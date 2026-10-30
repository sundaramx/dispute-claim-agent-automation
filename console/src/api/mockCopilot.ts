import { canWorkCases } from "../auth/permissions";
import type { CaseDetail, CopilotRef, CopilotTurn, Role, SuggestedAction } from "./types";

// Deterministic stand-in for the `copilot_answer` model task (ARCHITECTURE §5.9). It answers
// only from the case bundle, and every answer goes through the same citation validator the
// real gateway output will: a sentence whose cites don't resolve to the bundle is dropped,
// and an answer with no valid sentence becomes the fixed can't-answer reply.

type Sentence = { text: string; cites: CopilotRef[] };
type Answer = { sentences: Sentence[]; actions: SuggestedAction[]; note?: string };

export const CANT_ANSWER = "I can’t answer that from this case’s records. Try asking about the decision, evidence, clocks, proposals or drafts.";

const money = (minor: number | null) => (minor === null ? "" : (minor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }));

/** The refs the copilot may cite: built by code from the case, scoped by role (FR-36 AC 2). */
export function bundleRefs(c: CaseDetail, role: Role): CopilotRef[] {
  const refs: CopilotRef[] = [
    // The cardholder's own statement is a source too ("the cardholder says...").
    { kind: "claim", id: "claim", label: "claim" },
    ...c.evidence.map((e) => ({ kind: "evidence" as const, id: e.id, label: e.id })),
    ...(c.decision?.trace ?? []).map((t) => ({ kind: "rule" as const, id: t.ruleId, label: t.ruleId })),
    ...c.clocks.map((k) => ({ kind: "clock" as const, id: k.id, label: k.label })),
    ...c.proposals.map((p) => ({ kind: "proposal" as const, id: p.id, label: p.id })),
  ];
  // Auditors get a PII-minimized bundle: no draft letters (FR-26 AC 4).
  if (role !== "auditor") refs.push(...c.drafts.map((d) => ({ kind: "draft" as const, id: d.id, label: `${d.label} v${d.version}` })));
  return refs;
}

function compose(c: CaseDetail, q: string, ref: (kind: CopilotRef["kind"], id: string) => CopilotRef): Answer | null {
  const pending = c.proposals.filter((p) => p.status === "pending_approval");
  const first = pending[0];

  // An instruction to act is answered, never obeyed: the output schema has no approve action.
  if (/\b(ignore (your|all|the|previous)|just (approve|reject)|go ahead and (approve|reject)|(approve|reject) (it|this) (now|for me)|bypass|override)\b/i.test(q)) {
    return {
      sentences: first
        ? [{ text: `I can’t approve, reject or change anything on a case. That decision is yours in the action bar, for ${first.label.toLowerCase()} and the others.`, cites: [ref("proposal", first.id)] }]
        : [],
      actions: [],
      note: "Instruction in the question ignored · the copilot has no approve action",
    };
  }

  if (/supervisor|who (can|needs to|must) approve|why.*approv|four.?eyes/i.test(q)) {
    if (!first) return { sentences: [{ text: "Nothing on this case is waiting for approval.", cites: c.proposals[0] ? [ref("proposal", c.proposals[0].id)] : [] }], actions: [] };
    return {
      sentences: pending.map((p) => ({
        text: p.requiredRole === "analyst"
          ? `${p.label}${p.amountMinor === null ? "" : ` (${money(p.amountMinor)})`} can be approved by an Analyst who didn’t prepare it.`
          : p.lowConfidence
            ? `${p.label} needs a Supervisor because confidence is ${p.confidence.toFixed(2)}, below the 0.80 low-confidence line.`
            : `${p.label} needs a Supervisor because ${money(p.amountMinor)} is over the $500 threshold.`,
        cites: [ref("proposal", p.id)],
      })),
      actions: [],
    };
  }

  if (/missing|evidence|affidavit|before.*fil|what.*need|outstanding/i.test(q)) {
    const missing = c.evidence.filter((e) => e.status === "missing");
    const info = c.drafts.find((d) => /info request/i.test(d.label));
    const filing = pending.find((p) => /chargeback/i.test(p.label));
    const sentences: Sentence[] = missing.length
      ? missing.map((e) => ({ text: `${e.item} is still missing${e.note ? ` (${e.note})` : ""}.`, cites: [ref("evidence", e.id)] }))
      : [{ text: `All ${c.evidence.filter((e) => e.status === "present").length} required evidence items are present.`, cites: c.evidence.filter((e) => e.status === "present").map((e) => ref("evidence", e.id)) }];
    if (info) sentences.push({ text: `A customer info request is drafted at v${info.version}.`, cites: [ref("draft", info.id)] });
    if (filing) sentences.push({ text: `The chargeback filing is waiting for approval and must go before the ${filing.satisfies.label} closes.`, cites: [ref("proposal", filing.id), ref("clock", filing.satisfies.id)] });
    const actions: SuggestedAction[] = [];
    if (info) actions.push({ kind: "redraft", label: "Redraft the info request: add the portal chat link", draftId: info.id, instruction: "Add the portal chat link so the cardholder can reply there." });
    if (missing.length) actions.push({ kind: "add_note", label: "Add a note: evidence outstanding", text: `Outstanding: ${missing.map((e) => `${e.id} ${e.item}`).join("; ")}.` });
    return { sentences, actions };
  }

  if (/clock|deadline|due|nearest|when|time left/i.test(q)) {
    const running = c.clocks.filter((k) => k.dueAt && k.state !== "satisfied").sort((a, b) => a.dueAt!.localeCompare(b.dueAt!));
    // "When is the chargeback due?" asks about the filing window, not the nearest clock.
    const filing = /chargeback|filing|network window/i.test(q) ? pending.find((p) => /chargeback/i.test(p.label)) : undefined;
    if (filing?.satisfies.dueAt) {
      const k = filing.satisfies;
      return { sentences: [{ text: `The chargeback must be filed before the ${k.label} closes, ${k.remaining} ${k.remainingUnit === "BD" ? "business days" : "days"} from now.`, cites: [ref("clock", k.id), ref("proposal", filing.id)] }], actions: [] };
    }
    const k = running[0];
    if (!k) return null;
    const sentences: Sentence[] = [{ text: `The nearest deadline is the ${k.label.toLowerCase()} clock, ${k.remaining} ${k.remainingUnit === "BD" ? "business days" : "days"} away.`, cites: [ref("clock", k.id)] }];
    const satisfier = pending.find((p) => p.satisfies.id === k.id);
    if (satisfier) sentences.push({ text: `Approving ${satisfier.label.toLowerCase()} satisfies it.`, cites: [ref("proposal", satisfier.id)] });
    if (running[1]) sentences.push({ text: `After that comes the ${running[1].label.toLowerCase()}.`, cites: [ref("clock", running[1].id)] });
    return { sentences, actions: [] };
  }

  if (/summar|overview|tl;?dr|what.*(this|case) about|explain/i.test(q)) {
    const sentences: Sentence[] = c.evidenceSummary.map((s) => ({ text: s.text, cites: s.cites.map((id) => ref("evidence", id)) }));
    const last = c.decision?.trace.at(-1);
    if (c.decision && last) sentences.push({ text: `Policy recommends ${c.decision.outcome.replace(/_/g, " ")} at confidence ${c.decision.confidence.toFixed(2)}.`, cites: [ref("rule", last.ruleId)] });
    if (first) sentences.push({ text: `${first.label} is the next decision.`, cites: [ref("proposal", first.id)] });
    return { sentences, actions: [] };
  }

  if (/reason code|category|why.*(fraud|duplicate|code)|classif|rule/i.test(q)) {
    const t = c.decision?.trace.find((x) => /CAT|NET/.test(x.ruleId)) ?? c.decision?.trace[0];
    if (!t) return null;
    return { sentences: [{ text: `${t.text}.`, cites: [ref("rule", t.ruleId)] }, { text: `The reason code is ${c.reasonCode}, taken from the authoritative policy table; the model can only suggest.`, cites: [ref("rule", t.ruleId)] }], actions: [] };
  }

  if (/letter|notice|draft|wording/i.test(q)) {
    if (!c.drafts.length) return null;
    return {
      sentences: c.drafts.map((d) => ({ text: `${d.label} is at v${d.version}${d.checks.length ? `; checks passed: ${d.checks.join(", ").toLowerCase()}` : ""}.`, cites: [ref("draft", d.id)] })),
      actions: c.drafts.filter((d) => d.proposalId).map((d) => ({ kind: "redraft", label: `Redraft ${d.label.toLowerCase()}: plainer language`, draftId: d.id, instruction: "Use plainer language at a 6th-grade reading level." })),
    };
  }
  return null;
}

export function answerQuestion(c: CaseDetail, question: string, role: Role): Omit<CopilotTurn, "n" | "author" | "at"> {
  const refs = bundleRefs(c, role);
  const find = (kind: CopilotRef["kind"], id: string): CopilotRef => refs.find((r) => r.kind === kind && r.id === id) ?? { kind, id, label: "__unresolved__" };
  const raw = compose(c, question, find);
  // Citation validator: drop sentences with no cite, or with a cite outside the bundle.
  const sentences = (raw?.sentences ?? []).filter((s) => s.cites.length > 0 && s.cites.every((r) => r.label !== "__unresolved__"));
  if (!sentences.length) {
    return { role: "assistant", text: CANT_ANSWER, sentences: [], suggestedActions: [], meta: "No cited answer passed validation" };
  }
  const n = sentences.reduce((sum, s) => sum + s.cites.length, 0);
  return {
    role: "assistant",
    text: "",
    sentences,
    // Suggestions are dropped for roles that can't work cases (FR-36 AC 4).
    suggestedActions: canWorkCases(role) ? (raw?.actions ?? []).filter((a) => a.kind !== "redraft" || refs.some((r) => r.kind === "draft" && r.id === a.draftId)) : [],
    meta: raw?.note ?? `copilot_answer.v1 · mock-1 · ${n} citation${n === 1 ? "" : "s"} checked`,
  };
}
