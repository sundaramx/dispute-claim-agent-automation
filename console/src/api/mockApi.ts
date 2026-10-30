import { approvalBlock, canWorkCases } from "../auth/permissions";
import { cardNetwork, luhnValid, panDigits } from "../pan";
import type { ModelClient } from "./localModel";
import { answerQuestion, CANT_ANSWER } from "./mockCopilot";
import { caseBundle, lookupsForModel, validateAnswer, validateBrief } from "./modelOrchestrator";
import { buildBrief, chooseLookup, lookupEvidence, lookupFinding, lookupsFor, LOOKUPS } from "./mockInvestigation";
import { createSeed, MOCK_NOW } from "./mockData";
import {
  ProblemError,
  type AuditEvent,
  type AuditQuery,
  type CaseDetail,
  type CaseQuery,
  type CaseSummary,
  type Clock,
  type Config,
  type ConfigPatch,
  type ConfigVersion,
  type CopilotTurn,
  type Dashboard,
  type DisputeApi,
  type EvidenceItem,
  type InvestigationBrief,
  type LookupKind,
  type Inbox,
  type NewDispute,
  type Proposal,
  type ReplayResult,
  type SuggestedAction,
  type Role,
  type SystemInfo,
  type TimelineEvent,
  type User,
  type VerifyResult,
} from "./types";

// In-memory stand-in for the API until M5–M6 ship it. It applies the same checks the
// server will (role, four-eyes, content-hash binding) so the screens handle real errors.

function summary(c: CaseDetail): CaseSummary {
  const { ref, status, regime, network, category, reasonCode, amountMinor, channel, assignee, networkCritical, nearestClock } = c;
  return { ref, status, regime, network, category, reasonCode, amountMinor, channel, assignee, networkCritical, nearestClock };
}

const byDue = (a: string | null, b: string | null) => (a ?? "9999").localeCompare(b ?? "9999");

// US federal holidays the mock needs (the real calendar is dca.regclock, FR-4 AC 1).
const HOLIDAYS = new Set(["2026-11-11", "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18"]);

/** Business days after `start` (a notice before cut-off counts from that day), due 17:00 ET. */
function addBusinessDays(startIsoDate: string, n: number): string {
  const d = new Date(`${startIsoDate}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !HOLIDAYS.has(d.toISOString().slice(0, 10))) left--;
  }
  return endOfDayEt(d.toISOString().slice(0, 10));
}

function addCalendarDays(startIsoDate: string, n: number): string {
  const d = new Date(`${startIsoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return endOfDayEt(d.toISOString().slice(0, 10));
}

/** 17:00 America/New_York on that date, in UTC (EDT until Nov 1 2026, EST after). */
function endOfDayEt(isoDate: string): string {
  return `${isoDate}T${isoDate < "2026-11-01" ? "21" : "22"}:00:00Z`;
}

/** Stand-in for SHA-256 so the audit viewer has stable, chained hashes to show. Not cryptographic. */
function fakeHash(input: string): string {
  let out = "";
  for (let round = 0; out.length < 64; round++) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function nextAction(c: CaseDetail): string {
  if (c.status === "needs_manual_completion") return "Complete the claim manually";
  const p = c.proposals.find((x) => x.status === "pending_approval");
  return p ? `Approve: ${p.label}` : "Investigate";
}

const LLM_TASKS = ["extraction", "classification", "evidence_summary", "drafting"];

export class MockApi implements DisputeApi {
  private cases = createSeed();
  private seq = 48300;
  private nextCaseNumber = 432;
  private transcripts = new Map<string, CopilotTurn[]>();
  private idempotency = new Map<string, { payload: string; ref: string }>();
  private cfg: Config = {
    version: 14, supervisorThresholdMinor: 50000, autoThresholdMinor: 10000, confidenceLow: 0.8, confidenceHigh: 0.9,
    qaSampleRate: 0.1, autoApproveEnabled: false,
    llmRoutes: LLM_TASKS.map((task) => ({ task, primary: "mock", failover: "ollama", region: "local" })),
  };
  private history: ConfigVersion[] = [
    { version: 14, author: "admin1", at: "2026-10-24T20:10:00Z", changes: ["auto_approve.enabled true → false"], reason: "Pilot window ended" },
    { version: 13, author: "admin1", at: "2026-10-19T13:00:00Z", changes: ["auto_approve.enabled false → true"], reason: "Pilot window approved by Compliance" },
    { version: 12, author: "admin1", at: "2026-10-12T15:30:00Z", changes: ["qa.sample_rate 0.05 → 0.1"], reason: "Raise QA coverage" },
  ];
  private readonly currentUser: () => User | null;
  private readonly latencyMs: number;
  private readonly model: ModelClient | undefined;
  private briefCache = new Map<string, InvestigationBrief>();

  constructor(currentUser: () => User | null, opts: { latencyMs?: number; model?: ModelClient } = {}) {
    this.currentUser = currentUser;
    this.latencyMs = opts.latencyMs ?? 0;
    this.model = opts.model;
  }

  private async modelName(): Promise<string | null> {
    return this.model ? this.model.status() : null;
  }

  private async respond<T>(value: T): Promise<T> {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    return structuredClone(value);
  }

  private user(): User {
    const u = this.currentUser();
    if (!u) throw new ProblemError(401, "unauthenticated", "Sign in first.");
    return u;
  }

  private worker(): User {
    const u = this.user();
    if (!canWorkCases(u.role)) throw new ProblemError(403, "insufficient_role", "Your role can't change cases.");
    return u;
  }

  private find(proposalId: string): { c: CaseDetail; p: Proposal } {
    for (const c of this.cases.values()) {
      const p = c.proposals.find((x) => x.id === proposalId);
      if (p) return { c, p };
    }
    throw new ProblemError(404, "not_found", `Proposal ${proposalId} not found.`);
  }

  private record(c: CaseDetail, text: string, actor: string, kind: TimelineEvent["kind"] = "event") {
    c.timeline.push({ seq: ++this.seq, at: MOCK_NOW, text, actor, kind });
  }

  private allow(...roles: Role[]): User {
    const u = this.user();
    if (!roles.includes(u.role)) throw new ProblemError(403, "insufficient_role", "Your role can't do this.");
    return u;
  }

  async systemInfo(): Promise<SystemInfo> {
    this.user();
    const localModel = await this.modelName();
    return this.respond({ autoApproveEnabled: this.cfg.autoApproveEnabled, mockLlm: !localModel, localModel, supervisorThresholdMinor: this.cfg.supervisorThresholdMinor });
  }

  async listCases(q: CaseQuery = {}): Promise<CaseSummary[]> {
    this.user();
    const text = q.text?.trim().toLowerCase();
    const rows = [...this.cases.values()]
      .filter((c) => (!q.regime || c.regime === q.regime) && (!q.network || c.network === q.network) && (!q.category || c.category === q.category))
      .filter((c) => !text || [c.ref, c.category, c.status, c.assignee ?? "", c.claim.merchant].join(" ").toLowerCase().includes(text))
      .sort((a, b) => byDue(a.nearestClock.dueAt, b.nearestClock.dueAt))
      .map(summary);
    return this.respond(rows);
  }

  async getCase(ref: string): Promise<CaseDetail> {
    this.user();
    const c = this.cases.get(ref);
    if (!c) throw new ProblemError(404, "not_found", `Case ${ref} not found.`);
    return this.respond(c);
  }

  async inbox(): Promise<Inbox> {
    const user = this.user();
    const items: Inbox["items"] = [];
    const hidden = new Map<string, number>();
    for (const c of this.cases.values()) {
      for (const p of c.proposals.filter((x) => x.status === "pending_approval")) {
        const block = approvalBlock(p, user);
        if (block) hidden.set(block.message, (hidden.get(block.message) ?? 0) + 1);
        else items.push({ proposal: p, caseSummary: summary(c) });
      }
    }
    items.sort((a, b) => byDue(a.proposal.satisfies.dueAt, b.proposal.satisfies.dueAt));
    return this.respond({ items, hidden: [...hidden].map(([reason, count]) => ({ reason, count })) });
  }

  private checkPending(p: Proposal, expectedContentHash: string) {
    if (p.status !== "pending_approval") throw new ProblemError(409, "proposal_not_pending", "This proposal was already decided.");
    if (p.contentHash !== expectedContentHash) {
      throw new ProblemError(409, "proposal_hash_mismatch", "The proposal changed since you opened it. Review it again.");
    }
  }

  private settle(c: CaseDetail) {
    if (c.status === "awaiting_approval" && c.proposals.every((p) => p.status !== "pending_approval")) c.status = "executing";
  }

  async approve(proposalId: string, expectedContentHash: string): Promise<Proposal> {
    const user = this.user();
    const { c, p } = this.find(proposalId);
    const block = approvalBlock(p, user);
    if (block) {
      if (block.code === "four_eyes_violation") this.record(c, `security.four_eyes_violation · ${p.id}`, user.id, "security");
      throw new ProblemError(403, block.code, block.message);
    }
    this.checkPending(p, expectedContentHash);
    p.status = "approved";
    this.record(c, `approval.approved · ${p.id} ${p.label}`, user.id);
    this.settle(c);
    return this.respond(p);
  }

  private decline(proposalId: string, expectedContentHash: string, reason: string, verdict: "rejected" | "returned") {
    const user = this.worker();
    if (!reason.trim()) throw new ProblemError(422, "reason_required", "A reason is required.");
    const { c, p } = this.find(proposalId);
    this.checkPending(p, expectedContentHash);
    p.status = verdict;
    this.record(c, `approval.${verdict} · ${p.id} · “${reason.trim()}”`, user.id);
    if (verdict === "returned") c.status = "investigating";
    this.settle(c);
    return this.respond(p);
  }

  async reject(proposalId: string, expectedContentHash: string, reason: string): Promise<Proposal> {
    return this.decline(proposalId, expectedContentHash, reason, "rejected");
  }

  async returnForRework(proposalId: string, expectedContentHash: string, reason: string): Promise<Proposal> {
    return this.decline(proposalId, expectedContentHash, reason, "returned");
  }

  private caseOr404(ref: string): CaseDetail {
    const c = this.cases.get(ref);
    if (!c) throw new ProblemError(404, "not_found", `Case ${ref} not found.`);
    return c;
  }

  async copilotTranscript(ref: string): Promise<CopilotTurn[]> {
    this.user();
    this.caseOr404(ref);
    return this.respond(this.transcripts.get(ref) ?? []);
  }

  async askCopilot(ref: string, question: string): Promise<CopilotTurn> {
    const user = this.user(); // copilot.ask: every role with case.read
    const c = this.caseOr404(ref);
    const q = question.trim();
    if (!q) throw new ProblemError(422, "question_required", "Ask a question.");
    if (q.length > 1000) throw new ProblemError(422, "question_too_long", "Keep questions under 1,000 characters.");
    const turns = this.transcripts.get(ref) ?? [];
    turns.push({ n: turns.length + 1, role: "human", author: user.id, at: MOCK_NOW, text: q, sentences: [], suggestedActions: [], meta: "" });
    const history = turns.slice(-13, -1).map((t) => ({ role: t.role, text: t.role === "human" ? t.text : t.sentences.map((x) => x.text).join(" ") || t.text }));
    const answer = (await this.modelAnswer(c, q, user, history)) ?? this.answerWithTools(c, q, user, "local model unavailable · rule-based answer");
    const reply: CopilotTurn = { n: turns.length + 1, author: "copilot", at: MOCK_NOW, ...answer };
    turns.push(reply);
    this.transcripts.set(ref, turns);
    this.record(c, `conversation.turn · copilot · ${reply.sentences.length ? `${reply.sentences.length} cited sentences` : "no cited answer"}`, user.id, "ai");
    return this.respond(reply);
  }

  /**
   * Local model path (TD-60): the model answers or picks one read-only lookup from the closed
   * list (TD-59); code runs the lookup as the asking user, then asks again with the result.
   * Returns null if the model is unreachable, so the caller falls back to rules.
   */
  private async modelAnswer(c: CaseDetail, q: string, user: User, history: { role: string; text: string }[]): Promise<Omit<CopilotTurn, "n" | "author" | "at"> | null> {
    if (!this.model || !(await this.modelName())) return null;
    const allow = canWorkCases(user.role);
    const base = { lookups_available: lookupsForModel(c), question: q, history };
    try {
      let r = await this.model.copilotAnswer({ ...base, case: caseBundle(c, user.role), allow_lookup: allow });
      let tool = "";
      const kind = r.output.lookup;
      if (kind && allow && lookupsFor(c).some((l) => l.kind === kind && l.status === "available")) {
        const e = this.addLookup(c, kind, user);
        r = await this.model.copilotAnswer({
          ...base, lookups_available: lookupsForModel(c), case: caseBundle(c, user.role), allow_lookup: false,
          tool_result: { lookup: kind, evidence_id: e.id, finding: lookupFinding(c, kind) },
        });
        tool = `ran ${kind} (read-only) · `;
      }
      const v = validateAnswer(r.output, c, user.role);
      const timing = `${r.meta.model} · ${r.meta.prompt_version} · ${(r.meta.latency_ms / 1000).toFixed(1)} s`;
      if (!v.sentences.length) {
        // Small local models sometimes return nothing for answerable questions. Use the cited
        // rule-based answer when there is one, and say so; never an uncited guess.
        const rule = tool ? null : answerQuestion(c, q, user.role);
        if (rule?.sentences.length) return { ...rule, meta: `${r.meta.model} gave no cited answer · rule-based answer` };
        return { role: "assistant", text: CANT_ANSWER, sentences: [], suggestedActions: [], meta: `${tool}${timing} · no cited answer passed validation` };
      }
      const n = v.sentences.reduce((sum, s) => sum + s.cites.length, 0);
      return { role: "assistant", text: "", sentences: v.sentences, suggestedActions: v.actions, meta: `${tool}${timing} · ${n} citation${n === 1 ? "" : "s"} checked` };
    } catch {
      return null;
    }
  }

  /** Rule-based path: picks a read-only lookup from the closed list (TD-59); code runs it as the asking user. */
  private answerWithTools(c: CaseDetail, q: string, user: User, note?: string): Omit<CopilotTurn, "n" | "author" | "at"> {
    const kind = chooseLookup(q, c);
    if (!kind) {
      const a = answerQuestion(c, q, user.role);
      return note ? { ...a, meta: `${a.meta} · ${note}` } : a;
    }
    if (!canWorkCases(user.role)) {
      return { role: "assistant", text: "Lookups add evidence to the case, so only Analysts and Supervisors can run them.", sentences: [], suggestedActions: [], meta: `tool ${kind} not run for your role` };
    }
    const existing = c.evidence.find((e) => e.lookup?.kind === kind);
    const e = existing ?? this.addLookup(c, kind, user);
    const cite = { kind: "evidence" as const, id: e.id, label: e.id };
    return {
      role: "assistant", text: "",
      sentences: [
        { text: lookupFinding(c, kind), cites: [cite] },
        { text: existing ? `That check was already run and is on the case as ${e.id}.` : `I ran “${LOOKUPS[kind].label.toLowerCase()}” and added the result to the case as ${e.id}.`, cites: [cite] },
      ],
      suggestedActions: [],
      meta: `ran ${kind} (read-only) · rule-based answer${note ? ` · ${note}` : ""}`,
    };
  }

  private addLookup(c: CaseDetail, kind: LookupKind, user: User): EvidenceItem {
    if (c.evidence.filter((e) => e.lookup).length >= 10) throw new ProblemError(429, "lookup_limit", "This case has reached its lookup limit.");
    const e = lookupEvidence(c, kind, user.id);
    c.evidence.push(e);
    this.record(c, `copilot.lookup · ${kind} · read-only · requested by ${user.id}`, user.id, "ai");
    this.record(c, `evidence.collected · ${e.id} · decision re-evaluation queued`, "svc:investigate");
    return e;
  }

  async investigationBrief(ref: string): Promise<InvestigationBrief> {
    const user = this.user();
    const c = this.caseOr404(ref);
    const rules = buildBrief(c, user.role, MOCK_NOW);
    const model = await this.modelName();
    if (!this.model || !model) return this.respond({ ...rules, fallbackReason: "Local model unavailable: showing rule-based checks only." });
    // Regenerate only when what the model would see changes.
    const key = JSON.stringify([user.role, caseBundle(c, user.role), lookupsForModel(c)]);
    const hit = this.briefCache.get(key);
    if (hit) return this.respond(hit);
    try {
      const r = await this.model.brief({ case: caseBundle(c, user.role), lookups_available: lookupsForModel(c) });
      const brief = validateBrief(r.output, c, user.role, rules, `${r.meta.model} · ${r.meta.prompt_version} · ${(r.meta.latency_ms / 1000).toFixed(1)} s`);
      this.briefCache.set(key, brief);
      this.record(c, `llm.call · investigation_brief · ${r.meta.model}`, "svc:copilot", "ai");
      return this.respond(brief);
    } catch {
      return this.respond({ ...rules, fallbackReason: "The local model didn’t return a valid brief: showing rule-based checks only." });
    }
  }

  async runLookup(ref: string, kind: LookupKind): Promise<EvidenceItem> {
    const user = this.worker();
    const c = this.caseOr404(ref);
    if (!lookupsFor(c).some((l) => l.kind === kind)) throw new ProblemError(422, "lookup_not_applicable", "That lookup doesn't apply to this case.");
    return this.respond(c.evidence.find((e) => e.lookup?.kind === kind) ?? this.addLookup(c, kind, user));
  }

  async runCopilotAction(ref: string, action: SuggestedAction): Promise<CaseDetail> {
    const user = this.worker(); // copilot.act runs as the clicking human, with their permissions
    const c = this.caseOr404(ref);
    if (action.kind === "add_note") {
      this.record(c, `case.note · “${action.text}” (via copilot)`, user.id);
    } else {
      const d = c.drafts.find((x) => x.id === action.draftId);
      if (!d) throw new ProblemError(404, "not_found", `Draft ${action.draftId} not found.`);
      d.version += 1;
      if (/chat link/i.test(action.instruction)) d.body += "\n\nYou can also reply to this request in the secure chat on our website.";
      d.provenance = `v${d.version} · drafting.v2 · model mock-1 · instruction “${action.instruction}” · preparer ${user.id} (via copilot, D-10)`;
      this.record(c, `draft.version · ${d.label} v${d.version} · preparer ${user.id} (via copilot)`, user.id, "ai");
      // The human who asked for the redraft becomes the preparer, so four-eyes still applies (D-10).
      const p = c.proposals.find((x) => x.id === d.proposalId && x.status === "pending_approval");
      if (p) {
        p.preparer = user.id;
        p.contentHash = `${p.contentHash.split("·v")[0]}·v${d.version}`;
        this.record(c, `proposal.superseded · ${p.id} · new content hash, earlier approvals no longer count`, user.id);
      }
    }
    return this.respond(c);
  }

  async dashboard(): Promise<Dashboard> {
    const user = this.user();
    const atRisk = [...this.cases.values()].filter((c) => c.networkCritical || c.nearestClock.state === "at_risk");
    const changed = this.history.find((h) => h.changes.some((c) => c.startsWith("auto_approve.enabled")))!;
    return this.respond({
      deadlineCompliance: { value: 100, late: 0, closed: 2911, trend: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100] },
      handlingTimeReduction: { value: 57, baselineValidated: false, trend: [38, 41, 44, 46, 47, 49, 51, 53, 55, 57] },
      qaAgreement: { value: 94, agreed: 29, reviewed: 31, trend: [90, 92, 91, 95, 93, 94, 96, 94, 93, 94] },
      atRisk: { value: atRisk.length, changeSinceYesterday: 1, trend: [2, 3, 2, 3, 4, 3, 4, 3, 3, atRisk.length] },
      clocksByState: [
        { group: "Reg E · investigate or credit", open: 212, atRisk: 6, breached: 0 },
        { group: "Reg E · notices", open: 148, atRisk: 3, breached: 0 },
        { group: "Reg Z · acknowledgment", open: 96, atRisk: 1, breached: 0 },
        { group: "Reg Z · resolution", open: 301, atRisk: 0, breached: 0 },
        { group: "Network · filing and response", open: 517, atRisk: 4, breached: 0 },
      ],
      dueSoon: atRisk.sort((a, b) => byDue(a.nearestClock.dueAt, b.nearestClock.dueAt)).map((c) => ({
        ref: c.ref, clock: c.nearestClock.label, dueAt: c.nearestClock.dueAt ?? "",
        nextAction: nextAction(c),
      })),
      handlingMinutes: [
        { category: "fraud_unauthorized", now: 17, baseline: 42 }, { category: "non_receipt", now: 18, baseline: 38 },
        { category: "not_as_described", now: 22, baseline: 45 }, { category: "duplicate", now: 14, baseline: 25 },
        { category: "credit_not_processed", now: 15, baseline: 31 },
      ],
      autoApprove: { enabled: this.cfg.autoApproveEnabled, lastChangedBy: changed.author, lastChangedAt: changed.at },
      // GET /dashboard/llm-usage is supervisor, auditor and admin only (ARCHITECTURE §6.1).
      llmUsage: user.role === "analyst" ? null : [
        { task: "extraction", provider: "mock", calls: 182, tokens: 241_000, p95Ms: 12, costUsd: 0 },
        { task: "classification", provider: "mock", calls: 176, tokens: 98_000, p95Ms: 9, costUsd: 0 },
        { task: "evidence_summary", provider: "mock", calls: 164, tokens: 388_000, p95Ms: 15, costUsd: 0 },
        { task: "drafting", provider: "mock", calls: 203, tokens: 512_000, p95Ms: 18, costUsd: 0 },
      ],
    });
  }

  async createDispute(input: NewDispute, idempotencyKey: string): Promise<CaseSummary> {
    const user = this.worker();
    // Idempotency (FR-1 AC 2): same key + payload → same case; same key + new payload → 409.
    const payload = JSON.stringify(input);
    const seen = this.idempotency.get(idempotencyKey);
    if (seen) {
      if (seen.payload !== payload) throw new ProblemError(409, "idempotency_conflict", "This request key was already used for a different dispute.");
      return this.respond(summary(this.cases.get(seen.ref)!));
    }
    const digits = panDigits(input.pan);
    const net = cardNetwork(digits);
    if (net === "amex" || net === "discover") {
      throw new ProblemError(422, "out_of_scope_network", "This card network is out of scope.",
        { pan: `${net === "amex" ? "American Express" : "Discover"} is out of scope (OOS-3).` });
    }
    const errors: Record<string, string> = {};
    if (digits.length < 13 || !luhnValid(digits) || net === "unknown") errors.pan = "Enter a valid Visa or Mastercard number.";
    if (!input.merchant.trim()) errors.merchant = "Enter the merchant.";
    if (!(input.amountMinor > 0)) errors.amountMinor = "Enter an amount greater than $0.00.";
    const today = MOCK_NOW.slice(0, 10);
    if (!input.txnDate || input.txnDate > today) errors.txnDate = "Enter a date that isn't in the future.";
    if (input.learnedOn && input.txnDate && input.learnedOn < input.txnDate) errors.learnedOn = "Can't be before the transaction date.";
    if (Object.keys(errors).length) throw new ProblemError(422, "validation_failed", "Some fields need attention.", errors);

    // The vault tokenizes the PAN; only the last 4 digits ever reach the case (FR-31).
    const ref = `DSP-2026-${String(this.nextCaseNumber++).padStart(6, "0")}`;
    const regE = input.productType === "debit";
    const due = regE ? addBusinessDays(today, 10) : addCalendarDays(today, 30);
    const clock: Clock = regE
      ? { id: `clk-${ref}`, label: "Investigate or credit", detail: "10 business days", dueAt: due, remaining: 10, remainingUnit: "BD", state: "open", elapsedPct: 0 }
      : { id: `clk-${ref}`, label: "Written acknowledgment", detail: "30 days", dueAt: due, remaining: 30, remainingUnit: "days", state: "open", elapsedPct: 0 };
    const c: CaseDetail = {
      ref, status: "received", regime: regE ? "reg_e" : "reg_z", network: net as "visa" | "mastercard", category: input.category,
      reasonCode: "pending", amountMinor: input.amountMinor, channel: "console", assignee: null, networkCritical: false, nearestClock: clock,
      cardLast4: digits.slice(-4), productType: input.productType, noticeReceivedAt: MOCK_NOW,
      claim: { merchant: input.merchant.trim().toUpperCase(), txnDate: input.txnDate, txnRef: "pending match", matched: false, narrative: input.narrative.trim() || "—", learnedOn: input.learnedOn || null },
      evidence: [], evidenceSummary: [], decision: null, clocks: [clock], proposals: [], drafts: [], timeline: [],
    };
    this.cases.set(ref, c);
    this.idempotency.set(idempotencyKey, { payload, ref });
    this.record(c, "intake.received · console", user.id);
    return this.respond(summary(c));
  }

  private events(): AuditEvent[] {
    const raw: (TimelineEvent & { caseRef: string | null; configVersion: number })[] = [...this.cases.values()]
      .flatMap((c) => c.timeline.map((t) => ({ ...t, caseRef: c.ref, configVersion: 14 })));
    raw.push(...this.history.map((h) => ({
      seq: 40000 + h.version, at: h.at, text: `config.changed · v${h.version}`, actor: h.author, kind: "event" as const, caseRef: null, configVersion: h.version,
    })));
    raw.sort((a, b) => a.seq - b.seq);
    let prev = "0".repeat(64);
    return raw.map((t) => {
      const type = t.text.split(" ·")[0];
      const hash = fakeHash(`${prev}|${t.seq}|${t.at}|${t.actor}|${type}`);
      const event: AuditEvent = {
        seq: t.seq, at: t.at, actor: t.actor, caseRef: t.caseRef, type, prevHash: prev, hash,
        actorType: t.actor.startsWith("svc:") ? "service" : t.actor.startsWith("cust:") ? "customer" : t.actor === "system" ? "system" : "human",
        versions: type.startsWith("decision") || type.startsWith("proposal") ? `pack 2026.10.1 · config v${t.configVersion}` : `config v${t.configVersion}`,
        restricted: type === "intake.received" || type === "claim.extracted",
      };
      prev = hash;
      return event;
    });
  }

  async auditEvents(q: AuditQuery = {}): Promise<AuditEvent[]> {
    this.allow("supervisor", "auditor", "admin");
    const actor = q.actor?.trim().toLowerCase();
    return this.respond(this.events().filter((e) =>
      (!q.caseRef?.trim() || e.caseRef === q.caseRef.trim().toUpperCase()) &&
      (!actor || e.actor.toLowerCase().includes(actor)) &&
      (!q.typePrefix || e.type.startsWith(q.typePrefix))));
  }

  async verifyAudit(): Promise<VerifyResult> {
    this.allow("auditor", "admin");
    const events = this.events();
    let prev = "0".repeat(64);
    for (const e of events) {
      if (e.prevHash !== prev) return this.respond({ status: "broken", fromSeq: events[0].seq, toSeq: events.at(-1)!.seq, firstBadSeq: e.seq, reason: "prev_link_broken" });
      prev = e.hash;
    }
    return this.respond({ status: "ok", fromSeq: events[0].seq, toSeq: events.at(-1)!.seq });
  }

  async replay(caseRef: string): Promise<ReplayResult> {
    this.allow("supervisor", "auditor");
    const c = this.cases.get(caseRef.trim().toUpperCase());
    if (!c) throw new ProblemError(404, "not_found", `Case ${caseRef} not found.`);
    return this.respond({ caseRef: c.ref, match: true, decisions: c.decision ? 1 : 0, diffs: [] });
  }

  async config(): Promise<Config> {
    this.allow("auditor", "admin");
    return this.respond(this.cfg);
  }

  async configHistory(): Promise<ConfigVersion[]> {
    this.allow("auditor", "admin");
    return this.respond(this.history);
  }

  private commit(user: User, changes: string[], reason: string) {
    this.cfg = { ...this.cfg, version: this.cfg.version + 1 };
    this.history.unshift({ version: this.cfg.version, author: user.id, at: MOCK_NOW, changes, reason: reason.trim() });
  }

  async updateConfig(patch: ConfigPatch, reason: string): Promise<Config> {
    const user = this.allow("admin");
    if (!reason.trim()) throw new ProblemError(422, "reason_required", "A reason is required.");
    const next = { ...this.cfg, ...patch };
    const errors: Record<string, string> = {};
    if (!(next.supervisorThresholdMinor > 0)) errors.supervisorThresholdMinor = "Must be greater than $0.";
    if (!(next.autoThresholdMinor >= 0)) errors.autoThresholdMinor = "Can't be negative.";
    else if (next.autoThresholdMinor > next.supervisorThresholdMinor) errors.autoThresholdMinor = "Must be ≤ the Supervisor threshold (D-4).";
    if (!(next.confidenceLow > 0 && next.confidenceLow < 1)) errors.confidenceLow = "Must be between 0 and 1.";
    if (!(next.confidenceHigh > 0 && next.confidenceHigh <= 1)) errors.confidenceHigh = "Must be between 0 and 1.";
    else if (next.confidenceHigh < next.confidenceLow) errors.confidenceHigh = "Must be ≥ the low-confidence line (FR-9 AC 3).";
    if (!(next.qaSampleRate >= 0 && next.qaSampleRate <= 1)) errors.qaSampleRate = "Must be between 0% and 100%.";
    if (Object.keys(errors).length) throw new ProblemError(422, "validation_failed", "Some values are invalid.", errors);
    const KEYS: Record<keyof ConfigPatch, string> = {
      supervisorThresholdMinor: "approvals.supervisor_threshold_minor", autoThresholdMinor: "auto_approve.threshold_minor",
      confidenceLow: "confidence.low", confidenceHigh: "confidence.high", qaSampleRate: "qa.sample_rate",
    };
    const changes = (Object.keys(patch) as (keyof ConfigPatch)[])
      .filter((k) => patch[k] !== this.cfg[k]).map((k) => `${KEYS[k]} ${this.cfg[k]} → ${patch[k]}`);
    if (!changes.length) throw new ProblemError(422, "no_change", "Nothing changed.");
    Object.assign(this.cfg, patch);
    this.commit(user, changes, reason);
    return this.respond(this.cfg);
  }

  async setAutoApprove(enabled: boolean, reason: string): Promise<Config> {
    const user = this.allow("admin");
    if (!reason.trim()) throw new ProblemError(422, "reason_required", "A reason is required.");
    if (enabled === this.cfg.autoApproveEnabled) throw new ProblemError(422, "no_change", "Auto-approve is already in that state.");
    this.cfg.autoApproveEnabled = enabled;
    this.commit(user, [`auto_approve.enabled ${!enabled} → ${enabled}`], reason);
    return this.respond(this.cfg);
  }

  async assign(ref: string): Promise<CaseSummary> {
    const user = this.worker();
    const c = this.cases.get(ref);
    if (!c) throw new ProblemError(404, "not_found", `Case ${ref} not found.`);
    c.assignee = user.id;
    this.record(c, `case.assigned · ${user.id}`, user.id);
    return this.respond(summary(c));
  }
}
