import { SEEDED_USERS } from "../auth/session";
import type { ModelBrief, ModelClient, ModelCopilotAnswer } from "./localModel";
import { FakeModel } from "../test/fakeModel";
import { MockApi } from "./mockApi";
import { CANT_ANSWER } from "./mockCopilot";

const answer = (a: Partial<ModelCopilotAnswer>): ModelCopilotAnswer => ({ sentences: [], lookup: null, suggested_actions: [], self_score: 0.9, ...a });


const api = (model: ModelClient, user = "analyst1") => new MockApi(() => SEEDED_USERS.find((u) => u.id === user)!, { model });
const REF = "DSP-2026-000412";

describe("Co-Pilot with a local model (TD-60)", () => {
  it("uses a cited model answer and reports the model", async () => {
    const m = new FakeModel([answer({ sentences: [{ text: "The affidavit is missing.", cites: ["E-5"] }] })]);
    const turn = await api(m).askCopilot(REF, "what's missing?");
    expect(turn.sentences[0].cites[0]).toMatchObject({ kind: "evidence", id: "E-5" });
    expect(turn.meta).toMatch(/ollama:qwen2.5:7b .* 1 citation checked/);
  });

  it("ignores citations of request field names but still needs a real record", async () => {
    const m = new FakeModel([answer({ sentences: [{ text: "Magnetic stripe.", cites: ["E-1", "tool_result"] }, { text: "Only a field.", cites: ["tool_result"] }] })]);
    const turn = await api(m).askCopilot(REF, "how was it read?");
    expect(turn.sentences.map((s) => [s.text, s.cites.map((r) => r.id)])).toEqual([["Magnetic stripe.", ["E-1"]]]);
  });

  it("falls back to a cited rule-based answer when the model gives none, and says so", async () => {
    const turn = await api(new FakeModel([answer({})])).askCopilot(REF, "When is the chargeback due?");
    expect(turn.sentences[0].cites.map((r) => r.id)).toEqual(["clk-visa", "P-3"]);
    expect(turn.meta).toBe("ollama:qwen2.5:7b gave no cited answer · rule-based answer");
  });

  it("normalizes dotted field paths and accepts the claim as a source", async () => {
    const m = new FakeModel([answer({ sentences: [
      { text: "The cardholder says the card was in their wallet.", cites: ["case.claim"] },
      { text: "Terminal read not checked yet.", cites: ["lookups_available.terminal_read", "E-2"] },
      { text: "Only a path.", cites: ["lookups_available.terminal_read"] },
    ] })]);
    const turn = await api(m).askCopilot(REF, "what does the cardholder say?");
    expect(turn.sentences.map((s) => s.cites.map((r) => `${r.kind}:${r.id}`))).toEqual([["claim:claim"], ["evidence:E-2"]]);
  });

  it("drops sentences that cite records not on the case", async () => {
    const m = new FakeModel([answer({ sentences: [{ text: "Invented.", cites: ["E-99"] }, { text: "Uncited.", cites: [] }] })]);
    const turn = await api(m).askCopilot(REF, "anything?");
    expect(turn.text).toBe(CANT_ANSWER);
  });

  it("runs the model's chosen lookup, then asks again with the result", async () => {
    const m = new FakeModel([
      answer({ lookup: "terminal_read" }),
      answer({ sentences: [{ text: "The card was read by magnetic stripe.", cites: ["E-7"] }] }),
    ]);
    const a = api(m);
    const turn = await a.askCopilot(REF, "how was it read?");
    expect(m.calls[1].tool_result).toMatchObject({ lookup: "terminal_read", evidence_id: "E-7" });
    expect(m.calls[1].allow_lookup).toBe(false); // one tool call per turn
    expect(turn.meta).toMatch(/^ran terminal_read \(read-only\)/);
    expect((await a.getCase(REF)).evidence.find((e) => e.id === "E-7")?.lookup).toEqual({ kind: "terminal_read", requestedBy: "analyst1" });
  });

  it("never lets an Auditor's turn run a lookup, even if the model asks", async () => {
    const m = new FakeModel([answer({ lookup: "terminal_read" })]);
    const a = api(m, "auditor1");
    await a.askCopilot(REF, "how was it read?");
    expect(m.calls[0].allow_lookup).toBe(false);
    expect((await a.getCase(REF)).evidence).toHaveLength(6);
  });

  it("drops a redraft suggestion for a draft that doesn't exist", async () => {
    const m = new FakeModel([answer({
      sentences: [{ text: "D-1 is the notice.", cites: ["D-1"] }],
      suggested_actions: [{ kind: "redraft", draft_id: "D-9", instruction: "x" }, { kind: "add_note", text: "check E-5" }],
    })]);
    const turn = await api(m).askCopilot(REF, "drafts?");
    expect(turn.suggestedActions.map((s) => s.kind)).toEqual(["add_note"]);
  });

  it("falls back to rule-based answers when the model is down", async () => {
    const turn = await api(new FakeModel([], undefined, false)).askCopilot(REF, "What's missing?");
    expect(turn.meta).toMatch(/local model unavailable · rule-based answer/);
    expect(turn.sentences.length).toBeGreaterThan(0);
  });

  it("never sends the model a card number, or drafts for an Auditor", async () => {
    const m = new FakeModel([answer({})]);
    await api(m, "auditor1").askCopilot(REF, "hi");
    const sent = JSON.stringify(m.calls[0]);
    expect(sent).not.toMatch(/\d{13,19}/);
    expect(m.calls[0].case.drafts).toEqual([]);
  });

  it("merges rule checks into the model's brief and validates its plan actions", async () => {
    const brief: ModelBrief = {
      headline: "Likely fraud.", findings: [{ text: "Card-present.", cites: ["E-2"] }], gaps: [], conflicts: [],
      risks: [{ text: "Invented risk.", cites: ["X-1"], level: "high" }],
      plan: [
        { text: "Check terminal.", cites: ["lookups_available"], done: true, lookup: "terminal_read", proposal_id: null },
        { text: "Decide credit.", cites: ["P-1"], done: false, lookup: null, proposal_id: "P-1" },
        { text: "Decide a ghost.", cites: [], done: false, lookup: null, proposal_id: "P-42" },
      ],
      self_score: 0.9,
    };
    const b = await api(new FakeModel([], brief)).investigationBrief(REF);
    expect(b.model).toMatch(/ollama:qwen2.5:7b/);
    expect(b.conflicts.some((c) => c.source === "rule" && /card-present/.test(c.text))).toBe(true); // model missed it
    expect(b.risks.some((r) => r.text === "Invented risk.")).toBe(false);
    expect(b.plan.map((s) => [s.text, s.done, s.action?.kind])).toEqual([
      ["Check terminal.", false, "lookup"], // "done" corrected: the lookup hasn't run
      ["Decide credit.", false, "proposal"],
    ]);
  });

  it("doesn't repeat a rule item the model already covered", async () => {
    const brief: ModelBrief = {
      headline: "h", findings: [{ text: "f", cites: ["E-1"] }], conflicts: [], risks: [], plan: [], self_score: 1,
      gaps: [{ text: "The affidavit is missing; a request is drafted.", cites: ["E-5", "D-2"] }],
    };
    const b = await api(new FakeModel([], brief)).investigationBrief(REF);
    expect(b.gaps.map((g) => g.source)).toEqual(["model"]); // the rule gap cites only E-5
  });

  it("doesn't serve one model's cached brief after switching models", async () => {
    const brief: ModelBrief = { headline: "h", findings: [{ text: "f", cites: ["E-1"] }], gaps: [], conflicts: [], risks: [], plan: [], self_score: 1 };
    const m = new FakeModel([], brief);
    const a = api(m);
    await a.investigationBrief(REF);
    await a.useLocalModel("qwen3.6:27b-mlx");
    await a.investigationBrief(REF);
    expect(m.briefs).toHaveLength(2);
  });

  it("caches the brief until the case changes", async () => {
    const brief: ModelBrief = { headline: "h", findings: [{ text: "f", cites: ["E-1"] }], gaps: [], conflicts: [], risks: [], plan: [], self_score: 1 };
    const m = new FakeModel([], brief);
    const a = api(m);
    await a.investigationBrief(REF);
    await a.investigationBrief(REF);
    expect(m.briefs).toHaveLength(1);
    await a.runLookup(REF, "terminal_read");
    await a.investigationBrief(REF);
    expect(m.briefs).toHaveLength(2);
  });
});
