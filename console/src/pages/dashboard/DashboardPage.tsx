import { Link } from "react-router";
import { useDashboard } from "../../api/hooks";
import { Pill, Sparkline, errorText } from "../../components/ui";
import { CATEGORY, dateTimeLabel, dueLabel } from "../../format";

export function DashboardPage() {
  const q = useDashboard();
  if (q.isPending) return <div className="empty">Loading the dashboard…</div>;
  if (q.isError) return <div className="empty" role="alert">Couldn’t load the dashboard. {errorText(q.error)}</div>;
  const d = q.data;
  const maxBaseline = Math.max(...d.handlingMinutes.map((h) => h.baseline)) * 1.1;

  return (
    <>
      <div className="page-h">
        <div><h1>SLA dashboard</h1><p className="sub">Deadlines, handling time, auto-approve quality and model usage (FR-24).</p></div>
      </div>

      <div className="grid g4">
        <section className="card stat" aria-label="Deadline compliance">
          <div className="lbl">Deadline compliance · SM-1</div>
          <div className="val">{d.deadlineCompliance.value}%</div>
          <div className="delta up">{d.deadlineCompliance.late} of {d.deadlineCompliance.closed.toLocaleString()} closed clocks late</div>
          <Sparkline points={d.deadlineCompliance.trend} color="var(--ok)" />
        </section>
        <section className="card stat" aria-label="Handling time saved">
          <div className="lbl">Handling time saved · SM-2 {!d.handlingTimeReduction.baselineValidated && <Pill tone="warn" plain>baseline unvalidated</Pill>}</div>
          <div className="val">{d.handlingTimeReduction.value}%</div>
          <div className="delta">Target ≥ 50% against the manual baseline</div>
          <Sparkline points={d.handlingTimeReduction.trend} />
        </section>
        <section className="card stat" aria-label="QA agreement">
          <div className="lbl">QA agreement on auto-actions</div>
          <div className="val">{d.qaAgreement.value}%</div>
          <div className="delta">{d.qaAgreement.agreed} of {d.qaAgreement.reviewed} reviewed</div>
          <Sparkline points={d.qaAgreement.trend} color="var(--auto)" />
        </section>
        <section className="card stat" aria-label="Cases at risk">
          <div className="lbl">Cases at risk now</div>
          <div className="val">{d.atRisk.value}</div>
          <div className="delta down">{d.atRisk.changeSinceYesterday >= 0 ? "▲" : "▼"} {Math.abs(d.atRisk.changeSinceYesterday)} since yesterday</div>
          <Sparkline points={d.atRisk.trend} color="var(--warn)" />
        </section>
      </div>

      <div className="grid g2">
        <div className="card flush">
          <div className="card-h"><h2>Open clocks by state</h2></div>
          <table className="tbl heat">
            <thead><tr><th>Regime · clock</th><th className="num">Open</th><th className="num">At risk</th><th className="num">Breached</th></tr></thead>
            <tbody>
              {d.clocksByState.map((r) => (
                <tr key={r.group}><td>{r.group}</td><td className="num">{r.open}</td>
                  <td className={`num ${r.atRisk ? "h1" : "h0"}`}>{r.atRisk}</td><td className={`num ${r.breached ? "h1" : "h0"}`}>{r.breached}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card flush">
          <div className="card-h"><h2>Due within 2 business days</h2><Link className="right btn sm ghost" to="/cases">Open queue →</Link></div>
          <table className="tbl">
            <thead><tr><th>Case</th><th>Clock</th><th>Next action</th></tr></thead>
            <tbody>
              {d.dueSoon.length === 0 && <tr><td colSpan={3}><div className="empty">Nothing is at risk.</div></td></tr>}
              {d.dueSoon.map((r) => (
                <tr key={r.ref}><td><Link className="case-link" to={`/cases/${r.ref}`}>{r.ref}</Link><span className="sub">{dueLabel(r.dueAt)}</span></td>
                  <td>{r.clock}</td><td>{r.nextAction}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h"><h2>Handling time per case</h2>
            <span className="right legend"><span><i style={{ background: "var(--brand)" }} />now</span><span><i style={{ background: "var(--ink-2)" }} />baseline</span></span></div>
          <div className="card-b">
            {d.handlingMinutes.map((h) => (
              <div className="hbar" key={h.category}>
                <span>{CATEGORY[h.category]}</span>
                <div className="track"><i style={{ width: `${(h.now / maxBaseline) * 100}%` }} /><b style={{ left: `${(h.baseline / maxBaseline) * 100}%` }} /></div>
                <span className="tnum muted">{h.now} vs {h.baseline} min</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Auto-approve</h2><span className="right"><Pill tone={d.autoApprove.enabled ? "auto" : "ok"}>{d.autoApprove.enabled ? "ON" : "OFF"}</Pill></span></div>
          <div className="card-b">
            <p>Last changed by <b>{d.autoApprove.lastChangedBy}</b> on {dateTimeLabel(d.autoApprove.lastChangedAt)} ET.</p>
            <p className="note">High-confidence provisional credits and chargebacks up to the auto threshold execute without a human when ON. A sample goes to Supervisor QA.</p>
          </div>
        </div>
      </div>

      <div className="card flush">
        <div className="card-h"><h2>Model usage · last 24 h</h2><span className="right note">FR-30</span></div>
        {d.llmUsage === null ? (
          <p className="card-b muted" style={{ margin: 0 }}>Model usage is visible to Supervisors, Auditors and Admins.</p>
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Task</th><th>Provider</th><th className="num">Calls</th><th className="num">Tokens</th><th className="num">p95 latency</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {d.llmUsage.map((u) => (
                <tr key={u.task}><td className="mono">{u.task}</td><td>{u.provider}</td><td className="num">{u.calls}</td>
                  <td className="num">{u.tokens.toLocaleString()}</td><td className="num">{u.p95Ms} ms</td>
                  <td className="num">{u.costUsd.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
