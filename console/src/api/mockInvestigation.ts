import { bundleRefs } from "./mockCopilot";
import type { CaseDetail, CitedText, CopilotRef, EvidenceItem, InvestigationBrief, Lookup, LookupKind, PlanStep, Role } from "./types";

// Deterministic stand-ins for the Investigation Co-Pilot (FR-38): the `investigation_brief`
// model task and the read-only lookup tools it may choose from (TD-59). Lookups only read
// data about this case's own card, account and merchant; code runs them, never the model.

const usd = (minor: number) => (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

interface LookupSpec {
  label: string;
  description: string;
  appliesTo: (c: CaseDetail) => boolean;
  /** Pattern a question must match for the model stand-in to pick this tool. */
  intent: RegExp;
  run: (c: CaseDetail) => { item: string; source: string; note: string; finding: string };
}

const isFraud = (c: CaseDetail) => c.category === "fraud_unauthorized";
const is412 = (c: CaseDetail) => c.ref === "DSP-2026-000412";

export const LOOKUPS: Record<LookupKind, LookupSpec> = {
  merchant_disputes: {
    label: "Other disputes at this merchant",
    description: "Count of disputes at this merchant across the portfolio, last 90 days. Aggregate only, no other customers’ data.",
    appliesTo: () => true,
    intent: /merchant.*(dispute|fraud|complain|other customers)|other (disputes|customers)|fraud (cluster|ring|pattern)/i,
    run: (c) => is412(c)
      ? { item: "Merchant dispute history, 90 days", source: "Card processor (aggregate)", note: "14 fraud disputes, 9 card-present",
          finding: `${c.claim.merchant} had 14 fraud disputes in the last 90 days, 9 of them card-present.` }
      : { item: "Merchant dispute history, 90 days", source: "Card processor (aggregate)", note: "1 dispute (this one)",
          finding: `${c.claim.merchant} has no other disputes in the last 90 days.` },
  },
  card_merchant_history: {
    label: "Earlier charges on this card at this merchant",
    description: "Every charge on this card at this merchant in the last 24 months.",
    appliesTo: () => true,
    intent: /(earlier|previous|other|past|prior) (charges|purchases|transactions)|(shopped|used).*before|card.*history/i,
    run: (c) => c.category === "duplicate"
      ? { item: "Charges on this card at this merchant", source: "Card processor", note: `2 charges of ${usd(c.amountMinor)} on ${c.claim.txnDate}`,
          finding: `The card was charged ${usd(c.amountMinor)} twice at ${c.claim.merchant} on ${c.claim.txnDate}.` }
      : { item: "Charges on this card at this merchant", source: "Card processor", note: "none in 24 months",
          finding: `There are no earlier charges on card •••• ${c.cardLast4} at ${c.claim.merchant} in the last 24 months.` },
  },
  terminal_read: {
    label: "How the card was read at the terminal",
    description: "Entry mode for this authorization: chip, contactless, magnetic stripe or keyed.",
    appliesTo: isFraud,
    intent: /terminal|chip|swipe|stripe|entry mode|how.*(read|used)|counterfeit|skim/i,
    run: (c) => is412(c)
      ? { item: "Terminal entry mode", source: "Card processor", note: "magnetic stripe at terminal 2291-07; card has a chip",
          finding: "The card was read by magnetic stripe at terminal 2291-07, although it has a chip." }
      : { item: "Terminal entry mode", source: "Card processor", note: "chip",
          finding: "The card was read by chip at the terminal." },
  },
  merchant_credits: {
    label: "Credits or refunds from this merchant",
    description: "Any credit from this merchant posted to the account since the transaction.",
    appliesTo: (c) => !isFraud(c),
    intent: /refund|credit(ed)? (from|by) (the )?merchant|merchant.*(refund|credit)|money back/i,
    run: (c) => ({ item: "Merchant credits since the transaction", source: "Core ledger", note: "none posted",
      finding: `No credit from ${c.claim.merchant} has posted since ${c.claim.txnDate}.` }),
  },
};

export function lookupsFor(c: CaseDetail): Lookup[] {
  return (Object.keys(LOOKUPS) as LookupKind[]).filter((k) => LOOKUPS[k].appliesTo(c)).map((kind) => {
    const done = c.evidence.find((e) => e.lookup?.kind === kind);
    return { kind, label: LOOKUPS[kind].label, description: LOOKUPS[kind].description, status: done ? "done" : "available", evidenceId: done?.id };
  });
}

/** The model stand-in choosing a tool: only from the closed list, only one this case allows. */
export function chooseLookup(question: string, c: CaseDetail): LookupKind | null {
  return lookupsFor(c).find((l) => LOOKUPS[l.kind].intent.test(question))?.kind ?? null;
}

export function lookupEvidence(c: CaseDetail, kind: LookupKind, requestedBy: string): EvidenceItem {
  const r = LOOKUPS[kind].run(c);
  const n = Math.max(0, ...c.evidence.map((e) => Number(e.id.slice(2)) || 0)) + 1;
  return { id: `E-${n}`, item: r.item, source: r.source, status: "present", note: r.note, lookup: { kind, requestedBy } };
}

export const lookupFinding = (c: CaseDetail, kind: LookupKind) => LOOKUPS[kind].run(c).finding;

export function buildBrief(c: CaseDetail, role: Role, now: string): InvestigationBrief {
  const refs = bundleRefs(c, role);
  const ref = (kind: CopilotRef["kind"], id: string): CopilotRef => refs.find((r) => r.kind === kind && r.id === id) ?? { kind, id, label: "__unresolved__" };
  const valid = <T extends CitedText>(xs: T[]) => xs.filter((x) => x.cites.length && x.cites.every((r) => r.label !== "__unresolved__"));
  const ev = (kind: LookupKind) => c.evidence.find((e) => e.lookup?.kind === kind);
  const pending = c.proposals.filter((p) => p.status === "pending_approval");

  const findings: CitedText[] = c.evidenceSummary.map((s) => ({ text: s.text, cites: s.cites.map((id) => ref("evidence", id)) }));
  for (const e of c.evidence.filter((x) => x.lookup)) findings.push({ text: lookupFinding(c, e.lookup!.kind), cites: [ref("evidence", e.id)] });

  const gaps: CitedText[] = c.evidence.filter((e) => e.status === "missing").map((e) => ({
    text: `${e.item} is missing${e.note ? ` (${e.note})` : ""}.`, cites: [ref("evidence", e.id)],
  }));

  const conflicts: CitedText[] = [];
  const cardPresent = c.evidence.find((e) => /card-present/i.test(e.item) && e.status === "present");
  if (isFraud(c) && cardPresent && /wallet|had my card|in my possession/i.test(c.claim.narrative)) {
    const magstripe = ev("terminal_read");
    conflicts.push({
      text: "The purchase was card-present, but the cardholder says the card never left their wallet."
        + (magstripe && /stripe/.test(magstripe.note ?? "") ? " The magnetic-stripe read suggests a counterfeit copy of the card, which would explain both." : " Checking how the card was read could explain this."),
      cites: [ref("evidence", cardPresent.id), ...(magstripe ? [ref("evidence", magstripe.id)] : [])],
    });
  }

  const risks: InvestigationBrief["risks"] = [];
  for (const k of c.clocks.filter((x) => x.state === "at_risk" || x.state === "breached")) {
    risks.push({ level: "high", text: `The ${k.label.toLowerCase()} deadline is at risk.`, cites: [ref("clock", k.id)] });
  }
  const md = ev("merchant_disputes");
  if (md && /^\d{2,}/.test(md.note ?? "")) risks.push({ level: "high", text: "The merchant shows a cluster of fraud disputes, which points to a compromised terminal or merchant.", cites: [ref("evidence", md.id)] });
  const tr = ev("terminal_read");
  if (tr && /stripe/.test(tr.note ?? "")) risks.push({ level: "high", text: "A magnetic-stripe read on a chip card is a common sign of skimming.", cites: [ref("evidence", tr.id)] });
  for (const p of pending.filter((x) => x.lowConfidence)) risks.push({ level: "medium", text: `${p.label} has low confidence (${p.confidence.toFixed(2)}).`, cites: [ref("proposal", p.id)] });
  const big = pending.find((p) => (p.amountMinor ?? 0) > 50000);
  if (big) risks.push({ level: "medium", text: `${usd(big.amountMinor!)} is over the $500 line, so a Supervisor must sign off.`, cites: [ref("proposal", big.id)] });

  const plan: PlanStep[] = [];
  const auth = c.evidence.find((e) => /authorization/i.test(e.item));
  if (auth) plan.push({ id: "s-auth", text: "Confirm the authorization and capture details.", done: auth.status === "present", cites: [ref("evidence", auth.id)] });
  for (const l of lookupsFor(c)) {
    plan.push({
      id: `s-${l.kind}`, text: `Check: ${l.label.toLowerCase()}.`, done: l.status === "done",
      cites: l.evidenceId ? [ref("evidence", l.evidenceId)] : auth ? [ref("evidence", auth.id)] : [],
      action: l.status === "done" ? undefined : { kind: "lookup", lookup: l.kind },
    });
  }
  for (const e of c.evidence.filter((x) => x.status === "missing")) {
    plan.push({ id: `s-${e.id}`, text: `Get the ${e.item.toLowerCase()} from the cardholder.`, done: false, cites: [ref("evidence", e.id)] });
  }
  for (const p of pending) {
    plan.push({
      id: `s-${p.id}`, text: `Decide: ${p.label.toLowerCase()}${p.satisfies.dueAt ? `, before the ${p.satisfies.label.toLowerCase()} deadline` : ""}.`, done: false,
      cites: [ref("proposal", p.id), ...(p.satisfies.dueAt ? [ref("clock", p.satisfies.id)] : [])], action: { kind: "proposal", proposalId: p.id },
    });
  }

  const counterfeit = tr && /stripe/.test(tr.note ?? "");
  const outcome = c.decision?.outcome.replace(/_/g, " ");
  const headline = counterfeit
    ? `Likely counterfeit-card fraud. The evidence supports ${outcome ?? "the cardholder"}.`
    : `${c.category.replace(/_/g, " ")} dispute for ${usd(c.amountMinor)}${outcome ? `; policy recommends ${outcome}` : ""}.`;

  const tag = <T extends CitedText>(xs: T[]) => xs.map((x) => ({ ...x, source: "rule" as const }));
  return {
    generatedAt: now, model: "rule-based checks", headline: headline[0].toUpperCase() + headline.slice(1),
    findings: tag(valid(findings)), gaps: tag(valid(gaps)), conflicts: tag(valid(conflicts)), risks: tag(valid(risks)),
    plan: tag(plan.filter((s) => s.cites.length && s.cites.every((r) => r.label !== "__unresolved__"))), lookups: lookupsFor(c),
  };
}
