import type { CaseDetail, Category, Clock, Proposal } from "./types";

// Synthetic seed data for the mock API. Matches prototype/ so screens and prototype agree.
// Mock "now" is Wed 2026-10-28 09:30 ET.
export const MOCK_NOW = "2026-10-28T13:30:00Z";

function clock(
  id: string,
  label: string,
  detail: string,
  dueAt: string | null,
  remaining: number | null,
  remainingUnit: Clock["remainingUnit"],
  state: Clock["state"],
  elapsedPct: number,
): Clock {
  return { id, label, detail, dueAt, remaining, remainingUnit, state, elapsedPct };
}

function proposal(p: Omit<Proposal, "status" | "contentHash"> & { contentHash?: string }): Proposal {
  return {
    status: "pending_approval",
    contentHash: p.contentHash ?? `sha256:${p.id.toLowerCase()}-${p.caseRef.slice(-6)}`,
    ...p,
  };
}

interface Seed {
  ref: string;
  status: CaseDetail["status"];
  regime: CaseDetail["regime"];
  network: CaseDetail["network"];
  category: Category;
  reasonCode: string;
  amountMinor: number;
  channel: CaseDetail["channel"];
  assignee: string | null;
  networkCritical?: boolean;
  merchant: string;
  clock: Clock;
}

const SEEDS: Seed[] = [
  { ref: "DSP-2026-000398", status: "awaiting_approval", regime: "reg_e", network: "mastercard", category: "non_receipt", reasonCode: "4855", amountMinor: 21940, channel: "portal", assignee: "analyst2", merchant: "BRIGHTWAY HOME GOODS",
    clock: clock("clk-398", "Investigate or credit", "10 business days", "2026-10-29T21:00:00Z", 1, "BD", "at_risk", 90) },
  { ref: "DSP-2026-000366", status: "awaiting_approval", regime: "reg_z", network: "mastercard", category: "not_as_described", reasonCode: "4853", amountMinor: 31000, channel: "ivr", assignee: "analyst1", merchant: "LAKESIDE OUTFITTERS",
    clock: clock("clk-366", "Written acknowledgment", "30 days", "2026-10-30T21:00:00Z", 2, "days", "at_risk", 93) },
  { ref: "DSP-2026-000401", status: "needs_manual_completion", regime: "reg_e", network: "visa", category: "duplicate", reasonCode: "12.6", amountMinor: 3820, channel: "portal", assignee: null, merchant: "CORNER MARKET 88",
    clock: clock("clk-401", "Investigate or credit", "10 business days", "2026-10-30T21:00:00Z", 2, "BD", "at_risk", 80) },
  { ref: "DSP-2026-000355", status: "awaiting_approval", regime: "reg_e", network: "mastercard", category: "not_as_described", reasonCode: "4853", amountMinor: 12900, channel: "api", assignee: "analyst1", networkCritical: true, merchant: "PIXEL PRINT STUDIO",
    clock: clock("clk-355", "Mastercard filing window", "4853", "2026-11-02T22:00:00Z", 3, "days", "at_risk", 85) },
  { ref: "DSP-2026-000377", status: "awaiting_approval", regime: "reg_z", network: "visa", category: "credit_not_processed", reasonCode: "13.6", amountMinor: 6499, channel: "console", assignee: "analyst1", merchant: "TRAILHEAD SUPPLY",
    clock: clock("clk-377", "Written acknowledgment", "30 days", "2026-11-01T22:00:00Z", 4, "days", "open", 86) },
  { ref: "DSP-2026-000412", status: "awaiting_approval", regime: "reg_e", network: "visa", category: "fraud_unauthorized", reasonCode: "10.4", amountMinor: 84217, channel: "api", assignee: "supervisor1", merchant: "NORTHWAY ELECTRONICS #2291",
    clock: clock("clk-pc", "Investigate or credit", "10 business days", "2026-11-03T22:00:00Z", 4, "BD", "open", 60) },
  { ref: "DSP-2026-000312", status: "representment_review", regime: "reg_e", network: "visa", category: "fraud_unauthorized", reasonCode: "10.4", amountMinor: 5780, channel: "api", assignee: "analyst2", merchant: "SKYLINE TICKETS",
    clock: clock("clk-312", "Representment response", "Visa response window", "2026-11-06T22:00:00Z", 9, "days", "open", 45) },
  { ref: "DSP-2026-000431", status: "triaged", regime: "reg_e", network: "visa", category: "duplicate", reasonCode: "12.6", amountMinor: 4900, channel: "chat", assignee: null, merchant: "NORTHSIDE FITNESS",
    clock: clock("clk-431", "Investigate or credit", "10 business days", "2026-11-12T22:00:00Z", 10, "BD", "open", 2) },
  { ref: "DSP-2026-000299", status: "manual_prearb", regime: "reg_e", network: "mastercard", category: "credit_not_processed", reasonCode: "4860", amountMinor: 45000, channel: "portal", assignee: "supervisor1", merchant: "HARBOR FURNITURE",
    clock: clock("clk-299", "Extended investigation", "Manual queue", "2026-11-12T22:00:00Z", 10, "BD", "open", 55) },
  { ref: "DSP-2026-000340", status: "awaiting_network", regime: "reg_z", network: "mastercard", category: "fraud_unauthorized", reasonCode: "4837", amountMinor: 131055, channel: "api", assignee: "supervisor2", merchant: "AURORA JEWELERS",
    clock: clock("clk-340", "Resolution", "2 billing cycles, max 90 days", "2026-12-14T22:00:00Z", 47, "days", "open", 30) },
];

const PROPOSALS: Record<string, (c: Clock) => Proposal[]> = {
  "DSP-2026-000398": (c) => [proposal({ id: "P-7", caseRef: "DSP-2026-000398", label: "Provisional credit", amountMinor: 21940, preparer: "svc:decide", requiredRole: "analyst", lowConfidence: false, confidence: 0.91, ruleId: "RE-PC-001", satisfies: c })],
  "DSP-2026-000366": (c) => [proposal({ id: "P-9", caseRef: "DSP-2026-000366", label: "Acknowledgment letter", amountMinor: null, preparer: "svc:decide", requiredRole: "analyst", lowConfidence: false, confidence: 0.88, ruleId: "RZ-ACK-001", satisfies: c })],
  "DSP-2026-000355": (c) => [proposal({ id: "P-4", caseRef: "DSP-2026-000355", label: "Chargeback filing", amountMinor: 12900, preparer: "svc:decide", requiredRole: "supervisor", lowConfidence: true, confidence: 0.74, ruleId: "NET-CB-002", satisfies: c })],
  "DSP-2026-000377": (c) => [proposal({ id: "P-6", caseRef: "DSP-2026-000377", label: "Provisional credit (edited)", amountMinor: 6499, preparer: "supervisor1", requiredRole: "analyst", lowConfidence: false, confidence: 0.95, ruleId: "RZ-CR-003", satisfies: c })],
};

const CATEGORY_CLAIM: Record<Category, string> = {
  fraud_unauthorized: "I did not make this purchase.",
  non_receipt: "I paid for this order but it never arrived.",
  not_as_described: "What I received was not what the listing described.",
  duplicate: "I was charged twice for the same purchase.",
  credit_not_processed: "I returned the item but never got my refund.",
};

function genericDetail(s: Seed, index: number): CaseDetail {
  const seq = 46010 + index * 10; // audit sequence numbers are unique across the whole chain
  const proposals = PROPOSALS[s.ref]?.(s.clock) ?? [];
  return {
    ref: s.ref, status: s.status, regime: s.regime, network: s.network, category: s.category, reasonCode: s.reasonCode,
    amountMinor: s.amountMinor, channel: s.channel, assignee: s.assignee, networkCritical: s.networkCritical ?? false, nearestClock: s.clock,
    cardLast4: "2290", productType: s.regime === "reg_e" ? "debit" : "credit", noticeReceivedAt: "2026-10-21T14:05:00Z",
    claim: { merchant: s.merchant, txnDate: "2026-10-16", txnRef: "auth 5520-C", matched: true, narrative: CATEGORY_CLAIM[s.category], learnedOn: "2026-10-19" },
    evidence: [
      { id: "E-1", item: "Authorization and capture details", source: "Card processor", status: "present" },
      { id: "E-2", item: "Prior disputes on the account", source: "Core ledger", status: "present", note: "none" },
      { id: "E-3", item: "Customer contact history", source: "CRM", status: "present" },
    ],
    evidenceSummary: [
      { text: "The transaction is matched and authorized on the card.", cites: ["E-1"] },
      { text: "The account has no prior disputes.", cites: ["E-2"] },
    ],
    decision: proposals.length
      ? { outcome: proposals[0].label.toLowerCase().includes("chargeback") ? "file_chargeback" : "grant_provisional_credit",
          trace: [{ ruleId: proposals[0].ruleId, text: "Minimum evidence present and clock open" }],
          confidence: proposals[0].confidence, components: { ruleCoverage: 0.95, evidence: 0.9, model: 0.85 }, policyVersion: "2026.10.1", configVersion: 14 }
      : null,
    clocks: [s.clock],
    proposals,
    drafts: [],
    timeline: [
      { seq, at: "2026-10-21T14:05:00Z", text: `intake.received · ${s.channel}`, actor: "svc:api", kind: "event" },
      { seq: seq + 4, at: "2026-10-21T14:07:00Z", text: "triage.completed · clocks created", actor: "svc:triage", kind: "event" },
    ],
  };
}

function case412(): CaseDetail {
  const i = SEEDS.findIndex((s) => s.ref === "DSP-2026-000412");
  const base = genericDetail(SEEDS[i], i);
  const pc = base.nearestClock;
  const visa = clock("clk-visa", "Visa filing window", "10.4", "2026-12-15T22:00:00Z", 48, "days", "open", 14);
  const ext = clock("clk-ext", "Extended investigation", "45 days, if credited in time", null, null, "days", "not_started", 0);
  const pcNotice = clock("clk-pcn", "PC notice", "2 business days after the credit posts", null, null, "BD", "not_started", 0);
  return {
    ...base,
    cardLast4: "4417",
    noticeReceivedAt: "2026-10-20T14:14:00Z",
    claim: { merchant: "NORTHWAY ELECTRONICS #2291", txnDate: "2026-10-17", txnRef: "auth 4471-A", matched: true,
      narrative: "I did not make this purchase. I was at work. My card was in my wallet. I noticed it on the app on the 19th.", learnedOn: "2026-10-19" },
    evidence: [
      { id: "E-1", item: "Authorization and capture details", source: "Card processor", status: "present" },
      { id: "E-2", item: "Card-present indicator and device data", source: "Card processor", status: "present" },
      { id: "E-3", item: "Prior disputes on the account", source: "Core ledger", status: "present", note: "none" },
      { id: "E-4", item: "Customer contact history", source: "CRM", status: "present" },
      { id: "E-5", item: "Signed affidavit of unauthorized use", source: "Customer", status: "missing", note: "request drafted" },
      { id: "E-6", item: "Merchant credit record", source: "—", status: "not_applicable" },
    ],
    evidenceSummary: [
      { text: "The transaction was card-present at a merchant profile that does not match prior use.", cites: ["E-2"] },
      { text: "The cardholder reported it two days after posting.", cites: ["E-4"] },
      { text: "There are no prior disputes on the account.", cites: ["E-3"] },
      { text: "An affidavit is still outstanding.", cites: ["E-5"] },
    ],
    decision: {
      outcome: "grant_provisional_credit",
      trace: [
        { ruleId: "RE-REG-01", text: "Debit product → Reg E" },
        { ruleId: "NET-01", text: "BIN → Visa" },
        { ruleId: "CAT-FRAUD-02", text: "Fraud → 10.4 (table v7); the model agreed" },
        { ruleId: "RE-PC-001", text: "Minimum evidence present, clock open → grant provisional credit" },
      ],
      confidence: 0.93, components: { ruleCoverage: 0.97, evidence: 0.91, model: 0.88 }, policyVersion: "2026.10.1", configVersion: 14,
    },
    clocks: [pc, ext, visa, pcNotice],
    proposals: [
      proposal({ id: "P-1", caseRef: "DSP-2026-000412", label: "Provisional credit", amountMinor: 84217, preparer: "svc:decide", requiredRole: "supervisor", lowConfidence: false, confidence: 0.93, ruleId: "RE-PC-001", satisfies: pc, contentHash: "sha256:9c1e…b47a" }),
      proposal({ id: "P-2", caseRef: "DSP-2026-000412", label: "Provisional credit notice letter", amountMinor: null, preparer: "svc:decide", requiredRole: "analyst", lowConfidence: false, confidence: 0.93, ruleId: "RE-NOTICE-PC", satisfies: pcNotice, contentHash: "sha256:51d0…e902" }),
      proposal({ id: "P-3", caseRef: "DSP-2026-000412", label: "Chargeback filing to Visa (10.4)", amountMinor: 84217, preparer: "svc:decide", requiredRole: "supervisor", lowConfidence: false, confidence: 0.93, ruleId: "NET-CB-001", satisfies: visa, contentHash: "sha256:c7a3…1f08" }),
    ],
    drafts: [
      { id: "D-1", proposalId: "P-2", label: "Provisional credit notice", version: 1, provenance: "template pc_notice.v3 · prompt drafting.v2 · model mock-1 · svc:decide",
        checks: ["Reg E disclosures present", "Amounts and dates match the case", "No card number or extra PII"],
        body: "Dear [NAME_1],\n\nWe have credited $842.17 to your account on a provisional basis while we investigate the transaction of 10/17/2026 at NORTHWAY ELECTRONICS. We will complete our investigation within 45 days of your notice dated 10/20/2026." },
      { id: "D-2", label: "Customer info request", version: 1, provenance: "template info_request.v2 · prompt drafting.v2 · model mock-1 · svc:investigate",
        checks: ["No card number or extra PII"],
        body: "Dear [NAME_1],\n\nTo complete our review of DSP-2026-000412, please sign and return the enclosed statement that you did not authorize the purchase of $842.17 at NORTHWAY ELECTRONICS on 10/17/2026." },
    ],
    timeline: [
      { seq: 47102, at: "2026-10-20T14:14:00Z", text: "intake.received · REST API", actor: "svc:api", kind: "event" },
      { seq: 47103, at: "2026-10-20T14:15:00Z", text: "claim.extracted · extraction.v1", actor: "svc:intake", kind: "ai" },
      { seq: 47109, at: "2026-10-20T14:16:00Z", text: "triage.completed · 3 clocks created", actor: "svc:triage", kind: "event" },
      { seq: 47201, at: "2026-10-21T12:02:00Z", text: "evidence.collected · 5 items", actor: "svc:investigate", kind: "event" },
      { seq: 47388, at: "2026-10-21T12:05:00Z", text: "decision.made · confidence 0.93", actor: "svc:decide", kind: "ai" },
      { seq: 47389, at: "2026-10-21T12:05:00Z", text: "proposal.created ×3", actor: "svc:decide", kind: "event" },
      { seq: 47911, at: "2026-10-22T19:48:00Z", text: "security.four_eyes_violation · approval of own edit denied (403)", actor: "analyst2", kind: "security" },
    ],
  };
}

/** A fresh copy of the seed, so every mock API instance (and every test) starts clean. */
export function createSeed(): Map<string, CaseDetail> {
  const cases = SEEDS.map((s, i) => (s.ref === "DSP-2026-000412" ? case412() : genericDetail(s, i)));
  return new Map(cases.map((c) => [c.ref, structuredClone(c)]));
}
