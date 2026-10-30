import { canWorkCases } from "../auth/permissions";
import type { ModelBrief, ModelCited, ModelCopilotAnswer } from "./localModel";
import { bundleRefs } from "./mockCopilot";
import { lookupsFor } from "./mockInvestigation";
import type { CaseDetail, CitedText, CopilotRef, InvestigationBrief, PlanStep, Role, SuggestedAction } from "./types";

// Server-side half of the Co-Pilot that the real API will own (ARCHITECTURE §5.9): build the
// role-scoped bundle the model sees, then accept only output that resolves to this case.
// The model proposes; this code decides what reaches the analyst.

const usd = (minor: number | null) => (minor === null ? null : (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));

/** What the model may see. Auditors get no drafts (PII-minimized, FR-26 AC 4). Card numbers never appear: only last 4. */
export function caseBundle(c: CaseDetail, role: Role): Record<string, unknown> {
  return {
    ref: c.ref, regime: c.regime === "reg_e" ? "Reg E" : "Reg Z", network: c.network, category: c.category, reason_code: c.reasonCode,
    amount: usd(c.amountMinor), card: `${c.productType} ending ${c.cardLast4}`, status: c.status,
    claim: { merchant: c.claim.merchant, txn_date: c.claim.txnDate, learned_on: c.claim.learnedOn, narrative: c.claim.narrative },
    evidence: c.evidence.map((e) => ({ id: e.id, item: e.item, source: e.source, status: e.status, note: e.note ?? null })),
    decision: c.decision && {
      outcome: c.decision.outcome, confidence: c.decision.confidence,
      rules: c.decision.trace.map((t) => ({ id: t.ruleId, text: t.text })),
    },
    clocks: c.clocks.map((k) => ({ id: k.id, label: k.label, due: k.dueAt, remaining: k.remaining === null ? "not started" : `${k.remaining} ${k.remainingUnit === "BD" ? "business days" : "days"}`, state: k.state })),
    proposals: c.proposals.map((p) => ({
      id: p.id, label: p.label, amount: usd(p.amountMinor), status: p.status, prepared_by: p.preparer,
      approver: p.requiredRole === "supervisor" ? `Supervisor (${p.lowConfidence ? "low confidence" : "over $500"})` : "Analyst", satisfies_clock: p.satisfies.id,
    })),
    drafts: role === "auditor" ? [] : c.drafts.map((d) => ({ id: d.id, label: d.label, version: d.version })),
  };
}

export const lookupsForModel = (c: CaseDetail) => lookupsFor(c).map((l) => ({ kind: l.kind, label: l.label, status: l.status }));

function resolver(c: CaseDetail, role: Role) {
  const refs = bundleRefs(c, role);
  return (id: string): CopilotRef | undefined => refs.find((r) => r.id === id);
}

// Names of fields in the request the model sees. Small models sometimes "cite" these; that is a
// reference to the input's structure, not an invented record, so it is dropped rather than
// failing the sentence. Any other ID that doesn't resolve to this case still rejects it.
const PAYLOAD_FIELDS = new Set(["case", "claim", "evidence", "decision", "rules", "clocks", "proposals", "drafts", "lookups_available", "tool_result", "question", "history"]);
const citable = (ids: string[]) => ids.filter((id) => !PAYLOAD_FIELDS.has(id));

/** Strict: every cite must resolve to this case, and there must be at least one (FR-36 AC 3). */
function strict(items: ModelCited[], resolve: (id: string) => CopilotRef | undefined): CitedText[] {
  return items.flatMap((s) => {
    const refs = citable(s.cites).map(resolve);
    return refs.length && refs.every(Boolean) ? [{ text: s.text, cites: refs as CopilotRef[], source: "model" as const }] : [];
  });
}

export function validateAnswer(out: ModelCopilotAnswer, c: CaseDetail, role: Role): { sentences: CitedText[]; actions: SuggestedAction[] } {
  const resolve = resolver(c, role);
  const sentences = strict(out.sentences, resolve);
  const draftIds = new Set(role === "auditor" ? [] : c.drafts.map((d) => d.id));
  const actions: SuggestedAction[] = !canWorkCases(role) ? [] : out.suggested_actions.flatMap((a): SuggestedAction[] => {
    if (a.kind === "add_note") return [{ kind: "add_note", label: "Add as a case note", text: a.text.slice(0, 300) }];
    if (!draftIds.has(a.draft_id)) return []; // a redraft must name a real draft on this case
    const d = c.drafts.find((x) => x.id === a.draft_id)!;
    return [{ kind: "redraft", label: `Redraft ${d.label.toLowerCase()}`, draftId: d.id, instruction: a.instruction.slice(0, 200) }];
  });
  return { sentences, actions };
}

const sameCites = (a: CitedText, b: CitedText) => a.cites.map((r) => r.id).sort().join() === b.cites.map((r) => r.id).sort().join();
const merge = <T extends CitedText>(model: T[], rules: T[]) => [...model, ...rules.filter((r) => !model.some((m) => sameCites(m, r)))];

/** Accept the model's brief only as far as it resolves; add deterministic checks the model missed. */
export function validateBrief(out: ModelBrief, c: CaseDetail, role: Role, rules: InvestigationBrief, model: string): InvestigationBrief {
  const resolve = resolver(c, role);
  const lookups = lookupsFor(c);
  const pending = new Set(c.proposals.filter((p) => p.status === "pending_approval").map((p) => p.id));

  const plan: PlanStep[] = out.plan.flatMap((s, i) => {
    const cites = citable(s.cites).map(resolve).filter((r): r is CopilotRef => !!r);
    const lookup = s.lookup ? lookups.find((l) => l.kind === s.lookup) : undefined;
    let action: PlanStep["action"];
    let done = s.done;
    if (lookup) { done = lookup.status === "done"; if (!done && canWorkCases(role)) action = { kind: "lookup", lookup: lookup.kind }; }
    if (s.proposal_id && pending.has(s.proposal_id)) { done = false; action = { kind: "proposal", proposalId: s.proposal_id }; }
    // Plan steps may cite loosely (a lookup that hasn't run has nothing to cite), but need a cite or a real action.
    return cites.length || action ? [{ id: `m-${i}`, text: s.text, cites, done, action, source: "model" as const }] : [];
  });

  const findings = strict(out.findings, resolve);
  return {
    generatedAt: rules.generatedAt,
    model,
    headline: findings.length ? out.headline : rules.headline,
    findings: findings.length ? findings : rules.findings,
    gaps: merge(strict(out.gaps, resolve), rules.gaps),
    conflicts: merge(strict(out.conflicts, resolve), rules.conflicts),
    risks: merge(out.risks.flatMap((r) => strict([r], resolve).map((x) => ({ ...x, level: r.level }))), rules.risks),
    plan: plan.length ? plan : rules.plan,
    lookups: rules.lookups,
  };
}
