"""Case state machine and proposal lifecycle (FR-20).

The ``TRANSITIONS`` dict encodes the allowed case-state transitions from
ARCHITECTURE §2.3.  Any transition not listed raises
:exc:`IllegalTransition`.  Proposals have a separate, smaller
lifecycle tracked in ``PROPOSAL_TRANSITIONS``.

States (case): received, needs_manual_completion, triaged, investigating,
needs_attention, deciding, awaiting_approval, executing, awaiting_network,
representment_review, manual_prearb, resolved, closed.

Proposal states: pending_approval, approved, auto_approved, executing,
executed, failed, rejected, returned, superseded.
"""

from __future__ import annotations

from typing import Literal, get_args

# -------------------------------------------------------------------
# Case states & transitions  (ARCHITECTURE §2.3)
# -------------------------------------------------------------------

CaseState = Literal[
    "received",
    "needs_manual_completion",
    "triaged",
    "investigating",
    "needs_attention",
    "deciding",
    "awaiting_approval",
    "executing",
    "awaiting_network",
    "representment_review",
    "manual_prearb",
    "resolved",
    "closed",
]

CASE_STATES: set[str] = set(get_args(CaseState))

__all__ = [
    "IllegalTransition",
    "IllegalProposalTransition",
    "CASE_STATES",
    "CaseState",
    "TRANSITIONS",
    "PROPOSAL_STATES",
    "PROPOSAL_TRANSITIONS",
    "validate_transition",
    "validate_proposal_transition",
]


class IllegalTransition(Exception):
    """Raised when a requested state change is not in the transition table."""

    kind = "case"

    def __init__(self, current: str, requested: str) -> None:
        self.current = current
        self.requested = requested
        super().__init__(f"Illegal {self.kind} transition: {current!r} → {requested!r}")


class IllegalProposalTransition(IllegalTransition):
    """Raised when a requested proposal state change is not in the table."""

    kind = "proposal"


def _build_transition_table(allowed: list[tuple[str, str]]) -> dict[str, set[str]]:
    """Build a ``source → set(destinations)`` lookup from a list of pairs."""
    table: dict[str, set[str]] = {}
    for src, dst in allowed:
        table.setdefault(src, set()).add(dst)
    return table


# Ordered from the mermaid diagram in ARCHITECTURE §2.3  (keep canonical order
# for documentation; the sets are what matter at runtime).
_TRANSITIONS_LIST: list[tuple[str, str]] = [
    # Intake & manual completion
    ("received", "needs_manual_completion"),
    ("needs_manual_completion", "received"),
    # Triage → investigation
    ("received", "triaged"),
    ("triaged", "investigating"),
    # Investigation with analyst escalation
    ("investigating", "needs_attention"),
    ("needs_attention", "investigating"),
    # Decision path
    ("investigating", "deciding"),
    ("deciding", "awaiting_approval"),
    ("deciding", "executing"),  # auto-approve eligible (FR-13)
    # Approval outcomes
    ("awaiting_approval", "investigating"),  # returned for rework / more info
    ("awaiting_approval", "executing"),  # approved
    # Execution → network interaction
    ("executing", "awaiting_network"),
    ("executing", "resolved"),
    # Network events
    ("awaiting_network", "representment_review"),
    ("awaiting_network", "resolved"),
    # Representment handling
    ("representment_review", "awaiting_approval"),
    ("representment_review", "manual_prearb"),  # escalate (FR-18)
    # Closure
    ("resolved", "closed"),
    ("manual_prearb", "closed"),
    # TD-52: any working state may fail into needs_attention (§5.2/§5.6)
    ("received", "needs_attention"),
    ("triaged", "needs_attention"),
    ("deciding", "needs_attention"),
    ("awaiting_approval", "needs_attention"),
    ("executing", "needs_attention"),
    ("awaiting_network", "needs_attention"),
    ("representment_review", "needs_attention"),
    # TD-52: auto-approve toggled OFF cancels auto-effect; case back to approval
    ("executing", "awaiting_approval"),
]

TRANSITIONS: dict[str, set[str]] = _build_transition_table(_TRANSITIONS_LIST)


# -------------------------------------------------------------------
# Proposal lifecycle
# -------------------------------------------------------------------

ProposalState = Literal[
    "pending_approval",
    "approved",
    "auto_approved",
    "executing",
    "executed",
    "failed",
    "rejected",
    "returned",
    "superseded",
]

PROPOSAL_STATES: set[str] = set(get_args(ProposalState))

_PROPOSAL_TRANSITIONS_LIST: list[tuple[str, str]] = [
    # From pending approval
    ("pending_approval", "approved"),
    ("pending_approval", "rejected"),
    ("pending_approval", "returned"),
    ("pending_approval", "superseded"),
    ("pending_approval", "auto_approved"),
    # auto_approved goes straight to executing (ARCHITECTURE §2.3)
    ("auto_approved", "executing"),
    # approved → executing
    ("approved", "executing"),
    # execution outcomes
    ("executing", "executed"),
    ("executing", "failed"),
    # TD-52: auto-approve OFF returns unexecuted auto-effects to approval
    ("auto_approved", "pending_approval"),
    ("executing", "pending_approval"),
    # TD-52: edit after approval but before execution supersedes
    ("approved", "superseded"),
]

PROPOSAL_TRANSITIONS: dict[str, set[str]] = _build_transition_table(_PROPOSAL_TRANSITIONS_LIST)


# -------------------------------------------------------------------
# Validation helpers (pure functions)
# -------------------------------------------------------------------


def validate_transition(current: CaseState, next_state: CaseState) -> None:
    """Raise :exc:`IllegalTransition` when *next_state* is not allowed.

    Returns ``None`` on success.  Failed transitions are also audit-logged
    by the caller (see ARCHITECTURE §5.4).
    """
    allowed = TRANSITIONS.get(current, set())
    if next_state not in allowed:
        raise IllegalTransition(current, next_state)


def validate_proposal_transition(current: ProposalState, next_state: ProposalState) -> None:
    """Raise :exc:`IllegalProposalTransition` when *next_state* is not allowed."""
    allowed = PROPOSAL_TRANSITIONS.get(current, set())
    if next_state not in allowed:
        raise IllegalProposalTransition(current, next_state)
