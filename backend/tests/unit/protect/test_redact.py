import pytest

from dca.protect.pan import detect, luhn_valid
from dca.protect.redact import PanEgressBlocked, egress_guard, redact
from fixtures.pans import VISA_BAD_CHECK_DIGIT, VISA_TEST, VISA_TEST_DASHED, VISA_TEST_DIGITS


def test_luhn() -> None:
    assert luhn_valid(VISA_TEST_DIGITS)
    assert not luhn_valid(VISA_BAD_CHECK_DIGIT)


@pytest.mark.parametrize("text", [VISA_TEST, VISA_TEST_DASHED, f"card {VISA_TEST_DIGITS} ok"])
def test_detects_pans_with_separators(text: str) -> None:
    assert [m.last4 for m in detect(text)] == ["1111"]


def test_ignores_non_luhn_and_short_numbers() -> None:
    assert detect(f"order {VISA_BAD_CHECK_DIGIT}, auth 4471, ref 2026-10-17") == []


def test_redacts_pan_email_phone_ssn_and_keeps_merchant() -> None:
    text = (
        f"NORTHWAY ELECTRONICS charged {VISA_TEST}; "
        "mail a@b.com or call 415-555-0134, ssn 123-45-6789"
    )
    out, mapping = redact(text)
    assert "NORTHWAY ELECTRONICS" in out
    assert "[CARD_1]" in out and "[EMAIL_1]" in out and "[PHONE_1]" in out and "[SSN_1]" in out
    assert mapping["[CARD_1]"] == VISA_TEST
    assert detect(out) == []


def test_egress_guard_fails_closed() -> None:
    with pytest.raises(PanEgressBlocked):
        egress_guard(f"payload {VISA_TEST}")
    egress_guard("payload [CARD_1]")
