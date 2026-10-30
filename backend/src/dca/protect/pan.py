"""PAN detection (FR-31 AC 2): 13-19 digits, optionally space- or dash-separated, passing Luhn."""

import re
from dataclasses import dataclass

# A digit, then 12-18 more digits each optionally preceded by one space or dash.
_CANDIDATE = re.compile(r"(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d])")


@dataclass(frozen=True)
class PanMatch:
    start: int
    end: int
    last4: str


def luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return len(digits) > 0 and total % 10 == 0


def detect(text: str) -> list[PanMatch]:
    """Every PAN-like sequence in `text` that passes the Luhn check."""
    found: list[PanMatch] = []
    for m in _CANDIDATE.finditer(text):
        digits = re.sub(r"[ -]", "", m.group())
        if 13 <= len(digits) <= 19 and luhn_valid(digits):
            found.append(PanMatch(m.start(), m.end(), digits[-4:]))
    return found
