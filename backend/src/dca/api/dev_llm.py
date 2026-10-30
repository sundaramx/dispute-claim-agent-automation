"""Local-only bridge from the console to the LLM gateway (TD-60).

Until the real API exists (M5–M6), the console's mock backend builds the case bundle and
calls these two task endpoints, so model calls still go through dca.llm (redaction, egress
guard, schema validation) and never straight from the browser to a model. Refuses to start
outside DCA_ENV=local.

Run: DCA_ENV=local uvicorn dca.api.dev_llm:create_app --factory --port 8001
"""

import os
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from dca.llm.gateway import Gateway, GatewayResult, LlmUnavailable
from dca.llm.providers.ollama import OllamaProvider
from dca.llm.tasks import CopilotAnswer, InvestigationBrief
from dca.protect.redact import PanEgressBlocked


class _Req(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case: dict[str, Any]
    lookups_available: list[dict[str, Any]] = Field(default_factory=list, max_length=10)


class CopilotRequest(_Req):
    question: str = Field(min_length=1, max_length=1000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=12)
    allow_lookup: bool = True
    tool_result: dict[str, Any] | None = None


class BriefRequest(_Req):
    pass


class Meta(BaseModel):
    model: str
    prompt_version: str
    attempts: int
    latency_ms: int
    input_tokens: int
    output_tokens: int


def _meta(r: GatewayResult[Any]) -> Meta:
    return Meta(
        model=r.model,
        prompt_version=r.prompt_version,
        attempts=r.attempts,
        latency_ms=r.latency_ms,
        input_tokens=r.input_tokens,
        output_tokens=r.output_tokens,
    )


def _problem(status: int, code: str, detail: str) -> JSONResponse:
    return JSONResponse(
        {"type": "about:blank", "status": status, "code": code, "detail": detail},
        status_code=status,
        media_type="application/problem+json",
    )


def create_app(gateway: Gateway | None = None) -> FastAPI:
    if os.environ.get("DCA_ENV") != "local":
        raise RuntimeError("The dev LLM bridge only runs with DCA_ENV=local")
    gw = gateway or Gateway.from_env()
    app = FastAPI(title="dca dev LLM bridge (local only)", docs_url=None, redoc_url=None)

    @app.get("/api/dev/llm/health")
    async def health() -> dict[str, Any]:
        provider = gw.providers("default")[0]
        ok = await provider.health() if isinstance(provider, OllamaProvider) else True
        return {"ok": ok, "provider": provider.name, "model": provider.model}

    @app.post("/api/dev/llm/copilot_answer", response_model=None)
    async def copilot_answer(req: CopilotRequest) -> dict[str, Any] | JSONResponse:
        payload = req.model_dump()
        try:
            r = await gw.call("copilot_answer", payload, CopilotAnswer)
        except PanEgressBlocked:
            return _problem(422, "pan_egress_blocked", "A card number reached the model payload.")
        except LlmUnavailable as e:
            return _problem(502, "llm_unavailable", str(e))
        out = r.output
        if not req.allow_lookup:
            out = out.model_copy(update={"lookup": None})
        return {"output": out.model_dump(), "meta": _meta(r).model_dump()}

    @app.post("/api/dev/llm/investigation_brief", response_model=None)
    async def investigation_brief(req: BriefRequest) -> dict[str, Any] | JSONResponse:
        try:
            r = await gw.call("investigation_brief", req.model_dump(), InvestigationBrief)
        except PanEgressBlocked:
            return _problem(422, "pan_egress_blocked", "A card number reached the model payload.")
        except LlmUnavailable as e:
            return _problem(502, "llm_unavailable", str(e))
        return {"output": r.output.model_dump(), "meta": _meta(r).model_dump()}

    return app
