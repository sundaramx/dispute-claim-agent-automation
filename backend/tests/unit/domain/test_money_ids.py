"""Tests for dca.domain.ids and dca.domain.money (FR-20, NFR-11)."""

import uuid
from datetime import date
from decimal import Decimal

import pytest

from dca.domain.ids import (
    generate_uuid_v7,
    is_uuid_v7,
    make_case_ref,
    parse_case_ref,
)
from dca.domain.money import Money

# ---------------------------------------------------------------------------
# UUID v7
# ---------------------------------------------------------------------------


class TestGenerateUUIDV7:
    def test_returns_uuid(self):
        result = generate_uuid_v7()
        assert isinstance(result, uuid.UUID)

    def test_is_version_7(self):
        u = generate_uuid_v7()
        assert is_uuid_v7(u)
        assert str(u)[14] == "7"  # version nibble

    def test_uniqueness(self):
        ids = {generate_uuid_v7() for _ in range(50)}
        assert len(ids) == 50

    def test_version_and_variant_bits(self):
        u = generate_uuid_v7()
        assert u.version == 7
        # Variant byte (first byte of third group) must have top two bits = 10
        variant_byte = u.bytes[8]
        assert (variant_byte & 0xC0) == 0x80


def test_uuid_v7_sorts_across_milliseconds():
    import time

    ids = []
    for _ in range(5):
        ids.append(generate_uuid_v7())
        time.sleep(0.003)
    assert ids == sorted(ids)


class TestIsUUIDV7:
    def test_valid_v7_string(self):
        u = generate_uuid_v7()
        assert is_uuid_v7(str(u)) is True

    def test_valid_v7_uuid_obj(self):
        u = generate_uuid_v7()
        assert is_uuid_v7(u) is True

    def test_rejects_non_v7(self):
        # Clearly a v4 UUID - version nibble != 7, variant bits not set
        assert is_uuid_v7("550e8400-e29b-41d4-a716-446655440000") is False

    def test_rejects_trailing_newline(self):
        assert is_uuid_v7(str(generate_uuid_v7()) + "\n") is False

    def test_rejects_bad_format(self):
        assert is_uuid_v7("not-a-uuid") is False
        assert is_uuid_v7("") is False
        assert is_uuid_v7(str(uuid.UUID(int=0))) is False  # the nil UUID

    def test_uppercase_string_input_accepted(self):
        u = generate_uuid_v7()
        upper = str(u).upper()
        assert is_uuid_v7(upper) is True


# ---------------------------------------------------------------------------
# Case reference (DSP-YYYY-NNNNNN)
# ---------------------------------------------------------------------------


class TestMakeCaseRef:
    def test_basic(self):
        ref = make_case_ref(1, date(2026, 1, 1))
        assert ref == "DSP-2026-000001"

    def test_padding(self):
        ref = make_case_ref(42, date(2025, 6, 15))
        assert ref == "DSP-2025-000042"

    def test_max_seq(self):
        ref = make_case_ref(999_999, date(2026, 3, 1))
        assert ref == "DSP-2026-999999"

    def test_out_of_range_zero(self):
        with pytest.raises(ValueError):
            make_case_ref(0)

    def test_out_of_range_too_large(self):
        with pytest.raises(ValueError):
            make_case_ref(1_000_000)

    def test_defaults_to_today_year(self):
        ref = make_case_ref(1)
        assert ref.startswith(f"DSP-{date.today().year}-")


class TestParseCaseRef:
    def test_valid(self):
        year, seq = parse_case_ref("DSP-2026-000042")
        assert year == 2026
        assert seq == 42

    def test_leading_zeros_stripped(self):
        year, seq = parse_case_ref("DSP-2025-000001")
        assert year == 2025
        assert seq == 1

    def test_invalid_format(self):
        with pytest.raises(ValueError):
            parse_case_ref("DSP-26-000042")
        with pytest.raises(ValueError):
            parse_case_ref("DSP-2026-42")
        with pytest.raises(ValueError):
            parse_case_ref("CASE-2026-000042")
        with pytest.raises(ValueError):
            parse_case_ref("")

    def test_trailing_newline_rejected(self):
        with pytest.raises(ValueError):
            parse_case_ref("DSP-2026-000042\n")

    def test_unicode_digits_rejected(self):
        with pytest.raises(ValueError):
            parse_case_ref("DSP-2026-\u0660\u0660\u0660\u0660\u0660\u0661")

    def test_seq_zero_rejected(self):
        with pytest.raises(ValueError):
            parse_case_ref("DSP-2026-000000")

    def test_round_trip(self):
        original = make_case_ref(12345, date(2030, 7, 1))
        year, seq = parse_case_ref(original)
        assert year == 2030
        assert seq == 12345


# ---------------------------------------------------------------------------
# Money (integer minor units)
# ---------------------------------------------------------------------------


class TestMoneyConstruction:
    def test_from_int_cents(self):
        m = Money(4999)
        assert m.minor == 4999
        assert m.major.__class__.__name__ == "Decimal"
        assert m.currency == "USD"

    def test_from_decimal_dollars(self):
        m = Money.from_major(Decimal("49.99"))
        assert m.minor == 4999

    def test_rejects_float(self):
        with pytest.raises(TypeError):
            Money(49.99)  # type: ignore[arg-type]

    def test_rejects_decimal_in_constructor(self):
        with pytest.raises(TypeError):
            Money(Decimal("49.99"))  # type: ignore[arg-type]

    def test_immutable(self):
        m = Money(100)
        with pytest.raises(AttributeError):
            m._minor = 5  # type: ignore[misc]
        with pytest.raises(AttributeError):
            m.foo = 1  # type: ignore[attr-defined]

    def test_rejects_bool(self):
        with pytest.raises(TypeError):
            Money(True)  # type: ignore[arg-type]

    def test_rejects_sub_cent_decimal(self):
        # Decimal with more than 2 decimal places must raise ValueError
        with pytest.raises(ValueError):
            Money.from_major(Decimal("49.999"))

    def test_rejects_negative(self):
        with pytest.raises(ValueError):
            Money(-100)

    def test_zero_allowed(self):
        m = Money(0)
        assert m.minor == 0

    def test_non_usd_rejected(self):
        with pytest.raises(ValueError):
            Money(100, "EUR")


class TestMoneyArithmetic:
    def test_add(self):
        a = Money(100)
        b = Money(250)
        assert (a + b).minor == 350

    def test_subtract(self):
        assert (Money(500) - Money(200)).minor == 300

    def test_subtract_negative_result_rejected(self):
        with pytest.raises(ValueError):
            Money(100) - Money(200)

    def test_multiply_by_decimal(self):
        assert (Money(100) * Decimal("2.5")).minor == 250

    def test_multiply_by_float_rejected(self):
        # Floats are rejected in __mul__ — Python raises TypeError
        with pytest.raises(TypeError):
            Money(100) * 0.5  # type: ignore[operator]

    def test_multiply_by_bool_rejected(self):
        with pytest.raises(TypeError):
            Money(100) * True  # type: ignore[arg-type]

    def test_multiply_rounding_half_even(self):
        # 13 cents * 2.5 = 32.5 -> rounds to 32 (half-even)
        result = Money(13) * Decimal("2.5")
        assert result.minor == 32

    def test_comparison(self):
        a = Money(100)
        b = Money(200)
        assert a < b
        assert not (a > b)
        assert a <= a


class TestMoneyEquality:
    def test_equal_int_same_value(self):
        assert Money(500) == Money(500)

    def test_unequal(self):
        assert Money(100) != Money(200)

    def test_decimal_equivalence(self):
        # Decimal("5.00") * 100 = 500 cents
        assert Money.from_major(Decimal("5.00")) == Money(500)

    def test_not_equal_to_non_money(self):
        assert Money(100) != 100


@pytest.mark.parametrize("bad", ["NaN", "Infinity"])
def test_money_rejects_non_finite_decimal(bad: str) -> None:
    with pytest.raises(ValueError):
        Money.from_major(Decimal(bad))
