"""Calendar and business-day arithmetic for regulatory clocks.

Ported from disputes-claims-decision-engine (see _vendor/calendar/PROVENANCE.md).

FR-4 AC 1 · NFR-11 AC 2 — deterministic, coverage-checked calendar.
"""

from __future__ import annotations

import pathlib
from datetime import date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo

import yaml

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class CalendarCoverageError(Exception):
    """Raised when a date falls outside the configured coverage window.

    FR-4 AC 1: fail loudly — never silently treat an out-of-range date as a
    business day.
    """


# ---------------------------------------------------------------------------
# YAML loader
# ---------------------------------------------------------------------------

_DEFAULT_YAML = (
    pathlib.Path(__file__).resolve().parents[4] / "policies" / "calendar" / "us-business-days.yaml"
)


def _load_calendar_yaml(path: pathlib.Path | None = None) -> dict[str, object]:
    """Load and return the calendar YAML as a plain dict."""
    p = path or _DEFAULT_YAML
    raw = yaml.safe_load(p.read_text())
    if not isinstance(raw, dict):
        raise ValueError(f"Calendar YAML must be a mapping at {p}")
    return raw


def _parse_iso(v: object) -> date:
    """Convert an ISO-string (or date) to ``date``."""
    if isinstance(v, date):
        return v
    if isinstance(v, str):
        return date.fromisoformat(v)
    raise TypeError(f"Cannot convert {type(v).__name__} to date: {v!r}")


# ---------------------------------------------------------------------------
# Calendar class — pure, deterministic, stateless
# ---------------------------------------------------------------------------


class BusinessCalendar:
    """US federal-holiday business-day calendar with coverage enforcement.

    All public methods are deterministic for the same inputs (NFR-11).
    """

    def __init__(  # noqa: PLR0913
        self,
        *,
        yaml_path: pathlib.Path | None = None,
        holidays: list[date] | None = None,
        coverage_start: date | None = None,
        coverage_end: date | None = None,
        issuer_timezone: str | tzinfo | None = None,
        cutoff_local: time | None = None,
    ) -> None:
        cfg: dict[str, object] = {}
        if yaml_path is not None or holidays is None:
            cfg = _load_calendar_yaml(yaml_path)

        self._holidays: set[date] = (
            set(holidays)
            if holidays is not None
            else self._parse_holiday_list(cfg.get("holidays", []))  # type: ignore[arg-type]
        )
        self.version: str = str(cfg.get("version", "unversioned"))
        self.coverage_start: date = coverage_start or _parse_iso(cfg["coverage_start"])
        self.coverage_end: date = coverage_end or _parse_iso(cfg["coverage_end"])
        tz: str | tzinfo = (
            issuer_timezone
            if issuer_timezone is not None
            else str(cfg.get("timezone", "America/New_York"))
        )
        self.issuer_tz: tzinfo = ZoneInfo(tz) if isinstance(tz, str) else tz
        if cutoff_local is not None:
            self.cutoff_local: time = cutoff_local
        else:
            self.cutoff_local = time.fromisoformat(str(cfg.get("cutoff_local", "17:00")))

    # -- public API ----------------------------------------------------------

    def is_business_day(self, d: date | str) -> bool:
        """Return ``True`` when *d* is a Mon-Fri workday that is not a holiday.

        Raises :class:`CalendarCoverageError` when *d* is outside the
        coverage window (FR-4 AC 1).
        """
        d = _parse_iso(d)
        self._check_coverage(d)
        if d.weekday() >= 5:  # Sat == 5, Sun == 6
            return False
        return d not in self._holidays

    def add_business_days(self, start: date | str, n: int) -> date:
        """Return the calendar date that is *n* business days after *start*.

        Negative *n* moves backward. ``n == 0`` returns *start* (after
        coverage check).
        """
        current = _parse_iso(start)
        self._check_coverage(current)
        if n == 0:
            return current

        step = 1 if n > 0 else -1
        remaining = abs(n)
        while remaining:
            current += timedelta(days=step)
            if self.is_business_day(current):
                remaining -= 1
        return current

    def effective_received_date(self, received_at: datetime) -> date:
        """Return the business date a notice counts as received.

        Converts to issuer time; at/after the cut-off or on a non-business
        day the date rolls to the next business day. Naive datetimes are
        rejected.
        """
        if received_at.tzinfo is None or received_at.utcoffset() is None:
            raise ValueError("received_at must be timezone-aware")
        local = received_at.astimezone(self.issuer_tz)
        d = local.date()
        if local.time().replace(tzinfo=None) >= self.cutoff_local or not self.is_business_day(d):
            d = self.add_business_days(d, 1)
        return d

    def is_within_coverage(self, d: date | str) -> bool:
        """Check whether *d* falls within the coverage window (no exception)."""
        d = _parse_iso(d)
        return self.coverage_start <= d <= self.coverage_end

    def coverage_warning_days(self, reference: date | str | None = None) -> int | None:
        """Return days until coverage ends (or ``None`` — no warning).

        A warning is emitted when the gap is **<= 180 days** (FR-4 AC 1).
        Returns ``None`` when comfortably within coverage, or an integer
        indicating proximity.
        """
        ref: date = date.today() if reference is None else _parse_iso(reference)
        remaining = (self.coverage_end - ref).days
        if remaining <= 180:
            return remaining
        return None

    # -- internals -----------------------------------------------------------

    def _parse_holiday_list(self, items: list[object]) -> set[date]:
        """Convert a YAML holiday list to a ``set[date]``."""
        dates: set[date] = set()
        for item in items:
            if isinstance(item, dict):
                d = item.get("date")  # ISO string or date object
            else:
                d = item
            dates.add(_parse_iso(d))
        return dates

    def _check_coverage(self, d: date) -> None:
        if not (self.coverage_start <= d <= self.coverage_end):
            raise CalendarCoverageError(
                f"{d} is outside calendar coverage [{self.coverage_start}, {self.coverage_end}]"
            )


# ---------------------------------------------------------------------------
# Module-level convenience — default US federal calendar
# ---------------------------------------------------------------------------

_default_calendar: BusinessCalendar | None = None


def _get_default() -> BusinessCalendar:
    global _default_calendar  # noqa: PLW0603
    if _default_calendar is None:
        _default_calendar = BusinessCalendar()
    return _default_calendar


def is_business_day(d: date | str) -> bool:
    """Check business-day status using the default calendar."""
    return _get_default().is_business_day(d)


def add_business_days(start: date | str, n: int) -> date:
    """Add *n* business days using the default calendar."""
    return _get_default().add_business_days(start, n)
