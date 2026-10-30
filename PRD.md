# PRD — dispute-claim-agent-automation

> Status: **Draft v1 for design review**. Owner: Product. Date: 2026-10-28.
> Source of truth: `docs/DISCOVERY.md`. Answers the human confirmed are binding. Items marked *(inferred)* came out of discovery and still need confirmation at the design review gate. They are listed in §9.
> Standards: **quality floor only** (no company pack).
> **Change request CR-1 (2026-10-29, requested by the human after design approval):** add agent conversation capability for analysts (FR-36, FR-38) and cardholders (FR-37). It amends OOS-8 and adds D-10, D-11 and OQ-9..OQ-11. CR-1 items need confirmation at a design re-review before they are built (PLAN.md M11).
> Requirement IDs (`FR-n`, `NFR-n`, `AS-n`, `D-n`, `OQ-n`) are stable. Never renumber them. Add new IDs at the end, and mark removed ones "Withdrawn" instead of deleting them.

---

## 1. Problem

The dispute-operations team at a mid-size US card issuer works debit (Reg E) and credit (Reg Z) card disputes by hand across intake, triage, investigation, resolution and monitoring. This causes three problems:

- **Regulatory exposure.** Reg E and Reg Z have hard clocks: investigation and provisional-credit deadlines, written-notice duties, and resolution limits. Visa and Mastercard add filing windows that vary by reason code. Every miss is a compliance finding, and every missed network window is a lost chargeback the issuer has to write off.
- **Handling cost.** Analysts spend most of their time on mechanical work: re-keying claims, pulling transactions, assembling evidence, mapping reason codes, computing deadlines and drafting letters.
- **Weak reproducibility.** It is hard to reconstruct after the fact why a decision was made: which inputs, which policy version, and who approved it. That makes exams, audits and QA slow and contestable.

## 2. Goal

Ship a **production-grade MVP** of an agentic system that runs a card dispute end to end. The pipeline covers intake, triage, investigation, resolution/implementation (decision, provisional credit, chargeback filing, customer communications) and monitoring. Agents do the mechanical work. Humans keep authority over money movement, network filings and customer communications. Every action is deadline-aware and recorded in a tamper-evident audit trail. The MVP runs against **simulated integrations**, behind adapters that can be swapped for real systems later.

## 3. Users and roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| **Analyst** | Dispute-ops case worker | View and work cases; create claims manually; edit agent drafts; approve actions within their authority (≤ Supervisor threshold and not low-confidence) that they did not prepare | Approve their own prepared actions; approve actions over the threshold or low-confidence actions; change config; toggle auto-approve |
| **Supervisor** | Team lead | Everything an Analyst can do, plus approve actions over the threshold and low-confidence actions; perform QA review of auto-actions; reassign cases; work the manual (pre-arb/arbitration) queue | Approve actions they prepared; change system config; toggle auto-approve |
| **Compliance Auditor** | Compliance / internal audit / examiner liaison | Read-only access to cases, decisions, audit trail, chain verification, replay and reports | Any write, approve or config action |
| **Admin** | Platform / ops owner | Manage users and roles, thresholds, LLM provider routing and the auto-approve toggle; view the audit trail | Approve case actions (separation of duties, D-3) |
| **Agent (system principal)** | Non-human service identity per agent task | Intake extraction, triage, evidence gathering, deadline computation, drafting; executes approved actions; auto-executes eligible actions when auto-approve is ON | Approve anything; deny a claim; send customer communications without human approval |
| **Cardholder** *(indirect)* | Disputing customer | Submits disputes via the mocked portal/IVR feed; receives letters/SMS/email. Since CR-1, can also open a dispute, answer evidence requests and ask for status through the cardholder chat agent (FR-37) in the simulated portal | Has no direct console access (out of scope). Cannot reach any case but their own. Never receives free-form LLM text (D-11) |

## 4. Success metrics

| ID | Metric | Target | How measured |
|---|---|---|---|
| SM-1 | Reg E / Reg Z deadline compliance | **100%. Zero missed regulatory deadlines** | Count of clocks whose satisfying event (credit, notice, resolution) was recorded after the due time, divided by all clocks that closed. Reported on the SLA dashboard (FR-24) and computed by the certification run over the seeded scenario corpus (FR-33). |
| SM-2 | Handling time per case | **≥ 50% reduction** against baseline | Human active handling time per case (FR-35), compared with the configured manual-process baseline (AS-6, OQ-2). |
| SM-3 | Decision reproducibility | **100%** of closed cases | The replay check (FR-28) rebuilds every final decision from the audit trail with identical inputs, policy version, model/prompt version and outputs. |
| SM-4 | Audit-chain integrity | 100% verified, 0 undetected tampering | The chain verifier (FR-27) passes on clean data and detects 100% of injected tamper cases in tests. |
| SM-5 | Data-protection invariant | 0 PANs in any LLM payload or log | The egress scanner (FR-31) runs over all recorded LLM payloads in the test and eval corpus. |

Secondary indicators are tracked but have no target in the MVP: auto-approve QA agreement rate, chargeback win rate on seeded scenarios, LLM cost per case, and analyst touches per case.

---

## 5. Scope

### 5.1 In scope

- Issuer-side card disputes: **debit (Reg E)** and **credit (Reg Z)**.
- Networks: **Visa and Mastercard**, behind an extensible network adapter interface.
- Dispute categories (all five): **fraud/unauthorized, non-receipt, not-as-described, duplicate, credit-not-processed**.
- Lifecycle through **first chargeback** and **representment response**.
- Intake channels: REST API, analyst-console manual entry, a mocked customer-portal/IVR feed, and (CR-1) a cardholder chat agent in a simulated portal page.
- (CR-1) A case copilot: analysts, supervisors and auditors can converse with an agent about a case in the console.
- Human-in-the-loop default mode. Admin-toggled low-risk auto-approve mode (OFF by default).
- RBAC with four roles and four-eyes enforcement. OIDC-compatible JWT auth with seeded users.
- Policy-as-code decisioning, an LLM-assisted agent pipeline, and a multi-provider LLM gateway.
- Reg E/Z clock engine, business-day calendar, network filing windows.
- Append-only hash-chained audit log, a verification endpoint and CLI, and optional S3 Object Lock anchoring behind a flag.
- Mocked adapters: core ledger, card processor, Visa VROL, Mastercom, CRM, notifications (email/letter/SMS), tokenization vault.
- Synthetic dispute data generator and seeded scenarios.
- React/TypeScript analyst console: case queue, case detail, approvals inbox, SLA dashboard, admin config, audit viewer.
- Local run via docker compose. Terraform for AWS ECS (dev/staging/prod) is **written but not applied**.
- OpenTelemetry metrics/traces and alerting.

### 5.2 Explicitly out of scope

| # | Out of scope | Handling |
|---|---|---|
| OOS-1 | Acquirer/merchant side of disputes | Not modelled |
| OOS-2 | ACH, P2P (e.g. Zelle), check, wire, and non-card EFT disputes | Rejected at intake with a reason |
| OOS-3 | Amex and Discover | Rejected at intake with a reason. The adapter interface stays extensible (NFR-12) |
| OOS-4 | Pre-arbitration and arbitration | Flagged to a human and routed to the manual queue (FR-18). No agent automation |
| OOS-5 | Real integrations with production systems (core banking, FIS/TSYS/Fiserv, VROL, Mastercom, CRM, notification vendors) | Mocked adapters only |
| OOS-6 | Applying Terraform or deploying to any cloud environment | Terraform is written and validated only |
| OOS-7 | Real customer data, real PANs, real credentials | Synthetic data only |
| OOS-8 | Cardholder-facing web/mobile UI | A mocked feed simulates the portal/IVR. **Amended by CR-1:** a single simulated portal chat page, served by the mocks service, is in scope for FR-37. A production portal or mobile app is still out of scope |
| OOS-9 | Training or fine-tuning ML models | Uses off-the-shelf LLMs through the gateway. ML work would go to the DS sibling agent |
| OOS-10 | Production SSO/IdP integration | The design is SSO-ready. Local JWT issuer with seeded users |
| OOS-11 | Collections, credit-bureau reporting, and merchant-fraud investigations | The system only places a dispute hold flag on the ledger (FR-15) |
| OOS-12 | Multi-tenant (multi-issuer) operation and non-US jurisdictions | Single issuer, US only |

---

## 6. Functional requirements

Conventions:
- "Configurable" means stored in versioned config that only an Admin can change, and every change is audit-logged (FR-26).
- "Audit-logged" means an event is appended to the hash-chained log with actor, timestamp, case ID, inputs/outputs digest, policy version and model/prompt version where applicable.
- Default values marked *(inferred)* are starting points that need confirmation at the review gate.

### FR-1 — Multi-channel dispute intake
1. `POST /api/v1/disputes` accepts a dispute as structured JSON, free text, or both. It returns `201` with a case ID and the computed clocks, or `422` with field-level errors.
2. The REST endpoint requires an `Idempotency-Key` header. Resubmitting the same key and payload returns the original case and creates no duplicate. The same key with a different payload returns `409`.
3. The analyst console has a manual-entry form that captures the same fields as the API and validates them client-side and server-side.
4. A mocked customer-portal/IVR feed adapter delivers disputes (structured fields plus free-text narrative or an IVR transcript), which go through the same intake path.
5. Every intake records the channel, receipt timestamp (the Reg E/Z "notice received" time) and submitting principal, and is audit-logged.
6. Disputes on out-of-scope products or networks (OOS-2, OOS-3) are rejected with a machine-readable reason, and the rejection is audit-logged.
7. Card numbers submitted at any channel are tokenized at the edge (FR-31) before persistence. A raw PAN is never stored outside the tokenization vault.

### FR-2 — LLM-assisted claim extraction and validation
1. Free-text narratives and IVR transcripts are converted by an extraction agent into a structured claim: transaction reference(s), amount, merchant, transaction date, cardholder-asserted category, and the date the cardholder learned of the error where stated.
2. The extraction output is validated against a strict schema. Any output that fails the schema is retried at most N times (configurable, default 2 *(inferred)*). After that the claim is routed to an Analyst as "needs manual completion". It is never accepted partially.
3. Extracted transaction references are matched against the card processor adapter. Claims with no matching transaction are flagged "unmatched", not rejected.
4. The extraction input is PII-redacted and PAN-free (FR-31). The output, model and prompt version are audit-logged.
5. Customer-supplied text is treated as untrusted data. Instructions embedded in it cannot change the agent's tools, routing or decisions (NFR-9).

### FR-3 — Triage: classification, regime, network and reason-code mapping
1. Each claim is classified into exactly one of the five categories, or "unclassifiable", which routes it to an Analyst.
2. The regime is determined deterministically from the account/card product: **Reg E** (debit/prepaid) or **Reg Z** (credit). The LLM never chooses the regime.
3. The network (Visa / Mastercard) comes deterministically from transaction data.
4. The category is mapped to a network reason code. The policy-as-code mapping table is authoritative. The LLM may only suggest, and a suggestion that disagrees with the table lowers confidence and is surfaced to the reviewer.
5. Duplicate-claim detection flags a claim for the same card token, transaction and category as an existing open case, and links the two.
6. Triage assigns a priority from the nearest deadline (FR-4..FR-6) and the amount, and places the case in the queue (FR-22).
7. The triage outcome, mapping table version and any LLM suggestion are audit-logged.

### FR-4 — Reg E clock engine (debit)
1. On intake of a Reg E dispute, the engine creates clocks based on the business-day calendar (reused from `disputes-claims-decision-engine`). The calendar must cover at least the current year + 2. If a date falls outside calendar coverage, the system fails loudly with an error and an alert. It must never silently treat such a date as a business day.
2. **Investigate-or-provisionally-credit clock:** 10 business days from notice received. For new accounts it is 20 business days *(inferred from Reg E §1005.11; confirm, OQ-5)*.
3. **Extended investigation clock:** if provisional credit is granted by the 10-business-day deadline, investigation may extend to 45 calendar days. For new accounts, POS, and foreign-initiated transactions it is 90 calendar days. The extension rule is evaluated deterministically from transaction attributes.
4. **Notice clocks** create a written-notice obligation at each step: provisional-credit notice (within 2 business days of crediting *(inferred)*), results notice (within 3 business days of concluding *(inferred)*), and the notice of debit of provisional credit, including the 5-business-day honoring period *(inferred)*.
5. **Correction clock:** if an error is found, the account is corrected within 1 business day of the determination *(inferred)*.
6. Every clock has a state: `open` / `satisfied` / `at_risk` / `breached`. "Satisfied" is linked to the audit event that met it.
7. Clock parameters live in versioned policy-as-code. The version applied to each case is recorded and never changes retroactively for that case.
8. Property-based tests cover weekends, federal holidays, month/year rollovers, notice on a non-business day, and notice after cut-off time (NFR-10).

### FR-5 — Reg Z clock engine (credit)
1. On intake of a Reg Z billing-error notice, the engine creates clocks for **written acknowledgment within 30 days** and **resolution within 2 complete billing cycles, and no more than 90 days**.
2. Billing-cycle boundaries come from the account's statement cycle via the core ledger adapter.
3. While the dispute is open, the disputed amount is marked "in dispute" on the ledger adapter. That hold excludes it from collection and adverse reporting (FR-15). Marking it is audit-logged.
4. Clock states, versioning and satisfaction linking follow FR-4 AC 6–7.

### FR-6 — Network filing windows
1. Each chargeback-eligible case gets a network filing-window clock based on network and reason code, taken from a versioned, configurable window table *(inferred: windows per reason code; seeded values need Compliance confirmation, OQ-4)*.
2. Representment cases get a response-window clock from the same table.
3. If a filing window would close before the Reg E/Z provisional-credit decision is due, the case is escalated to priority "network-critical".
4. A case whose filing window has already closed at intake is flagged "network window expired". It goes to an Analyst with a recommended write-off/absorb decision that requires approval (FR-11).

### FR-7 — Investigation and evidence gathering agent
1. For each triaged case, the investigation agent collects evidence through the adapters:
   - transaction and authorization details (card processor)
   - account history and prior disputes (core ledger, CRM)
   - customer contact history (CRM)
   - merchant/credit records relevant to the category, such as a matching credit for credit-not-processed or a duplicate presentment for duplicate.
2. Evidence requirements per category are defined in policy-as-code as a checklist. The agent records each item as `present` / `missing` / `not_applicable`, with its source.
3. Missing evidence that needs customer input creates a drafted customer request (FR-19), which needs approval before it is sent.
4. The agent produces an evidence summary (LLM) that cites evidence item IDs. Uncited claims in the summary fail validation.
5. Adapter failures retry with backoff (NFR-4). If they keep failing, the case goes to an Analyst, and its clocks keep running and stay visible.
6. All evidence items are stored immutably by content hash and referenced from the audit log.

### FR-8 — Policy-as-code decisioning
1. A deterministic rules engine, reused from `disputes-claims-decision-engine` and ported to Postgres, takes the structured claim, evidence checklist and clocks. It outputs a **recommended outcome** (`grant_provisional_credit`, `file_chargeback`, `resolve_in_favor`, `resolve_against`, `request_more_info`, `write_off`, `escalate_manual`) together with the rule IDs that fired.
2. Policies are versioned files. Each decision records the policy version and the rule trace.
3. The same inputs and policy version always produce the same outcome (NFR-11).
4. The LLM cannot add, remove or override an outcome produced by policy. The LLM's role is summarization, classification suggestion, reason-code suggestion, and drafting.
5. No outcome that moves money or denies a claim executes without the approval path in FR-11, except where auto-approve rules allow it (FR-13). `resolve_against` (denial) **always** requires human approval.

### FR-9 — Confidence scoring
1. Each case recommendation carries a confidence score in [0,1]. It is a calibrated composite of rule coverage, evidence completeness, and the model's self-score *(inferred composite; weights configurable)*.
2. The components and weights are recorded with the score.
3. "Low confidence" is any score below a configurable threshold (default 0.80 *(inferred)*). "High confidence" for auto-approve is at or above a separate configurable threshold (default 0.90 *(inferred)*). The high threshold must be ≥ the low threshold, and config validation rejects anything else.
4. Calibration is measured on the golden-case eval set (NFR-10): expected calibration error ≤ 0.10 *(inferred)*, reported per release.
5. A disagreement between the LLM's classification or reason-code suggestion and policy forces the case into low confidence.

### FR-10 — Decision and letter drafting
1. For each recommended outcome, the agent drafts:
   - a decision memo (rationale citing evidence IDs and rule IDs)
   - required customer notices (FR-4/FR-5 notice types), from versioned letter templates with LLM-filled narrative sections
   - for chargebacks, a network filing package for the network adapter.
2. Drafts are validated: required regulatory disclosures are present, there are no unresolved placeholders, no PAN or unredacted PII beyond what the template allows, and amounts and dates equal the case record exactly.
3. Drafts are editable by an Analyst or Supervisor. Each edit is versioned, and the editor becomes the preparer (D-2).
4. Each draft records the template version, model/prompt version and the generated output.

### FR-11 — Human-in-the-loop approval workflow (default mode)
1. The default mode is always available. Every **money movement** (provisional credit, final credit/debit, reversal of provisional credit, write-off), every **chargeback filing**, every **representment response**, and every **outbound customer communication** is created as a pending *action proposal* and is not executed until it is approved.
2. An action proposal shows the proposed action, the amount, the policy outcome and rule trace, confidence and its components, the evidence summary, the drafts, and the clock deadlines it satisfies.
3. Approvers can **approve**, **reject with reason**, or **return for rework with comment**. Every decision is audit-logged with the approver identity and the proposal's content hash at the moment of approval.
4. An approval binds to the exact proposal content hash. Any later edit invalidates the approval and needs a new one.
5. Approved actions execute through the relevant adapter exactly once (NFR-4). The execution result is audit-logged and linked to the approval.
6. Proposals are ordered in the approvals inbox (FR-23) by nearest deadline.

### FR-12 — Four-eyes and Supervisor sign-off
1. **Preparer** means the principal who created or last materially edited the proposal: the agent identity if it is unedited, otherwise the editing human (D-2).
2. The approver must be a human user who is not the preparer. The server enforces this and returns `403` with a reason. The UI hides the approve control in the same situation.
3. Proposals with an amount **> $500** (configurable, default $500) or **low confidence** (FR-9) need an approver with the **Supervisor** role.
4. A Compliance Auditor can never approve. An Admin cannot approve case actions (D-3).
5. An attempt to bypass these rules (self-approval, approval below the required role, or an approval request to an API without the role) is denied and audit-logged as a security event.

### FR-13 — Low-risk auto-approve mode
1. An Admin can toggle auto-approve ON or OFF at runtime with no restart. It is **OFF by default** on every fresh deploy.
2. Each toggle is audit-logged with the Admin identity, a mandatory reason, and the before and after state. The current state shows in the console header for all roles.
3. When ON, a case is auto-eligible only if **all** of these are true:
   - confidence ≥ the high-confidence threshold (FR-9)
   - amount ≤ the auto-approve dollar threshold (configurable). Config validation enforces auto threshold ≤ Supervisor threshold (D-4)
   - the policy outcome is `grant_provisional_credit` and/or `file_chargeback`
   - the category and regime are on the configurable allow-list (default: all five categories)
   - no open duplicate-claim link, unmatched-transaction flag, or adapter error.
4. For eligible cases the agent executes provisional credit and chargeback filing without human approval. Each auto-action is audit-logged as `auto_approved`, with the eligibility evaluation and the config version that applied.
5. Even when ON, customer communications, final credit/debit, reversal of provisional credit, write-off, and denial still need human approval *(customer comms: inferred, conservative)*.
6. Turning the mode OFF stops new auto-actions immediately (within one workflow tick, ≤ 5 s). Auto-actions already executed are not reversed.
7. Ineligible cases fall back to the default flow (FR-11) with the reasons for ineligibility shown.

### FR-14 — Supervisor QA sampling of auto-actions
1. A configurable share of auto-approved actions (default **10%** *(inferred)*) is randomly sampled into a Supervisor QA queue. The random seed is recorded so the sample can be reproduced.
2. A Supervisor records a QA verdict (`agree` / `disagree` with reason). A disagreement opens a remediation task on the case, which a human must act on, such as reversing through a new approved proposal.
3. The QA agreement rate is reported on the SLA dashboard (FR-24).
4. Changing the sampling rate is an Admin config change and is audit-logged.

### FR-15 — Money movement via core ledger adapter
1. Provisional credit, final credit, final debit/reversal of provisional credit, write-off, and Reg Z "in dispute" holds run through the core-ledger adapter interface only.
2. Every ledger call carries an idempotency key derived from (case ID, action type, proposal version), so retries never double-post.
3. A reversal of provisional credit cannot run until the related customer notice (FR-4 AC 4) has been approved and dispatched, where the regime requires it.
4. Ledger postings and their results are audit-logged and shown on the case timeline.

### FR-16 — Chargeback filing via network adapter
1. Chargebacks are filed through a network adapter interface. The MVP implements mocked **Visa (VROL)** and **Mastercom** adapters.
2. The filing package is validated against the network/reason-code schema before submission. Any validation failure blocks submission and comes back as a rework item.
3. The network's acknowledgment and case reference are stored and audit-logged. A filing must happen before the filing-window clock (FR-6) closes, or the case is breached and alerted.
4. The mocked network adapters simulate the outcomes accept, representment and reject, with configurable latency and failure injection.

### FR-17 — Representment response handling
1. A merchant representment received from the network adapter attaches to the case, starts the response-window clock (FR-6 AC 2), and triggers re-investigation of the new evidence.
2. Policy-as-code recommends one of: **accept representment** (resolve against the cardholder, which means a reversal of provisional credit plus a notice, all needing approval), **resolve in the cardholder's favour without further network action**, or **escalate to pre-arbitration** (FR-18).
3. The agent drafts the response memo and customer notices. Approval follows FR-11/FR-12. Auto-approve never applies to representment responses.

### FR-18 — Pre-arbitration / arbitration manual queue
1. Any case whose next step is pre-arbitration or arbitration is flagged `manual_prearb` and moved to a Supervisor-visible manual queue. All agent automation for that case stops beyond keeping clocks and the audit log.
2. Regulatory clocks keep being tracked and alerted for manual-queue cases.
3. Manual-queue actions taken in the console (notes, outcome entry, closure) are audit-logged.

### FR-19 — Customer communications
1. Customer letters, emails and SMS are sent only through the notification adapter. The MVP mocks it, and rendered output can be viewed in the console.
2. Every outbound communication needs human approval under FR-11/FR-12 in both modes.
3. Communications that satisfy a regulatory notice duty are linked to the clock they satisfy. The dispatch timestamp is the satisfaction time.
4. A communication clock entering `at_risk` puts its pending approval at the top of the approvals inbox.
5. The content sent is stored by content hash, and the hash is audit-logged.

### FR-20 — Durable workflow / state machine
1. Each case advances through an explicit state machine (e.g. `received → triaged → investigating → awaiting_approval → executing → awaiting_network → resolved → closed`, plus `manual_prearb`, `needs_manual_completion`). Transitions not defined in it are rejected.
2. Workflow steps are persisted in Postgres, idempotent, and retried with bounded exponential backoff. Clock timers survive restarts.
3. Killing any worker during a step and restarting it leads to the step completing exactly once in effect (NFR-4).
4. Every state transition is audit-logged.

### FR-21 — Authentication and RBAC
1. All API and console access needs an OIDC-compatible JWT. Locally a built-in issuer provides seeded users for each role. Issuer, audience and JWKS are configurable, so a real IdP can be swapped in (SSO-ready *(inferred)*).
2. Authorization is enforced server-side on every endpoint according to the role matrix in §3. The UI hides actions the user is not permitted to take but is not relied on for enforcement.
3. Agent workers authenticate as distinct service principals, one per agent task, and can call only the endpoints and adapters their task needs.
4. Authentication failures and authorization denials are audit-logged.

### FR-22 — Console: case queue and case detail
1. **Case queue:** filterable by status, category, regime, network, assignee, priority and clock state. It is sorted by nearest deadline by default and shows a countdown in business or calendar days, as each clock requires.
2. **Case detail:** shows the claim, the masked card (last 4 only), transactions, evidence checklist with sources, the agent's evidence summary, policy outcome and rule trace, confidence breakdown, all clocks with state, drafts with version history, action proposals, and a chronological timeline linked to audit events.
3. Analysts can claim, assign, add notes, edit drafts and submit for approval from case detail, within role permissions.

### FR-23 — Console: approvals inbox
1. Lists pending action proposals the current user may approve, after applying FR-12 rules. Ordered by nearest deadline, with at-risk items highlighted.
2. Approving, rejecting or returning works from the inbox with a link to the full case detail. Rejection and return require a reason.
3. Supervisors also see the QA sample queue (FR-14) and the manual pre-arb queue (FR-18).

### FR-24 — Console: SLA dashboard
1. Shows open clocks by state (`open` / `at_risk` / `breached`), by regime and by clock type, as well as cases at T-2 business days.
2. Shows SM-1 compliance (rolling and all-time), handling-time trend against baseline (SM-2), auto-approve volume and QA agreement rate, and the current auto-approve mode state.
3. Shows LLM cost, latency and token usage per agent task and provider (FR-30).

### FR-25 — Console: admin configuration
1. Admins manage users and role assignment, the Supervisor dollar threshold, confidence thresholds, auto-approve toggle, threshold, allow-list and QA sampling rate, and LLM provider/model routing per environment and per agent task (FR-29).
2. All config is versioned. Each change needs a reason, is validated (e.g. D-4, FR-9 AC 3), and is audit-logged with a before/after diff.
3. Cases record the config version that was active when each decision was made.

### FR-26 — Append-only, hash-chained audit log
1. Every significant event goes to an append-only event log in Postgres (reused ledger design): intake, extraction, triage, evidence, policy decision, LLM call, draft, proposal, approval/rejection, execution, communication, state transition, clock change, config change, toggle, auth/authz denial and QA verdict.
2. Each event carries: sequence number, timestamp, actor (human or service principal), case ID (if any), event type, payload or payload digest, policy version, config version, model/provider/prompt version (if any), previous-event hash, and its own SHA-256 hash.
3. The application database role cannot run UPDATE or DELETE on the audit table. This is enforced by DB grants and/or triggers and verified by a test.
4. Payloads that contain PII are stored by reference/digest with access controls. The chain stays verifiable without exposing PII to the Compliance Auditor beyond what their role needs.
5. **Audit viewer (console):** search by case, actor, event type and time range. Shows the chain position of each event and the verification status.

### FR-27 — Audit verification and WORM anchoring
1. `GET /api/v1/audit/verify` and a CLI command recompute the chain over a full or ranged sequence. They return `ok`, or the first broken sequence number and the reason.
2. Tests show that altering, deleting, reordering or inserting any event is detected.
3. When `AUDIT_ANCHOR_S3_ENABLED=true` (default `false`), the system periodically writes the chain head hash and sequence to a configured S3 bucket with Object Lock (compliance mode) on a configurable interval. Verification can check the local chain against the anchors.
4. Anchoring failures are alerted on and retried. They never block case processing.
5. The 7-year audit retention policy is documented (README/ARCHITECTURE), including how it maps to S3 Object Lock retention.

### FR-28 — Decision reproducibility (replay)
1. For any case, a replay command and endpoint rebuilds each decision from the audit trail: inputs, evidence digests, policy version, config version, recorded LLM outputs, model/prompt version, and outputs.
2. Replay re-runs the deterministic policy engine and confidence computation, and the outcomes match the recorded ones exactly. LLM outputs are **replayed from the record** and not regenerated.
3. A replay mismatch is reported with a diff and an alert.
4. The certification run replays 100% of closed cases in the seeded corpus with no mismatches (SM-3).

### FR-29 — LLM provider gateway
1. All LLM calls go through a single gateway. Agents never call a provider SDK directly, and an import/lint check enforces this.
2. Supported providers: **Ollama** (local, default), **AWS Bedrock** via `anthropic.AsyncAnthropicBedrock` with a full application-inference-profile ARN and mandatory guardrail headers, **Google Gemini**, and **any OpenAI-compatible API**.
3. Provider and model can be configured per environment and per agent task (extraction, classification, reason-code suggestion, evidence summary, drafting), with an ordered failover list.
4. Failover triggers on timeout, 5xx, rate limit or schema-invalid output after retries. The provider actually used is recorded on the call.
5. Bedrock credentials come from the configured auth refresh command, with TTL-based client refresh and retry on auth errors. ARNs, profiles, roles and guardrail IDs come from config/env and are never hard-coded.
6. Every call's output is schema-validated before an agent uses it.

### FR-30 — LLM usage, cost and latency tracking
1. Every LLM call records provider, model, agent task, case ID, prompt template version, input/output tokens, latency, estimated cost (from a configurable price table), outcome (ok / error / failover), and a hash of the redacted prompt.
2. Usage is exported as OpenTelemetry metrics and shown on the SLA dashboard (FR-24 AC 3).
3. Configurable alert thresholds exist for per-call latency, per-case cost and hourly spend (FR-34).

### FR-31 — PAN tokenization and PII redaction
1. PANs are tokenized at intake through a tokenization-vault adapter (mocked). Everywhere outside the vault only tokens and last-4 are stored and displayed.
2. Every LLM request passes an egress filter that detects PAN-like sequences (13–19 digits passing the Luhn check, with separators) and configured PII (names, addresses, emails, phone numbers, account numbers, SSNs) and replaces them with placeholders. **If a PAN is detected after redaction, the call is blocked and fails closed** with an alert.
3. Placeholders are re-hydrated only in final rendered customer communications, through a server-side, template-controlled step. They are never re-hydrated in prompts.
4. Logs, traces and error messages pass through the same redaction. A test scans all logs and LLM payloads produced by the eval corpus and finds zero PANs (SM-5).

### FR-32 — Mocked integration adapters
1. Each external system has a typed adapter interface with a mock implementation: core ledger, card processor, Visa VROL, Mastercom, CRM, notifications (email/letter/SMS), and tokenization vault.
2. Mocks are deterministic under a seed. They support configurable latency, error injection (timeouts, 5xx, partial failures) and idempotency-key semantics that match FR-15/FR-16.
3. Swapping a mock for a real implementation needs only configuration plus a new adapter class. No changes to agents, policy or workflow (NFR-12).

### FR-33 — Synthetic data generator and seeded scenarios
1. A seeded generator produces synthetic accounts, cards (test-range PANs only), transactions, merchants and disputes across both regimes, both networks and all five categories.
2. A named scenario corpus covers at least these edge cases *(inferred)*:
   - holiday- and weekend-adjacent notices
   - new-account Reg E
   - POS/foreign 90-day extension
   - amount exactly at and over $500
   - low confidence
   - duplicate claim
   - unmatched transaction
   - expired network window
   - representment accepted and escalated to pre-arb
   - adapter outage
   - prompt-injection text in a narrative
   - PAN in free text.
3. Running the generator with the same seed produces byte-identical output.
4. The corpus can be loaded into a local stack with one command and drives the golden-case eval (NFR-10).

### FR-34 — Monitoring and alerting
1. Services emit OpenTelemetry traces and metrics: case throughput, state durations, queue depth, clock states, approvals latency, adapter errors, and LLM usage.
2. Alerts fire for:
   - a regulatory or network clock reaching **T-2 business days** without being satisfied
   - any clock breach
   - agent step errors over a configurable rate
   - LLM latency or cost spikes over configurable thresholds
   - audit-chain verification failure or anchoring failure
   - a PAN egress block.
3. Locally, alerts go to a mocked notification sink and the console. Alert rules are defined as code alongside the Terraform.
4. Each at-risk alert names the case, clock, due time and next required action.

### FR-35 — Handling-time measurement
1. The system records human active handling time per case: time spent on case detail/approval screens with interaction, idle-capped at a configurable timeout *(inferred)*, plus counts of human touches.
2. Handling time per case is reported against the configured baseline (AS-6) on the SLA dashboard and in an exportable report (SM-2).

### FR-36 — Case copilot: analyst conversation with the agent *(CR-1)*
1. Case detail (FR-22) has a copilot panel where a user with `case.read` can hold a multi-turn conversation with an agent about that case. Typical questions: why a reason code or outcome was chosen, what evidence is missing, which clock is nearest and what satisfies it, what changed since the last version of a draft.
2. Answers are grounded only in the case record the user is allowed to see. The agent receives a context bundle built by code from the case aggregate, scoped by role (an Auditor's bundle is PII-minimized, FR-26 AC 4), redacted and PAN-free (FR-31). It cannot fetch anything else.
3. Every factual sentence in an answer cites at least one case reference: evidence `E-n`, rule ID, clock, draft version or audit sequence number. Uncited sentences fail validation (same validator as FR-7 AC 4). After the retry limit the copilot replies "I can't answer that from the case record" instead of guessing.
4. The copilot can return **suggested actions** from a closed list: redraft a draft with an instruction, re-run an evidence item, add a case note, or draft a customer info request. A suggestion does nothing on its own. It appears as a button, and clicking it calls the normal API **as the human**, with the human's permissions. Users without `case.work` (Auditor, Admin) see no suggestions.
5. The copilot can never approve, reject or return a proposal, change a policy outcome, confidence score, clock or config, or send anything to a customer. No such action exists in its output schema. A redraft made through the copilot makes the requesting human the preparer (D-10), so four-eyes still needs a different approver.
6. Every turn is stored (redacted) and audit-logged with the user, model, prompt version and the citations. Transcripts are read-only, retained like other audit evidence (NFR-7), and visible on the case timeline. Copilot output is never an input to policy, confidence or replay (FR-28), so SM-3 is unaffected.
7. Instructions in case content (narratives, evidence, earlier turns) cannot change the copilot's scope or make it emit an action outside the closed list (NFR-9 AC 3).
8. Copilot use counts as interaction for handling time (FR-35).

### FR-38 — Investigation Co-Pilot: brief and read-only lookups *(CR-1)*
1. When a case is opened, the Co-Pilot writes an **investigation brief**: a headline, findings, evidence gaps, conflicting facts, risks with a level, and an ordered plan of next steps. Every item cites case records under the same rules as FR-36 AC 3.
2. Deterministic rule checks (for example a card-present purchase while the cardholder says the card never left them, or a clock at risk) are merged into the brief and labelled as rule-based, so the brief doesn't depend on the model noticing them.
3. The Co-Pilot can run **read-only lookups** from a closed list: other disputes at this merchant (aggregate only), earlier charges on this card at this merchant, how the card was read at the terminal, and merchant credits since the transaction. Lookups only read data about the case's own card, account and merchant (TD-59).
4. The model may choose a lookup when a question needs it. Code validates the choice against the list for this case and runs it as the asking user. At most one lookup runs per turn, and each case has a lookup limit.
5. A lookup result is added to the case as an evidence item marked with the lookup and the requesting user, is audit-logged, and queues the decision for re-evaluation. It never changes a policy outcome directly.
6. Only users who can work cases (Analyst, Supervisor) can run lookups. Others see the brief without lookup controls.
7. Plan steps can link to a pending proposal or a lookup. Taking that step still goes through the normal approval or lookup path.

### FR-37 — Cardholder chat agent *(CR-1)*
1. A cardholder authenticated in the simulated portal (OOS-8 as amended) can chat with an agent to **open a dispute**, **answer an outstanding evidence request** on their own case, **ask for the status** of their own case, or **ask for a person**.
2. The first message says that the cardholder is talking to an automated assistant, and how to reach a person (OQ-10).
3. **The LLM never writes text the cardholder sees (D-11).** An LLM task (`chat_understand`) only labels each cardholder message with an intent from a closed set and extracts slot values. A deterministic dialogue engine picks the next reply from a versioned, Compliance-approved reply library and fills its slots only from validated values: the cardholder's own transactions, case reference, status label and clock due dates.
4. To open a dispute, the dialogue collects the fields of FR-2 AC 1: the transaction (chosen from the cardholder's recent transactions, so no card number is typed), the category in plain language, a description, and when they learned of the error. Before submitting, the cardholder sees a summary and confirms it. The dispute then goes through the normal intake path (FR-1) with channel `chat`, and the redacted transcript is stored as the narrative.
5. **Notice time:** the Reg E/Z notice-received time is the timestamp of the first cardholder message that the dialogue labels as asserting an error on an identified transaction (OQ-11). If the cardholder abandons the chat after that point, a case is still created and routed to `needs_manual_completion`, so the clock is never lost.
6. Card numbers typed in chat are detected and tokenized at the edge before anything is stored (FR-31). The reply library asks the cardholder not to share card numbers.
7. Status answers use customer-safe status labels mapped from the case state, and state only dates the case record already holds. The chat never states or hints at an outcome, a credit or a denial that has not already been sent as an approved communication (FR-19).
8. Answers to an evidence request are attached to the case as customer-sourced evidence items and re-trigger investigation. They do not satisfy any notice clock.
9. "Talk to a person", two consecutive messages the engine cannot understand, or any out-of-scope intent ends the automated flow with a handoff reply and creates a callback task in the Analyst queue. There is no live human chat in the MVP.
10. Every turn (redacted), intent label, slot values, chosen reply template and its library version is audit-logged. Cardholder text is untrusted (FR-2 AC 5). Sessions are rate-limited per cardholder and time out after a configurable idle period.
11. The reply library is versioned policy-as-code. Each version records who approved it in Compliance. Changing it is an Admin config change with a reason (FR-25).

---

## 7. Non-functional requirements

### NFR-1 — Console and API performance
1. Console-facing API reads (queue, case detail, inbox, dashboard, audit search for one case) have **p95 < 500 ms**, not counting LLM calls, at a seeded load of 50k cases and 20 concurrent users *(inferred)*. Measured by a load-test script in CI/local.
2. Approve/reject API calls have p95 < 500 ms up to the point the proposal is durably committed. Adapter execution is asynchronous.

### NFR-2 — Capacity and scalability
1. The baseline design handles **~5,000 disputes/month** (≈ 250/business day) with one worker per agent task.
2. Scaling **10× (~50,000/month)** needs only more horizontal workers on the Postgres-backed queue, with no code changes. A load test at 10× peak daily intake processes the full backlog without any regulatory clock breach caused by system latency.
3. Queue consumers use `SKIP LOCKED` (or an equivalent) so N workers never process the same step at the same time. A concurrency test verifies this.

### NFR-3 — Availability and recovery
1. The target is **99.5% monthly availability** for API and console *(inferred)* in the hosted design. Locally this is shown with health/readiness endpoints for every service.
2. Losing any single worker or API instance loses no work. Clock timers and pending steps resume after restart (FR-20 AC 2–3).
3. The infrastructure-as-code specifies Postgres backup/restore and point-in-time recovery (RPO ≤ 5 min, RTO ≤ 1 h *(inferred)*), and both are documented.

### NFR-4 — Exactly-once effects and idempotency
1. Every external side effect (ledger posting, network filing, notification dispatch, audit anchor) carries a deterministic idempotency key. Fault-injection tests (crash before or after the adapter call, duplicate delivery) show zero duplicate effects.
2. Retries use bounded exponential backoff with jitter. A case-level error goes to a human after the retry limit is reached, and clocks keep running.

### NFR-5 — Security baseline
1. Data is encrypted in transit (TLS 1.2+ in the hosted design; local TLS optional) and at rest (managed-database/KMS encryption in the infrastructure-as-code; vault data encrypted at the application level locally).
2. No secrets in the repo. Locally they come from environment variables (`.env` is gitignored and never committed). In the hosted design they come from a managed secrets store. A secret scanner runs in CI with zero findings.
3. Dependencies are pinned. CI runs dependency vulnerability scanning with zero unresolved critical/high findings at certification.
4. Input validation is present on all endpoints. Responses are protected against OWASP Top-10 classes (injection, broken access control, XSS in rendered letters/console, SSRF in adapters). The Security role reviews this and records the result in `docs/CERTIFICATION.md`.
5. The console uses secure headers (CSP, no inline scripts, HSTS in the hosted design) and short-lived JWTs.

### NFR-6 — Data protection, PCI-DSS awareness and residency
1. The PAN-handling scope is limited to the tokenization vault component. The rest of the system is designed to stay out of PCI cardholder-data scope (documented data-flow diagram in ARCHITECTURE).
2. **US data residency:** the infrastructure-as-code targets US regions only. LLM providers other than local Ollama must be configured with a US-region endpoint, and config validation rejects a provider without a declared US region in non-local environments *(inferred)*.
3. PII access is limited by role, and the Compliance Auditor's views are minimized (FR-26 AC 4).
4. Synthetic data only. Card numbers come from test ranges.

### NFR-7 — Audit retention and tamper evidence
1. Retention for audit events and evidence is **7 years**. The policy is documented, and when anchoring is enabled the infrastructure-as-code sets object-lock retention to match.
2. Chain verification over 1M events completes in < 60 s *(inferred)*.

### NFR-8 — Observability
1. All services emit OpenTelemetry traces with case ID and correlation ID propagated across API, workflow and adapter calls, including LLM spans.
2. Logs are structured (JSON) and redacted (FR-31 AC 4).
3. A local docker-compose profile includes an OTel collector and a way to view traces and metrics.

### NFR-9 — Agent safety and guardrails
1. The LLM never makes money or denial decisions. Every action proposal's outcome traces back to a policy rule ID. A test asserts that no action proposal exists without a policy rule trace.
2. Agents have least-privilege tool access per task (FR-21 AC 3). No agent tool can approve an action.
3. Prompt-injection scenarios (FR-33) cannot change routing, outcome, tool calls or approval requirements. They pass 100% in the eval harness.
4. All LLM outputs are schema-validated, and invalid outputs never reach downstream steps.
5. Bedrock use follows the user-global rules: `AsyncAnthropicBedrock`, an application-inference-profile ARN, mandatory guardrail headers, and no hard-coded account, profile, role or guardrail IDs.

### NFR-10 — Quality and test strategy
1. **pytest** unit and integration tests for all backend components. Line coverage ≥ 80% on the clock engine, policy engine, approval/four-eyes logic, audit chain and redaction *(inferred)*.
2. **Property-based tests** (Hypothesis) for the clock engine and business-day calendar (FR-4 AC 8).
3. **Golden-case eval harness** for agent outputs over the seeded corpus. It reports extraction field accuracy, classification accuracy, reason-code agreement, citation validity, calibration (FR-9 AC 4) and injection resistance. Release gates are classification accuracy ≥ 95% and reason-code agreement ≥ 95% on the golden set *(inferred)*. CI uses a deterministic mock LLM provider.
4. **Playwright smoke tests** for the console: login per role, queue → case → approve, four-eyes denial, auto-approve toggle, audit verify.
5. **CI static checks:** `ruff`, `mypy` (strict on core packages), `tsc --noEmit`, and ESLint. All pass with zero errors.
6. CI runs fully offline with mocks and no paid LLM calls.

### NFR-11 — Determinism and reproducibility
1. The policy engine, clock engine, confidence computation, generator and mocks are deterministic for the same inputs, versions and seed.
2. Every artifact that affects a decision (policy, templates, prompts, config, mapping tables) is versioned, and its version is recorded on the decision (FR-28).

### NFR-12 — Extensibility
1. Adding a network (e.g. a future Amex adapter) needs only a new adapter class, a reason-code mapping table and a filing-window table. Tests use a stub third network to show that agents, workflow and policy core stay unchanged.
2. Adding an LLM provider needs only a gateway provider class and config.

### NFR-13 — Deployability and operability
1. `docker compose up` brings up the whole stack locally (Postgres, API, workers, console, OTel collector, mocks) with seeded users and an optional seeded corpus. Health checks go green within 2 minutes on a developer laptop *(inferred)*.
2. The infrastructure-as-code for the hosted container environments (dev/staging/prod) passes format checks, validation and a static security scan with no high findings. Only offline static checks are run. It is **never applied** (OOS-6).
3. Database schema changes are delivered as versioned migrations, and a fresh install and an upgrade both succeed in CI.

### NFR-14 — Usability and accessibility of the console
1. An Analyst can open a case from the queue and approve or reject its pending proposal in ≤ 3 clicks.
2. The console meets WCAG 2.1 AA for color contrast and keyboard navigation on the six primary screens *(inferred)*, verified by an automated axe check in Playwright.

---

## 8. Requirement-to-metric map

| Success metric | Primary requirements |
|---|---|
| SM-1 deadline compliance | FR-4, FR-5, FR-6, FR-11, FR-19, FR-20, FR-24, FR-34, NFR-2, NFR-3 |
| SM-2 handling time | FR-2, FR-3, FR-7, FR-10, FR-13, FR-22, FR-23, FR-35, FR-36, FR-37, NFR-14 |
| SM-3 reproducibility | FR-8, FR-9, FR-26, FR-28, FR-30, NFR-11 |
| SM-4 audit integrity | FR-26, FR-27, NFR-7 |
| SM-5 data protection | FR-1, FR-31, FR-36, FR-37, NFR-6 |

---

## 9. Assumptions, decisions and open questions

### 9.1 Assumptions
| ID | Assumption | Source |
|---|---|---|
| AS-1 | Reg E/Z timing parameters beyond those stated in discovery (new-account 20 business days, notice timings, 1-business-day correction, 5-business-day honoring) follow Reg E §1005.11 / Reg Z §1026.13 as commonly read. They are held as versioned config for Compliance to confirm. | inferred |
| AS-2 | Network filing/response windows and reason-code mappings (e.g. Visa 10.4/13.1/13.3/12.6/13.6; Mastercard 4837/4855/4853/4834/4860) are seeded from public summaries and are configurable. They are not authoritative network rules. | inferred |
| AS-3 | Reusable assets from `disputes-claims-decision-engine` (clock engine, calendar, policy-as-code, hash-chained ledger) are Python 3.14/SQLite. They will be ported to Python 3.12/Postgres, and their invariants (ML scores and drafts while policy decides; no auto-denial) are kept. That repo's calendar covers only 2025–2027 and must be extended (FR-4 AC 1). | prior art |
| AS-4 | Confidence is a composite of rule coverage, evidence completeness and model self-score. Weights and default thresholds (0.80 low / 0.90 high) are starting values that will be tuned on the golden set. | inferred |
| AS-5 | QA sample rate defaults to 10%. Customer communications always need approval, including in auto-approve mode. | inferred (conservative) |
| AS-6 | No real baseline handling-time data exists. SM-2 is measured against a configured baseline per category, which must be supplied by the business (OQ-2). | inferred |
| AS-7 | The local JWT issuer with seeded users is acceptable for the MVP. The OIDC configuration is shaped to accept a real IdP later. | inferred |
| AS-8 | Secrets come from env vars locally and from a managed secrets store in the hosted design. | inferred |
| AS-9 | Performance targets (p95 < 500 ms, 99.5% availability) and the quality-tool set (ruff, mypy, tsc, Playwright) are inferred defaults. | inferred |

### 9.2 Decisions log
| ID | Decision | Rationale | Date |
|---|---|---|---|
| D-1 | The agent never denies a claim autonomously. `resolve_against` always needs human approval, in both modes. | The human's money-movement and comms approval rules imply it. It matches the prior-art invariant and keeps regulatory risk low. | 2026-10-28 |
| D-2 | "Preparer" is the principal who created or last materially edited a proposal. Unedited agent drafts have the agent as preparer, so one human approval meets four-eyes. A human who edits a draft cannot approve it. | Keeps four-eyes meaningful without forcing two human touches per action, which would undercut SM-2. | 2026-10-28 |
| D-3 | Admins cannot approve case actions. Compliance Auditors are strictly read-only. | Separation of duties: whoever controls config should not also control approvals. | 2026-10-28 |
| D-4 | The auto-approve dollar threshold must be ≤ the Supervisor sign-off threshold, and config validation enforces it. | Stops auto-approve from bypassing the human's "> $500 needs Supervisor" rule. | 2026-10-28 |
| D-5 | The system **does not** auto-grant Reg E provisional credit when a deadline approaches without approval. It escalates instead (T-2 alert, priority bump, Supervisor visibility). | The human required approval for every money movement in default mode. Auto-granting would breach that. OQ-1 asks whether a fail-safe is wanted. | 2026-10-28 |
| D-6 | Regime (Reg E/Z) and network come from data deterministically, never from the LLM. Policy tables are authoritative for reason codes. | The LLM must not drive regulatory classification, and this protects reproducibility. | 2026-10-28 |
| D-7 | LLM outputs are replayed from the record during reproducibility checks. They are not regenerated. | LLMs are non-deterministic, while SM-3 requires exact reproduction. | 2026-10-28 |
| D-8 | Representment responses are never auto-approved. | Not listed by the human as auto-eligible (only provisional credit and chargeback filing). | 2026-10-28 |
| D-9 | Requests that are out of scope (ACH/P2P, Amex/Discover) are rejected at intake with a reason. Pre-arb/arbitration cases are kept and routed to a manual queue. | Follows the human's scope answer. | 2026-10-28 |
| D-10 | A draft changed through a copilot suggestion counts as an edit by the human who clicked it, who becomes the preparer (D-2). | Otherwise a human could launder their own edit through the agent and approve it themselves, defeating four-eyes. | 2026-10-29 |
| D-11 | The cardholder chat agent never sends LLM-generated text. Replies come only from a Compliance-approved, versioned reply library filled with validated values. Approval happens once per library version, not per message. | The human's rule is that every outbound customer communication is human-approved. Per-message approval would make live chat unusable, and free-form LLM replies could promise credit or misstate rights. Library-level approval is the closest fit, and it is still a change to the binding rule, so OQ-9 asks the human to confirm. | 2026-10-29 |

### 9.3 Open questions (for the design review gate)
| ID | Question | Default if unanswered |
|---|---|---|
| OQ-1 | If a Reg E provisional-credit deadline is about to be missed for lack of approval, should the system auto-grant provisional credit as a compliance fail-safe? | No (D-5). Escalate only. |
| OQ-2 | What is the current manual handling-time baseline per category for SM-2? | A placeholder baseline in config, flagged as unvalidated on the dashboard. |
| OQ-3 | Should auto-approve also cover customer notices that are pure regulatory acknowledgments (e.g. the Reg Z 30-day acknowledgment)? | No. All comms need approval (AS-5). |
| OQ-4 | Who in Compliance owns sign-off of the Reg E/Z parameters and the network window/reason-code tables? | Treated as unconfirmed seed data. Flagged in certification. |
| OQ-5 | Do new-account (20 business day / 90 day) Reg E rules apply to the issuer's portfolio, and what defines "new account"? | Applied, with "new" meaning an account open < 30 days per Reg E. |
| OQ-6 | Are letters needed in languages other than English? | English only. |
| OQ-7 | Should the configurable PII redaction list include merchant names, or are merchant names needed in prompts for classification quality? | Merchant names are allowed. Cardholder PII is redacted. |
| OQ-8 | Is audit anchoring to object-locked storage meant for every environment, or only staging and prod? | Off locally. On in the staging/prod variables. |
| OQ-9 | Does Compliance approval of a reply-library version satisfy "a human approves every outbound customer communication" for live chat replies (D-11)? | Yes for chat replies only. Letters, emails, SMS and notices that satisfy a regulatory duty still need per-item approval (FR-19). If the answer is no, FR-37 is limited to intake with a fixed acknowledgment. |
| OQ-10 | Which bot-disclosure wording is required, and should "talk to a person" connect to a live agent rather than a callback task? | Generic automated-assistant disclosure on the first message. Callback task only, no live handoff. |
| OQ-11 | When does a chat count as the Reg E/Z notice of error? | At the first cardholder message labelled as asserting an error on an identified transaction (FR-37 AC 5), the earlier and therefore conservative reading. |
