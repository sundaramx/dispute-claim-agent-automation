import { SEEDED_USERS } from "../auth/session";
import type { CopilotRequest, ModelBrief, ModelClient, ModelCopilotAnswer, ModelMeta, ModelRequest } from "./localModel";
import { MockApi } from "./mockApi";
import { CANT_ANSWER } from "./mockCopilot";

const META: ModelMeta = { model: "ollama:qwen2.5:7b", prompt_version: "copilot_answer.v1", attempts: 1, latency_ms: 900, input_tokens: 1400, output_tokens: 60 };
const answer = (a: Partial<ModelCopilotAnswer>): ModelCopilotAnswer => ({ sentences: [], lookup: null, suggested_actions: [], self_score: 0.9, ...a });

class FakeModel implements ModelClient {
  calls: CopilotRequest[] = [];
  briefs: ModelRequest[] = [];
  constructor(private answers: ModelCopilotAnswer[], private brief_?: ModelBrief, private up = true) {}
  async status() { return this.up ? "qwen2.5:7b" : null; }
  async copilotAnswer(req: CopilotRequest) { this.calls.push(req); return { output: this.answers.shift()!, meta: META }; }
  async brief(req: ModelRequest) { this.briefs.push(req); if (!this.brief_) throw new Error("502"); return { output: this.brief_, meta: META }; }
}

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
