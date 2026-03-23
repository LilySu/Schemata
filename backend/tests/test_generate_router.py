import json
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.routers import generate

client = TestClient(app)


def test_healthz_ok():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "status": "ok"}


def test_generate_cost_success(monkeypatch):
    monkeypatch.setattr(
        generate,
        "_get_github_data",
        lambda username, repo, github_pat=None: SimpleNamespace(
            default_branch="main",
            file_tree="src/main.py",
            readme="# readme",
        ),
    )
    monkeypatch.setattr(generate, "get_model", lambda: "gpt-5.4-mini")

    async def fake_count_input_tokens(*, model, system_prompt, data, api_key=None, reasoning_effort=None):
        return 100

    monkeypatch.setattr(generate.openai_service, "count_input_tokens", fake_count_input_tokens)

    response = client.post(
        "/generate/cost",
        json={"username": "acme", "repo": "demo"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["cost"].endswith("USD")
    assert data["model"] == "gpt-5.4-mini"
    assert data["pricing_model"] == "gpt-5.4-mini"
    assert "estimated_input_tokens" in data
    assert "estimated_output_tokens" in data


def test_generate_cost_error(monkeypatch):
    def fail_github_data(username, repo, github_pat=None):
        raise ValueError("repo not found")

    monkeypatch.setattr(generate, "_get_github_data", fail_github_data)

    response = client.post(
        "/generate/cost",
        json={"username": "acme", "repo": "missing"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is False
    assert data["error_code"] == "COST_ESTIMATION_FAILED"


def test_generate_stream_jsonl_pipeline(monkeypatch):
    fake_github_data = SimpleNamespace(
        default_branch="main",
        file_tree="src/main.py",
        readme="# readme",
    )

    class FakeGitHubService:
        def __init__(self, pat=None):
            pass
        def get_github_data(self, username, repo):
            return fake_github_data

    monkeypatch.setattr(generate, "GitHubService", FakeGitHubService)
    monkeypatch.setattr(generate, "get_model", lambda: "gpt-5.4-mini")

    async def fake_estimate_repo_input_tokens(model, file_tree, readme, api_key=None):
        return 1000

    async def fake_stream_completion(*, model, system_prompt, data, api_key=None, reasoning_effort=None, max_output_tokens=None):
        if "explaining to a principal" in system_prompt:
            yield "<explanation>Repo explanation</explanation>"
            return
        if "mapping key components" in system_prompt:
            yield "<component_mapping>"
            yield "1. API: src/main.py"
            yield "</component_mapping>"
            return
        # JSONL diagram output
        yield '{"kind":"node","id":"api","label":"API","type":"service","path":"src/main.py"}\n'
        yield '{"kind":"node","id":"worker","label":"Worker","type":"service"}\n'
        yield '{"kind":"edge","source":"api","target":"worker","label":"dispatches"}\n'

    monkeypatch.setattr(generate, "_estimate_repo_input_tokens", fake_estimate_repo_input_tokens)
    monkeypatch.setattr(generate.openai_service, "stream_completion", fake_stream_completion)

    response = client.post(
        "/generate/stream",
        json={"username": "acme", "repo": "demo"},
    )

    assert response.status_code == 200
    events = []
    payloads = []
    for block in response.text.split("\n\n"):
        if not block.startswith("data: "):
            continue
        payload = json.loads(block[6:])
        payloads.append(payload)
        if "status" in payload:
            events.append(payload["status"])

    assert "started" in events
    assert "explanation_sent" in events
    assert "mapping_sent" in events
    assert "diagram_sent" in events
    assert "diagram_item" in events
    assert events[-1] == "complete"
    complete_payload = payloads[-1]
    assert complete_payload["status"] == "complete"
    diagram_data = json.loads(complete_payload["diagram"])
    assert len(diagram_data["nodes"]) == 2
    assert len(diagram_data["edges"]) == 1
    # Check that processNodePaths resolved the path to a GitHub URL
    api_node = next(n for n in diagram_data["nodes"] if n["id"] == "api")
    assert "https://github.com/acme/demo/blob/main/src/main.py" in api_node.get("clickUrl", "")


def test_modify_route_removed():
    response = client.post("/modify", json={})
    assert response.status_code == 404
