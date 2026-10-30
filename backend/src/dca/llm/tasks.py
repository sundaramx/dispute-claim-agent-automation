"""Output schemas for the Investigation Co-Pilot tasks (FR-36, FR-38; ARCHITECTURE §6.4).

Closed shapes: unknown fields are rejected and every enum is closed, so a model (or an
injected instruction) can't add an action the code doesn't already allow (§7.3).
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LookupKind = Literal[
    "merchant_disputes", "card_merchant_history", "terminal_read", "merchant_credits"
]


class _Closed(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CitedSentence(_Closed):
    text: str = Field(min_length=1, max_length=400)
    cites: list[str] = Field(max_length=4)


class AddNote(_Closed):
    kind: Literal["add_note"]
    text: str = Field(min_length=1, max_length=300)


class Redraft(_Closed):
    kind: Literal["redraft"]
    draft_id: str
    instruction: str = Field(min_length=1, max_length=200)


class CopilotAnswer(_Closed):
    sentences: list[CitedSentence] = Field(max_length=6)
    lookup: LookupKind | None
    suggested_actions: list[AddNote | Redraft] = Field(max_length=2)
    self_score: float = Field(ge=0, le=1)


class RiskItem(CitedSentence):
    level: Literal["low", "medium", "high"]


class PlanItem(CitedSentence):
    done: bool
    lookup: LookupKind | None
    proposal_id: str | None


class InvestigationBrief(_Closed):
    headline: str = Field(min_length=1, max_length=240)
    findings: list[CitedSentence] = Field(max_length=6)
    gaps: list[CitedSentence] = Field(max_length=5)
    conflicts: list[CitedSentence] = Field(max_length=4)
    risks: list[RiskItem] = Field(max_length=5)
    plan: list[PlanItem] = Field(max_length=8)
    self_score: float = Field(ge=0, le=1)
