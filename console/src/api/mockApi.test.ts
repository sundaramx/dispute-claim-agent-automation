import { SEEDED_USERS } from "../auth/session";
import { MockApi } from "./mockApi";
import { ProblemError, type User } from "./types";
import { AMEX_TEST_DIGITS, VISA_TEST_DIGITS } from "../test/fixtures/pans";

const as = (id: string) => {
  let user: User | null = SEEDED_USERS.find((u) => u.id === id) ?? null;
  const api = new MockApi(() => user);
  return { api, switchTo: (next: string) => { user = SEEDED_USERS.find((u) => u.id === next) ?? null; } };
};

async function problem(p: Promise<unknown>): Promise<ProblemError> {
  try { await p; } catch (e) { if (e instanceof ProblemError) return e; throw e; }
  throw new Error("expected a ProblemError");
}

describe("MockApi server rules", () => {
  it("lists cases nearest deadline first", async () => {
    const { api } = as("analyst1");
    const refs = (await api.listCases()).map((c) => c.ref);
    expect(refs[0]).toBe("DSP-2026-000398");
    expect(refs.indexOf("DSP-2026-000412")).toBeLessThan(refs.indexOf("DSP-2026-000340"));
  });

  it("refuses unauthenticated calls", async () => {
    const api = new MockApi(() => null);
    expect((await problem(api.listCases())).status).toBe(401);
  });

  it("refuses an Analyst approving over $500 (FR-12 AC 3)", async () => {
    const { api } = as("analyst1");
    const e = await problem(api.approve("P-1", "sha256:9c1e…b47a"));
    expect([e.status, e.code]).toEqual([403, "insufficient_role"]);
  });

  it("refuses the preparer approving their own edit and logs it (FR-12 AC 2, AC 5)", async () => {
    const { api } = as("supervisor1");
    const p = (await api.getCase("DSP-2026-000377")).proposals[0];
    const e = await problem(api.approve(p.id, p.contentHash));
    expect([e.status, e.code]).toEqual([403, "four_eyes_violation"]);
    const timeline = (await api.getCase("DSP-2026-000377")).timeline;
    expect(timeline.at(-1)?.kind).toBe("security");
  });

  it("refuses Auditors and Admins (D-3)", async () => {
    const { api, switchTo } = as("auditor1");
    expect((await problem(api.approve("P-7", "sha256:p-7-000398"))).status).toBe(403);
    switchTo("admin1");
    expect((await problem(api.reject("P-7", "sha256:p-7-000398", "no"))).status).toBe(403);
  });

  it("binds approval to the reviewed content hash (FR-11 AC 4)", async () => {
    const { api } = as("supervisor1");
    const e = await problem(api.approve("P-1", "sha256:stale"));
    expect([e.status, e.code]).toEqual([409, "proposal_hash_mismatch"]);
  });

  it("requires a reason to reject or return (FR-11 AC 3)", async () => {
    const { api } = as("analyst1");
    const e = await problem(api.reject("P-7", "sha256:p-7-000398", "   "));
    expect([e.status, e.code]).toEqual([422, "reason_required"]);
  });

  it("approves once, then moves the case on when nothing is pending", async () => {
    const { api } = as("analyst1");
    const p = await api.approve("P-7", "sha256:p-7-000398");
    expect(p.status).toBe("approved");
    expect((await api.getCase("DSP-2026-000398")).status).toBe("executing");
    expect((await problem(api.approve("P-7", "sha256:p-7-000398"))).code).toBe("proposal_not_pending");
  });

  it("inbox shows only what the caller may decide, and says why the rest is hidden (FR-23 AC 1)", async () => {
    const { api } = as("analyst1");
    const inbox = await api.inbox();
    const ids = inbox.items.map((i) => i.proposal.id);
    expect(ids).toContain("P-6");
    expect(ids).not.toContain("P-1");
    expect(inbox.hidden.some((h) => h.reason.includes("Supervisor"))).toBe(true);
  });
});

describe("MockApi intake, audit and config rules", () => {
  const input = { pan: VISA_TEST_DIGITS, productType: "debit" as const, merchant: "Shop", amountMinor: 1000, txnDate: "2026-10-20", learnedOn: "2026-10-21", category: "duplicate" as const, narrative: "" };

  it("is idempotent per key and refuses a reused key with a new payload (FR-1 AC 2)", async () => {
    const { api } = as("analyst1");
    const a = await api.createDispute(input, "k1");
    const b = await api.createDispute(input, "k1");
    expect(b.ref).toBe(a.ref);
    expect((await problem(api.createDispute({ ...input, amountMinor: 2000 }, "k1"))).code).toBe("idempotency_conflict");
  });

  it("never keeps the card number, only the last 4 (FR-31)", async () => {
    const { api } = as("analyst1");
    const c = await api.getCase((await api.createDispute(input, "k2")).ref);
    expect(JSON.stringify(c)).not.toContain(VISA_TEST_DIGITS);
    expect(c.cardLast4).toBe("1111");
  });

  it("rejects out-of-scope networks with a field error (FR-1 AC 6)", async () => {
    const { api } = as("analyst1");
    const e = await problem(api.createDispute({ ...input, pan: AMEX_TEST_DIGITS }, "k3"));
    expect([e.status, e.code, Object.keys(e.fieldErrors)]).toEqual([422, "out_of_scope_network", ["pan"]]);
  });

  it("chains audit hashes and verifies; analysts can't read the trail", async () => {
    const { api, switchTo } = as("auditor1");
    const events = await api.auditEvents();
    expect(events[1].prevHash).toBe(events[0].hash);
    const seqs = events.map((e) => e.seq);
    expect(seqs).toEqual([...new Set(seqs)].sort((a, b) => a - b)); // unique and increasing
    expect((await api.verifyAudit()).status).toBe("ok");
    switchTo("analyst1");
    expect((await problem(api.auditEvents())).status).toBe(403);
  });

  it("enforces D-4 and admin-only writes on config (FR-25 AC 2)", async () => {
    const { api, switchTo } = as("admin1");
    const e = await problem(api.updateConfig({ autoThresholdMinor: 60000 }, "try"));
    expect(e.fieldErrors.autoThresholdMinor).toMatch(/D-4/);
    expect((await api.updateConfig({ qaSampleRate: 0.2 }, "more QA")).version).toBe(15);
    switchTo("auditor1");
    expect((await problem(api.setAutoApprove(true, "x"))).status).toBe(403);
  });
});
