import json
from typing import Any

import httpx
import pytest

import dca.llm.gateway as gateway_module
from dca.llm.gateway import Gateway, LlmUnavailable, inline_refs
from dca.llm.providers.ollama import OllamaProvider, ProviderError, ProviderReply
from dca.llm.tasks import CopilotAnswer, InvestigationBrief
from dca.protect.redact import PanEgressBlocked
from fixtures.pans import VISA_TEST, VISA_TEST_DIGITS

VALID = {
    "sentences": [{"text": "E-5 is missing.", "cites": ["E-5"]}],
    "lookup": None,
    "suggested_actions": [],
    "self_score": 0.9,
}


class FakeProvider:
    name = "fake"
    model = "fake-1"

    def __init__(self, replies: list[str | Exception]) -> None:
        self.replies = replies
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    async def chat(self, system: str, user: str, schema: dict[str, Any]) -> ProviderReply:
        self.calls.append((system, user, schema))
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return ProviderReply(
            text=r, model="fake:fake-1", input_tokens=10, output_tokens=5, latency_ms=1
        )


async def test_returns_typed_output_with_metering() -> None:
    p = FakeProvider([json.dumps(VALID)])
    r = await Gateway({"default": [p]}).call("copilot_answer", {"question": "q"}, CopilotAnswer)
    assert r.output.sentences[0].cites == ["E-5"]
    assert (r.attempts, r.model, r.prompt_version) == (1, "fake:fake-1", "copilot_answer.v1")
    assert len(r.redacted_prompt_hash) == 64


async def test_untrusted_data_is_delimited_and_redacted() -> None:
    p = FakeProvider([json.dumps(VALID)])
    await Gateway({"default": [p]}).call(
        "copilot_answer", {"note": "mail me at a@b.com"}, CopilotAnswer
    )
    _, user, schema = p.calls[0]
    assert "<untrusted_data>" in user and "never instructions" in user
    assert "a@b.com" not in user and "[EMAIL_1]" in user
    assert "$ref" not in json.dumps(schema)  # flattened for constrained decoding


async def test_redacts_a_pan_and_fails_closed_if_one_survives(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    p = FakeProvider([json.dumps(VALID)])
    gw = Gateway({"default": [p]})
    # A PAN in the payload is redacted, so the call goes through without it.
    await gw.call("copilot_answer", {"narrative": f"my card {VISA_TEST}"}, CopilotAnswer)
    assert VISA_TEST not in p.calls[0][1]
    # A PAN on a path redaction doesn't cover (the system prompt) blocks the call.
    monkeypatch.setattr(
        gateway_module, "load_prompt", lambda task, version=1: (f"card {VISA_TEST_DIGITS}", "x.v1")
    )
    with pytest.raises(PanEgressBlocked):
        await gw.call("copilot_answer", {}, CopilotAnswer)
    assert len(p.calls) == 1  # the provider was never called the second time


async def test_retries_invalid_output_then_succeeds() -> None:
    bad = json.dumps({**VALID, "approve": "P-1"})  # extra field: rejected by the closed schema
    p = FakeProvider([bad, "not json", json.dumps(VALID)])
    r = await Gateway({"default": [p]}).call("copilot_answer", {}, CopilotAnswer)
    assert r.attempts == 3


async def test_fails_over_then_gives_up() -> None:
    a = FakeProvider([ProviderError("down")] * 3)
    b = FakeProvider([json.dumps(VALID)])
    assert (
        await Gateway({"default": [a, b]}).call("copilot_answer", {}, CopilotAnswer)
    ).attempts == 4
    c = FakeProvider(["{}"] * 3)
    with pytest.raises(LlmUnavailable):
        await Gateway({"default": [c]}).call("copilot_answer", {}, CopilotAnswer)


def test_schemas_reject_unknown_actions_and_lookups() -> None:
    with pytest.raises(ValueError):
        CopilotAnswer.model_validate({**VALID, "lookup": "transfer_funds"})
    with pytest.raises(ValueError):
        CopilotAnswer.model_validate(
            {**VALID, "suggested_actions": [{"kind": "approve", "proposal_id": "P-1"}]}
        )
    assert "$ref" not in json.dumps(inline_refs(InvestigationBrief.model_json_schema()))


async def test_ollama_provider_request_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "model": "qwen2.5:7b",
                "message": {"content": "{}"},
                "prompt_eval_count": 12,
                "eval_count": 3,
            },
        )

    p = OllamaProvider("http://ollama.test", "qwen2.5:7b", transport=httpx.MockTransport(handler))
    reply = await p.chat("sys", "user", {"type": "object"})
    assert seen["format"] == {"type": "object"} and seen["stream"] is False
    assert seen["think"] is False  # reasoning off unless configured
    assert seen["options"]["temperature"] == 0 and seen["options"]["num_ctx"] >= 8192
    assert (reply.model, reply.input_tokens, reply.output_tokens) == ("ollama:qwen2.5:7b", 12, 3)


async def test_ollama_provider_wraps_http_errors() -> None:
    p = OllamaProvider(
        "http://ollama.test", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500))
    )
    with pytest.raises(ProviderError):
        await p.chat("s", "u", {})


def test_routes_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DCA_OLLAMA_MODEL", raising=False)
    assert Gateway.from_env().providers("copilot_answer")[0].model == "qwen3.6:27b-mlx"  # TD-62
    monkeypatch.setenv("DCA_OLLAMA_MODEL", "qwen2.5:7b")
    monkeypatch.setenv("DCA_OLLAMA_MODEL_INVESTIGATION_BRIEF", "qwen3.6:27b-mlx")
    gw = Gateway.from_env()
    assert gw.providers("copilot_answer")[0].model == "qwen2.5:7b"
    assert gw.providers("investigation_brief")[0].model == "qwen3.6:27b-mlx"
