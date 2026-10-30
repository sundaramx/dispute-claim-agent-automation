// Shapes mirror the API contracts in ARCHITECTURE §6. When the API exists, T83 replaces
// these hand-written types with the client generated from /api/v1/openapi.json.

export type Role = "analyst" | "supervisor" | "auditor" | "admin";

export interface User {
  id: string;
  displayName: string;
  role: Role;
}

export type Regime = "reg_e" | "reg_z";
export type Network = "visa" | "mastercard";
export type Category =
  | "fraud_unauthorized"
  | "non_receipt"
  | "not_as_described"
  | "duplicate"
  | "credit_not_processed";
export type CaseStatus =
  | "received"
  | "triaged"
  | "investigating"
  | "needs_attention"
  | "needs_manual_completion"
  | "deciding"
  | "awaiting_approval"
  | "executing"
  | "awaiting_network"
  | "representment_review"
  | "manual_prearb"
  | "resolved"
  | "closed";
export type Channel = "api" | "console" | "portal" | "ivr" | "chat";
export type ClockState = "open" | "at_risk" | "satisfied" | "breached" | "not_started";

export interface Clock {
  id: string;
  label: string;
  detail: string;
  dueAt: string | null; // ISO-8601 UTC
  // The server counts in the unit the regulation uses: business days for Reg E, calendar days otherwise.
  remaining: number | null;
  remainingUnit: "BD" | "days";
  state: ClockState;
  elapsedPct: number;
}

export interface CaseSummary {
  ref: string;
  status: CaseStatus;
  regime: Regime;
  network: Network;
  category: Category;
  reasonCode: string;
  amountMinor: number;
  channel: Channel;
  assignee: string | null;
  networkCritical: boolean;
  nearestClock: Clock;
}

export interface EvidenceItem {
  id: string; // E-n
  item: string;
  source: string;
  status: "present" | "missing" | "not_applicable";
  note?: string;
  /** Set when an Investigation Co-Pilot lookup collected this item (FR-38). */
  lookup?: { kind: LookupKind; requestedBy: string };
}

export interface SummarySentence {
  text: string;
  cites: string[];
}

export interface Decision {
  outcome: string;
  trace: { ruleId: string; text: string }[];
  confidence: number;
  components: { ruleCoverage: number; evidence: number; model: number };
  policyVersion: string;
  configVersion: number;
}

export type ProposalStatus = "pending_approval" | "approved" | "rejected" | "returned";

export interface Proposal {
  id: string;
  caseRef: string;
  label: string;
  amountMinor: number | null;
  preparer: string; // svc:decide for unedited agent drafts, otherwise the editing user (D-2)
  requiredRole: "analyst" | "supervisor";
  lowConfidence: boolean;
  confidence: number;
  status: ProposalStatus;
  contentHash: string;
  ruleId: string;
  satisfies: Clock;
}

export interface Draft {
  id: string;
  /** The proposal this draft is part of, if any. Editing the draft supersedes that proposal (FR-11 AC 4). */
  proposalId?: string;
  label: string;
  version: number;
  body: string;
  checks: string[];
  provenance: string;
}

export interface TimelineEvent {
  seq: number;
  at: string;
  text: string;
  actor: string;
  kind: "event" | "ai" | "security";
}

export interface CaseDetail extends CaseSummary {
  cardLast4: string;
  productType: "debit" | "credit";
  noticeReceivedAt: string;
  claim: {
    merchant: string;
    txnDate: string;
    txnRef: string;
    matched: boolean;
    narrative: string;
    learnedOn: string | null;
  };
  evidence: EvidenceItem[];
  evidenceSummary: SummarySentence[];
  decision: Decision | null;
  clocks: Clock[];
  proposals: Proposal[];
  drafts: Draft[];
  timeline: TimelineEvent[];
}

export interface InboxItem {
  proposal: Proposal;
  caseSummary: CaseSummary;
}

export interface Inbox {
  items: InboxItem[];
  // Proposals the caller can't decide, by reason, so the UI can explain what's missing.
  hidden: { reason: string; count: number }[];
}

export interface SystemInfo {
  autoApproveEnabled: boolean;
  mockLlm: boolean;
  /** The local model behind the Co-Pilot when the gateway bridge is up, else null (rule-based answers). */
  localModel: string | null;
  supervisorThresholdMinor: number;
}

export interface CaseQuery {
  regime?: Regime;
  network?: Network;
  category?: Category;
  text?: string;
}

/** RFC 9457 problem details, as the API returns them (ARCHITECTURE §6.1). */
export class ProblemError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field-level validation errors (`errors[]` in the problem body), keyed by field name. */
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, detail: string, fieldErrors: Record<string, string> = {}) {
    super(detail);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

// ---- Case copilot (FR-36, CR-1) ----
/** Something on the case a copilot sentence points at. Every factual sentence cites at least one. */
export interface CopilotRef {
  kind: "claim" | "evidence" | "rule" | "clock" | "proposal" | "draft";
  id: string;
  label: string;
}

/** Closed list (ARCHITECTURE §5.9). Runs only when a human clicks it, as that human. */
export type SuggestedAction =
  | { kind: "redraft"; label: string; draftId: string; instruction: string }
  | { kind: "add_note"; label: string; text: string };

export interface CopilotTurn {
  n: number;
  role: "human" | "assistant";
  author: string;
  at: string;
  text: string; // the human's question, or the fixed fallback reply
  sentences: { text: string; cites: CopilotRef[] }[];
  suggestedActions: SuggestedAction[];
  meta: string;
}

// ---- Investigation Co-Pilot (FR-38, CR-1) ----
/** Closed list of read-only lookups, scoped to the case's own card, account and merchant (TD-59). */
export type LookupKind = "merchant_disputes" | "card_merchant_history" | "terminal_read" | "merchant_credits";

export interface Lookup {
  kind: LookupKind;
  label: string;
  description: string;
  status: "available" | "done";
  evidenceId?: string;
}

export interface CitedText {
  text: string;
  cites: CopilotRef[];
  /** Who produced it: the model (validated) or a deterministic rule check. */
  source?: "model" | "rule";
}

export interface PlanStep extends CitedText {
  id: string;
  done: boolean;
  /** One-click next action: run a lookup, or open the proposal that completes the step. */
  action?: { kind: "lookup"; lookup: LookupKind } | { kind: "proposal"; proposalId: string };
}

export interface InvestigationBrief {
  generatedAt: string;
  model: string;
  /** Set when the local model wasn't used, saying why. */
  fallbackReason?: string;
  headline: string;
  findings: CitedText[];
  gaps: CitedText[];
  conflicts: CitedText[];
  risks: (CitedText & { level: "low" | "medium" | "high" })[];
  plan: PlanStep[];
  lookups: Lookup[];
}

// ---- SLA dashboard (FR-24, FR-30) ----
export interface Kpi {
  value: number;
  trend: number[];
}

export interface Dashboard {
  deadlineCompliance: Kpi & { late: number; closed: number }; // SM-1
  handlingTimeReduction: Kpi & { baselineValidated: boolean }; // SM-2
  qaAgreement: Kpi & { agreed: number; reviewed: number };
  atRisk: Kpi & { changeSinceYesterday: number };
  clocksByState: { group: string; open: number; atRisk: number; breached: number }[];
  dueSoon: { ref: string; clock: string; dueAt: string; nextAction: string }[];
  handlingMinutes: { category: Category; now: number; baseline: number }[];
  autoApprove: { enabled: boolean; lastChangedBy: string; lastChangedAt: string };
  /** Null when the caller's role can't see LLM usage (analysts). */
  llmUsage: { task: string; provider: string; calls: number; tokens: number; p95Ms: number; costUsd: number }[] | null;
}

// ---- Manual intake (FR-1) ----
export interface NewDispute {
  pan: string; // tokenized by the API edge before anything is stored (FR-31)
  productType: "debit" | "credit";
  merchant: string;
  amountMinor: number;
  txnDate: string;
  learnedOn: string;
  category: Category;
  narrative: string;
}

// ---- Audit (FR-26..FR-28) ----
export interface AuditEvent {
  seq: number;
  at: string;
  actor: string;
  actorType: "human" | "service" | "system" | "customer";
  caseRef: string | null;
  type: string;
  versions: string;
  hash: string;
  prevHash: string;
  restricted: boolean;
}

export interface AuditQuery {
  caseRef?: string;
  actor?: string;
  typePrefix?: string;
}

export interface VerifyResult {
  status: "ok" | "broken";
  fromSeq: number;
  toSeq: number;
  firstBadSeq?: number;
  reason?: string;
}

export interface ReplayResult {
  caseRef: string;
  match: boolean;
  decisions: number;
  diffs: string[];
}

// ---- Configuration (FR-25, FR-13) ----
export interface Config {
  version: number;
  supervisorThresholdMinor: number;
  autoThresholdMinor: number;
  confidenceLow: number;
  confidenceHigh: number;
  qaSampleRate: number;
  autoApproveEnabled: boolean;
  llmRoutes: { task: string; primary: string; failover: string; region: string }[];
}

export type ConfigPatch = Partial<Pick<Config, "supervisorThresholdMinor" | "autoThresholdMinor" | "confidenceLow" | "confidenceHigh" | "qaSampleRate">>;

export interface ConfigVersion {
  version: number;
  author: string;
  at: string;
  changes: string[];
  reason: string;
}

export interface DisputeApi {
  systemInfo(): Promise<SystemInfo>;
  listCases(query?: CaseQuery): Promise<CaseSummary[]>;
  getCase(ref: string): Promise<CaseDetail>;
  inbox(): Promise<Inbox>;
  approve(proposalId: string, expectedContentHash: string): Promise<Proposal>;
  reject(proposalId: string, expectedContentHash: string, reason: string): Promise<Proposal>;
  returnForRework(proposalId: string, expectedContentHash: string, reason: string): Promise<Proposal>;
  assign(ref: string): Promise<CaseSummary>;
  copilotTranscript(ref: string): Promise<CopilotTurn[]>;
  askCopilot(ref: string, question: string): Promise<CopilotTurn>;
  runCopilotAction(ref: string, action: SuggestedAction): Promise<CaseDetail>;
  investigationBrief(ref: string): Promise<InvestigationBrief>;
  runLookup(ref: string, kind: LookupKind): Promise<EvidenceItem>;
  /** Local model picker (dev only, TD-63): null when no model gateway is reachable. */
  localModels(): Promise<{ current: string; available: { name: string; detail: string }[] } | null>;
  useLocalModel(name: string): Promise<void>;
  dashboard(): Promise<Dashboard>;
  createDispute(input: NewDispute, idempotencyKey: string): Promise<CaseSummary>;
  auditEvents(query?: AuditQuery): Promise<AuditEvent[]>;
  verifyAudit(): Promise<VerifyResult>;
  replay(caseRef: string): Promise<ReplayResult>;
  config(): Promise<Config>;
  configHistory(): Promise<ConfigVersion[]>;
  updateConfig(patch: ConfigPatch, reason: string): Promise<Config>;
  setAutoApprove(enabled: boolean, reason: string): Promise<Config>;
}
