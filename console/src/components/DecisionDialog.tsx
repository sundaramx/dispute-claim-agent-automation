import { useState } from "react";
import { useDecision, type DecisionKind } from "../api/hooks";
import { ProblemError, type Proposal } from "../api/types";
import { dueLabel, money } from "../format";
import { Modal, useToast } from "./ui";

const COPY: Record<DecisionKind, { title: string; confirm: string; cls: string; done: string; reasonLabel?: string }> = {
  approve: { title: "Approve", confirm: "Approve", cls: "ok", done: "Approved. Executing exactly once." },
  reject: { title: "Reject", confirm: "Reject", cls: "danger", done: "Rejected with your reason.", reasonLabel: "Why are you rejecting it?" },
  return: { title: "Return for rework", confirm: "Return", cls: "", done: "Returned to the agent for rework.", reasonLabel: "What needs to change?" },
};

/** Confirms an approval decision. Approve stays one click from here so the queue → approve path is ≤ 3 clicks (NFR-14). */
export function DecisionDialog({ kind, proposal, onClose }: { kind: DecisionKind; proposal: Proposal; onClose: () => void }) {
  const copy = COPY[kind];
  const decision = useDecision();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [missingReason, setMissingReason] = useState(false);
  const error = decision.error instanceof ProblemError ? decision.error.message : decision.error ? "Something went wrong. Try again." : null;

  const submit = () => {
    if (copy.reasonLabel && !reason.trim()) { setMissingReason(true); return; }
    decision.mutate({ kind, proposal, reason }, {
      onSuccess: () => { toast(copy.done, kind === "approve" ? undefined : "warn"); onClose(); },
    });
  };

  return (
    <Modal
      title={`${copy.title}: ${proposal.label}`}
      onClose={onClose}
      footer={<>
        <button className="btn sec" type="button" onClick={onClose}>Cancel</button>
        <button className={`btn ${copy.cls}`} type="button" onClick={submit} disabled={decision.isPending}>
          {decision.isPending ? "Saving…" : copy.confirm}
        </button>
      </>}
    >
      <div className="summary">
        <div><span>Case</span><b>{proposal.caseRef}</b></div>
        <div><span>Amount</span><b>{money(proposal.amountMinor)}</b></div>
        <div><span>Satisfies</span><b>{proposal.satisfies.label} · {dueLabel(proposal.satisfies.dueAt)}</b></div>
        <div><span>Policy rule</span><b className="mono">{proposal.ruleId}</b></div>
        <div><span>Binds to</span><b className="mono">{proposal.contentHash}</b></div>
      </div>
      {kind === "approve" && <p className="note">If the proposal changes before it executes, this approval stops counting (FR-11 AC 4).</p>}
      {copy.reasonLabel && (
        <div className="field">
          <label htmlFor="decision-reason">{copy.reasonLabel} <span className="muted">(required)</span></label>
          <textarea id="decision-reason" value={reason} aria-invalid={missingReason} aria-describedby="decision-reason-err"
            onChange={(e) => { setReason(e.target.value); setMissingReason(false); }} />
          {missingReason && <div className="err" id="decision-reason-err">Give a reason. It is stored in the audit log.</div>}
        </div>
      )}
      {error && <div className="callout warn" role="alert">{error}</div>}
    </Modal>
  );
}
