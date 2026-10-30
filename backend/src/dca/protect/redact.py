"""Redaction before any LLM egress (FR-31 AC 2, ARCHITECTURE §7.1 step 2).

PANs, emails, phone numbers and SSNs become numbered placeholders. Merchant names are kept
(OQ-7, TD-30). The placeholder map stays server-side; it is never sent to a model.
"""

import re

from dca.protect.pan import detect

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_PHONE = re.compile(r"(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)")


class PanEgressBlocked(Exception):
    """A PAN survived redaction. The call is refused and must alert (fail closed)."""


def redact(text: str) -> tuple[str, dict[str, str]]:
    """Return `text` with PII replaced by placeholders, and the placeholder → value map."""
    mapping: dict[str, str] = {}
    counters: dict[str, int] = {}

    def placeholder(kind: str, value: str) -> str:
        counters[kind] = counters.get(kind, 0) + 1
        key = f"[{kind}_{counters[kind]}]"
        mapping[key] = value
        return key

    # PANs first, right to left so earlier offsets stay valid.
    for m in sorted(detect(text), key=lambda m: m.start, reverse=True):
        text = text[: m.start] + placeholder("CARD", text[m.start : m.end]) + text[m.end :]

    def replace_all(kind: str, pattern: re.Pattern[str], s: str) -> str:
        return pattern.sub(lambda m: placeholder(kind, m.group()), s)

    for kind, pattern in (("EMAIL", _EMAIL), ("SSN", _SSN), ("PHONE", _PHONE)):
        text = replace_all(kind, pattern, text)
    return text, mapping


def egress_guard(payload: str) -> None:
    """Re-run PAN detection on the final payload; raise if anything slipped through."""
    if detect(payload):
        raise PanEgressBlocked("PAN-like sequence in LLM payload after redaction")
