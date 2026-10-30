import { useState } from "react";
import { useConfig, useConfigHistory, useSetAutoApprove, useUpdateConfig } from "../../api/hooks";
import { ProblemError, type Config, type ConfigPatch } from "../../api/types";
import { ROLE_LABEL } from "../../auth/permissions";
import { SEEDED_USERS, useUser } from "../../auth/session";
import { Modal, Pill, errorText, useToast } from "../../components/ui";
import { dateTimeLabel, money } from "../../format";

type Key = keyof ConfigPatch;

// Displayed units: dollars for thresholds, 0–1 for confidence, percent for QA.
const FIELDS: { key: Key; label: string; step: string; toForm: (c: Config) => string; fromForm: (v: string) => number; show: (n: number) => string }[] = [
  { key: "supervisorThresholdMinor", label: "Supervisor sign-off over (USD)", step: "1", toForm: (c) => String(c.supervisorThresholdMinor / 100), fromForm: (v) => Math.round(Number(v) * 100), show: (n) => money(n) },
  { key: "autoThresholdMinor", label: "Auto-approve up to (USD)", step: "1", toForm: (c) => String(c.autoThresholdMinor / 100), fromForm: (v) => Math.round(Number(v) * 100), show: (n) => money(n) },
  { key: "confidenceLow", label: "Low confidence below", step: "0.01", toForm: (c) => String(c.confidenceLow), fromForm: Number, show: (n) => n.toFixed(2) },
  { key: "confidenceHigh", label: "High confidence at or above", step: "0.01", toForm: (c) => String(c.confidenceHigh), fromForm: Number, show: (n) => n.toFixed(2) },
  { key: "qaSampleRate", label: "QA sample rate (%)", step: "1", toForm: (c) => String(Math.round(c.qaSampleRate * 100)), fromForm: (v) => Number(v) / 100, show: (n) => `${Math.round(n * 100)}%` },
];

export function AdminPage() {
  const user = useUser();
  const canRead = user.role === "admin" || user.role === "auditor";
  const cfg = useConfig(canRead);
  const history = useConfigHistory(canRead);
  if (!canRead) return <div className="empty" role="alert">Your role can’t view configuration.</div>;
  if (cfg.isPending) return <div className="empty">Loading configuration…</div>;
  if (cfg.isError) return <div className="empty" role="alert">{errorText(cfg.error)}</div>;
  // Re-mount the editor whenever a new version is saved, so the form starts from it.
  return <ConfigView key={cfg.data.version} config={cfg.data} canWrite={user.role === "admin"} history={history.data ?? []} />;
}

function ConfigView({ config, canWrite, history }: { config: Config; canWrite: boolean; history: NonNullable<ReturnType<typeof useConfigHistory>["data"]> }) {
  const toast = useToast();
  const update = useUpdateConfig();
  const setAuto = useSetAutoApprove();
  const [form, setForm] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, f.toForm(config)])) as Record<Key, string>);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"save" | "auto" | null>(null);
  const [reason, setReason] = useState("");
  const [reasonMissing, setReasonMissing] = useState(false);

  const values = Object.fromEntries(FIELDS.map((f) => [f.key, f.fromForm(form[f.key])])) as Record<Key, number>;
  const patch: ConfigPatch = Object.fromEntries(FIELDS.filter((f) => values[f.key] !== config[f.key]).map((f) => [f.key, values[f.key]]));
  // Same rules the server applies (D-4, FR-9 AC 3), for instant feedback.
  const clientErrors: Partial<Record<Key, string>> = {};
  if (values.autoThresholdMinor > values.supervisorThresholdMinor) clientErrors.autoThresholdMinor = `Must be ≤ the Supervisor threshold (${money(values.supervisorThresholdMinor)}) so auto-approve can’t bypass sign-off (D-4).`;
  if (values.confidenceHigh < values.confidenceLow) clientErrors.confidenceHigh = `Must be ≥ the low-confidence line (${values.confidenceLow}) (FR-9 AC 3).`;
  const errorFor = (k: Key) => clientErrors[k] ?? serverErrors[k];
  const changed = Object.keys(patch).length > 0;

  const close = () => { setConfirm(null); setReason(""); setReasonMissing(false); };
  const onConfirm = () => {
    if (!reason.trim()) { setReasonMissing(true); return; }
    if (confirm === "save") {
      update.mutate({ patch, reason }, {
        onSuccess: (c) => { toast(`Saved as config v${c.version}`); close(); },
        onError: (e) => { if (e instanceof ProblemError) setServerErrors(e.fieldErrors); close(); toast(errorText(e), "bad"); },
      });
    } else {
      setAuto.mutate({ enabled: !config.autoApproveEnabled, reason }, {
        onSuccess: (c) => { toast(`Auto-approve is now ${c.autoApproveEnabled ? "ON" : "OFF"} · config v${c.version}`, c.autoApproveEnabled ? "warn" : undefined); close(); },
        onError: (e) => { close(); toast(errorText(e), "bad"); },
      });
    }
  };
  const turningOn = !config.autoApproveEnabled;

  return (
    <>
      <div className="page-h">
        <div><h1>Configuration</h1><p className="sub">Config v{config.version} is active. Every change is versioned, needs a reason and is audit-logged with a diff (FR-25).
          {!canWrite && " You have read-only access."}</p></div>
      </div>

      <div className="grid g2">
        <section className="card" aria-labelledby="auto-h">
          <div className="card-h"><h2 id="auto-h">Low-risk auto-approve</h2><span className="right"><Pill tone={config.autoApproveEnabled ? "auto" : "ok"}>{config.autoApproveEnabled ? "ON" : "OFF"}</Pill></span></div>
          <div className="card-b">
            <label className="switch">
              <input type="checkbox" role="switch" checked={config.autoApproveEnabled} disabled={!canWrite} onChange={() => setConfirm("auto")} />
              <span className="track" /><span>Execute eligible actions without a human</span>
            </label>
            <div className="summary" style={{ marginTop: 14 }}>
              <div><span>Eligible actions</span><b>Provisional credit, chargeback filing</b></div>
              <div><span>Confidence</span><b>≥ {config.confidenceHigh.toFixed(2)}</b></div>
              <div><span>Amount</span><b>≤ {money(config.autoThresholdMinor)}</b></div>
              <div><span>QA sample</span><b>{Math.round(config.qaSampleRate * 100)}% to Supervisors</b></div>
              <div><span>Never automatic</span><b>Letters, denials, write-offs, representment</b></div>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="thr-h">
          <div className="card-h"><h2 id="thr-h">Thresholds</h2></div>
          <div className="card-b grid g2" style={{ gap: 12 }}>
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                <input id={f.key} type="number" step={f.step} value={form[f.key]} disabled={!canWrite}
                  aria-invalid={!!errorFor(f.key)} aria-describedby={`${f.key}-err`}
                  onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setServerErrors({}); }} />
                {errorFor(f.key) && <div className="err" id={`${f.key}-err`}>{errorFor(f.key)}</div>}
              </div>
            ))}
            {canWrite && (
              <div className="field" style={{ alignSelf: "end" }}>
                <button className="btn" type="button" disabled={!changed || Object.keys(clientErrors).length > 0} onClick={() => setConfirm("save")}>
                  Save as v{config.version + 1}…
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid g2">
        <section className="card flush" aria-labelledby="llm-h">
          <div className="card-h"><h2 id="llm-h">Model routing</h2><span className="right note">per environment and task, with failover</span></div>
          <table className="tbl">
            <thead><tr><th>Task</th><th>Primary</th><th>Failover</th><th>Region</th></tr></thead>
            <tbody>{config.llmRoutes.map((r) => <tr key={r.task}><td className="mono">{r.task}</td><td>{r.primary}</td><td>{r.failover}</td><td>{r.region}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="card flush" aria-labelledby="users-h">
          <div className="card-h"><h2 id="users-h">Users and roles</h2><span className="right note">Admin and Auditor can’t hold other roles</span></div>
          <table className="tbl"><tbody>
            {SEEDED_USERS.map((u) => <tr key={u.id}><td><b>{u.displayName}</b></td><td>{ROLE_LABEL[u.role]}</td><td><Pill tone="ok">active</Pill></td></tr>)}
          </tbody></table>
        </section>
      </div>

      <section className="card flush" aria-labelledby="hist-h">
        <div className="card-h"><h2 id="hist-h">Version history</h2></div>
        <table className="tbl">
          <thead><tr><th>Version</th><th>When</th><th>By</th><th>Change</th><th>Reason</th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.version}><td>v{h.version}</td><td>{dateTimeLabel(h.at)}</td><td>{h.author}</td>
                <td className="mono">{h.changes.join("; ")}</td><td>{h.reason}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {confirm && (
        <Modal
          title={confirm === "save" ? `Save configuration v${config.version + 1}` : `Turn auto-approve ${turningOn ? "ON" : "OFF"}?`}
          onClose={close}
          footer={<>
            <button className="btn sec" type="button" onClick={close}>Cancel</button>
            <button className={`btn ${confirm === "auto" && turningOn ? "danger" : ""}`} type="button" onClick={onConfirm} disabled={update.isPending || setAuto.isPending}>
              {confirm === "save" ? "Save" : turningOn ? "Turn ON" : "Turn OFF"}
            </button>
          </>}
        >
          {confirm === "save" ? (
            <div className="summary">
              {FIELDS.filter((f) => f.key in patch).map((f) => (
                <div key={f.key}><span>{f.label}</span><b className="mono">{f.show(config[f.key])} → {f.show(values[f.key])}</b></div>
              ))}
            </div>
          ) : (
            <div className={`callout ${turningOn ? "auto" : "info"}`} style={{ marginTop: 0 }}>
              {turningOn
                ? `High-confidence provisional credits and chargeback filings up to ${money(config.autoThresholdMinor)} will execute without a human. ${Math.round(config.qaSampleRate * 100)}% are sampled for Supervisor QA.`
                : "New auto-actions stop within 5 seconds. Auto-actions not yet executed go back to the approvals inbox."}
            </div>
          )}
          <div className="field">
            <label htmlFor="cfg-reason">Reason <span className="muted">(required, stored in the audit log)</span></label>
            <textarea id="cfg-reason" value={reason} aria-invalid={reasonMissing} aria-describedby="cfg-reason-err"
              onChange={(e) => { setReason(e.target.value); setReasonMissing(false); }} />
            {reasonMissing && <div className="err" id="cfg-reason-err">Give a reason.</div>}
          </div>
        </Modal>
      )}
    </>
  );
}
