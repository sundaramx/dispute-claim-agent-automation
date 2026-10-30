import type { Proposal, Role, User } from "../api/types";

// Mirrors the server's RBAC matrix and four-eyes check (ARCHITECTURE §8.2, FR-12).
// The UI uses it only to hide controls; the server is the authority (FR-21 AC 2).

export const ROLE_LABEL: Record<Role, string> = {
  analyst: "Analyst",
  supervisor: "Supervisor",
  auditor: "Compliance Auditor",
  admin: "Admin",
};

const ROLE_INITIALS: Record<Role, string> = { analyst: "A", supervisor: "S", auditor: "CA", admin: "AD" };

/** Avatar initials, e.g. "S1" for supervisor1, "CA" for auditor1. */
export function initials(user: User): string {
  const n = user.id.match(/\d+$/)?.[0];
  return ROLE_INITIALS[user.role].length > 1 || !n ? ROLE_INITIALS[user.role] : ROLE_INITIALS[user.role] + n;
}

export function canWorkCases(role: Role): boolean {
  return role === "analyst" || role === "supervisor";
}

export type ApprovalBlock =
  | { code: "role_cannot_approve"; message: string }
  | { code: "four_eyes_violation"; message: string }
  | { code: "insufficient_role"; message: string };

/** Why `user` may not approve `proposal`, or null if they may. */
export function approvalBlock(proposal: Proposal, user: User): ApprovalBlock | null {
  if (!canWorkCases(user.role)) {
    return {
      code: "role_cannot_approve",
      message: `${ROLE_LABEL[user.role]}s can't approve case actions (D-3).`,
    };
  }
  if (proposal.preparer === user.id) {
    return {
      code: "four_eyes_violation",
      message: "You prepared this proposal, so someone else must approve it.",
    };
  }
  if (proposal.requiredRole === "supervisor" && user.role !== "supervisor") {
    return {
      code: "insufficient_role",
      message: `Needs a Supervisor (${supervisorReason(proposal)}).`,
    };
  }
  return null;
}

export function supervisorReason(proposal: Proposal): string {
  return proposal.lowConfidence ? "low confidence" : "over $500";
}
