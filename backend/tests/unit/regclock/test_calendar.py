"""Unit tests for dca.regclock.calendar (FR-4 AC 1, NFR-11). Task T11."""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from dca.regclock.calendar import (
    BusinessCalendar,
    CalendarCoverageError,
    add_business_days,
    is_business_day,
)


@pytest.fixture
def cal():
    return BusinessCalendar()


@pytest.fixture
def small_cal():
    return BusinessCalendar(
        holidays=[date(2025, 1, 1), date(2025, 7, 4)],
        coverage_start=date(2025, 1, 1),
        coverage_end=date(2030, 12, 31),
    )


def test_weekday_is_business_day(small_cal):
    assert small_cal.is_business_day(date(2025, 1, 6)) is True


def test_string_input(small_cal):
    assert small_cal.is_business_day("2025-01-06") is True


@pytest.mark.parametrize("d", [date(2025, 1, 4), date(2025, 1, 5)])
def test_weekend_is_not_business_day(cal, d):
    assert cal.is_business_day(d) is False


@pytest.mark.parametrize(
    "d",
    [date(2025, 1, 1), date(2025, 1, 20), date(2026, 7, 3), date(2030, 12, 25)],
)
def test_holidays_from_yaml(cal, d):
    assert cal.is_business_day(d) is False


def test_yaml_has_all_years(cal):
    years = {h.year for h in cal._holidays}
    assert years == set(range(2025, 2031))


@pytest.mark.parametrize("d", [date(2024, 12, 31), date(2031, 1, 1)])
def test_outside_coverage_raises(cal, d):
    with pytest.raises(CalendarCoverageError, match=str(d)):
        cal.is_business_day(d)


def test_add_outside_coverage_raises(cal):
    with pytest.raises(CalendarCoverageError):
        cal.add_business_days(date(2030, 12, 30), 5)


def test_coverage_boundaries_ok(cal):
    assert cal.is_business_day(date(2025, 1, 1)) is False
    assert cal.is_business_day(date(2030, 12, 31)) is True
    assert cal.is_within_coverage(date(2030, 12, 31)) is True
    assert cal.is_within_coverage(date(2031, 1, 1)) is False


def test_add_zero(small_cal):
    assert small_cal.add_business_days(date(2025, 1, 6), 0) == date(2025, 1, 6)


def test_add_over_weekend(cal):
    assert cal.add_business_days(date(2025, 1, 3), 1) == date(2025, 1, 6)


def test_add_ten_skips_mlk(cal):
    assert cal.add_business_days(date(2025, 1, 6), 10) == date(2025, 1, 21)


def test_add_ten_without_mlk(small_cal):
    assert small_cal.add_business_days(date(2025, 1, 6), 10) == date(2025, 1, 20)


def test_add_skips_july_fourth(small_cal):
    assert small_cal.add_business_days(date(2025, 7, 1), 5) == date(2025, 7, 9)


def test_add_year_rollover(cal):
    assert cal.add_business_days(date(2025, 12, 31), 2) == date(2026, 1, 5)


def test_subtract(cal):
    assert cal.add_business_days(date(2025, 1, 6), -1) == date(2025, 1, 3)


def test_start_on_weekend(cal):
    assert cal.add_business_days(date(2025, 1, 4), 1) == date(2025, 1, 6)


def test_issuer_defaults(cal):
    assert str(cal.issuer_tz) == "America/New_York"
    assert cal.cutoff_local == time(17, 0)


def test_custom_issuer():
    c = BusinessCalendar(
        holidays=[],
        coverage_start=date(2025, 1, 1),
        coverage_end=date(2030, 12, 31),
        issuer_timezone="America/Chicago",
        cutoff_local=time(15, 30),
    )
    assert str(c.issuer_tz) == "America/Chicago"
    assert c.cutoff_local == time(15, 30)


def test_coverage_warning(cal):
    assert cal.coverage_warning_days(date(2027, 6, 15)) is None
    assert cal.coverage_warning_days(date(2030, 7, 4)) == 180
    assert cal.coverage_warning_days(date(2030, 12, 31)) == 0


def test_coverage_warning_boundary(cal):
    assert cal.coverage_warning_days(date(2030, 7, 4)) == 180
    assert cal.coverage_warning_days(date(2030, 7, 3)) is None


def test_module_level_and_determinism():
    assert is_business_day(date(2025, 1, 6)) is True
    assert is_business_day(date(2025, 1, 4)) is False
    assert add_business_days(date(2025, 1, 6), 1) == date(2025, 1, 7)
    assert add_business_days(date(2025, 1, 1), 10) == add_business_days(date(2025, 1, 1), 10)


def _nth(y, m, wd, n):
    d = date(y, m, 1)
    d += timedelta((wd - d.weekday()) % 7)
    return d + timedelta(7 * (n - 1))


def _last_monday_may(y):
    d = date(y, 5, 31)
    return d - timedelta(d.weekday())


def _obs(d):
    if d.weekday() == 5:
        return d - timedelta(1)
    if d.weekday() == 6:
        return d + timedelta(1)
    return d


def _expected(y):
    return {
        _obs(date(y, 1, 1)),
        _nth(y, 1, 0, 3),
        _nth(y, 2, 0, 3),
        _last_monday_may(y),
        _obs(date(y, 6, 19)),
        _obs(date(y, 7, 4)),
        _nth(y, 9, 0, 1),
        _nth(y, 10, 0, 2),
        _obs(date(y, 11, 11)),
        _nth(y, 11, 3, 4),
        _obs(date(y, 12, 25)),
    }


def test_yaml_matches_federal_rules_exactly(cal):
    expected = set()
    for y in range(2025, 2031):
        expected |= _expected(y)
    # 2028-01-01 observed on 2027-12-31; 2031-01-01 is out of coverage
    assert len(expected) == 66
    assert cal._holidays == expected
    assert date(2027, 6, 18) in cal._holidays
    assert date(2027, 12, 31) in cal._holidays


def test_version_loaded(cal):
    assert cal.version == "2025.1"


NY = ZoneInfo("America/New_York")


def test_cutoff_1659_vs_1700(cal):
    assert cal.effective_received_date(datetime(2025, 1, 6, 16, 59, tzinfo=NY)) == date(2025, 1, 6)
    assert cal.effective_received_date(datetime(2025, 1, 6, 17, 0, tzinfo=NY)) == date(2025, 1, 7)


def test_friday_evening_rolls_to_monday(cal):
    assert cal.effective_received_date(datetime(2025, 1, 3, 18, 0, tzinfo=NY)) == date(2025, 1, 6)


def test_weekend_receipt_rolls(cal):
    assert cal.effective_received_date(datetime(2025, 1, 4, 9, 0, tzinfo=NY)) == date(2025, 1, 6)


def test_utc_crossing_midnight_in_new_york(cal):
    # 2025-01-07 01:00 UTC == 2025-01-06 20:00 NY -> after cut-off -> Jan 7
    assert cal.effective_received_date(datetime(2025, 1, 7, 1, 0, tzinfo=UTC)) == date(2025, 1, 7)
    # 2025-01-06 21:30 UTC == 16:30 NY -> same day
    assert cal.effective_received_date(datetime(2025, 1, 6, 21, 30, tzinfo=UTC)) == date(2025, 1, 6)


def test_naive_datetime_rejected(cal):
    with pytest.raises(ValueError):
        cal.effective_received_date(datetime(2025, 1, 6, 12, 0))
