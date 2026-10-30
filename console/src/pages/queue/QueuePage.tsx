import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAssign, useCases } from "../../api/hooks";
import type { CaseQuery, CaseSummary, Category, Network, Regime } from "../../api/types";
import { canWorkCases } from "../../auth/permissions";
import { useUser } from "../../auth/session";
import { ClockPill, DueMeter, Pill, useToast } from "../../components/ui";
import { CATEGORY, CHANNEL, dueLabel, money, NETWORK, REGIME, STATUS_TONE, statusLabel } from "../../format";

type View = "all" | "risk" | "approval" | "mine" | "unassigned";

const VIEWS: { id: View; label: string; test: (c: CaseSummary, me: string) => boolean }[] = [
  { id: "all", label: "All open", test: () => true },
  { id: "risk", label: "At risk", test: (c) => c.networkCritical || c.nearestClock.state === "at_risk" || c.nearestClock.state === "breached" },
  { id: "approval", label: "Awaiting approval", test: (c) => c.status === "awaiting_approval" },
  { id: "mine", label: "Assigned to me", test: (c, me) => c.assignee === me },
  { id: "unassigned", label: "Unassigned", test: (c) => !c.assignee },
];

export function QueuePage() {
  const user = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const assign = useAssign();
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState<CaseQuery>({});
  const [selected, setSelected] = useState(0);
  const cases = useCases(query);

  const all = cases.data ?? [];
  const rows = all.filter((c) => VIEWS.find((v) => v.id === view)!.test(c, user.id));
  const sel = Math.min(selected, Math.max(rows.length - 1, 0));

  // j/k move, Enter opens (NFR-14: keyboard navigable).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag) || e.metaKey || e.ctrlKey) return;
      if (e.key === "j") setSelected(Math.min(sel + 1, rows.length - 1));
      if (e.key === "k") setSelected(Math.max(sel - 1, 0));
      if (e.key === "Enter" && rows[sel]) navigate(`/cases/${rows[sel].ref}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rows, sel, navigate]);

  const set = <K extends keyof CaseQuery>(k: K, v: string) => { setQuery((q) => ({ ...q, [k]: v || undefined })); setSelected(0); };

  return (
    <>
      <div className="page-h">
        <div><h1>Case queue</h1><p className="sub">Nearest deadline first. Reg E counts business days; Reg Z and network clocks count calendar days.</p></div>
        {canWorkCases(user.role) && <div className="actions"><Link className="btn" to="/intake">+ New dispute</Link></div>}
      </div>

      <div className="card flush">
        <div className="tabs" role="tablist" aria-label="Saved views">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => { setView(v.id); setSelected(0); }}>
              {v.label}<span className="c">{all.filter((c) => v.test(c, user.id)).length}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <div className="search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <label className="sr-only" htmlFor="q">Filter cases</label>
            <input id="q" placeholder="Filter by case, merchant, assignee or status" value={query.text ?? ""} onChange={(e) => set("text", e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="f-regime">Regime</label>
          <select id="f-regime" style={{ width: "auto" }} value={query.regime ?? ""} onChange={(e) => set("regime", e.target.value as Regime)}>
            <option value="">All regimes</option>{Object.entries(REGIME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-network">Network</label>
          <select id="f-network" style={{ width: "auto" }} value={query.network ?? ""} onChange={(e) => set("network", e.target.value as Network)}>
            <option value="">All networks</option>{Object.entries(NETWORK).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="sr-only" htmlFor="f-category">Category</label>
          <select id="f-category" style={{ width: "auto" }} value={query.category ?? ""} onChange={(e) => set("category", e.target.value as Category)}>
            <option value="">All categories</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table className="tbl hover">
            <thead><tr><th>Case</th><th>Regime</th><th>Category</th><th className="num">Amount</th><th>Nearest deadline</th><th>Status</th><th>Assignee</th></tr></thead>
            <tbody>
              {cases.isPending && <tr><td colSpan={7}><div className="empty">Loading cases…</div></td></tr>}
              {cases.isError && <tr><td colSpan={7}><div className="empty" role="alert">Couldn’t load cases. {String(cases.error.message)}</div></td></tr>}
              {cases.isSuccess && rows.length === 0 && <tr><td colSpan={7}><div className="empty">No cases match these filters.</div></td></tr>}
              {rows.map((c, i) => (
                <tr key={c.ref} className={i === sel ? "sel" : undefined} onClick={() => navigate(`/cases/${c.ref}`)}>
                  <td><Link className="case-link" to={`/cases/${c.ref}`} onClick={(e) => e.stopPropagation()}>{c.ref}</Link>
                    <span className="sub">{CHANNEL[c.channel]}</span></td>
                  <td><span className="tag">{REGIME[c.regime]}</span></td>
                  <td>{CATEGORY[c.category]}<span className="sub">{NETWORK[c.network]} · {c.reasonCode}</span></td>
                  <td className="num"><b>{money(c.amountMinor)}</b>{c.amountMinor > 50000 && <span className="sub">Supervisor</span>}</td>
                  <td><DueMeter clock={c.nearestClock} label={dueLabel(c.nearestClock.dueAt)} />
                    <div style={{ marginTop: 4 }}><ClockPill clock={c.nearestClock} networkCritical={c.networkCritical} /></div></td>
                  <td><Pill tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Pill></td>
                  <td>{c.assignee ?? (canWorkCases(user.role)
                    ? <button className="btn sm sec" type="button" disabled={assign.isPending}
                        onClick={(e) => { e.stopPropagation(); assign.mutate(c.ref, { onSuccess: () => toast(`${c.ref} assigned to you`) }); }}>Claim</button>
                    : <span className="muted">—</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="toolbar" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
          <span className="note">{rows.length} shown</span>
          <span className="note" style={{ marginLeft: "auto" }}><span className="kbd">j</span> <span className="kbd">k</span> move · <span className="kbd">↵</span> open</span>
        </div>
      </div>
    </>
  );
}
