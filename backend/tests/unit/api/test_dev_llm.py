import json

import pytest
from fastapi.testclient import TestClient

from dca.api.dev_llm import create_app
from dca.llm.gateway import Gateway

from ..llm.test_gateway import VALID, FakeProvider


def test_refuses_to_start_outside_local(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DCA_ENV", "staging")
    with pytest.raises(RuntimeError):
        create_app(Gateway({"default": [FakeProvider([])]}))


def test_copilot_answer_and_lookup_suppression(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DCA_ENV", "local")
    out = {**VALID, "lookup": "terminal_read"}
    client = TestClient(
        create_app(Gateway({"default": [FakeProvider([json.dumps(out), json.dumps(out)])]}))
    )
    body = {"case": {"ref": "DSP-2026-000412"}, "question": "how was it read?"}
    r = client.post("/api/dev/llm/copilot_answer", json=body)
    assert r.status_code == 200 and r.json()["output"]["lookup"] == "terminal_read"
    assert r.json()["meta"]["model"] == "fake:fake-1"
    r = client.post("/api/dev/llm/copilot_answer", json={**body, "allow_lookup": False})
    assert r.json()["output"]["lookup"] is None


def test_unavailable_model_is_a_502_problem(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DCA_ENV", "local")
    client = TestClient(create_app(Gateway({"default": [FakeProvider(["{}"] * 3)]})))
    r = client.post("/api/dev/llm/investigation_brief", json={"case": {}})
    assert r.status_code == 502 and r.json()["code"] == "llm_unavailable"


def test_rejects_unknown_request_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DCA_ENV", "local")
    client = TestClient(create_app(Gateway({"default": [FakeProvider([])]})))
    assert (
        client.post(
            "/api/dev/llm/copilot_answer", json={"case": {}, "question": "q", "system": "x"}
        ).status_code
        == 422
    )


TAGS = {
    "models": [
        {
            "name": "qwen2.5:7b",
            "size": 4_700_000_000,
            "capabilities": ["completion", "tools"],
            "details": {"parameter_size": "7.6B"},
        },
        {"name": "nomic-embed-text:latest", "size": 270_000_000, "capabilities": ["embedding"]},
        {"name": "qwen3.6:27b-mlx", "size": 19_800_000_000, "capabilities": ["completion"]},
    ]
}


def _ollama_app(monkeypatch: pytest.MonkeyPatch, seen: list[str]) -> TestClient:
    import httpx

    from dca.llm.providers.ollama import OllamaProvider

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json=TAGS)
        seen.append(json.loads(request.content)["model"])
        return httpx.Response(
            200, json={"model": seen[-1], "message": {"content": json.dumps(VALID)}}
        )

    real_init = OllamaProvider.__init__

    def init(self: OllamaProvider, *args: object, **kwargs: object) -> None:
        kwargs["transport"] = httpx.MockTransport(handler)
        real_init(self, *args, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(OllamaProvider, "__init__", init)
    monkeypatch.setenv("DCA_ENV", "local")
    monkeypatch.setenv("DCA_OLLAMA_MODEL", "qwen3.6:27b-mlx")
    return TestClient(create_app(Gateway.from_env()))


def test_lists_text_models_only_and_switches(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []
    client = _ollama_app(monkeypatch, seen)
    r = client.get("/api/dev/llm/models").json()
    assert r["current"] == "qwen3.6:27b-mlx"
    assert [m["name"] for m in r["models"]] == ["qwen2.5:7b", "qwen3.6:27b-mlx"]  # no embedder
    assert client.put("/api/dev/llm/model", json={"model": "qwen2.5:7b"}).json() == {
        "current": "qwen2.5:7b"
    }
    client.post("/api/dev/llm/copilot_answer", json={"case": {}, "question": "q"})
    assert seen == ["qwen2.5:7b"]
    assert client.get("/api/dev/llm/health").json()["model"] == "qwen2.5:7b"


def test_refuses_a_model_that_isnt_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _ollama_app(monkeypatch, [])
    r = client.put("/api/dev/llm/model", json={"model": "nomic-embed-text:latest"})
    assert r.status_code == 422 and r.json()["code"] == "model_not_installed"
    assert client.put("/api/dev/llm/model", json={"model": "evil:latest"}).status_code == 422
