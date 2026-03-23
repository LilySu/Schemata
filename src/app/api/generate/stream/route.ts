import { getModel } from "~/server/generate/model-config";
import { analyzeRepo } from "~/server/generate/analyzer";
import {
  extractComponentMapping,
  parseJsonlLine,
  processNodePaths,
  stripJsonCodeFences,
  toTaggedMessage,
} from "~/server/generate/format";
import {
  getFileContent,
  getGithubData,
  getScopedFileTree,
} from "~/server/generate/github";
import {
  estimateTokens,
  streamCompletion,
} from "~/server/generate/llm";
import {
  SYSTEM_DRILLDOWN_DIAGRAM_PROMPT,
  SYSTEM_DRILLDOWN_DIRECTORY_PROMPT,
  SYSTEM_DRILLDOWN_FILE_PROMPT,
  SYSTEM_EDGES_PROMPT,
} from "~/server/generate/prompts";
import { generateRequestSchema, sseMessage } from "~/server/generate/types";
import type { GraphData } from "~/features/diagram/graph-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateRepoTokenCount(fileTree: string, readme: string) {
  return estimateTokens(`${fileTree}\n${readme}`);
}

export async function POST(request: Request) {
  const parsed = generateRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Invalid request payload.",
        error_code: "VALIDATION_ERROR",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const {
    username,
    repo,
    api_key: apiKey,
    github_pat: githubPat,
    scope_path: scopePath,
    parent_explanation: parentExplanation,
  } = parsed.data;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseMessage(payload)));
      };

      const run = async () => {
        try {
          console.log("[stream] POST /api/generate/stream", { username, repo, scopePath: scopePath ?? "none", hasApiKey: !!apiKey });
          const githubData = await getGithubData(username, repo, githubPat);
          console.log("[stream] GitHub data fetched. fileTree:", githubData.fileTree.length, "chars, readme:", githubData.readme.length, "chars");
          const model = getModel();
          console.log("[stream] model:", model);

          // ---- Scoped drill-down pipeline ----
          if (scopePath) {
            console.log("[stream] entering DRILL-DOWN pipeline for:", scopePath);
            send({
              status: "started",
              message: `Starting drill-down generation for ${scopePath}...`,
            });

            const lastSegment = scopePath.split("/").pop() ?? scopePath;
            const isFile =
              lastSegment.includes(".") && !scopePath.endsWith("/");

            let systemPrompt: string;
            let userData: Record<string, string>;

            if (isFile) {
              let fileContent = await getFileContent(
                username,
                repo,
                scopePath,
                githubData.defaultBranch,
                githubPat,
              );
              const lines = fileContent.split("\n");
              if (lines.length > 3000) {
                fileContent =
                  lines.slice(0, 3000).join("\n") + "\n... (truncated)";
              }
              systemPrompt = SYSTEM_DRILLDOWN_FILE_PROMPT;
              userData = {
                parent_context: parentExplanation ?? "",
                scope_path: scopePath,
                file_content: fileContent,
              };
            } else {
              const scopedTree = getScopedFileTree(
                githubData.fileTree,
                scopePath,
              );
              const scopedLines = scopedTree
                .split("\n")
                .filter((l) => l.trim());
              if (scopedLines.length < 3) {
                send({
                  status: "error",
                  error: `Directory '${scopePath}' has fewer than 3 files. Open it on GitHub instead.`,
                  error_code: "SCOPE_TOO_SMALL",
                });
                controller.close();
                return;
              }

              const entryPointNames = [
                "index.ts",
                "index.tsx",
                "index.js",
                "main.py",
                "__init__.py",
                "mod.rs",
                "lib.rs",
                "main.go",
                "main.ts",
                "app.ts",
                "app.py",
              ];
              const fileContentsParts: string[] = [];
              for (const line of scopedLines.slice(0, 50)) {
                const filename = line.split("/").pop() ?? line;
                if (
                  entryPointNames.includes(filename) &&
                  fileContentsParts.length < 5
                ) {
                  try {
                    const content = await getFileContent(
                      username,
                      repo,
                      line,
                      githubData.defaultBranch,
                      githubPat,
                    );
                    fileContentsParts.push(`--- ${line} ---\n${content}`);
                  } catch {
                    // skip files that can't be fetched
                  }
                }
              }

              systemPrompt = SYSTEM_DRILLDOWN_DIRECTORY_PROMPT;
              userData = {
                parent_context: parentExplanation ?? "",
                scope_path: scopePath,
                sub_tree: scopedTree,
              };
              if (fileContentsParts.length > 0) {
                userData.file_contents = fileContentsParts.join("\n\n");
              }
            }

            // Stage 1: Explanation + component mapping (combined)
            send({
              status: "explanation",
              message: `Analyzing ${scopePath}...`,
            });

            let explanationResponse = "";
            for await (const chunk of streamCompletion({
              model,
              systemPrompt,
              userPrompt: toTaggedMessage(userData),
              apiKey,
              reasoningEffort: "medium",
            })) {
              explanationResponse += chunk;
              send({ status: "explanation_chunk", chunk });
            }

            let explanation = explanationResponse;
            const expStart = explanationResponse.indexOf("<explanation>");
            const expEnd = explanationResponse.indexOf("</explanation>");
            if (expStart !== -1 && expEnd !== -1) {
              explanation = explanationResponse.slice(
                expStart,
                expEnd + "</explanation>".length,
              );
            }

            const componentMapping =
              extractComponentMapping(explanationResponse);
            const isLeaf = explanationResponse
              .toLowerCase()
              .includes("<is_leaf>true</is_leaf>");

            // Stage 2: Diagram generation
            send({
              status: "diagram",
              message: "Generating diagram...",
            });

            const diagramData: Record<string, string> = { explanation };
            if (
              !isFile &&
              explanationResponse.includes("<component_mapping>")
            ) {
              diagramData.component_mapping = componentMapping;
            }

            // Stream JSONL and emit diagram_item events progressively
            let lineBuffer = "";
            const graphData: GraphData = { nodes: [], edges: [], groups: [] };

            for await (const chunk of streamCompletion({
              model,
              systemPrompt: SYSTEM_DRILLDOWN_DIAGRAM_PROMPT,
              userPrompt: toTaggedMessage(diagramData),
              apiKey,
              reasoningEffort: "low",
            })) {
              lineBuffer += chunk;
              send({ status: "diagram_chunk", chunk });

              // Process complete lines
              let newlineIdx: number;
              while ((newlineIdx = lineBuffer.indexOf("\n")) !== -1) {
                const line = lineBuffer.slice(0, newlineIdx);
                lineBuffer = lineBuffer.slice(newlineIdx + 1);
                const cleaned = stripJsonCodeFences(line);
                const item = parseJsonlLine(cleaned);
                if (item) {
                  if (item.kind === "node") graphData.nodes.push(item);
                  else if (item.kind === "edge") graphData.edges.push(item);
                  else if (item.kind === "group")
                    graphData.groups!.push(item);
                  send({ status: "diagram_item", item });
                }
              }
            }

            // Process any remaining buffer
            if (lineBuffer.trim()) {
              const cleaned = stripJsonCodeFences(lineBuffer);
              const item = parseJsonlLine(cleaned);
              if (item) {
                if (item.kind === "node") graphData.nodes.push(item);
                else if (item.kind === "edge") graphData.edges.push(item);
                else if (item.kind === "group") graphData.groups!.push(item);
                send({ status: "diagram_item", item });
              }
            }

            if (graphData.nodes.length === 0) {
              send({
                status: "error",
                error:
                  "Diagram generation produced no valid nodes. Please retry.",
                error_code: "EMPTY_DIAGRAM",
              });
              controller.close();
              return;
            }

            const processedGraph = processNodePaths(
              graphData,
              username,
              repo,
              githubData.defaultBranch,
              githubData.fileTree,
              true,
            );

            send({
              status: "complete",
              diagram: JSON.stringify(processedGraph),
              explanation,
              mapping: isFile ? "" : componentMapping,
              is_leaf: isLeaf,
            });
            controller.close();
            return;
          }

          // ---- Hybrid pipeline: deterministic nodes + LLM edges ----
          const tokenCount = estimateRepoTokenCount(
            githubData.fileTree,
            githubData.readme,
          );

          console.log("[stream] tokenCount:", tokenCount);
          send({
            status: "started",
            message: "Starting generation process...",
          });

          const hasServerKey = !!(process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY);
          console.log("[stream] hasApiKey:", !!apiKey, "hasServerKey:", hasServerKey, "GOOGLE_API_KEY set:", !!process.env.GOOGLE_API_KEY);
          if (tokenCount > 50000 && tokenCount < 195000 && !apiKey && !hasServerKey) {
            send({
              status: "error",
              error:
                "File tree and README combined exceeds token limit (50,000). This repository is too large for free generation. Provide your own OpenAI API key to continue.",
              error_code: "API_KEY_REQUIRED",
            });
            controller.close();
            return;
          }

          if (tokenCount > 195000) {
            send({
              status: "error",
              error:
                "Repository is too large (>195k tokens) for analysis. Try a smaller repo.",
              error_code: "TOKEN_LIMIT_EXCEEDED",
            });
            controller.close();
            return;
          }

          // Step 1: Deterministic analysis (instant)
          console.log("[stream] === HYBRID PIPELINE START ===");
          console.log("[stream] tokenCount:", tokenCount);
          send({
            status: "analyzing",
            message: "Analyzing repository structure...",
          });

          const analysis = analyzeRepo(
            githubData.fileTree,
            githubData.readme,
            repo,
          );

          console.log("[stream] analyzer produced", analysis.components.length, "nodes,", analysis.groups.length, "groups");

          const graphData: GraphData = {
            nodes: [...analysis.components],
            edges: [],
            groups: [...analysis.groups],
          };

          // Emit pre-computed nodes instantly
          for (const group of analysis.groups) {
            send({
              status: "diagram_item",
              item: { kind: "group" as const, ...group },
            });
          }
          for (const node of analysis.components) {
            send({
              status: "diagram_item",
              item: { kind: "node" as const, ...node },
            });
          }

          // Step 2: Single LLM call for edges + missing components
          console.log("[stream] Step 2: calling LLM for edges with model:", model);
          send({
            status: "diagram",
            message: "Generating relationships...",
          });

          const nodesJsonl = analysis.components
            .map((n) => JSON.stringify({ kind: "node", ...n }))
            .join("\n");
          console.log("[stream] nodesJsonl length:", nodesJsonl.length, "chars");

          let lineBuffer = "";
          let edgeChunkCount = 0;
          for await (const chunk of streamCompletion({
            model,
            systemPrompt: SYSTEM_EDGES_PROMPT,
            userPrompt: toTaggedMessage({
              project_summary: analysis.summary,
              nodes: nodesJsonl,
              file_tree: githubData.fileTree,
            }),
            apiKey,
            reasoningEffort: "low",
          })) {
            edgeChunkCount++;
            lineBuffer += chunk;
            send({ status: "diagram_chunk", chunk });

            // Process complete lines
            let newlineIdx: number;
            while ((newlineIdx = lineBuffer.indexOf("\n")) !== -1) {
              const line = lineBuffer.slice(0, newlineIdx);
              lineBuffer = lineBuffer.slice(newlineIdx + 1);
              const cleaned = stripJsonCodeFences(line);
              const item = parseJsonlLine(cleaned);
              if (item) {
                if (item.kind === "node") graphData.nodes.push(item);
                else if (item.kind === "edge") graphData.edges.push(item);
                else if (item.kind === "group") graphData.groups!.push(item);
                send({ status: "diagram_item", item });
              }
            }
          }

          console.log("[stream] LLM stream ended. chunks:", edgeChunkCount);
          console.log("[stream] remaining lineBuffer:", JSON.stringify(lineBuffer.slice(0, 200)));

          // Process any remaining buffer
          if (lineBuffer.trim()) {
            const cleaned = stripJsonCodeFences(lineBuffer);
            const item = parseJsonlLine(cleaned);
            if (item) {
              if (item.kind === "node") graphData.nodes.push(item);
              else if (item.kind === "edge") graphData.edges.push(item);
              else if (item.kind === "group") graphData.groups!.push(item);
              send({ status: "diagram_item", item });
            }
          }

          console.log("[stream] final graph — nodes:", graphData.nodes.length, "edges:", graphData.edges.length, "groups:", graphData.groups?.length);

          if (graphData.nodes.length === 0) {
            console.error("[stream] ERROR: zero nodes!");
            send({
              status: "error",
              error:
                "Diagram generation produced no valid nodes. Please retry.",
              error_code: "EMPTY_DIAGRAM",
            });
            return;
          }

          const processedGraph = processNodePaths(
            graphData,
            username,
            repo,
            githubData.defaultBranch,
            githubData.fileTree,
            true, // enable drill-down on directory nodes
          );

          console.log("[stream] sending complete. nodes:", processedGraph.nodes.length, "edges:", processedGraph.edges.length);
          send({
            status: "complete",
            diagram: JSON.stringify(processedGraph),
            explanation: analysis.summary,
            mapping: "",
          });
          console.log("[stream] === HYBRID PIPELINE DONE ===");
        } catch (error) {
          console.error("[stream] CAUGHT ERROR:", error);
          send({
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Streaming generation failed.",
            error_code: "STREAM_FAILED",
          });
        } finally {
          try {
            controller.close();
          } catch {
            // already closed by an early return
          }
        }
      };

      void run();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
