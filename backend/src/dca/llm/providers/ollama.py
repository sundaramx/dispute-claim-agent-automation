"""Ollama provider (ARCHITECTURE §7.2): httpx → /api/chat with a JSON-schema `format`."""

import time
from dataclasses import dataclass
from typing import Any

import httpx


class ProviderError(Exception):
    """Timeout, transport failure or non-2xx response. The gateway may retry or fail over."""


@dataclass(frozen=True)
class ModelInfo:
    name: str
    size_bytes: int
    parameter_size: str


@dataclass(frozen=True)
class ProviderReply:
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    latency_ms: int


class OllamaProvider:
    name = "ollama"

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        timeout_s: float = 120.0,
        num_ctx: int = 8192,
        think: bool = False,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self.model = model
        self.timeout_s = timeout_s
        self.think = think
        self._num_ctx = num_ctx
        self._think = think
        self._client = httpx.AsyncClient(
            base_url=base_url, timeout=timeout_s, transport=transport, follow_redirects=False
        )

    async def chat(self, system: str, user: str, schema: dict[str, Any]) -> ProviderReply:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "format": schema,  # constrained decoding to the task's output schema
            "stream": False,
            # Reasoning models (Qwen3 family) think before answering by default: ~30x the
            # tokens for a schema-constrained answer. Off unless configured.
            "think": self._think,
            # Deterministic, and a context big enough for a case bundle (Ollama defaults to 2048).
            "options": {"temperature": 0, "seed": 42, "num_ctx": self._num_ctx},
        }
        started = time.monotonic()
        try:
            r = await self._client.post("/api/chat", json=body)
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise ProviderError(f"ollama: {type(e).__name__}: {e}") from e
        data = r.json()
        return ProviderReply(
            text=data["message"]["content"],
            model=f"ollama:{data.get('model', self.model)}",
            input_tokens=int(data.get("prompt_eval_count", 0)),
            output_tokens=int(data.get("eval_count", 0)),
            latency_ms=int((time.monotonic() - started) * 1000),
        )

    async def list_models(self) -> list[ModelInfo]:
        """Pulled models that can generate text (embedding-only models are left out)."""
        try:
            r = await self._client.get("/api/tags", timeout=3.0)
            r.raise_for_status()
        except httpx.HTTPError:
            return []
        return [
            ModelInfo(
                name=m["name"],
                size_bytes=int(m.get("size", 0)),
                parameter_size=m.get("details", {}).get("parameter_size", ""),
            )
            for m in r.json().get("models", [])
            if "completion" in m.get("capabilities", ["completion"])
        ]

    async def health(self) -> bool:
        """True if Ollama answers and has this model pulled."""
        return any(m.name == self.model for m in await self.list_models())

    async def aclose(self) -> None:
        await self._client.aclose()
