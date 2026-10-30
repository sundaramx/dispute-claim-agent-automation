import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useInbox, type DecisionKind } from "../../api/hooks";
import { supervisorReason } from "../../auth/permissions";
import { useUser } from "../../auth/session";
import { DecisionDialog } from "../../components/DecisionDialog";
import { DueMeter, Pill } from "../../components/ui";
import { CATEGORY, dueLabel, money, NETWORK } from "../../format";

export function ApprovalsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const inbox = useInbox();
  const [selected, setSelected] = useState(0);
  const [dialog, setDialog] = useState<DecisionKind | null>(null);

  const items = inbox.data?.items ?? [];
  const sel = Math.min(selected, Math.max(items.length - 1, 0));
  const current = items[sel];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (dialog || ["INPUT", "SELECT", "TEXTAREA"].includes(tag) || e.metaKey || e.ctrlKey) return;
      if (e.key === "j") setSelected(Math.min(sel + 1, items.length - 1));
      if (e.key === "k") setSelected(Math.max(sel - 1, 0));
      if (!current) return;
      if (e.key === "a") setDialog("approve");
      if (e.key === "r") setDialog("reject");
      if (e.key === "e") setDialog("return");
      if (e.key === "Enter") navigate(`/cases/${current.proposal.caseRef}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, sel, items.length, current, navigate]);

  return (
    <>
      <div className="page-h">
        <div><h1>Approvals</h1><p className="sub">What <b>{user.displayName}</b> may decide, nearest deadline first. Four-eyes and role rules are applied by the server.</p></div>
        <div className="actions"><span className="note"><span className="kbd">j</span> <span className="kbd">k</span> move · <span className="kbd">a</span> approve · <span className="kbd">e</span> return · <span className="kbd">r</span> reject</span></div>
      </div>

      {inbox.isPending && <div className="empty">Loading…</div>}
      {inbox.isError && <div className="empty" role="alert">Couldn’t load the inbox. {inbox.error.message}</div>}
      {inbox.isSuccess && (
        <div className="split">
          <div>
            <div className="card flush">
              <div className="table-wrap"><table className="tbl hover">
                <thead><tr><th>Proposal</th><th className="num">Amount</th><th>Deadline it satisfies</th><th>Approver</th></tr></thead>
                <tbody>
                  {items.length === 0 && <tr><td colSpan={4}><div className="empty"><b>Inbox zero.</b><br />Everything you can decide has been decided.</div></td></tr>}
                  {items.map(({ proposal: p, caseSummary: c }, i) => (
                    <tr key={p.id} className={i === sel ? "sel" : undefined} onClick={() => setSelected(i)} aria-selected={i === sel}>
                      <td><b>{p.label}</b><span className="sub">{c.ref} · {CATEGORY[c.category]} · {NETWORK[c.network]} {c.reasonCode}</span></td>
                      <td className="num">{money(p.amountMinor)}</td>
                      <td><DueMeter clock={p.satisfies} label={dueLabel(p.satisfies.dueAt)} /></td>
                      <td>{p.requiredRole === "supervisor" ? <Pill tone="warn">Supervisor · {supervisorReason(p)}</Pill> : <Pill plain>Analyst</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
            {inbox.data.hidden.length > 0 && (
              <div className="callout info">
                Not shown because you can’t decide them:{" "}
                {inbox.data.hidden.map((h) => `${h.count} · ${h.reason}`).join("  ")}
              </div>
            )}
          </div>

          {current && (
            <div className="card preview" aria-live="polite" aria-label="Selected proposal">
              <div className="card-h"><h2>{current.proposal.label} · {money(current.proposal.amountMinor)}</h2>
                <div className="right"><Link className="btn sm ghost" to={`/cases/${current.proposal.caseRef}`}>Open case →</Link></div></div>
              <div className="card-b">
                <div className="summary">
                  <div><span>Case</span><b>{current.proposal.caseRef}</b></div>
                  <div><span>Policy rule</span><b className="mono">{current.proposal.ruleId}</b></div>
                  <div><span>Prepared by</span><b>{current.proposal.preparer}</b></div>
                  <div><span>Satisfies</span><b>{current.proposal.satisfies.label}</b></div>
                </div>
                <div>
                  <div className="small muted" style={{ display: "flex", justifyContent: "space-between" }}><span>Confidence</span>
                    <b>{current.proposal.confidence.toFixed(2)}{current.proposal.lowConfidence ? " · low" : ""}</b></div>
                  <div className={`meter ${current.proposal.lowConfidence ? "warn" : "ok"}`}><i style={{ width: `${current.proposal.confidence * 100}%` }} /></div>
                </div>
                <div className="btn-row">
                  <button className="btn ok lg" type="button" onClick={() => setDialog("approve")}>Approve <span className="kbd">a</span></button>
                  <button className="btn sec" type="button" onClick={() => setDialog("return")}>Return <span className="kbd">e</span></button>
                  <button className="btn danger-sec" type="button" onClick={() => setDialog("reject")}>Reject <span className="kbd">r</span></button>
                </div>
                <p className="note">Approval binds to <span className="mono">{current.proposal.contentHash}</span>.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {dialog && current && <DecisionDialog kind={dialog} proposal={current.proposal} onClose={() => setDialog(null)} />}
    </>
  );
}
