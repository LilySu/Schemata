from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError

from app.core.observability import Timer, log_event
from app.prompts import (
    SYSTEM_DRILLDOWN_DIAGRAM_PROMPT,
    SYSTEM_DRILLDOWN_DIRECTORY_PROMPT,
    SYSTEM_DRILLDOWN_FILE_PROMPT,
    SYSTEM_FIRST_PROMPT,
    SYSTEM_SECOND_PROMPT,
    SYSTEM_THIRD_PROMPT,
)
from app.services.github_service import GitHubService
from app.services.model_config import get_model
from app.services.openai_service import OpenAIService
from app.services.pricing import estimate_text_token_cost_usd

router = APIRouter(prefix="/generate", tags=["OpenAI"])

openai_service = OpenAIService()

MULTI_STAGE_INPUT_MULTIPLIER = 2
INPUT_OVERHEAD_TOKENS = 3000
ESTIMATED_OUTPUT_TOKENS = 8000


class GenerateRequest(BaseModel):
    username: str = Field(min_length=1)
    repo: str = Field(min_length=1)
    api_key: str | None = Field(default=None, min_length=1)
    github_pat: str | None = Field(default=None, min_length=1)
    scope_path: str | None = Field(default=None, min_length=1)
    parent_explanation: str | None = Field(default=None, min_length=1)


def _sse_message(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _strip_json_code_fences(text: str) -> str:
    return re.sub(r"```(?:json|jsonl)?\s*", "", text).strip()


def _extract_component_mapping(response: str) -> str:
    start_tag = "<component_mapping>"
    end_tag = "</component_mapping>"
    start_index = response.find(start_tag)
    end_index = response.find(end_tag)
    if start_index == -1 or end_index == -1:
        return response
    return response[start_index:end_index]


def _parse_jsonl_line(line: str) -> dict[str, Any] | None:
    """Parse a single JSONL line into a graph item, or return None if unparseable."""
    trimmed = line.strip()
    if not trimmed or trimmed in ("[", "]", ","):
        return None
    # Remove trailing comma (LLM may add commas between array elements)
    cleaned = trimmed.rstrip(",").strip()
    if not cleaned.startswith("{"):
        return None
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and parsed.get("kind") in ("node", "edge", "group"):
            return parsed
        return None
    except json.JSONDecodeError:
        return None


def _process_node_paths(
    graph_data: dict[str, Any],
    username: str,
    repo: str,
    branch: str,
    file_tree: str | None = None,
    drill_down: bool = False,
) -> dict[str, Any]:
    """Process node paths to add clickUrl or clickAction/clickPath."""
    tree_lines = set(file_tree.split("\n")) if file_tree else None

    processed_nodes = []
    for node in graph_data.get("nodes", []):
        path = node.get("path")
        if not path:
            processed_nodes.append(node)
            continue

        is_file = "." in path and not path.endswith("/")
        if tree_lines:
            has_children = any(line.startswith(path + "/") for line in tree_lines)
            if has_children:
                is_file = False

        node = dict(node)  # copy
        if is_file:
            node["clickUrl"] = f"https://github.com/{username}/{repo}/blob/{branch}/{path}"
        elif drill_down:
            node["clickAction"] = "drilldown"
            node["clickPath"] = path
        else:
            node["clickUrl"] = f"https://github.com/{username}/{repo}/tree/{branch}/{path}"
        processed_nodes.append(node)

    return {**graph_data, "nodes": processed_nodes}


def _parse_request_payload(payload: Any) -> tuple[GenerateRequest | None, str | None]:
    try:
        parsed = GenerateRequest.model_validate(payload)
        return parsed, None
    except ValidationError:
        return None, "Invalid request payload."


def _get_github_data(username: str, repo: str, github_pat: str | None):
    github_service = GitHubService(pat=github_pat)
    return github_service.get_github_data(username, repo)


async def _estimate_repo_input_tokens(
    model: str,
    file_tree: str,
    readme: str,
    api_key: str | None = None,
) -> int:
    try:
        return await openai_service.count_input_tokens(
            model=model,
            system_prompt=SYSTEM_FIRST_PROMPT,
            data={
                "file_tree": file_tree,
                "readme": readme,
            },
            api_key=api_key,
            reasoning_effort="medium",
        )
    except Exception:
        return openai_service.estimate_tokens(f"{file_tree}\n{readme}")


@router.post("/cost")
async def get_generation_cost(request: Request):
    timer = Timer()
    try:
        payload = await request.json()
        parsed, error = _parse_request_payload(payload)
        if not parsed:
            return JSONResponse(
                {
                    "ok": False,
                    "error": error,
                    "error_code": "VALIDATION_ERROR",
                }
            )

        github_data = _get_github_data(parsed.username, parsed.repo, parsed.github_pat)
        model = get_model()
        base_input_tokens = await _estimate_repo_input_tokens(
            model=model,
            file_tree=github_data.file_tree,
            readme=github_data.readme,
            api_key=parsed.api_key,
        )
        estimated_input_tokens = (
            base_input_tokens * MULTI_STAGE_INPUT_MULTIPLIER + INPUT_OVERHEAD_TOKENS
        )
        estimated_output_tokens = ESTIMATED_OUTPUT_TOKENS
        cost_usd, pricing_model, pricing = estimate_text_token_cost_usd(
            model=model,
            input_tokens=estimated_input_tokens,
            output_tokens=estimated_output_tokens,
        )

        response_payload = {
            "ok": True,
            "cost": f"${cost_usd:.2f} USD",
            "model": model,
            "pricing_model": pricing_model,
            "estimated_input_tokens": estimated_input_tokens,
            "estimated_output_tokens": estimated_output_tokens,
            "pricing": {
                "input_per_million_usd": pricing.input_per_million_usd,
                "output_per_million_usd": pricing.output_per_million_usd,
            },
        }
        log_event(
            "generate.cost.success",
            username=parsed.username,
            repo=parsed.repo,
            elapsed_ms=timer.elapsed_ms(),
            model=model,
        )
        return JSONResponse(response_payload)
    except Exception as exc:
        log_event(
            "generate.cost.failed",
            elapsed_ms=timer.elapsed_ms(),
            error=str(exc),
        )
        return JSONResponse(
            {
                "ok": False,
                "error": str(exc) if isinstance(exc, Exception) else "Failed to estimate generation cost.",
                "error_code": "COST_ESTIMATION_FAILED",
            }
        )


@router.post("/stream")
async def generate_stream(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse(
            {
                "ok": False,
                "error": "Invalid request payload.",
                "error_code": "VALIDATION_ERROR",
            },
            status_code=400,
        )

    parsed, error = _parse_request_payload(payload)
    if not parsed:
        return JSONResponse(
            {
                "ok": False,
                "error": error,
                "error_code": "VALIDATION_ERROR",
            },
            status_code=400,
        )

    async def event_generator():
        timer = Timer()

        def send(payload: dict[str, Any]) -> str:
            return _sse_message(payload)

        try:
            github_service = GitHubService(pat=parsed.github_pat)
            github_data = github_service.get_github_data(parsed.username, parsed.repo)
            model = get_model()

            # ---- Scoped drill-down pipeline ----
            if parsed.scope_path:
                yield send(
                    {
                        "status": "started",
                        "message": f"Starting drill-down generation for {parsed.scope_path}...",
                    }
                )

                scope_path = parsed.scope_path
                is_file = "." in scope_path.split("/")[-1] and not scope_path.endswith("/")

                if is_file:
                    # File-level drill-down
                    file_content = github_service.get_file_content(
                        parsed.username, parsed.repo, scope_path, github_data.default_branch,
                    )
                    # Truncate very large files
                    lines = file_content.split("\n")
                    if len(lines) > 3000:
                        file_content = "\n".join(lines[:3000]) + "\n... (truncated)"

                    system_prompt = SYSTEM_DRILLDOWN_FILE_PROMPT
                    user_data = {
                        "parent_context": parsed.parent_explanation or "",
                        "scope_path": scope_path,
                        "file_content": file_content,
                    }
                else:
                    # Directory-level drill-down
                    scoped_tree = GitHubService.get_scoped_file_tree(
                        github_data.file_tree, scope_path,
                    )
                    scoped_lines = [l for l in scoped_tree.split("\n") if l.strip()]
                    if len(scoped_lines) < 3:
                        yield send(
                            {
                                "status": "error",
                                "error": f"Directory '{scope_path}' has fewer than 3 files. Open it on GitHub instead.",
                                "error_code": "SCOPE_TOO_SMALL",
                            }
                        )
                        return

                    # Fetch key entry-point files
                    entry_point_names = [
                        "index.ts", "index.tsx", "index.js", "main.py", "__init__.py",
                        "mod.rs", "lib.rs", "main.go", "main.ts", "app.ts", "app.py",
                    ]
                    file_contents_parts: list[str] = []
                    for line in scoped_lines[:50]:  # check first 50 paths
                        filename = line.split("/")[-1] if "/" in line else line
                        if filename in entry_point_names and len(file_contents_parts) < 5:
                            try:
                                content = github_service.get_file_content(
                                    parsed.username, parsed.repo, line, github_data.default_branch,
                                )
                                file_contents_parts.append(f"--- {line} ---\n{content}")
                            except Exception:
                                pass

                    system_prompt = SYSTEM_DRILLDOWN_DIRECTORY_PROMPT
                    user_data: dict[str, str] = {
                        "parent_context": parsed.parent_explanation or "",
                        "scope_path": scope_path,
                        "sub_tree": scoped_tree,
                    }
                    if file_contents_parts:
                        user_data["file_contents"] = "\n\n".join(file_contents_parts)

                # Stage 1: Explanation + component mapping (combined)
                yield send(
                    {
                        "status": "explanation",
                        "message": f"Analyzing {scope_path}...",
                    }
                )

                explanation_response = ""
                async for chunk in openai_service.stream_completion(
                    model=model,
                    system_prompt=system_prompt,
                    data=user_data,
                    api_key=parsed.api_key,
                    reasoning_effort="medium",
                ):
                    explanation_response += chunk
                    yield send({"status": "explanation_chunk", "chunk": chunk})

                # Extract explanation and component mapping from response
                explanation = explanation_response
                exp_start = explanation_response.find("<explanation>")
                exp_end = explanation_response.find("</explanation>")
                if exp_start != -1 and exp_end != -1:
                    explanation = explanation_response[exp_start:exp_end + len("</explanation>")]

                component_mapping = _extract_component_mapping(explanation_response)
                is_leaf = "<is_leaf>true</is_leaf>" in explanation_response.lower()

                # Stage 2: Diagram generation
                yield send(
                    {
                        "status": "diagram",
                        "message": "Generating diagram...",
                    }
                )

                diagram_data: dict[str, str] = {"explanation": explanation}
                if not is_file and "<component_mapping>" in explanation_response:
                    diagram_data["component_mapping"] = component_mapping

                # Stream JSONL and emit diagram_item events progressively
                line_buffer = ""
                graph_data: dict[str, Any] = {"nodes": [], "edges": [], "groups": []}

                async for chunk in openai_service.stream_completion(
                    model=model,
                    system_prompt=SYSTEM_DRILLDOWN_DIAGRAM_PROMPT,
                    data=diagram_data,
                    api_key=parsed.api_key,
                    reasoning_effort="low",
                ):
                    line_buffer += chunk
                    yield send({"status": "diagram_chunk", "chunk": chunk})

                    # Process complete lines
                    while "\n" in line_buffer:
                        newline_idx = line_buffer.index("\n")
                        line = line_buffer[:newline_idx]
                        line_buffer = line_buffer[newline_idx + 1:]
                        cleaned = _strip_json_code_fences(line)
                        item = _parse_jsonl_line(cleaned)
                        if item:
                            kind = item["kind"]
                            if kind == "node":
                                graph_data["nodes"].append(item)
                            elif kind == "edge":
                                graph_data["edges"].append(item)
                            elif kind == "group":
                                graph_data["groups"].append(item)
                            yield send({"status": "diagram_item", "item": item})

                # Process any remaining buffer
                if line_buffer.strip():
                    cleaned = _strip_json_code_fences(line_buffer)
                    item = _parse_jsonl_line(cleaned)
                    if item:
                        kind = item["kind"]
                        if kind == "node":
                            graph_data["nodes"].append(item)
                        elif kind == "edge":
                            graph_data["edges"].append(item)
                        elif kind == "group":
                            graph_data["groups"].append(item)
                        yield send({"status": "diagram_item", "item": item})

                if not graph_data["nodes"]:
                    yield send(
                        {
                            "status": "error",
                            "error": "Diagram generation produced no valid nodes. Please retry.",
                            "error_code": "EMPTY_DIAGRAM",
                        }
                    )
                    return

                processed_graph = _process_node_paths(
                    graph_data,
                    parsed.username,
                    parsed.repo,
                    github_data.default_branch,
                    file_tree=github_data.file_tree,
                    drill_down=True,
                )

                yield send(
                    {
                        "status": "complete",
                        "diagram": json.dumps(processed_graph),
                        "explanation": explanation,
                        "mapping": component_mapping if not is_file else "",
                        "is_leaf": is_leaf,
                    }
                )
                log_event(
                    "generate.stream.drilldown.success",
                    username=parsed.username,
                    repo=parsed.repo,
                    scope_path=scope_path,
                    elapsed_ms=timer.elapsed_ms(),
                    model=model,
                )
                return

            # ---- Standard 3-stage pipeline (no scope_path) ----
            token_count = await _estimate_repo_input_tokens(
                model=model,
                file_tree=github_data.file_tree,
                readme=github_data.readme,
                api_key=parsed.api_key,
            )

            yield send(
                {
                    "status": "started",
                    "message": "Starting generation process...",
                }
            )

            if token_count > 50000 and token_count < 195000 and not parsed.api_key:
                yield send(
                    {
                        "status": "error",
                        "error": "File tree and README combined exceeds token limit (50,000). This repository is too large for free generation. Provide your own OpenAI API key to continue.",
                        "error_code": "API_KEY_REQUIRED",
                    }
                )
                return

            if token_count > 195000:
                yield send(
                    {
                        "status": "error",
                        "error": "Repository is too large (>195k tokens) for analysis. Try a smaller repo.",
                        "error_code": "TOKEN_LIMIT_EXCEEDED",
                    }
                )
                return

            yield send(
                {
                    "status": "explanation_sent",
                    "message": f"Sending explanation request to {model}...",
                }
            )
            await asyncio.sleep(0.08)
            yield send(
                {
                    "status": "explanation",
                    "message": "Analyzing repository structure...",
                }
            )

            explanation = ""
            async for chunk in openai_service.stream_completion(
                model=model,
                system_prompt=SYSTEM_FIRST_PROMPT,
                data={
                    "file_tree": github_data.file_tree,
                    "readme": github_data.readme,
                },
                api_key=parsed.api_key,
                reasoning_effort="medium",
            ):
                explanation += chunk
                yield send({"status": "explanation_chunk", "chunk": chunk})

            yield send(
                {
                    "status": "mapping_sent",
                    "message": f"Sending component mapping request to {model}...",
                }
            )
            await asyncio.sleep(0.08)
            yield send(
                {
                    "status": "mapping",
                    "message": "Creating component mapping...",
                }
            )

            full_mapping_response = ""
            async for chunk in openai_service.stream_completion(
                model=model,
                system_prompt=SYSTEM_SECOND_PROMPT,
                data={
                    "explanation": explanation,
                    "file_tree": github_data.file_tree,
                },
                api_key=parsed.api_key,
                reasoning_effort="low",
            ):
                full_mapping_response += chunk
                yield send({"status": "mapping_chunk", "chunk": chunk})

            component_mapping = _extract_component_mapping(full_mapping_response)

            yield send(
                {
                    "status": "diagram_sent",
                    "message": f"Sending diagram generation request to {model}...",
                }
            )
            await asyncio.sleep(0.08)
            yield send(
                {
                    "status": "diagram",
                    "message": "Generating diagram...",
                }
            )

            # Stream JSONL and emit diagram_item events progressively
            line_buffer = ""
            graph_data: dict[str, Any] = {"nodes": [], "edges": [], "groups": []}

            async for chunk in openai_service.stream_completion(
                model=model,
                system_prompt=SYSTEM_THIRD_PROMPT,
                data={
                    "explanation": explanation,
                    "component_mapping": component_mapping,
                },
                api_key=parsed.api_key,
                reasoning_effort="low",
            ):
                line_buffer += chunk
                yield send({"status": "diagram_chunk", "chunk": chunk})

                # Process complete lines
                while "\n" in line_buffer:
                    newline_idx = line_buffer.index("\n")
                    line = line_buffer[:newline_idx]
                    line_buffer = line_buffer[newline_idx + 1:]
                    cleaned = _strip_json_code_fences(line)
                    item = _parse_jsonl_line(cleaned)
                    if item:
                        kind = item["kind"]
                        if kind == "node":
                            graph_data["nodes"].append(item)
                        elif kind == "edge":
                            graph_data["edges"].append(item)
                        elif kind == "group":
                            graph_data["groups"].append(item)
                        yield send({"status": "diagram_item", "item": item})

            # Process any remaining buffer
            if line_buffer.strip():
                cleaned = _strip_json_code_fences(line_buffer)
                item = _parse_jsonl_line(cleaned)
                if item:
                    kind = item["kind"]
                    if kind == "node":
                        graph_data["nodes"].append(item)
                    elif kind == "edge":
                        graph_data["edges"].append(item)
                    elif kind == "group":
                        graph_data["groups"].append(item)
                    yield send({"status": "diagram_item", "item": item})

            if not graph_data["nodes"]:
                yield send(
                    {
                        "status": "error",
                        "error": "Diagram generation produced no valid nodes. Please retry.",
                        "error_code": "EMPTY_DIAGRAM",
                    }
                )
                return

            processed_graph = _process_node_paths(
                graph_data,
                parsed.username,
                parsed.repo,
                github_data.default_branch,
            )

            yield send(
                {
                    "status": "complete",
                    "diagram": json.dumps(processed_graph),
                    "explanation": explanation,
                    "mapping": component_mapping,
                }
            )
            log_event(
                "generate.stream.success",
                username=parsed.username,
                repo=parsed.repo,
                elapsed_ms=timer.elapsed_ms(),
                model=model,
            )
        except Exception as exc:
            yield send(
                {
                    "status": "error",
                    "error": str(exc) if isinstance(exc, Exception) else "Streaming generation failed.",
                    "error_code": "STREAM_FAILED",
                }
            )
            log_event(
                "generate.stream.failed",
                username=parsed.username,
                repo=parsed.repo,
                elapsed_ms=timer.elapsed_ms(),
                error=str(exc),
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
