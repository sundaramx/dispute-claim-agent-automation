import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Clock } from "../api/types";

export function Pill({ tone, children, plain }: { tone?: string; children: ReactNode; plain?: boolean }) {
  return <span className={["pill", tone, plain ? "plain" : ""].filter(Boolean).join(" ")}>{children}</span>;
}

const CLOCK_TONE: Record<Clock["state"], string> = { open: "", at_risk: "warn", breached: "bad", satisfied: "ok", not_started: "" };

export function DueMeter({ clock, label }: { clock: Clock; label: string }) {
  return (
    <div className="due">
      <div className="lbl">
        <b>{label}</b>
        {clock.remaining !== null && <span className="muted">{clock.remaining} {clock.remainingUnit}</span>}
      </div>
      <div className={`meter ${CLOCK_TONE[clock.state]}`} role="meter" aria-label={`${clock.label}: ${clock.elapsedPct}% of the time used`}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={clock.elapsedPct}>
        <i style={{ width: `${clock.elapsedPct}%` }} />
      </div>
    </div>
  );
}

export function ClockPill({ clock, networkCritical }: { clock: Clock; networkCritical?: boolean }) {
  if (networkCritical) return <Pill tone="bad">network-critical</Pill>;
  if (clock.state === "at_risk") return <Pill tone="warn">at risk</Pill>;
  if (clock.state === "breached") return <Pill tone="bad">breached</Pill>;
  if (clock.state === "not_started") return <Pill plain>not started</Pill>;
  return <Pill tone="info">{clock.state}</Pill>;
}

/** Accessible modal: labelled, traps nothing fancy but closes on Escape and returns focus. */
export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("textarea, input, button:not(.btn.sec)");
    first?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <div className="dlg-h"><h2 id="modal-title">{title}</h2></div>
        <div className="dlg-b">{children}</div>
        <div className="dlg-f">{footer}</div>
      </div>
    </div>
  );
}

interface Toast { id: number; text: string; tone?: "warn" | "bad" }
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone?: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ""}`}><i />{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Small trend line for KPI tiles. Decorative: the value next to it carries the meaning. */
export function Sparkline({ points, color = "var(--brand)" }: { points: number[]; color?: string }) {
  const w = 200, h = 36, pad = 3;
  const max = Math.max(...points), min = Math.min(...points);
  const xy = points.map((v, i) => [(i / Math.max(points.length - 1, 1)) * w, h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Message for a failed query or mutation, preferring the API's problem detail. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
