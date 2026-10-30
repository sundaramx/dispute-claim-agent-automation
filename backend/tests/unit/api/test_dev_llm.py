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
