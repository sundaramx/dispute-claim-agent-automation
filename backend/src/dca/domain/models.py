"""Core payload contracts - Pydantic v2 models (FR-20, NFR-11).

Every model listed here uses ``ConfigDict(extra='forbid')``, closed enums
(Literal types), and is exportable to JSON Schema.  These are the canonical
contracts used by the LLM gateway, the policy engine, the approval workflow
and the audit subsystem (ARCHITECTURE sec-6.2).
"""

from __future__ import annotations

import uuid as _uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

# -------------------------------------------------------------------
# Supporting types (not exported to JSON Schema directly)
# -------------------------------------------------------------------


class DraftRef(BaseModel):
    """Reference to a draft version."""

    model_config = ConfigDict(extra="forbid")
    name: str
    version: int


class PrincipalRef(BaseModel):
    """Identifies the principal that prepared an action proposal."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True, serialize_by_alias=True)
    type_: Literal["human", "service"] = Field(alias="type")
    id: str


# -------------------------------------------------------------------
# Enumerations (closed sets)
# -------------------------------------------------------------------

CATEGORY_VALUES = Literal[
    "fraud_unauthorized",
    "non_receipt",
    "not_as_described",
    "duplicate",
    "credit_not_processed",
    "unknown",
]

OUTCOME_VALUES = Literal[
    "grant_provisional_credit",
    "file_chargeback",
    "resolve_in_favor",
    "resolve_against",
    "request_more_info",
    "write_off",
    "escalate_manual",
]

ACTION_TYPE_VALUES = Literal[
    "provisional_credit",
    "final_credit",
    "final_debit",
    "pc_reversal",
    "write_off",
    "chargeback_filing",
    "representment_response",
    "customer_comm",
    "dispute_hold",
]

ProposalStatus = Literal[
    "pending_approval",
    "approved",
    "executing",
    "executed",
    "failed",
    "rejected",
    "returned",
    "superseded",
    "auto_approved",
]

PROPOSAL_STATUS_VALUES = ProposalStatus

ACTOR_TYPE_VALUES = Literal["human", "service", "system"]


# -------------------------------------------------------------------
# ExtractedClaim - LLM extraction output schema (FR-2 AC 1)
# -------------------------------------------------------------------


class ExtractedClaim(BaseModel):
    """Structured claim extracted from a narrative or IVR transcript."""

    model_config = ConfigDict(extra="forbid")

    txn_refs: list[str] = Field(default_factory=list)
    amount_minor: Annotated[StrictInt, Field(ge=1, description="Amount in cents")] | None = None
    currency: Literal["USD"] = "USD"
    merchant: str | None = None
    txn_date: date | None = None
    asserted_category: CATEGORY_VALUES
    learned_of_error_on: date | None = None
    self_score: Annotated[float, Field(ge=0.0, le=1.0)]


# -------------------------------------------------------------------
# RuleTraceStep - one step in a policy decision trace
# -------------------------------------------------------------------


class RuleTraceStep(BaseModel):
    """One rule-firing event within a policy decision."""

    model_config = ConfigDict(extra="forbid")
    rule_id: str
    description: str | None = None
    inputs_digest: str
    outcome_fragment: str | None = None


# -------------------------------------------------------------------
# ConfidenceComponents - breakdown of the confidence score (FR-9 AC 2)
# -------------------------------------------------------------------


class ConfidenceComponents(BaseModel):
    """Weighted components that compose the overall confidence score."""

    model_config = ConfigDict(extra="forbid")

    rule_coverage: Annotated[float, Field(ge=0.0, le=1.0)]
    evidence_completeness: Annotated[float, Field(ge=0.0, le=1.0)]
    model_self_score: Annotated[float, Field(ge=0.0, le=1.0)]
    rule_coverage_weight: Annotated[float, Field(ge=0.0, le=1.0)]
    evidence_completeness_weight: Annotated[float, Field(ge=0.0, le=1.0)]
    model_self_score_weight: Annotated[float, Field(ge=0.0, le=1.0)]

    @model_validator(mode="after")
    def _weights_must_sum_to_one(self) -> ConfidenceComponents:
        """The three weight fields must sum to 1.0 (compared as Decimal)."""
        total = (
            Decimal(str(self.rule_coverage_weight))
            + Decimal(str(self.evidence_completeness_weight))
            + Decimal(str(self.model_self_score_weight))
        )
        if total != Decimal("1"):
            raise ValueError(f"Weights must sum to 1.0, got {total}")
        return self


# -------------------------------------------------------------------
# Decision - output of the policy engine (FR-8, FR-9)
# -------------------------------------------------------------------


class Decision(BaseModel):
    """Policy decision with rule trace and confidence."""

    model_config = ConfigDict(extra="forbid")

    outcome: OUTCOME_VALUES
    rule_ids: list[Annotated[str, Field(min_length=1)]] = Field(..., min_length=1)
    trace: list[RuleTraceStep] = Field(default_factory=list)
    policy_pack_version: str
    config_version: int
    inputs_digest: str
    confidence: Annotated[Decimal, Field(ge=0, le=1, decimal_places=4)]
    confidence_components: ConfidenceComponents
    calibration_version: str


# -------------------------------------------------------------------
# ActionProposal - FR-11 AC 2
# -------------------------------------------------------------------


class ActionProposal(BaseModel):
    """A pending action proposal awaiting approval."""

    model_config = ConfigDict(extra="forbid")

    id: _uuid.UUID
    case_id: _uuid.UUID
    action_type: ACTION_TYPE_VALUES
    amount_minor: Annotated[StrictInt, Field(ge=1)] | None = None
    decision_id: _uuid.UUID
    draft_version_refs: list[DraftRef] = Field(default_factory=list)
    content_hash: str
    preparer: PrincipalRef
    required_role: Literal["analyst", "supervisor"]
    low_confidence: bool
    satisfies_clock_ids: list[_uuid.UUID] = Field(default_factory=list)
    status: ProposalStatus


# -------------------------------------------------------------------
# AuditEvent - FR-26 AC 2
# -------------------------------------------------------------------


class AuditEvent(BaseModel):
    """One append-only, hash-chained audit event."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True, serialize_by_alias=True)

    seq: int = Field(..., ge=1)
    ts: datetime
    actor_type: ACTOR_TYPE_VALUES
    actor_id: str
    case_id: _uuid.UUID | None = None
    event_type: str
    payload_digest: str
    policy_version: str | None = None
    config_version: int | None = None
    model_ref: str | None = None  # "provider:model@prompt_vN"
    prev_hash: str
    hash_: str = Field(alias="hash")


__all__ = [
    "ExtractedClaim",
    "Decision",
    "RuleTraceStep",
    "ConfidenceComponents",
    "ActionProposal",
    "AuditEvent",
    "DraftRef",
    "PrincipalRef",
]
