import { useInvestigationBrief, useRunLookup, useSystemInfo } from "../../api/hooks";
import type { CitedText, CopilotRef, LookupKind, PlanStep } from "../../api/types";
import { canWorkCases } from "../../auth/permissions";
import { useUser } from "../../auth/session";
import { Pill, errorText, useToast } from "../../components/ui";

function Cites({ refs, onCite }: { refs: CopilotRef[]; onCite: (r: CopilotRef) => void }) {
  return <>{refs.map((r) => (
    <button key={r.kind + r.id} type="button" className="cite" onClick={() => onCite(r)} aria-label={`Show ${r.kind} ${r.label}`}>{r.label}</button>
  ))}</>;
}

const Source = ({ s }: { s?: CitedText["source"] }) =>
  s === "rule" ? <span className="src-tag" title="Deterministic rule check">rule</span> : null;

function Section({ title, items, empty, onCite, tone }: { title: string; items: CitedText[]; empty: string; onCite: (r: CopilotRef) => void; tone?: string }) {
  return (
    <section className="brief-sec" aria-label={title}>
      <h3>{title} {items.length > 0 && <Pill tone={tone} plain>{items.length}</Pill>}</h3>
      {items.length === 0 ? <p className="note">{empty}</p> : (
        <ul>{items.map((x, i) => <li key={i}>{x.text} <Cites refs={x.cites} onCite={onCite} /><Source s={x.source} /></li>)}</ul>
      )}
    </section>
  );
}

const RISK_TONE = { high: "bad", medium: "warn", low: "info" } as const;

function PlanAction({ action, canRun, busy, onLookup, onCite }: {
  action: NonNullable<PlanStep["action"]>; canRun: boolean; busy: boolean; onLookup: (k: LookupKind) => void; onCite: (r: CopilotRef) => void;
}) {
  if (action.kind === "lookup") {
    return canRun ? <div><button type="button" className="btn sm sec" disabled={busy} onClick={() => onLookup(action.lookup)}>Run this check</button></div> : null;
  }
  return <div><button type="button" className="btn sm sec" onClick={() => onCite({ kind: "proposal", id: action.proposalId, label: action.proposalId })}>Open {action.proposalId}</button></div>;
}

/** The Co-Pilot's investigation brief (FR-38): written when the case opens, every item cited. */
export function BriefView({ caseRef, onCite }: { caseRef: string; onCite: (r: CopilotRef) => void }) {
  const user = useUser();
  const toast = useToast();
  const info = useSystemInfo();
  const brief = useInvestigationBrief(caseRef);
  const lookup = useRunLookup(caseRef);
  const canRun = canWorkCases(user.role);
  const run = (kind: LookupKind, label: string) =>
    lookup.mutate(kind, {
      onSuccess: (e) => toast(`${label}: added to the case as ${e.id}`),
      onError: (e) => toast(errorText(e), "bad"),
    });

  if (brief.isPending) {
    return (
      <div className="brief-loading" role="status">
        <span className="typing" aria-hidden="true"><i /><i /><i /></span>
        <p>{info.data?.localModel ? `Writing the brief with ${info.data.localModel}…` : "Running the investigation checks…"}</p>
      </div>
    );
  }
  if (brief.isError) return <p className="err" role="alert">{errorText(brief.error)}</p>;
  const b = brief.data;

  return (
    <div className="brief" aria-busy={brief.isFetching}>
      {b.fallbackReason && <div className="callout warn" style={{ marginTop: 0 }}>{b.fallbackReason}</div>}
      <p className="brief-headline">{b.headline}</p>
      <p className="note">{b.model}{brief.isFetching ? " · updating…" : ""}</p>

      <Section title="Findings" items={b.findings} empty="No findings yet." onCite={onCite} />
      <Section title="Gaps" items={b.gaps} empty="No missing evidence." onCite={onCite} tone="warn" />
      <Section title="Conflicts" items={b.conflicts} empty="No conflicting facts found." onCite={onCite} tone="bad" />
      <section className="brief-sec" aria-label="Risks">
        <h3>Risks {b.risks.length > 0 && <Pill tone="warn" plain>{b.risks.length}</Pill>}</h3>
        {b.risks.length === 0 ? <p className="note">No risks flagged.</p> : (
          <ul>{b.risks.map((r, i) => <li key={i}><Pill tone={RISK_TONE[r.level]} plain>{r.level}</Pill> {r.text} <Cites refs={r.cites} onCite={onCite} /><Source s={r.source} /></li>)}</ul>
        )}
      </section>

      <section className="brief-sec" aria-label="Plan">
        <h3>Plan</h3>
        <ol className="plan">
          {b.plan.map((s) => (
            <li key={s.id} className={s.done ? "done" : undefined}>
              <span className="tick" aria-label={s.done ? "Done" : "To do"}>{s.done ? "✓" : ""}</span>
              <div>
                {s.text} <Cites refs={s.cites} onCite={onCite} /><Source s={s.source} />
                {s.action && <PlanAction action={s.action} canRun={canRun} busy={lookup.isPending}
                  onLookup={(kind) => run(kind, s.text)} onCite={onCite} />}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="brief-sec" aria-label="Lookups">
        <h3>Read-only lookups</h3>
        <p className="note">The Co-Pilot can run these checks on this case’s own card, account and merchant. Results are added as evidence.</p>
        <ul className="lookups">
          {b.lookups.map((l) => (
            <li key={l.kind}>
              <div><b>{l.label}</b><span className="note">{l.description}</span></div>
              {l.status === "done"
                ? <button type="button" className="cite" onClick={() => onCite({ kind: "evidence", id: l.evidenceId!, label: l.evidenceId! })} aria-label={`Show evidence ${l.evidenceId}`}>{l.evidenceId}</button>
                : canRun && <button type="button" className="btn sm sec" disabled={lookup.isPending} onClick={() => run(l.kind, l.label)}>Run</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
