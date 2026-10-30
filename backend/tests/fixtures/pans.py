"""Published test-range card numbers. Card-number literals live only in fixture files, where
the secret scanner allows these known test numbers (.gitleaks.toml, TD-61)."""

VISA_TEST = "4111 1111 1111 1111"
VISA_TEST_DIGITS = VISA_TEST.replace(" ", "")
VISA_TEST_DASHED = VISA_TEST.replace(" ", "-")
# Same length and prefix, wrong check digit: must not be detected as a PAN.
VISA_BAD_CHECK_DIGIT = VISA_TEST_DIGITS[:-1] + "2"
