import type { CaseStatus, Category, Channel, Network, Regime } from "./api/types";

export const money = (minor: number | null): string =>
  minor === null ? "—" : (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const REGIME: Record<Regime, string> = { reg_e: "Reg E", reg_z: "Reg Z" };
export const NETWORK: Record<Network, string> = { visa: "Visa", mastercard: "Mastercard" };
export const CATEGORY: Record<Category, string> = {
  fraud_unauthorized: "Fraud",
  non_receipt: "Non-receipt",
  not_as_described: "Not as described",
  duplicate: "Duplicate",
  credit_not_processed: "Credit not processed",
};
export const CHANNEL: Record<Channel, string> = { api: "REST API", console: "Console", portal: "Portal", ivr: "IVR", chat: "Chat" };

export const statusLabel = (s: CaseStatus): string => s.replace(/_/g, " ");

export const STATUS_TONE: Partial<Record<CaseStatus, string>> = {
  awaiting_approval: "brand",
  needs_manual_completion: "warn",
  needs_attention: "warn",
  investigating: "info",
  triaged: "info",
  representment_review: "info",
  executing: "auto",
  resolved: "ok",
};

const ET = "America/New_York";

/** e.g. "Tue Nov 3 · 17:00" in issuer time. */
export function dueLabel(iso: string | null): string {
  if (!iso) return "Not started";
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: ET, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day.replace(",", "")} · ${time}`;
}

export function dateTimeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: ET, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
