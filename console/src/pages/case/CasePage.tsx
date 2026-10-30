import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useCase, type DecisionKind } from "../../api/hooks";
import type { CaseDetail, CopilotRef, Proposal } from "../../api/types";
import { approvalBlock } from "../../auth/permissions";
import { useUser } from "../../auth/session";
import { DecisionDialog } from "../../components/DecisionDialog";
import { ClockPill, DueMeter, Pill } from "../../components/ui";
import { CATEGORY, CHANNEL, dateTimeLabel, dueLabel, money, NETWORK, REGIME, STATUS_TONE, statusLabel } from "../../format";
import { CopilotDrawer, Spark } from "./CopilotDrawer";

type Tab = "overview" | "evidence" | "drafts" | "timeline";

const PROPOSAL_TONE: Record<Proposal["status"], string> = { pending_approval: "brand", approved: "ok", rejected: "bad", returned: "warn" };

export function CasePage() {
  const { ref = "" } = useParams();
  const q = useCase(ref);
  if (q.isPending) return <div className="empty">Loading {ref}…</div>;
  if (q.isError) return <div className="empty" role="alert">Couldn’t load {ref}. {q.error.message} <Link to="/cases">Back to the queue</Link></div>;
  return <CaseView c={q.data} />;
}

function CaseView({ c }: { c: CaseDetail }) {
  const user = useUser();
  const [tab, setTab] = useState<Tab>("overview");
  const [jumpTo, setJumpTo] = useState<{ domId: string; n: number } | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DecisionKind | null>(null);

  const pending = c.proposals.filter((p) => p.status === "pending_approval");
  const active = pending.find((p) => p.id === activeId) ?? pending[0];
  const block = active ? approvalBlock(active, user) : null;
  const canDecline = user.role === "analyst" || user.role === "supervisor";

  // A citation shows the record it points at: switch tab if needed, scroll to it and flash it.
  useEffect(() => {
    if (!jumpTo) return;
    const el = document.getElementById(jumpTo.domId);
    if (!el) return;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
    el.classList.remove("flash");
    void el.offsetWidth; // restart the animation on repeat clicks
    el.classList.add("flash");
  }, [jumpTo, tab]);
  const jump = (domId: string, inTab?: Tab) => {
    if (inTab) setTab(inTab);
    setJumpTo((j) => ({ domId, n: (j?.n ?? 0) + 1 }));
  };
  const cite = (id: string) => jump(`ev-${id}`, "evidence");
  const onCite = (r: CopilotRef) => {
    if (window.innerWidth < 1200) setCopilotOpen(false);
    if (r.kind === "evidence") jump(`ev-${r.id}`, "evidence");
    if (r.kind === "rule") jump(`rule-${r.id}`, "overview");
    if (r.kind === "draft") jump(`draft-${r.id}`, "drafts");
    if (r.kind === "clock") jump(`clk-row-${r.id}`);
    if (r.kind === "proposal") {
      if (c.proposals.some((p) => p.id === r.id && p.status === "pending_approval")) setActiveId(r.id);
      jump(`prop-${r.id}`);
    }
  };

  // Docks the copilot beside the case on wide screens (see .copilot-open in console.css).
  useEffect(() => {
    document.body.classList.toggle("copilot-open", copilotOpen);
    return () => document.body.classList.remove("copilot-open");
  }, [copilotOpen]);

  // a / e / r shortcuts mirror the approvals inbox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (dialog || ["INPUT", "SELECT", "TEXTAREA"].includes(tag) || e.metaKey || e.ctrlKey) return;
      if (e.key === "c" && !copilotOpen) { e.preventDefault(); setCopilotOpen(true); return; }
      if (!active) return;
      if (e.key === "a" && !block) setDialog("approve");
      if (e.key === "e" && canDecline) setDialog("return");
      if (e.key === "r" && canDecline && !block) setDialog("reject");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, active, block, canDecline, copilotOpen]);

  return (
    <>
      <p className="note" style={{ marginBottom: 8 }}><Link to="/cases">← Case queue</Link></p>
      <section className="card case-head" aria-labelledby="case-title">
        <div className="title">
          <h1 id="case-title">{c.ref}</h1>
          <Pill tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Pill>
          <span className="tag">{REGIME[c.regime]}</span><span className="tag">{NETWORK[c.network]} {c.reasonCode}</span><span className="tag">{CATEGORY[c.category]}</span>
          {c.networkCritical && <Pill tone="bad">network-critical</Pill>}
        </div>
        <div className="facts">
          <div><span>Amount</span><b className="tnum">{money(c.amountMinor)}</b></div>
          <div><span>Card</span><b>{c.productType === "debit" ? "Debit" : "Credit"} •••• {c.cardLast4}</b></div>
          <div><span>Notice received</span><b>{dateTimeLabel(c.noticeReceivedAt)} ET</b></div>
          <div><span>Channel</span><b>{CHANNEL[c.channel]}</b></div>
          {c.decision && <div><span>Confidence</span><b>{c.decision.confidence.toFixed(2)}</b></div>}
          <div><span>Assignee</span><b>{c.assignee ?? "Unassigned"}</b></div>
        </div>

        <div className="action-bar" aria-live="polite">
          {active ? (
            <>
              <div className="what">
                <span className="muted small">Next decision · prepared by {active.preparer}</span>
                <b>{active.label}{active.amountMinor !== null && ` · ${money(active.amountMinor)}`}</b>
                <span>Satisfies {active.satisfies.label.toLowerCase()} · {dueLabel(active.satisfies.dueAt)}</span>
              </div>
              <div className="btn-row">
                {block && <span className="note" data-testid="approve-block">{block.message}</span>}
                {!block && <button className="btn ok" type="button" onClick={() => setDialog("approve")}>Approve <span className="kbd">a</span></button>}
                {canDecline && <button className="btn sec" type="button" onClick={() => setDialog("return")}>Return <span className="kbd">e</span></button>}
                {canDecline && !block && <button className="btn danger-sec" type="button" onClick={() => setDialog("reject")}>Reject <span className="kbd">r</span></button>}
              </div>
            </>
          ) : (
            <div className="what"><b>No decisions waiting</b><span>Nothing on this case needs approval right now.</span></div>
          )}
        </div>
      </section>

      <div className="grid g-main">
        <div className="card flush">
          <div className="tabs" role="tablist" aria-label="Case sections">
            {(["overview", "evidence", "drafts", "timeline"] as Tab[]).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
                {t === "evidence" && <span className="c">{c.evidence.filter((e) => e.status === "present").length} / {c.evidence.length}</span>}
                {t === "drafts" && <span className="c">{c.drafts.length}</span>}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <section className="card-b" role="tabpanel" aria-label="Overview">
              <div className="grid g2">
                <div>
                  <h3 style={{ marginTop: 0 }}>Claim</h3>
                  <dl className="kv">
                    <dt>Transaction</dt><dd>{c.claim.merchant}<br /><span className="muted small">{c.claim.txnDate} · {money(c.amountMinor)} · {c.claim.txnRef}</span> {c.claim.matched ? <Pill tone="ok">matched</Pill> : <Pill tone="warn">unmatched</Pill>}</dd>
                    <dt>Cardholder says</dt><dd>“{c.claim.narrative}”<br /><span className="note">Untrusted text · redacted before any model call</span></dd>
                    <dt>Learned of error</dt><dd>{c.claim.learnedOn ?? "Not stated"}</dd>
                  </dl>
                </div>
                {c.decision && (
                  <div>
                    <h3 style={{ marginTop: 0 }}>Policy decision <Pill tone="ok" plain>{c.decision.outcome}</Pill></h3>
                    <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                      {c.decision.trace.map((t) => <li key={t.ruleId} id={`rule-${t.ruleId}`} tabIndex={-1}><code>{t.ruleId}</code> {t.text}</li>)}
                    </ol>
                    <p className="note" style={{ marginTop: 8 }}>Policy pack {c.decision.policyVersion} · config v{c.decision.configVersion} · the model can’t change an outcome</p>
                  </div>
                )}
              </div>
              {c.decision && (
                <>
                  <h3>Confidence {c.decision.confidence.toFixed(2)}</h3>
                  <div className="conf">
                    {([["Rule coverage", c.decision.components.ruleCoverage], ["Evidence complete", c.decision.components.evidence], ["Model self-score", c.decision.components.model]] as const).map(([k, v]) => (
                      <div className="row" key={k}><span>{k}</span><div className="meter ok"><i style={{ width: `${v * 100}%` }} /></div><b className="tnum">{v.toFixed(2)}</b></div>
                    ))}
                  </div>
                </>
              )}
              <h3>Agent evidence summary</h3>
              <p>
                {c.evidenceSummary.map((s, i) => (
                  <span key={i}>{s.text}{s.cites.map((id) => <button key={id} type="button" className="cite" onClick={() => cite(id)} aria-label={`Show evidence ${id}`}>{id}</button>)} </span>
                ))}
              </p>
            </section>
          )}

          {tab === "evidence" && (
            <section role="tabpanel" aria-label="Evidence">
              <table className="tbl">
                <thead><tr><th>ID</th><th>Item</th><th>Source</th><th>Status</th></tr></thead>
                <tbody>
                  {c.evidence.map((e) => (
                    <tr key={e.id} id={`ev-${e.id}`} tabIndex={-1}>
                      <td className="mono">{e.id}</td><td>{e.item}</td><td>{e.source}</td>
                      <td><Pill tone={e.status === "present" ? "ok" : e.status === "missing" ? "warn" : undefined} plain={e.status === "not_applicable"}>
                        {e.status.replace("_", " ")}{e.note ? ` · ${e.note}` : ""}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {tab === "drafts" && (
            <section className="card-b" role="tabpanel" aria-label="Drafts">
              {c.drafts.length === 0 && <p className="muted">No drafts on this case yet.</p>}
              {c.drafts.map((d) => (
                <article key={d.id} id={`draft-${d.id}`} tabIndex={-1} style={{ marginBottom: 18 }}>
                  <h3 style={{ marginTop: 0 }}>{d.label} · v{d.version}</h3>
                  {/* Plain text only. HTML letters render in a sandboxed iframe once T85's renderer exists. */}
                  <div className="letter" style={{ whiteSpace: "pre-wrap" }}>{d.body}</div>
                  <div className="checks">{d.checks.map((ch) => <Pill key={ch} tone="ok">{ch}</Pill>)}</div>
                  <p className="note" style={{ marginTop: 6 }}>{d.provenance}</p>
                </article>
              ))}
            </section>
          )}

          {tab === "timeline" && (
            <section className="card-b" role="tabpanel" aria-label="Timeline">
              <ul className="timeline">
                {c.timeline.map((t) => (
                  <li key={t.seq}><span className={`dot ${t.kind === "security" ? "sec" : t.kind === "ai" ? "ai" : ""}`} />
                    <div>{t.text}<small>{dateTimeLabel(t.at)} · {t.actor} · seq {t.seq.toLocaleString()}</small></div></li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside>
          <div className="card">
            <div className="card-h"><h2>Proposals</h2><span className="right note">bound to content hashes</span></div>
            {c.proposals.length === 0 ? <p className="card-b muted">None yet.</p> : (
              <table className="tbl hover"><tbody>
                {c.proposals.map((p) => (
                  <tr key={p.id} id={`prop-${p.id}`} tabIndex={-1} className={active?.id === p.id ? "sel" : undefined}
                    onClick={() => p.status === "pending_approval" && setActiveId(p.id)}>
                    <td><b>{p.label}</b><span className="sub">{p.id} · {money(p.amountMinor)} · {p.requiredRole === "supervisor" ? "Supervisor" : "Analyst"} · by {p.preparer}</span></td>
                    <td style={{ textAlign: "right" }}><Pill tone={PROPOSAL_TONE[p.status]}>{p.status === "pending_approval" ? "pending" : p.status}</Pill></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div className="card">
            <div className="card-h"><h2>Clocks</h2></div>
            <table className="tbl"><tbody>
              {c.clocks.map((k) => (
                <tr key={k.id} id={`clk-row-${k.id}`} tabIndex={-1}>
                  <td><b>{k.label}</b><span className="sub">{k.detail}</span></td>
                  <td>{k.dueAt ? <DueMeter clock={k} label={dueLabel(k.dueAt)} /> : <ClockPill clock={k} />}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </aside>
      </div>

      {dialog && active && <DecisionDialog kind={dialog} proposal={active} onClose={() => setDialog(null)} />}

      {!copilotOpen && (
        <button className="fab" type="button" onClick={() => setCopilotOpen(true)} aria-label="Open the Investigation Co-Pilot">
          <Spark />Investigation Co-Pilot <span className="kbd" style={{ color: "#fff", borderColor: "rgba(255,255,255,.5)", background: "transparent" }}>c</span>
        </button>
      )}
      <CopilotDrawer c={c} open={copilotOpen} onClose={() => setCopilotOpen(false)} onCite={onCite} />
    </>
  );
}
