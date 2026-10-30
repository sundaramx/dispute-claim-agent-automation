import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useAuditEvents, useReplay, useVerifyAudit } from "../../api/hooks";
import type { AuditEvent, AuditQuery } from "../../api/types";
import { useUser } from "../../auth/session";
import { Modal, Pill, errorText } from "../../components/ui";
import { dateTimeLabel } from "../../format";

const TYPES: { prefix: string; label: string }[] = [
  { prefix: "approval", label: "Approvals" },
  { prefix: "security", label: "Security" },
  { prefix: "decision", label: "Decisions" },
  { prefix: "config", label: "Config" },
  { prefix: "intake", label: "Intake" },
];

const short = (h: string) => `${h.slice(0, 4)}…${h.slice(-4)}`;

export function AuditPage() {
  const user = useUser();
  const canRead = user.role !== "analyst";
  const canVerify = user.role === "auditor" || user.role === "admin";
  const canReplay = user.role === "auditor" || user.role === "supervisor";

  const [draft, setDraft] = useState<AuditQuery>({});
  const [query, setQuery] = useState<AuditQuery>({});
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const [replayRef, setReplayRef] = useState("DSP-2026-000412");
  const events = useAuditEvents(query, canRead);
  const verify = useVerifyAudit();
  const replay = useReplay();

  if (!canRead) return <div className="empty" role="alert">Your role can’t read the audit trail.</div>;

  const search = (e: FormEvent) => { e.preventDefault(); setQuery(draft); };
  const toggleType = (prefix: string) => {
    const next = { ...draft, typePrefix: draft.typePrefix === prefix ? undefined : prefix };
    setDraft(next); setQuery(next);
  };

  return (
    <>
      <div className="page-h">
        <div><h1>Audit trail</h1><p className="sub">Append-only and hash-chained (FR-26). Each event’s hash covers the one before it, so any edit, deletion or reordering breaks the chain.</p></div>
      </div>

      {canVerify && (
        <div className="card chainbar">
          <button className="btn" type="button" onClick={() => verify.mutate()} disabled={verify.isPending}>{verify.isPending ? "Verifying…" : "Verify chain"}</button>
          <span aria-live="polite">
            {verify.data?.status === "ok" && <Pill tone="ok">Chain intact · seq {verify.data.fromSeq.toLocaleString()} → {verify.data.toSeq.toLocaleString()}</Pill>}
            {verify.data?.status === "broken" && <Pill tone="bad">Broken at seq {verify.data.firstBadSeq} · {verify.data.reason}</Pill>}
            {verify.isError && <span className="err">{errorText(verify.error)}</span>}
            {verify.isIdle && <span className="note">Recomputes every hash and checks each link (FR-27).</span>}
          </span>
        </div>
      )}

      <div className="card flush">
        <form className="toolbar" onSubmit={search} aria-label="Search audit events">
          <label className="sr-only" htmlFor="a-case">Case</label>
          <input id="a-case" style={{ width: 190 }} placeholder="Case, e.g. DSP-2026-000412" value={draft.caseRef ?? ""}
            onChange={(e) => setDraft({ ...draft, caseRef: e.target.value || undefined })} />
          <label className="sr-only" htmlFor="a-actor">Actor</label>
          <input id="a-actor" style={{ width: 160 }} placeholder="Actor" value={draft.actor ?? ""}
            onChange={(e) => setDraft({ ...draft, actor: e.target.value || undefined })} />
          <button className="btn sec sm" type="submit">Search</button>
          <span style={{ width: 8 }} />
          {TYPES.map((t) => (
            <button key={t.prefix} type="button" className="chip" aria-pressed={draft.typePrefix === t.prefix} onClick={() => toggleType(t.prefix)}>{t.label}</button>
          ))}
        </form>
        <div className="table-wrap">
          <table className="tbl hover">
            <thead><tr><th className="num">Seq</th><th>Time (ET)</th><th>Actor</th><th>Event</th><th>Case</th><th>Versions</th><th>Hash</th></tr></thead>
            <tbody>
              {events.isPending && <tr><td colSpan={7}><div className="empty">Loading events…</div></td></tr>}
              {events.isError && <tr><td colSpan={7}><div className="empty" role="alert">{errorText(events.error)}</div></td></tr>}
              {events.data?.length === 0 && <tr><td colSpan={7}><div className="empty">No events match.</div></td></tr>}
              {events.data?.map((e) => (
                <tr key={e.seq} onClick={() => setOpen(e)} tabIndex={0} onKeyDown={(k) => { if (k.key === "Enter") setOpen(e); }}>
                  <td className="num">{e.seq.toLocaleString()}</td><td>{dateTimeLabel(e.at)}</td><td>{e.actor}</td>
                  <td className="mono">{e.type}</td><td>{e.caseRef ? <Link to={`/cases/${e.caseRef}`} onClick={(x) => x.stopPropagation()}>{e.caseRef}</Link> : "—"}</td>
                  <td className="mono">{e.versions}</td><td className="hash">{short(e.hash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note card-b" style={{ margin: 0 }}>Select a row to see its hash links. Payloads containing PII are shown by digest only.</p>
      </div>

      {canReplay && (
        <div className="card">
          <div className="card-h"><h2>Replay a case</h2><span className="right note">Model outputs are replayed from the record, never regenerated (FR-28)</span></div>
          <form className="card-b btn-row" onSubmit={(e) => { e.preventDefault(); replay.mutate(replayRef); }}>
            <label className="sr-only" htmlFor="replay-ref">Case to replay</label>
            <input id="replay-ref" style={{ width: 220 }} value={replayRef} onChange={(e) => setReplayRef(e.target.value)} />
            <button className="btn sec" type="submit" disabled={replay.isPending}>Replay</button>
            <span aria-live="polite">
              {replay.data && (replay.data.match
                ? <Pill tone="ok">{replay.data.caseRef}: match · {replay.data.decisions} decision(s) · 0 diffs</Pill>
                : <Pill tone="bad">{replay.data.caseRef}: {replay.data.diffs.length} diffs</Pill>)}
              {replay.isError && <span className="err">{errorText(replay.error)}</span>}
            </span>
          </form>
        </div>
      )}

      {open && (
        <Modal title={`Event ${open.seq.toLocaleString()}`} onClose={() => setOpen(null)}
          footer={<button className="btn" type="button" onClick={() => setOpen(null)}>Close</button>}>
          <div className="summary">
            <div><span>Type</span><b className="mono">{open.type}</b></div>
            <div><span>Actor</span><b>{open.actor} ({open.actorType})</b></div>
            <div><span>Time</span><b>{dateTimeLabel(open.at)} ET</b></div>
            <div><span>Versions</span><b className="mono">{open.versions}</b></div>
            <div><span>Hash</span><b className="mono">{short(open.hash)}</b></div>
            <div><span>Previous hash</span><b className="mono">{short(open.prevHash)}</b></div>
            <div><span>Payload</span><b>{open.restricted ? "Digest only (restricted PII)" : "Available"}</b></div>
          </div>
        </Modal>
      )}
    </>
  );
}
