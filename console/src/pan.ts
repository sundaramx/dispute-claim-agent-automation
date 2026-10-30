// Card-number checks used for client-side validation. The API edge re-validates and
// tokenizes; the console never stores or logs a card number (FR-31).

export const panDigits = (value: string): string => value.replace(/\D/g, "");

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

export type CardNetwork = "visa" | "mastercard" | "amex" | "discover" | "unknown";

export function cardNetwork(digits: string): CardNetwork {
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(011|5)/.test(digits)) return "discover";
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  return "unknown";
}

/** Digits in groups of four for display while typing. */
export const formatPan = (value: string): string => panDigits(value).slice(0, 19).replace(/(.{4})(?=.)/g, "$1 ");

/** Why a card number can't be submitted, or null if it can. */
export function panProblem(value: string): string | null {
  const d = panDigits(value);
  const net = cardNetwork(d);
  if (net === "amex") return "American Express is out of scope (OOS-3).";
  if (net === "discover") return "Discover is out of scope (OOS-3).";
  if (d.length < 13) return "Enter the full card number.";
  if (!luhnValid(d)) return "That card number fails the check digit. Check for a typo.";
  if (net === "unknown") return "Only Visa and Mastercard cards are supported.";
  return null;
}
