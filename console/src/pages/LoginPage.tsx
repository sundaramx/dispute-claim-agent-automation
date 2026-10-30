import { useNavigate } from "react-router";
import { initials, ROLE_LABEL } from "../auth/permissions";
import { SEEDED_USERS, useSession } from "../auth/session";

const BLURB: Record<string, string> = {
  supervisor: "Approves over $500 and low-confidence actions, QA and pre-arb queues",
  analyst: "Works cases and approves up to $500, never their own edits",
  auditor: "Read-only cases and audit trail, chain verification and replay",
  admin: "Users, thresholds, LLM routing, auto-approve. Can’t approve cases",
};

export function LoginPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  return (
    <div className="signin">
      <section className="hero">
        <div className="brand" style={{ color: "#fff", padding: 0 }}><span className="mark" style={{ background: "rgba(255,255,255,.18)" }}>D</span><span>Dispute Console</span></div>
        <div>
          <h1>Agents do the legwork. People make the calls.</h1>
          <p>Every credit, chargeback and customer letter waits for a human, and every step lands on a tamper-evident record.</p>
        </div>
        <p className="small" style={{ opacity: 0.7 }}>Local development · mock API · synthetic data</p>
      </section>
      <section className="panel">
        <h2 style={{ fontSize: 22 }}>Sign in</h2>
        <p className="muted">Pick a seeded user from the local dev issuer. Hosted environments use your company’s SSO.</p>
        <div className="user-pick">
          {SEEDED_USERS.map((u) => (
            <button key={u.id} type="button" className="user-pick-btn" onClick={() => { signIn(u.id); navigate("/cases"); }}>
              <span className="avatar">{initials(u)}</span>
              <span><b>{u.displayName} · {ROLE_LABEL[u.role]}</b><span>{BLURB[u.role]}</span></span>
              <span className="go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
