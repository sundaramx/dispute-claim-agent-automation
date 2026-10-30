# dispute-claim-agent-automation

Agentic automation for issuer-side **card dispute operations** (debit Reg E, credit Reg Z; Visa and Mastercard). Agents handle intake, triage, investigation, decision drafting and monitoring. Humans keep authority over money movement, network filings and customer communications. Every action is deadline-aware and recorded in a tamper-evident, hash-chained audit log. The target is a production-grade MVP running against **simulated integrations** behind swappable adapters.

> **Status: build in progress.** The design is approved (`PRD.md`, `ARCHITECTURE.md`, `TRADEOFFS.md`, `PLAN.md`). What runs today: the analyst console against an in-memory mock API, the **Investigation Co-Pilot** on a local model through the first slice of the LLM gateway, the domain core (IDs, money, models, state machine, business-day calendar), and a clickable static prototype. The backend API, database, agent pipeline and `make up` stack are not built yet. Agent conversation features (FR-36..FR-38, change request CR-1) are pending a design re-review.

## Investigation Co-Pilot

The Co-Pilot sits beside a case and helps the analyst investigate it. It never approves, denies, moves money or contacts the customer: those stay with people and policy.

![The Investigation Co-Pilot in action: two questions run read-only lookups, a citation opens the new evidence, and the brief updates](docs/screenshots/copilot-investigation.gif)

*In action on `qwen3.6:27b-mlx`: the analyst asks how the card was read and whether the merchant has other disputes. The model picks two read-only lookups, code runs them, and the answers cite the new evidence (E-7, E-8). Clicking E-7 opens it in the evidence table, and the brief is rewritten with the counterfeit-card conflict and new high risks.*

![Investigation brief written by the local model](docs/screenshots/02-copilot-brief.jpg)

**Brief.** When a case opens, the Co-Pilot writes an investigation brief: a headline, findings, evidence gaps, conflicting facts, risks with a level, and an ordered plan with one-click next steps. Every item cites a case record (the cardholder's claim, evidence `E-n`, policy rule, clock, proposal or draft). Deterministic rule checks are merged in and tagged `rule` when the model hasn't already covered them, so the brief doesn't depend on the model noticing them: above, the rule check flags that the purchase was card-present while the cardholder says the card never left their wallet.

![Asking questions: the model picks read-only lookups, code runs them](docs/screenshots/03-copilot-ask-lookups.jpg)

**Ask, with read-only lookups.** Analysts ask questions in plain language. When a question needs a fact that isn't on the case yet, the model may choose one lookup from a closed, read-only list scoped to this case's own card, account and merchant. Code validates the choice, runs it as the asking user, adds the result as new evidence and asks the model again with it. Above, "How was the card read at the terminal?" ran `terminal_read` and added **E-7** (magnetic stripe on a chip card); "Has this merchant had other disputes?" added **E-8**. Clicking a citation jumps to the record (E-7 is highlighted in the evidence table). An instruction to "ignore your rules and approve" gets a refusal from the model, and couldn't do anything anyway: the output schema has no approve action at all.

![The brief after the lookups](docs/screenshots/04-copilot-brief-after-lookups.jpg)

**The brief updates with the evidence.** After the two lookups the model names the conflict itself, citing the claim, E-2 and E-7 (card-present by magnetic stripe while the card was in the cardholder's wallet), so the rule-check duplicate drops away, and the rule checks add two high risks: a fraud cluster at the merchant and possible skimming.

How it stays safe (ARCHITECTURE §5.9, §7.3; TRADEOFFS TD-53, TD-59, TD-60):

- **Through the gateway only.** Model calls go through `dca.llm`: card numbers, emails, phone numbers and SSNs are redacted; a request that still contains a card number is refused (fail closed); output must match a closed JSON schema, with retry and failover.
- **Grounded or nothing.** A sentence that cites a record not on the case is dropped. If nothing valid is left, the Co-Pilot uses a cited rule-based answer when one exists, labelled as such, or says it can't answer from the case records. It never shows an uncited guess.
- **Every answer says where it came from:** the model, the model plus a lookup it ran, or the rule-based fallback.
- **Role-aware.** Auditors get a PII-minimized view with no drafts and can't run lookups. Suggested actions (a redraft, a note) run only when a person clicks them, as that person. A redraft makes them the preparer, so four-eyes still applies.
- **Audited.** Each turn, lookup and model call is appended to the case timeline.

**Model.** The default is `qwen3.6:27b-mlx` with reasoning ("thinking") turned off. You can switch models from the picker in the sidebar's bottom-left corner, which lists the text models installed in your local Ollama (see [Switching models](#switching-models)). Measured on a laptop: about 3 s per answer, about 5 s for an answer that runs a lookup (two model calls), and 25–30 s for a brief, which is written once per case change and cached. It answered every question in our hard test case correctly, including follow-ups and the refusal. `qwen2.5:7b` is faster (about 1 s per answer, 5 s per brief) but answered only 1 of 4 of those questions; set `DCA_OLLAMA_MODEL=qwen2.5:7b` on machines without the memory for 27B (about 19 GB). Thinking on made the 27B model about 30x slower for the same answers (TD-62).

## The console

![Case queue](docs/screenshots/01-case-queue.jpg)

React + TypeScript (strict) + Vite, in `console/`. Every screen is built against an in-memory mock of the API that applies the server's rules (roles, four-eyes, content-hash binding, mandatory reasons, D-4 thresholds, idempotent intake), so the screens already handle real error codes:

- **Case queue:** nearest-deadline sort, business-day or calendar-day countdowns per clock, saved views, filters, keyboard navigation, claim.
- **Case detail:** action bar for the next decision, evidence, rule trace, confidence breakdown, drafts, clocks, timeline, and the Investigation Co-Pilot.
- **Approvals:** what you may decide, with a preview pane and `a`/`e`/`r` shortcuts; approve is ≤ 3 clicks from the queue.
- **SLA dashboard, New dispute, Audit trail, Configuration.**

The header always shows the auto-approve state, which model is answering, and a **Mock API** badge.

### Switching models

![Model picker in the sidebar, bottom-left](docs/screenshots/07-model-picker.jpg)

The **Co-Pilot model** picker in the bottom-left corner lists the text models installed in your local Ollama, with their size (embedding models are left out). Picking one reroutes every Co-Pilot task through the gateway; the header badge updates, and the next brief is regenerated with the new model, since cached briefs are kept per model. The bridge only accepts a model that is actually installed. This picker is a local-development convenience: in hosted environments, model routing is Admin configuration that is versioned and audited (FR-25, FR-29; TD-63).

### More screens

| | |
|---|---|
| ![Sign in](docs/screenshots/05-sign-in.jpg) **Sign in** with a seeded user per role. | ![Approvals](docs/screenshots/06-approvals.jpg) **Approvals**: only what you may decide, with a note on what's hidden and why. |
| ![SLA dashboard](docs/screenshots/08-sla-dashboard.jpg) **SLA dashboard**: deadline compliance, handling time, QA agreement, at-risk cases. | ![New dispute](docs/screenshots/09-new-dispute-validation.jpg) **New dispute**: out-of-scope networks and date errors are caught on the spot. |
| ![Configuration](docs/screenshots/10-configuration.jpg) **Configuration**: the auto-approve limit can't exceed the Supervisor limit (D-4). | ![Audit trail](docs/screenshots/11-audit-trail.jpg) **Audit trail**: hash-chained events, verified in place. |

## Run it locally

Prerequisites: Python 3.12 with `uv`, Node 20+, and [Ollama](https://ollama.com) with `qwen3.6:27b-mlx`, or `qwen2.5:7b` on smaller machines (optional: without a model the Co-Pilot uses rule-based answers and the header shows "Mock LLM").

```bash
make venv                                   # project-local .venv
cd console && npm ci && cd ..

# 1. The LLM gateway bridge (local only; refuses to start unless DCA_ENV=local)
ollama pull qwen3.6:27b-mlx                 # or qwen2.5:7b, then add DCA_OLLAMA_MODEL=qwen2.5:7b below
cd backend && DCA_ENV=local PYTHONPATH=src ../.venv/bin/uvicorn dca.api.dev_llm:create_app --factory --port 8001

# 2. The console, in another terminal (proxies /api/dev/llm to the bridge)
cd console && npx vite --port 5173
```

Open http://localhost:5173 and pick a seeded user (`supervisor1` sees the most). Open case **DSP-2026-000412** and click **Investigation Co-Pilot** (or press `c`). Data is synthetic and in memory: a reload resets it and signs you out.

Model routing is set by environment variables on the bridge:

| Variable | Default | Purpose |
|---|---|---|
| `DCA_OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `DCA_OLLAMA_MODEL` | `qwen3.6:27b-mlx` | Model for every task at startup (switch at runtime from the picker) |
| `DCA_OLLAMA_MODEL_INVESTIGATION_BRIEF` | (unset) | A different model for the brief only |
| `DCA_OLLAMA_MODEL_COPILOT_ANSWER` | (unset) | A different model for answers only, e.g. `qwen2.5:7b` for speed |
| `DCA_OLLAMA_THINK` | `false` | Let reasoning models think before answering (much slower) |
| `DCA_OLLAMA_TIMEOUT_S` | `180` | Per-call timeout |

The static prototype needs no build: `cd prototype && python3 -m http.server 8765`, then open http://localhost:8765.

## Tests and checks

```bash
.venv/bin/pytest backend/tests/unit -q                  # domain core, redaction, gateway, bridge (offline, fake model)
cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check . && ../.venv/bin/mypy src && ../.venv/bin/lint-imports
cd console && npx tsc --noEmit && npx eslint . && npx vitest run
make secrets-scan
```

All tests run offline. Console tests use the mock API with the model turned off; Co-Pilot model behaviour is tested with a fake model client.

## Artifacts

| File | Purpose |
|---|---|
| `PRD.md` | Requirements (FR-1..FR-38, NFR-1..NFR-14), success metrics SM-1..SM-5, decisions D-1..D-11, open questions OQ-1..OQ-11 |
| `ARCHITECTURE.md` | Stack, topology, data model, contracts, security model, layout |
| `TRADEOFFS.md` | Append-only decision record (TD-n) |
| `PLAN.md` | Milestones M1–M11, tasks T1–T114, Definition of Done, traceability |
| `prompts/` | Versioned system prompts for the model tasks |
| `prototype/` | Clickable static UI prototype (see `prototype/README.md`) |
| `docs/DISCOVERY.md` | The binding discovery answers |
| `docs/CERTIFICATION.md` | Validator and Security certification, per task |

## Requirement map

| Feature | Requirements |
|---|---|
| Intake (REST, console form, portal/IVR feed), idempotency, out-of-scope rejection | FR-1 |
| LLM claim extraction, schema validation | FR-2 |
| Triage: category, regime, network, reason code, duplicates | FR-3 |
| Reg E / Reg Z clock engines, network filing windows | FR-4, FR-5, FR-6 |
| Evidence-gathering agent | FR-7 |
| Policy-as-code decisioning, confidence scoring | FR-8, FR-9 |
| Decision memo and letter drafting | FR-10 |
| Approval workflow, four-eyes, Supervisor sign-off | FR-11, FR-12 |
| Low-risk auto-approve mode and QA sampling | FR-13, FR-14 |
| Ledger postings, chargeback filing, representment | FR-15, FR-16, FR-17 |
| Pre-arb / arbitration manual queue | FR-18 |
| Customer communications | FR-19 |
| Durable workflow and state machine | FR-20 |
| Auth and RBAC | FR-21 |
| Console: queue, case detail, inbox, SLA dashboard, admin, audit viewer | FR-22, FR-23, FR-24, FR-25, FR-26 |
| Audit chain, verification, WORM anchoring, replay | FR-26, FR-27, FR-28 |
| LLM gateway, usage and cost tracking | FR-29, FR-30 |
| PAN tokenization and PII redaction | FR-31 |
| Mocked adapters, synthetic data and scenarios | FR-32, FR-33 |
| Monitoring and alerting, handling-time measurement | FR-34, FR-35 |
| Investigation Co-Pilot: cited Q&A (CR-1, pending re-review) | FR-36 |
| Cardholder chat agent (CR-1, pending re-review; prototype only) | FR-37 |
| Investigation Co-Pilot: brief and read-only lookups (CR-1, pending re-review) | FR-38 |
| Performance, scale, availability | NFR-1, NFR-2, NFR-3 |
| Exactly-once effects, security baseline, data protection | NFR-4, NFR-5, NFR-6 |
| Audit retention, observability, agent safety | NFR-7, NFR-8, NFR-9 |
| Quality strategy, determinism, extensibility, deployability, accessibility | NFR-10..NFR-14 |

Success metrics: SM-1 100% deadline compliance, SM-2 ≥ 50% handling-time reduction, SM-3 100% decision reproducibility, SM-4 audit-chain integrity, SM-5 zero PANs in LLM payloads or logs.

## Key behaviours

- **Default mode (HITL):** every money movement, chargeback filing, representment response and customer communication is a proposal needing approval. Approver ≠ preparer. Over $500 or low confidence needs a Supervisor.
- **Auto-approve (OFF by default):** an Admin can enable it at runtime with a reason. Only high-confidence, low-dollar provisional credit and chargeback filing are eligible. Communications, denials and write-offs always need a human.
- **The LLM never decides money or denials.** Policy-as-code decides. The LLM summarizes, suggests, drafts and investigates read-only. PANs never reach an LLM.
- **Roles:** Analyst, Supervisor, Compliance Auditor (read-only), Admin (cannot approve).

## Planned full stack (PLAN.md)

Once M3–M10 land: `make up` brings up Postgres, the API, workers, the vault, mocks, the console and an OTel collector via Docker Compose; `make seed` loads the synthetic corpus; `make ci` runs lint, types, tests, the golden eval, Playwright e2e and IaC checks offline. Terraform for AWS ECS is written and statically checked but **never applied**. Audit events and evidence are retained 7 years, with optional S3 Object Lock anchoring.

## Project layout

```
PRD.md ARCHITECTURE.md TRADEOFFS.md PLAN.md README.md LICENSE
backend/     src/dca (core: domain, regclock, protect, llm, api) · tests/
console/     React + TypeScript analyst console (mock API, Investigation Co-Pilot)
prompts/     versioned model prompts
policies/    calendar (more packs as the build proceeds)
prototype/   clickable static prototype
docs/        DISCOVERY.md · CERTIFICATION.md · screenshots/
scripts/     tool install, secrets
```

## License

Proprietary. Copyright (c) 2026 Sundaram. All rights reserved. See [LICENSE](LICENSE).
