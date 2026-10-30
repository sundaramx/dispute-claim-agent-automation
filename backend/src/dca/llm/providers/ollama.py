"""Ollama provider (ARCHITECTURE §7.2): httpx → /api/chat with a JSON-schema `format`."""

import time
from dataclasses import dataclass
from typing import Any

import httpx


class ProviderError(Exception):
    """Timeout, transport failure or non-2xx response. The gateway may retry or fail over."""


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
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.model = model
        self._num_ctx = num_ctx
        self._client = httpx.AsyncClient(
            base_url=base_url, timeout=timeout_s, transport=transport, follow_redirects=False
        )

    async def chat(self, system: str, user: str, schema: dict[str, Any]) -> ProviderReply:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "format": schema,  # constrained decoding to the task's output schema
            "stream": False,
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

    async def health(self) -> bool:
        """True if Ollama answers and has this model pulled."""
        try:
            r = await self._client.get("/api/tags", timeout=3.0)
            r.raise_for_status()
        except httpx.HTTPError:
            return False
        return any(m.get("name") == self.model for m in r.json().get("models", []))

    async def aclose(self) -> None:
        await self._client.aclose()
