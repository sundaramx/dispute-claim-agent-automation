"""Domain identifiers - UUID v7 and case reference (FR-20, NFR-11).

UUID v7 provides time-ordered 128-bit identifiers (RFC 9562).
Case references follow the format DSP-YYYY-NNNNNN for human-readable tracking.
"""

from __future__ import annotations

import os
import re
import time
import uuid
from datetime import date

# -------------------------------------------------------------------
# UUID v7 helpers
# -------------------------------------------------------------------

UUIDV7_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
    re.ASCII,
)


def generate_uuid_v7() -> uuid.UUID:
    """Return a UUID v7 (RFC 9562) generated from the current time."""
    ts_ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10), "big")
    rand_a = (rand >> 62) & 0xFFF
    rand_b = rand & ((1 << 62) - 1)
    value = (ts_ms & ((1 << 48) - 1)) << 80
    value |= 0x7 << 76
    value |= rand_a << 64
    value |= 0b10 << 62
    value |= rand_b
    return uuid.UUID(int=value)


def is_uuid_v7(value: uuid.UUID | str) -> bool:
    """Check whether a UUID has version 7 and the correct variant bits."""
    u = str(value).lower() if not isinstance(value, str) else value.lower()
    return bool(UUIDV7_PATTERN.fullmatch(u))


# -------------------------------------------------------------------
# Case reference (DSP-YYYY-NNNNNN)
# -------------------------------------------------------------------

_CASE_REF_PATTERN = re.compile(r"DSP-([0-9]{4})-([0-9]{6})", re.ASCII)


def make_case_ref(seq: int, date_of_year: date | None = None) -> str:
    """Create a case reference in the format DSP-YYYY-NNNNNN.

    Args:
        seq: 1-based sequential case number (padded to 6 digits).
        date_of_year: Optional date used to extract the year. Defaults to today.

    Returns:
        String like 'DSP-2026-000042'.

    Raises:
        ValueError: If seq is out of range for a 6-digit field.
    """
    if not (1 <= seq <= 999_999):
        raise ValueError(f"seq must be 1..999999, got {seq}")
    year = date_of_year.year if date_of_year else date.today().year
    return f"DSP-{year:04d}-{seq:06d}"


def parse_case_ref(ref: str) -> tuple[int, int]:
    """Parse a case reference into (year, seq).

    Raises:
        ValueError: If the format is invalid.
    """
    m = _CASE_REF_PATTERN.fullmatch(ref)
    if not m:
        raise ValueError(f"Invalid case reference format: {ref!r}")
    year = int(m.group(1))
    seq = int(m.group(2))
    if seq < 1:
        raise ValueError(f"Case sequence must be >= 1: {ref!r}")
    return (year, seq)


__all__ = ["generate_uuid_v7", "is_uuid_v7", "make_case_ref", "parse_case_ref"]
