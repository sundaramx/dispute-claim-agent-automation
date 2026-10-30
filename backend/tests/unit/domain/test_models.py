"""Tests for dca.domain.models - Pydantic v2 contracts (FR-20, NFR-11)."""

import uuid
from datetime import datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError

from dca.domain.models import (
    ActionProposal,
    AuditEvent,
    ConfidenceComponents,
    Decision,
    DraftRef,
    ExtractedClaim,
    PrincipalRef,
    RuleTraceStep,
)

# ---------------------------------------------------------------------------
# ExtractedClaim
# ---------------------------------------------------------------------------


class TestExtractedClaim:
    def test_valid_minimal(self):
        claim = ExtractedClaim(
            asserted_category="fraud_unauthorized",
            self_score=0.95,
        )
        assert claim.txn_refs == []
        assert claim.amount_minor is None
        assert claim.currency == "USD"
        assert claim.merchant is None
        assert claim.txn_date is None
        assert claim.learned_of_error_on is None

    def test_valid_full(self):
        from datetime import date

        claim = ExtractedClaim(
            txn_refs=["TXN-123"],
            amount_minor=4999,
            currency="USD",
            merchant="Acme Corp",
            txn_date=date(2026, 5, 1),
            asserted_category="non_receipt",
            learned_of_error_on=date(2026, 5, 3),
            self_score=0.80,
        )
        assert claim.amount_minor == 4999
        assert claim.txn_refs == ["TXN-123"]

    def test_amount_minor_rejects_zero(self):
        with pytest.raises(ValidationError):
            ExtractedClaim(
                asserted_category="unknown",
                self_score=0.5,
                amount_minor=0,
            )

    def test_self_score_bounds(self):
        assert ExtractedClaim(asserted_category="unknown", self_score=0.0).self_score == 0.0
        assert ExtractedClaim(asserted_category="unknown", self_score=1.0).self_score == 1.0
        with pytest.raises(ValidationError):
            ExtractedClaim(asserted_category="unknown", self_score=-0.01)
        with pytest.raises(ValidationError):
            ExtractedClaim(asserted_category="unknown", self_score=1.01)

    def test_extra_fields_forbidden(self):
        with pytest.raises(ValidationError):
            ExtractedClaim(
                asserted_category="fraud_unauthorized",
                self_score=0.5,
                extra_field="not allowed",  # type: ignore[arg-type]
            )

    def test_invalid_category_rejected(self):
        with pytest.raises(ValidationError):
            ExtractedClaim(
                asserted_category="invalid_category",  # type: ignore[arg-type]
                self_score=0.5,
            )

    def test_json_serialize(self):
        claim = ExtractedClaim(asserted_category="duplicate", self_score=1.0)
        data = claim.model_dump()
        assert data["asserted_category"] == "duplicate"
        reloaded = ExtractedClaim(**data)
        assert reloaded.asserted_category == claim.asserted_category


# ---------------------------------------------------------------------------
# RuleTraceStep
# ---------------------------------------------------------------------------


class TestRuleTraceStep:
    def test_valid(self):
        step = RuleTraceStep(rule_id="R-001", inputs_digest="abc123")
        assert step.rule_id == "R-001"
        assert step.description is None
        assert step.outcome_fragment is None

    def test_with_optional_fields(self):
        step = RuleTraceStep(
            rule_id="R-002",
            description="Amount exceeds threshold",
            inputs_digest="def456",
            outcome_fragment="grant_provisional_credit",
        )
        assert step.description == "Amount exceeds threshold"

    def test_extra_forbidden(self):
        with pytest.raises(ValidationError):
            RuleTraceStep(  # type: ignore[arg-type]
                rule_id="R-003",
                inputs_digest="xyz",
                bogus=True,
            )


# ---------------------------------------------------------------------------
# ConfidenceComponents
# ---------------------------------------------------------------------------


class TestConfidenceComponents:
    def test_valid(self):
        cc = ConfidenceComponents(
            rule_coverage=0.9,
            evidence_completeness=0.8,
            model_self_score=0.85,
            rule_coverage_weight=0.4,
            evidence_completeness_weight=0.4,
            model_self_score_weight=0.2,
        )
        assert cc.rule_coverage == 0.9

    def test_component_score_out_of_range(self):
        with pytest.raises(ValidationError):
            ConfidenceComponents(
                rule_coverage=-0.1,
                evidence_completeness=0.5,
                model_self_score=0.5,
                rule_coverage_weight=0.33,
                evidence_completeness_weight=0.34,
                model_self_score_weight=0.33,
            )

    def test_weights_must_sum_to_one(self):
        """The three weight fields must sum to 1.0 (compared as Decimal)."""
        # Valid — sums to exactly 1.0
        ConfidenceComponents(
            rule_coverage=0.5,
            evidence_completeness=0.5,
            model_self_score=0.5,
            rule_coverage_weight=Decimal("0.3"),
            evidence_completeness_weight=Decimal("0.3"),
            model_self_score_weight=Decimal("0.4"),
        )

    def test_weights_not_summing_to_one_rejected(self):
        with pytest.raises(ValidationError):
            ConfidenceComponents(
                rule_coverage=0.5,
                evidence_completeness=0.5,
                model_self_score=0.5,
                rule_coverage_weight=Decimal("0.4"),
                evidence_completeness_weight=Decimal("0.4"),
                model_self_score_weight=Decimal("0.4"),
            )

    def test_extra_forbidden(self):
        with pytest.raises(ValidationError):
            ConfidenceComponents(  # type: ignore[arg-type]
                rule_coverage=0.5,
                evidence_completeness=0.5,
                model_self_score=0.5,
                rule_coverage_weight=0.33,
                evidence_completeness_weight=0.34,
                model_self_score_weight=0.33,
                extra="no",
            )


# ---------------------------------------------------------------------------
# Decision
# ---------------------------------------------------------------------------


class TestDecision:
    def _cc(self):
        return ConfidenceComponents(
            rule_coverage=0.9,
            evidence_completeness=0.8,
            model_self_score=0.85,
            rule_coverage_weight=0.4,
            evidence_completeness_weight=0.4,
            model_self_score_weight=0.2,
        )

    def test_valid(self):
        d = Decision(
            outcome="grant_provisional_credit",
            rule_ids=["R-001"],
            policy_pack_version="v1",
            config_version=1,
            inputs_digest="sha256:abc",
            confidence=Decimal("0.85"),
            confidence_components=self._cc(),
            calibration_version="cal-v1",
        )
        assert d.outcome == "grant_provisional_credit"
        assert len(d.rule_ids) >= 1

    def test_confidence_is_decimal(self):
        """Stored confidence value must be a Decimal."""
        d = Decision(
            outcome="grant_provisional_credit",
            rule_ids=["R-001"],
            policy_pack_version="v1",
            config_version=1,
            inputs_digest="abc",
            confidence=Decimal("0.85"),
            confidence_components=self._cc(),
            calibration_version="cal-v1",
        )
        assert isinstance(d.confidence, Decimal)

    def test_confidence_max_4_decimal_places(self):
        d = Decision(
            outcome="grant_provisional_credit",
            rule_ids=["R-001"],
            policy_pack_version="v1",
            config_version=1,
            inputs_digest="abc",
            confidence=Decimal("0.1234"),
            confidence_components=self._cc(),
            calibration_version="cal-v1",
        )
        assert d.confidence == Decimal("0.1234")

    def test_confidence_rejects_5_decimal_places(self):
        with pytest.raises(ValidationError):
            Decision(
                outcome="grant_provisional_credit",
                rule_ids=["R-001"],
                policy_pack_version="v1",
                config_version=1,
                inputs_digest="abc",
                confidence=Decimal("0.12345"),
                confidence_components=self._cc(),
                calibration_version="cal-v1",
            )

    def test_empty_rule_ids_rejected(self):
        with pytest.raises(ValidationError):
            Decision(
                outcome="file_chargeback",
                rule_ids=[],
                policy_pack_version="v1",
                config_version=1,
                inputs_digest="abc",
                confidence=Decimal("0.5"),
                confidence_components=self._cc(),
                calibration_version="cal-v1",
            )

    def test_empty_string_rule_id_rejected(self):
        with pytest.raises(ValidationError):
            Decision(
                outcome="file_chargeback",
                rule_ids=[""],
                policy_pack_version="v1",
                config_version=1,
                inputs_digest="abc",
                confidence=Decimal("0.5"),
                confidence_components=self._cc(),
                calibration_version="cal-v1",
            )

    def test_confidence_bounds(self):
        with pytest.raises(ValidationError):
            Decision(
                outcome="resolve_against",
                rule_ids=["R-01"],
                policy_pack_version="v1",
                config_version=1,
                inputs_digest="abc",
                confidence=Decimal("1.5"),
                confidence_components=self._cc(),
                calibration_version="cal-v1",
            )

    def test_extra_forbidden(self):
        with pytest.raises(ValidationError):
            Decision(  # type: ignore[arg-type]
                outcome="escalate_manual",
                rule_ids=["R-02"],
                policy_pack_version="v1",
                config_version=1,
                inputs_digest="abc",
                confidence=Decimal("0.5"),
                confidence_components=self._cc(),
                calibration_version="cal-v1",
                extra_field=True,
            )

    def test_all_outcomes_accepted(self):
        outcomes = [
            "grant_provisional_credit",
            "file_chargeback",
            "resolve_in_favor",
            "resolve_against",
            "request_more_info",
            "write_off",
            "escalate_manual",
        ]
        for outcome in outcomes:
            Decision(
                outcome=outcome,  # type: ignore[arg-type]
                rule_ids=["R-X"],
                policy_pack_version="v1",
                config_version=1,
                inputs_digest="abc",
                confidence=Decimal("0.5"),
                confidence_components=self._cc(),
                calibration_version="cal-v1",
            )


# ---------------------------------------------------------------------------
# ActionProposal
# ---------------------------------------------------------------------------


class TestActionProposal:
    def _preparer(self):
        return PrincipalRef(type_="service", id="svc:decide")

    def test_all_proposal_status_values_accepted(self):
        """Check every value from ProposalStatus matching §2.3 exactly."""
        for status in (
            "pending_approval",
            "approved",
            "executing",
            "executed",
            "failed",
            "rejected",
            "returned",
            "superseded",
            "auto_approved",
        ):
            proposal = ActionProposal(
                id=uuid.uuid4(),
                case_id=uuid.uuid4(),
                action_type="provisional_credit",
                amount_minor=5000,
                decision_id=uuid.uuid4(),
                content_hash="sha256:abc123",
                preparer=self._preparer(),
                required_role="analyst",
                low_confidence=False,
                status=status,  # type: ignore[arg-type]
            )
            assert proposal.status == status

    def test_rejected_status_values(self):
        """Old values 'pending' and 'cancelled' must be rejected."""
        for bad in ("pending", "cancelled"):
            with pytest.raises(ValidationError):
                ActionProposal(
                    id=uuid.uuid4(),
                    case_id=uuid.uuid4(),
                    action_type="provisional_credit",
                    amount_minor=5000,
                    decision_id=uuid.uuid4(),
                    content_hash="h",
                    preparer=self._preparer(),
                    required_role="analyst",
                    low_confidence=False,
                    status=bad,  # type: ignore[arg-type]
                )

    def test_amount_minor_rejects_zero(self):
        with pytest.raises(ValidationError):
            ActionProposal(
                id=uuid.uuid4(),
                case_id=uuid.uuid4(),
                action_type="provisional_credit",
                amount_minor=0,
                decision_id=uuid.uuid4(),
                content_hash="h",
                preparer=self._preparer(),
                required_role="analyst",
                low_confidence=False,
                status="approved",
            )

    def test_extra_forbidden(self):
        with pytest.raises(ValidationError):
            ActionProposal(  # type: ignore[arg-type]
                id=uuid.uuid4(),
                case_id=uuid.uuid4(),
                action_type="customer_comm",
                decision_id=uuid.uuid4(),
                content_hash="h",
                preparer=self._preparer(),
                required_role="analyst",
                low_confidence=False,
                status="approved",
                extra=True,
            )


# ---------------------------------------------------------------------------
# AuditEvent
# ---------------------------------------------------------------------------


class TestAuditEvent:
    def test_valid(self):
        event = AuditEvent(
            seq=1,
            ts=datetime(2026, 5, 1, 12, 0),
            actor_type="service",
            actor_id="svc:decide",
            case_id=uuid.uuid4(),
            event_type="decision.made",
            payload_digest="sha256:payload",
            prev_hash="sha256:prev",
            hash_="sha256:self",
        )
        assert event.seq == 1
        assert event.actor_type == "service"

    def test_seq_zero_rejected(self):
        with pytest.raises(ValidationError):
            AuditEvent(
                seq=0,
                ts=datetime(2026, 5, 1),
                actor_type="system",
                actor_id="sys",
                event_type="boot",
                payload_digest="",
                prev_hash="",
                hash_="",
            )

    def test_optional_fields_defaults(self):
        event = AuditEvent(
            seq=2,
            ts=datetime.now(),
            actor_type="human",
            actor_id="user:1",
            event_type="case.assigned",
            payload_digest="d",
            prev_hash="h",
            hash_="x",
        )
        assert event.case_id is None
        assert event.policy_version is None
        assert event.config_version is None
        assert event.model_ref is None

    def test_extra_forbidden(self):
        with pytest.raises(ValidationError):
            AuditEvent(  # type: ignore[arg-type]
                seq=3,
                ts=datetime.now(),
                actor_type="service",
                actor_id="svc",
                event_type="test",
                payload_digest="d",
                prev_hash="h",
                hash_="x",
                extra_field=True,
            )

    def test_all_actor_types(self):
        for at in ("human", "service", "system"):
            e = AuditEvent(
                seq=1,
                ts=datetime.now(),
                actor_type=at,  # type: ignore[arg-type]
                actor_id="x",
                event_type="t",
                payload_digest="d",
                prev_hash="h",
                hash_="x",
            )
            assert e.actor_type == at

    def test_hash_field_alias(self):
        """The 'hash' field is aliased to hash_ in Python but serialises as 'hash'."""
        event = AuditEvent(
            seq=1,
            ts=datetime.now(),
            actor_type="system",
            actor_id="sys",
            event_type="boot",
            payload_digest="d",
            prev_hash="h",
            hash_="abc",
        )
        dumped = event.model_dump(by_alias=True)
        assert "hash" in dumped
        assert dumped["hash"] == "abc"


# ---------------------------------------------------------------------------
# DraftRef & PrincipalRef (supporting types)
# ---------------------------------------------------------------------------


class TestDraftRef:
    def test_valid(self):
        d = DraftRef(name="provisional_credit_notice", version=1)
        assert d.name == "provisional_credit_notice"

    def test_extra_forbidden(self):
        with pytest.raises(ValidationError):
            DraftRef(name="x", version=1, extra="no")  # type: ignore[arg-type]


class TestPrincipalRef:
    def test_valid_human(self):
        p = PrincipalRef(type_="human", id="user:42")
        assert p.type_ == "human"

    def test_alias_serialisation(self):
        p = PrincipalRef(type_="service", id="svc:decide")
        d = p.model_dump(by_alias=True)
        assert d["type"] == "service"


# ---------------------------------------------------------------------------
# Strict amount_minor and JSON-schema alignment
# ---------------------------------------------------------------------------


def _proposal_kwargs(amount):
    return dict(
        id=uuid.uuid4(),
        case_id=uuid.uuid4(),
        action_type="provisional_credit",
        amount_minor=amount,
        decision_id=uuid.uuid4(),
        content_hash="sha256:x",
        preparer=PrincipalRef(type_="service", id="svc:decide"),
        required_role="analyst",
        low_confidence=False,
        status="pending_approval",
    )


@pytest.mark.parametrize("bad", [100.0, True, "4999"])
def test_amount_minor_rejects_non_int_python(bad):
    with pytest.raises(ValidationError):
        ExtractedClaim(amount_minor=bad, asserted_category="unknown", self_score=0.5)
    with pytest.raises(ValidationError):
        ActionProposal(**_proposal_kwargs(bad))


@pytest.mark.parametrize("bad", ["100.0", "true", '"4999"'])
def test_amount_minor_rejects_non_int_json(bad):
    with pytest.raises(ValidationError):
        ExtractedClaim.model_validate_json(
            f'{{"amount_minor": {bad}, "asserted_category": "unknown", "self_score": 0.5}}'
        )


def test_dump_json_matches_schema_field_names():
    cc = ConfidenceComponents(
        rule_coverage=0.9,
        evidence_completeness=0.8,
        model_self_score=0.85,
        rule_coverage_weight=0.4,
        evidence_completeness_weight=0.4,
        model_self_score_weight=0.2,
    )
    instances = [
        ExtractedClaim(asserted_category="unknown", self_score=0.5),
        RuleTraceStep(rule_id="r1", inputs_digest="d"),
        cc,
        Decision(
            outcome="escalate_manual",
            rule_ids=["r1"],
            policy_pack_version="v1",
            config_version=1,
            inputs_digest="d",
            confidence=Decimal("0.5"),
            confidence_components=cc,
            calibration_version="c1",
        ),
        ActionProposal(**_proposal_kwargs(100)),
        AuditEvent(
            seq=1,
            ts=datetime(2026, 5, 1),
            actor_type="system",
            actor_id="s",
            event_type="e",
            payload_digest="d",
            prev_hash="p",
            hash_="h",
        ),
    ]
    for inst in instances:
        schema_props = set(type(inst).model_json_schema()["properties"])
        dumped = inst.model_dump(mode="json")
        assert set(dumped) <= schema_props, type(inst).__name__
        type(inst).model_validate(dumped)
    assert "hash" in instances[-1].model_dump(mode="json")
    assert PrincipalRef(type_="human", id="u").model_dump(mode="json")["type"] == "human"
