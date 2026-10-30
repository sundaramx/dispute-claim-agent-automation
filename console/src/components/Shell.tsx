import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { useInbox, useSystemInfo } from "../api/hooks";
import type { Role } from "../api/types";
import { initials, ROLE_LABEL } from "../auth/permissions";
import { useSession, useUser } from "../auth/session";
import { Pill } from "./ui";

const ICON: Record<string, ReactNode> = {
  cases: <path d="M4 6h16M4 12h16M4 18h10" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.8 2.8L16 9.5" /></>,
  chart: <path d="M4 20V11M10 20V5M16 20v-6M2 20h20" />,
  plus: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></>,
  shield: <><path d="M12 3l7.5 3v6c0 4.6-3.2 7.7-7.5 9-4.3-1.3-7.5-4.4-7.5-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  sliders: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></>,
};

const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>
);

// Navigation follows the RBAC matrix (ARCHITECTURE §8.2); hiding is cosmetic, the API enforces it.
const NAV: { to: string; label: string; icon: string; roles: Role[]; group?: string }[] = [
  { to: "/cases", label: "Cases", icon: "cases", roles: ["analyst", "supervisor", "auditor", "admin"] },
  { to: "/approvals", label: "Approvals", icon: "check", roles: ["analyst", "supervisor"] },
  { to: "/dashboard", label: "SLA dashboard", icon: "chart", roles: ["analyst", "supervisor", "auditor", "admin"] },
  { to: "/intake", label: "New dispute", icon: "plus", roles: ["analyst", "supervisor"] },
  { to: "/audit", label: "Audit trail", icon: "shield", roles: ["supervisor", "auditor", "admin"], group: "Governance" },
  { to: "/admin", label: "Configuration", icon: "sliders", roles: ["auditor", "admin"] },
];

export function Shell() {
  const user = useUser();
  const { signOut } = useSession();
  const info = useSystemInfo();
  const inbox = useInbox();
  const pending = user.role === "analyst" || user.role === "supervisor" ? inbox.data?.items.length : undefined;

  return (
    <div className="app">
      <aside className="side" aria-label="Main navigation">
        <div className="brand"><span className="mark">D</span><span>Dispute Console<small>Card disputes · Reg E / Z</small></span></div>
        <nav className="nav" aria-label="Primary">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <div key={n.to} style={{ display: "contents" }}>
              {n.group && <div className="nav-label">{n.group}</div>}
              <NavLink to={n.to}>
                <Icon name={n.icon} /><span>{n.label}</span>
                {n.to === "/approvals" && pending ? <span className="count hot" aria-label={`${pending} waiting`}>{pending}</span> : null}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who"><span className="avatar">{initials(user)}</span><div><b>{user.displayName}</b><span>{ROLE_LABEL[user.role]}</span></div></div>
          <button className="btn sec sm" type="button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span style={{ marginLeft: "auto" }} />
          {info.data && (
            <>
              <span title="Auto-approve mode is shown to every role (FR-13)">
                <Pill tone={info.data.autoApproveEnabled ? "auto" : "ok"}>Auto-approve {info.data.autoApproveEnabled ? "ON" : "OFF"}</Pill>
              </span>
              {info.data.localModel
                ? <span title="Co-Pilot answers come from this local model through the LLM gateway"><Pill tone="info">Local model · {info.data.localModel}</Pill></span>
                : <span title="Local model unavailable: Co-Pilot uses rule-based answers"><Pill tone="warn">Mock LLM</Pill></span>}
            </>
          )}
          <Pill tone="info" plain>Mock API</Pill>
        </header>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
