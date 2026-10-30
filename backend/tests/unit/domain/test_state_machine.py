"""Tests for dca.domain.state_machine (FR-20).

Covers every transition in the TRANSITIONS table, illegal transitions,
the proposal lifecycle, and edge cases around state validation.
"""

from __future__ import annotations

import pytest

from dca.domain.state_machine import (
    CASE_STATES,
    PROPOSAL_STATES,
    PROPOSAL_TRANSITIONS,
    TRANSITIONS,
    IllegalProposalTransition,
    IllegalTransition,
    validate_proposal_transition,
    validate_transition,
)

# -------------------------------------------------------------------
# Case state machine — allowed transitions
# -------------------------------------------------------------------

_ALLOWED: list[tuple[str, str]] = [
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
    ("awaiting_approval", "investigating"),  # returned for rework
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
    # TD-52
    ("received", "needs_attention"),
    ("triaged", "needs_attention"),
    ("deciding", "needs_attention"),
    ("awaiting_approval", "needs_attention"),
    ("executing", "needs_attention"),
    ("awaiting_network", "needs_attention"),
    ("representment_review", "needs_attention"),
    ("executing", "awaiting_approval"),
]


@pytest.mark.parametrize("current,next_state", _ALLOWED)
def test_allowed_transitions_pass(current: str, next_state: str) -> None:
    """Every listed transition must succeed (FR-20)."""
    validate_transition(current, next_state)  # should not raise


@pytest.mark.parametrize("current,next_state", _ALLOWED)
def test_transition_table_contains_all(current: str, next_state: str) -> None:
    """TRANSITIONS dict covers every allowed pair (FR-20)."""
    assert current in TRANSITIONS
    assert next_state in TRANSITIONS[current]


# -------------------------------------------------------------------
# Case state machine — illegal transitions
# -------------------------------------------------------------------

_ILLEGAL_CASE: list[tuple[str, str]] = [
    # Backwards skips
    ("closed", "received"),
    ("closed", "executing"),
    ("resolved", "executing"),
    ("resolved", "awaiting_network"),
    # Skip triaged
    ("received", "investigating"),
    ("received", "deciding"),
    # Skip deciding
    ("investigating", "awaiting_approval"),
    # Skip executing
    ("awaiting_approval", "awaiting_network"),
    # Closed is terminal — nothing leaves it
    ("closed", "resolved"),
    ("closed", "triaged"),
    # needs_attention cannot go to deciding directly
    ("needs_attention", "deciding"),
    # manual_prearb cannot go back
    ("manual_prearb", "executing"),
    ("manual_prearb", "representment_review"),
    # representment_review cannot go to resolved directly
    ("representment_review", "resolved"),
    # awaiting_network cannot skip to closed
    ("awaiting_network", "closed"),
]


@pytest.mark.parametrize("current,next_state", _ILLEGAL_CASE)
def test_illegal_case_transitions_raise(current: str, next_state: str) -> None:
    """Any transition not in TRANSITIONS raises IllegalTransition (FR-20)."""
    with pytest.raises(IllegalTransition, match=current + ".*" + next_state):
        validate_transition(current, next_state)


# -------------------------------------------------------------------
# Proposal lifecycle — allowed transitions
# -------------------------------------------------------------------

_PROPOSAL_ALLOWED: list[tuple[str, str]] = [
    ("pending_approval", "approved"),
    ("pending_approval", "rejected"),
    ("pending_approval", "returned"),
    ("pending_approval", "superseded"),
    ("pending_approval", "auto_approved"),
    ("auto_approved", "executing"),
    ("approved", "executing"),
    ("executing", "executed"),
    ("executing", "failed"),
    # TD-52
    ("auto_approved", "pending_approval"),
    ("executing", "pending_approval"),
    ("approved", "superseded"),
]


@pytest.mark.parametrize("current,next_state", _PROPOSAL_ALLOWED)
def test_allowed_proposal_transitions_pass(current: str, next_state: str) -> None:
    """Every listed proposal transition must succeed (FR-20)."""
    validate_proposal_transition(current, next_state)


@pytest.mark.parametrize("current,next_state", _PROPOSAL_ALLOWED)
def test_proposal_table_contains_all(current: str, next_state: str) -> None:
    """PROPOSAL_TRANSITIONS dict covers every allowed pair (FR-20)."""
    assert current in PROPOSAL_TRANSITIONS
    assert next_state in PROPOSAL_TRANSITIONS[current]


# -------------------------------------------------------------------
# Proposal lifecycle — illegal transitions
# -------------------------------------------------------------------

_PROPOSAL_ILLEGAL: list[tuple[str, str]] = [
    # Cannot go backwards from executed/failed/rejected
    ("executed", "approved"),
    ("executed", "pending_approval"),
    ("failed", "executing"),
    ("rejected", "approved"),
    ("returned", "executing"),
    ("superseded", "approved"),
    # Cannot skip stages
    ("pending_approval", "executing"),
    ("approved", "executed"),  # must go through executing first
    # auto_approved cannot skip to executed
    ("auto_approved", "executed"),
]


@pytest.mark.parametrize("current,next_state", _PROPOSAL_ILLEGAL)
def test_illegal_proposal_transitions_raise(current: str, next_state: str) -> None:
    """Any undefined proposal transition raises IllegalProposalTransition (FR-20)."""
    with pytest.raises(IllegalProposalTransition):
        validate_proposal_transition(current, next_state)


# -------------------------------------------------------------------
# Structural checks
# -------------------------------------------------------------------


def test_transitions_are_dictionaries_of_sets() -> None:
    """TRANSITIONS maps str → set of str (FR-20)."""
    for key, destinations in TRANSITIONS.items():
        assert isinstance(key, str), f"Key {key!r} is not a string"
        assert isinstance(destinations, set), f"Destinations of {key!r} is not a set"
        for dst in destinations:
            assert isinstance(dst, str), f"Destination {dst!r} is not a string"


def test_proposal_transitions_are_dictionaries_of_sets() -> None:
    """PROPOSAL_TRANSITIONS maps str → set of str (FR-20)."""
    for key, destinations in PROPOSAL_TRANSITIONS.items():
        assert isinstance(key, str)
        assert isinstance(destinations, set)


def test_illegal_transition_has_attributes() -> None:
    """IllegalTransition exposes current and requested attributes."""
    exc = IllegalTransition("closed", "received")
    assert exc.current == "closed"
    assert exc.requested == "received"
    assert "closed" in str(exc)
    assert "received" in str(exc)


def test_illegal_proposal_transition_has_attributes() -> None:
    """IllegalProposalTransition exposes current and requested attributes."""
    exc = IllegalProposalTransition("executed", "pending_approval")
    assert exc.current == "executed"
    assert exc.requested == "pending_approval"


def test_validate_proposal_transition_raises_illegal_transition() -> None:
    """IllegalProposalTransition is catchable as IllegalTransition."""
    with pytest.raises(IllegalTransition, match="proposal"):
        validate_proposal_transition("executed", "approved")  # type: ignore[arg-type]


def _expected(pairs: list[tuple[str, str]]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for a, b in pairs:
        out.setdefault(a, set()).add(b)
    return out


def test_case_transitions_exact() -> None:
    assert TRANSITIONS == _expected(_ALLOWED)


def test_proposal_transitions_exact() -> None:
    assert PROPOSAL_TRANSITIONS == _expected(_PROPOSAL_ALLOWED)


def test_case_transitions_exhaustive() -> None:
    allowed = set(_ALLOWED)
    names = [*sorted(CASE_STATES), "bogus"]
    for cur in names:
        for nxt in names:
            if (cur, nxt) in allowed:
                validate_transition(cur, nxt)  # type: ignore[arg-type]
            else:
                with pytest.raises(IllegalTransition):
                    validate_transition(cur, nxt)  # type: ignore[arg-type]


def test_proposal_transitions_exhaustive() -> None:
    allowed = set(_PROPOSAL_ALLOWED)
    names = [*sorted(PROPOSAL_STATES), "bogus"]
    for cur in names:
        for nxt in names:
            if (cur, nxt) in allowed:
                validate_proposal_transition(cur, nxt)  # type: ignore[arg-type]
            else:
                with pytest.raises(IllegalTransition):
                    validate_proposal_transition(cur, nxt)  # type: ignore[arg-type]
