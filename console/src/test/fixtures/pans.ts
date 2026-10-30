// Published test-range card numbers. Card-number literals live only in fixture files, where
// the secret scanner allows these known test numbers (.gitleaks.toml, TD-61).
export const VISA_TEST = "4111 1111 1111 1111";
export const VISA_TEST_DIGITS = VISA_TEST.replace(/ /g, "");
export const AMEX_TEST = "3782 822463 10005";
export const AMEX_TEST_DIGITS = AMEX_TEST.replace(/ /g, "");
