# Provenance: business-day calendar

- Source project: `disputes-claims-decision-engine` (sibling repo, Python 3.14 / SQLite).
- Source path: `disputes-claims-decision-engine/app/chassis/calendar.py`
- Source date: 2026-08-01
- Snapshot reference (the repo is not under git, so a content hash is used):
  SHA-256 `ad2c3d0c2f73af60adb00aefe6332b54a6d1980222eb4b2264e0985a7e0f4d97`
- Reuse mode: ported, not imported (ARCHITECTURE.md §1.2).
- Target: `backend/src/dca/regclock/calendar.py`, Python 3.12.

## Licence

The upstream repo has no LICENSE file; the code is reused internally, as
ARCHITECTURE.md §1.2 requires.

## Changes from upstream

- `add_business_days` now takes and returns `date` instead of `datetime` → 23:59:59
  end-of-day.
- Negative `n` is allowed instead of raising `ValueError`.
- `business_days_between` and `add_calendar_days` are not ported.
- The 2025–2027 holiday set is confirmed identical to upstream.
- Coverage extended from 2025–2027 to 2025-01-01 … 2030-12-31 (FR-4 AC 1).
- Holidays and coverage window live in `policies/calendar/us-business-days.yaml`.
- `CalendarCoverageError` is raised for any date outside coverage; no silent fallback.
- Issuer timezone `America/New_York` and 17:00 cut-off exposed on the calendar.
- `coverage_warning_days()` reports when the end is ≤ 180 days away (ARCHITECTURE.md §5.6).

Holiday dates are US federal holidays (5 U.S.C. §6103) with weekend observance applied.
