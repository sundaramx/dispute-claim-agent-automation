import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAskCopilot, useCopilotAction, useCopilotTranscript, useSystemInfo } from "../../api/hooks";
import type { CaseDetail, CopilotRef, CopilotTurn, SuggestedAction } from "../../api/types";
import { useUser } from "../../auth/session";
import { Modal, errorText, useToast } from "../../components/ui";
import { BriefView } from "./BriefView";

const STARTERS = ["Summarize this case", "What’s missing before we file the chargeback?", "How was the card read at the terminal?", "Has this merchant had other disputes?"];

const Spark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  </svg>
);

/**
 * Investigation Co-Pilot (FR-36, FR-38): a cited brief written when the case opens, and a
 * conversation that answers only from this case and can run read-only lookups. Suggestions run as you.
 */
export function CopilotDrawer({ c, open, onClose, onCite }: { c: CaseDetail; open: boolean; onClose: () => void; onCite: (ref: CopilotRef) => void }) {
  const user = useUser();
  const info = useSystemInfo();
  const [tab, setTab] = useState<"brief" | "ask">("brief");
  const toast = useToast();
  const transcript = useCopilotTranscript(c.ref);
  const ask = useAskCopilot(c.ref);
  const act = useCopilotAction(c.ref);
  const [question, setQuestion] = useState("");
  const [confirm, setConfirm] = useState<Extract<SuggestedAction, { kind: "redraft" }> | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const turns = transcript.data ?? [];
  const asked = new Set(turns.filter((t) => t.role === "human").map((t) => t.text));

  useEffect(() => { if (open && tab === "ask") input.current?.focus(); }, [open, tab]);
  useEffect(() => { log.current?.scrollTo?.({ top: log.current.scrollHeight }); }, [turns.length, ask.isPending]);

  const send = (q: string) => {
    if (!q.trim() || ask.isPending) return;
    setQuestion("");
    ask.mutate(q);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(question); };

  const run = (turn: CopilotTurn, a: SuggestedAction) => {
    const key = `${turn.n}:${a.label}`;
    if (a.kind === "redraft") { setConfirm(a); return; }
    act.mutate(a, { onSuccess: () => { setDone((s) => new Set(s).add(key)); toast(`Note added as ${user.id}`); } });
  };

  return (
    <>
      <div className={`scrim ${open ? "show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`drawer ${open ? "open" : ""}`} aria-label="Investigation Co-Pilot" inert={!open}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="drawer-h">
          <span className="ai-badge"><Spark /></span>
          <div><b>Investigation Co-Pilot</b><span>{info.data?.localModel ? `${info.data.localModel} via the LLM gateway` : "Rule-based (local model offline)"} · {c.ref}</span></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close copilot" style={{ marginLeft: "auto" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="tabs" role="tablist" aria-label="Co-Pilot views">
          <button role="tab" aria-selected={tab === "brief"} onClick={() => setTab("brief")}>Brief</button>
          <button role="tab" aria-selected={tab === "ask"} onClick={() => { setTab("ask"); setTimeout(() => input.current?.focus(), 0); }}>Ask</button>
        </div>

        {tab === "brief" && open && <div className="drawer-b"><BriefView caseRef={c.ref} onCite={onCite} /></div>}

        <div className="drawer-b" ref={log} role="log" aria-live="polite" aria-label="Copilot conversation" hidden={tab !== "ask"}>
          <div className="msg sys">Click a citation to jump to the record. The copilot can’t approve, change outcomes or contact the customer.</div>
          {turns.map((t) => t.role === "human" ? (
            <div key={t.n} className="msg me">{t.text}<span className="meta">{t.author}</span></div>
          ) : (
            <div key={t.n} className="msg bot">
              {t.sentences.length === 0 ? t.text : t.sentences.map((s, i) => (
                <span key={i}>{s.text}{s.cites.map((r) => (
                  <button key={r.kind + r.id} type="button" className="cite" onClick={() => onCite(r)} aria-label={`Show ${r.kind} ${r.label}`}>{r.label}</button>
                ))} </span>
              ))}
              {t.suggestedActions.length > 0 && (
                <div className="acts">
                  {t.suggestedActions.map((a) => {
                    const key = `${t.n}:${a.label}`;
                    return <button key={key} type="button" className="btn sm sec" disabled={done.has(key) || act.isPending} onClick={() => run(t, a)}>{done.has(key) ? "Done" : a.label}</button>;
                  })}
                </div>
              )}
              <span className="meta">{t.meta}</span>
            </div>
          ))}
          {ask.isPending && (
            <>
              <div className="msg me">{ask.variables}<span className="meta">{user.id}</span></div>
              <div className="msg bot" style={{ padding: 0 }}><span className="typing" aria-label="Copilot is thinking"><i /><i /><i /></span></div>
            </>
          )}
          {ask.isError && <div className="msg sys" role="alert">{errorText(ask.error)}</div>}
        </div>

        <div className="drawer-f" hidden={tab !== "ask"}>
          <div className="suggest">
            {STARTERS.filter((s) => !asked.has(s)).map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}
          </div>
          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="copilot-in">Ask about this case</label>
            <textarea id="copilot-in" ref={input} rows={1} placeholder="Ask about this case…" value={question} maxLength={1000}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(question); } }} />
            <button className="btn" type="submit" aria-label="Send" disabled={!question.trim() || ask.isPending}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" style={{ width: 16, height: 16 }} aria-hidden="true"><path d="M5 12l14-7-5 15-2.5-6.5z" /></svg>
            </button>
          </form>
          <span className="note">Answers cite this case’s records only · every turn is audit-logged</span>
        </div>
      </aside>

      {confirm && (
        <Modal title="Redraft as you?" onClose={() => setConfirm(null)}
          footer={<>
            <button className="btn sec" type="button" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn" type="button" disabled={act.isPending} onClick={() => act.mutate(confirm, {
              onSuccess: () => { toast("New draft version created. You are its preparer."); setConfirm(null); },
              onError: (e) => { toast(errorText(e), "bad"); setConfirm(null); },
            })}>Create new version as me</button>
          </>}>
          <p>The drafting agent will write a new version with this instruction: <i>“{confirm.instruction}”</i></p>
          <div className="callout warn" style={{ marginTop: 0 }}>This counts as your edit. You become the preparer, so a different person must approve anything that uses this draft, and earlier approvals stop counting (D-10).</div>
        </Modal>
      )}
    </>
  );
}

export { Spark };
