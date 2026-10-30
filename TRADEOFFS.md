# TRADEOFFS — dispute-claim-agent-automation

> **Append-only** decision record. Owner: Architecture. Never edit or delete an entry. To change a decision, append a new entry that names the one it supersedes ("Supersedes TD-n").
> Each entry covers: **Options considered** · **Choice made** · **Why** (trade-offs / optimized-for / gave-up) · **Date**.
> IDs (`TD-n`) are cited from `ARCHITECTURE.md`. Requirement IDs (`FR-n`, `NFR-n`, `D-n`, `AS-n`, `OQ-n`) are the PRD's.
> Standards: quality floor only (no company pack). Nothing here deviates from a company golden path, because none applies.

## Index of inferred discovery defaults

The human did not state these values. Discovery (`docs/DISCOVERY.md`, marked *(inferred)*) or the PRD's assumptions and open questions inferred them. Each one has its own entry so the review gate can confirm or override it.

| Inferred default | Origin | Entry |
|---|---|---|
| Network filing windows per reason code (seeded, unconfirmed) | DISCOVERY "Regulatory clocks", AS-2, OQ-4 | TD-33 |
| QA sample rate 10% | DISCOVERY "Low-risk auto-approve", AS-5 | TD-34 |
| Customer comms still need approval in auto-approve mode | DISCOVERY "Low-risk auto-approve", AS-5, OQ-3 | TD-35 |
| OIDC-compatible JWT, seeded users, SSO-ready | DISCOVERY "Roles and RBAC", AS-7 | TD-9 |
| Free text is LLM-extracted and then validated (retry 2 → manual) | DISCOVERY "Intake channels", FR-2 | TD-36 |
| Confidence = composite of rule coverage, evidence completeness, model self-score | DISCOVERY "Decisioning", AS-4 | TD-26 |
| Confidence thresholds 0.80 low / 0.90 high | FR-9, AS-4 | TD-37 |
| Secrets: env vars locally, AWS Secrets Manager in Terraform | DISCOVERY "Data protection", AS-8 | TD-29 |
| Synthetic data generator + seeded scenarios for all categories and edge cases | DISCOVERY "Integrations", FR-33 | TD-38 |
| 99.5% availability, console p95 < 500 ms, compose healthy in < 2 min | DISCOVERY "Scale", AS-9, NFR-1/3/13 | TD-39 |
| Quality tooling: ruff, mypy, tsc, Playwright (+ ESLint, Hypothesis, scanners) | DISCOVERY "Quality", AS-9 | TD-20 |
| Reg E/Z timing parameters beyond those stated; "new account" < 30 days | AS-1, OQ-5 | TD-40 |
| RPO ≤ 5 min / RTO ≤ 1 h | NFR-3 AC 3 | TD-41 |
| US-region enforcement for non-local LLM providers | NFR-6 AC 2 | TD-42 |
| Handling-time idle cap + placeholder baseline | FR-35, AS-6, OQ-2 | TD-43 |
| Coverage ≥ 80%, eval gates ≥ 95%, ECE ≤ 0.10, audit verify 1M events < 60 s | NFR-10, FR-9 AC 4, NFR-7 AC 2 | TD-44 |
| WCAG 2.1 AA on six primary screens | NFR-14 AC 2 | TD-45 |
| English-only letters | OQ-6 | TD-46 |
| S3 anchoring off locally, on in staging/prod; 15-min interval | OQ-8, FR-27 | TD-47 |
| Auto-approve dollar threshold $100; allow-list all categories | FR-13 (value not stated by the human) | TD-48 |
| No auto provisional credit at deadline (escalate only) | D-5, OQ-1 | TD-13 |
| Issuer timezone, 17:00 cut-off, calendar coverage 2025–2030 | FR-4 AC 1/8 | TD-14 |
| Merchant names allowed in prompts; cardholder PII redacted | OQ-7 | TD-30 |
| Ollama default model, CI mock, LLM budgets and breaker values | FR-29/30 (values not stated) | TD-16 |
| Retry/backoff/lease values | NFR-4 (values not stated) | TD-5 |
| Clock sweeper cadence 60 s | FR-34 (cadence not stated) | TD-18 |
| API rate limit 120/min, idempotency TTL 30 days | FR-1 AC 2 (values not stated) | TD-28 |
| Reg Z "in dispute" hold executes without approval | FR-5 AC 3 vs. approval list | TD-32 |

---

## TD-1 — Backend language and framework

- **Options considered:**
  - Python 3.12 + FastAPI + Pydantic v2
  - Django + DRF
  - TypeScript (NestJS/Fastify)
  - Go
- **Choice made:** Python 3.12, FastAPI, Pydantic v2.
- **Why:**
  - **Specified and reusable.** The human specified this stack. Every reusable asset is Python: the clock engine, calendar, policy engine and hash-chained ledger from `disputes-claims-decision-engine`, and `llm_client.py` from `autonomous-ds-agent`.
  - **Fit.** Async I/O suits a workload dominated by adapter and LLM calls. Pydantic models serve as API contracts, DB DTOs *and* LLM output schemas (FR-29 AC 6).
  - **Optimized for:** asset reuse and the LLM-SDK ecosystem.
  - **Gave up:** Go's throughput and single-binary deploys, and Django's built-in admin.
  - **Porting note:** the prior project runs on Python 3.14, so ported code must avoid 3.13+ syntax and stdlib features. mypy is pinned to `python_version = 3.12`.
- **Date:** 2026-10-28

## TD-2 — Python packaging and dependency pinning

- **Options considered:**
  - pip + `requirements.txt`
  - Poetry
  - uv with `pyproject.toml` + `uv.lock`
- **Choice made:** uv, with a committed `uv.lock`.
- **Why:**
  - **Fixes a landmine.** The prior project had no requirements file, and its versions were unpinned. A lockfile gives reproducible installs and is a prerequisite for `pip-audit` (NFR-5 AC 3).
  - **Proven.** uv is already the choice in the `autonomous-threat-detection` design. It is fast in CI and in Docker layers.
  - **Gave up:** Poetry's familiarity for some contributors.
- **Date:** 2026-10-28

## TD-3 — System-of-record datastore

- **Options considered:**
  - PostgreSQL 16, single cluster, schemas `dca` + `vault`
  - SQLite (the prior project's store)
  - Postgres plus a separate event store (EventStoreDB/Kafka)
  - DynamoDB
- **Choice made:** PostgreSQL 16. One database with two schemas (`dca` for the app, `vault` for PCI) and four DB roles. RDS in the hosted design, with RDS Proxy optional.
- **Why:**
  - **One transaction for everything.** Case state, the next workflow step, the effects outbox and the audit append commit in a single transaction (§5.1). This removes the "posted but not audited" class of bug.
  - **Grants and triggers** give real append-only enforcement (FR-26 AC 3), which SQLite cannot.
  - **Specified.** The human specified Postgres.
  - **Optimized for:** atomicity, auditability and operational simplicity.
  - **Gave up:**
    - Physical isolation of the vault store. Hosted, it could move to its own RDS instance with no code change, because only the vault service touches it.
    - Write scale-out beyond a single primary, which is unnecessary at ≤ 50k cases/month.
- **Date:** 2026-10-28

## TD-4 — Data access and migrations

- **Options considered:**
  - SQLAlchemy 2.0 + psycopg 3 + Alembic
  - asyncpg with hand-written SQL everywhere
  - SQLModel
  - Django ORM
- **Choice made:** SQLAlchemy 2.0 (Core + ORM) on psycopg 3, with Alembic migrations. Hand-written, parameterized SQL is used on the queue-claim and audit-append hot paths.
- **Why:**
  - Typed models, mature versioned migrations (fresh install + upgrade, NFR-13 AC 3), and bound parameters by default (T10).
  - psycopg 3 serves both the sync CLI and async workers.
  - **Gave up:** asyncpg's raw speed, which is irrelevant at this volume, and SQLModel's terseness, which is less mature for complex Core queries.
- **Date:** 2026-10-28

## TD-5 — Durable workflow engine

- **Options considered:**
  - Temporal
  - Celery + Redis
  - procrastinate
  - pgqueuer
  - DBOS
  - A hand-rolled Postgres queue (`workflow_steps`) + transactional outbox (`effects`) using `FOR UPDATE SKIP LOCKED`, leases and DB-resident timers
- **Choice made:** the hand-rolled Postgres queue + outbox. Defaults *(inferred)*: lease 30 s, heartbeat at lease/3, exponential backoff with full jitter (base 2 s, cap 5 min, max 8 attempts), then a human (`needs_attention`) with clocks still running.
- **Why:**
  - **Specified.** The human required a Postgres-backed durable workflow.
  - **Same transaction.** The step must commit in the *same* transaction as the domain write, the audit append and the executor's authorization re-check (§5.1–5.2).
  - **Why not the alternatives:**
    - Temporal adds a cluster, a second source of truth and deterministic-replay constraints on workflow code.
    - Celery + Redis breaks atomicity and adds a broker.
    - procrastinate, pgqueuer and DBOS are viable, but each couples us to its schema, worker model and upgrade cadence, all to replace about 300 LOC that we must fault-test anyway.
  - **Optimized for:** atomic, auditable, zero-extra-infrastructure execution.
  - **Gave up:** a workflow UI, built-in cron and battle-tested edge-case handling. Mitigations: fault-injection and concurrency tests (AR-4), and `dca workflow inspect|retry`.
- **Date:** 2026-10-28

## TD-6 — Agent pattern

- **Options considered:**
  - LLM-as-function steps orchestrated by deterministic code
  - LangGraph/LangChain agents
  - A provider-native tool-use loop, where the model picks tools
  - Multi-agent frameworks (CrewAI/AutoGen)
- **Choice made:** LLM-as-function. Each agent step calls the gateway for a schema-constrained output, and code decides routing, tools and outcomes. The model has no tools.
- **Why:**
  - **Injection-proof by construction.** An injected instruction has nothing to call (NFR-9 AC 3).
  - **Replayable.** Recorded outputs replay exactly (FR-28, D-7), and every step is unit-testable with a mock provider.
  - **Matches the human's split:** autonomy over intake, triage, evidence and drafting, and humans over effects.
  - **Optimized for:** safety, determinism and certifiability.
  - **Gave up:** open-ended investigation, where an agent decides which evidence to fetch. Policy-defined checklists replace it (FR-7 AC 2). The design is also less flexible for novel case types.
- **Date:** 2026-10-28

## TD-7 — LLM gateway implementation

- **Options considered:**
  - An in-house `dca.llm` gateway: the vendored `autonomous-ds-agent` `llm_client.py` plus a design port of `optimus` router/metering
  - LiteLLM (library or proxy)
  - Direct provider SDKs in each agent
  - Running `optimus` as a sidecar service
- **Choice made:** the in-house gateway, the only module allowed to import provider SDKs (import-linter enforced).
- **Why:**
  - **Rules it must enforce:**
    - the user-global Bedrock rules: `AsyncAnthropicBedrock`, a full inference-profile ARN, *mandatory* guardrail headers, and auth-refresh command with TTL refresh
    - a fail-closed PAN egress block
    - per-task routing with failover, and recorded outputs for replay
  - **Why not the alternatives:**
    - LiteLLM's Bedrock path does not use `AsyncAnthropicBedrock`, and its proxy adds a service.
    - Direct SDKs scatter policy across agents.
    - `optimus` is TypeScript, so it would add a runtime and a network hop.
  - **Optimized for:** policy enforcement at a single choke point.
  - **Gave up:** LiteLLM's broad provider catalogue and maintained price tables. Prices live in config instead.
- **Date:** 2026-10-28

## TD-8 — Policy-as-code format

- **Options considered:**
  - Versioned YAML packs + a pure Python evaluator (ported from `disputes-claims-decision-engine`)
  - OPA/Rego
  - A DMN decision-table engine
  - Rules stored in DB tables
  - Plain Python rule functions
- **Choice made:** YAML packs with a pure Python evaluator. Pack version = SHA-256 of canonical content + a semantic label. Invariants (`INV-NO-AUTO-DENIAL`, `INV-OUTCOME-HAS-RULE`, `INV-LLM-CANNOT-OVERRIDE`) live in code, outside any pack.
- **Why:**
  - **Reuse.** The engine is reused, and packs are diffable and reviewable by Compliance.
  - **Determinism.** Content-hash versioning makes replay exact (FR-8, NFR-11).
  - **Why not the alternatives:** OPA adds a sidecar and a new language. DB-stored rules are hard to diff and review. Plain Python mixes policy with code changes.
  - **Gave up:** OPA's policy-testing ecosystem and any non-engineer rule-editing UI.
- **Date:** 2026-10-28

## TD-9 — Authentication model *(inferred discovery default)*

- **Options considered:**
  - OIDC-compatible RS256 JWTs verified against a configurable issuer/audience/JWKS, plus a built-in dev issuer with seeded users (local only)
  - Keycloak in compose
  - Server sessions with a local user table
  - Auth deferred
- **Choice made:** OIDC-compatible JWTs, with the dev issuer mounted only when `DCA_ENV=local` (the process refuses to start otherwise). Access-token TTL 15 min. The console keeps tokens in memory only. With a real IdP, the SPA uses Auth Code + PKCE.
- **Why:**
  - **Discovery default.** SSO-ready auth with seeded users was inferred in discovery (AS-7). A real IdP swaps in by config only (OOS-10).
  - **Why not the alternatives:** Keycloak is heavy to configure and run for an MVP. Sessions are not SSO-shaped.
  - **Optimized for:** a low-friction local setup with a production-shaped token contract.
  - **Gave up:** realistic IdP behaviour locally (refresh tokens, MFA). Reloading the page means logging in again locally.
- **Date:** 2026-10-28

## TD-10 — Console framework

- **Options considered:**
  - React + TypeScript (strict) + Vite SPA
  - Next.js
  - Server-rendered Jinja/HTMX
  - React with a heavy component kit (MUI/Ant)
- **Choice made:** React + TS + Vite, with React Router, TanStack Query and plain CSS design tokens lifted from `prototype/`. Served as a static bundle by nginx.
- **Why:**
  - **Specified.** The human specified React/TypeScript.
  - **CSP.** A static bundle allows a strict CSP with no inline scripts (NFR-5 AC 5).
  - **Fidelity.** Tokens from the prototype keep the build faithful to the reviewed design.
  - **Gave up:** SSR (not needed for an internal tool) and a ready-made component library. That means more hand-written CSS, and accessibility must be proven with axe (TD-45).
- **Date:** 2026-10-28

## TD-11 — Simulated integrations

- **Options considered:**
  - One `mocks` HTTP service (FastAPI) for all externals, plus in-process fakes for unit tests
  - In-process fakes only
  - WireMock/Prism from OpenAPI stubs
- **Choice made:** the `mocks` HTTP service, plus in-process fakes.
- **Why:**
  - **Realistic boundary.** The adapter boundary is a real network hop, so timeouts, 5xx errors, idempotency-key semantics and the SSRF surface behave as they will with real systems (FR-32).
  - **Logic stub servers can't express.** Seeded outcome simulation (accept/representment/reject) and stateful idempotency are awkward in WireMock.
  - **Gave up:** one more container, and mock code that must be maintained.
- **Date:** 2026-10-28

## TD-12 — PAN tokenization

- **Options considered:**
  - A separate `vault` service with its own schema, DB role and key (AES-256-GCM, random tokens)
  - Tokenizing inside the API process
  - Format-preserving encryption
  - A third-party vault (e.g. VGS), mocked
- **Choice made:** a separate vault service. Random `tok_…` tokens, a keyed HMAC fingerprint for de-duplication, and **no detokenize endpoint** exposed to core in the MVP.
- **Why:**
  - **Scope.** It shrinks the PCI cardholder-data environment to one component (NFR-6 AC 1).
  - **No linkage.** Random tokens have no mathematical link to the PAN, unlike FPE.
  - **Nothing needs the PAN downstream,** because adapters work on tokens.
  - **Gave up:** an extra network hop on intake, and one more service and image.
- **Date:** 2026-10-28

## TD-13 — No automatic provisional credit at the Reg E deadline *(inferred default for OQ-1)*

- **Options considered:**
  - Keep the prior engine's `INV-PC-GUARANTEE` (auto-post provisional credit at the investigate deadline)
  - Escalate only: T-2 alert, priority bump, Supervisor visibility, breach alert
  - A fail-safe auto-PC behind its own Admin toggle
- **Choice made:** escalate only (D-5). `INV-PC-GUARANTEE` is removed from the ported engine. The design leaves room for a future `R-FAILSAFE-PC` rule as a B3 auto-action behind its own toggle.
- **Why:**
  - **The human's rule wins.** The human required human approval for every money movement in default mode, and auto-posting would break it.
  - **Optimized for:** the explicit HITL mandate.
  - **Gave up:** a structural guarantee for SM-1. A missed approval can now cause a breach, which is mitigated by T-2 alerts and inbox ordering.
  - **Flagged at the review gate** as OQ-1.
- **Date:** 2026-10-28

## TD-14 — Business-day time semantics and calendar coverage *(inferred default)*

- **Options considered:**
  - Compute business days on UTC dates
  - Issuer timezone + daily cut-off
  - Cardholder-local timezone
- **Choice made:**
  - Issuer timezone `America/New_York` with a 17:00 local cut-off. A notice received after the cut-off or on a non-business day counts from the next business day.
  - Holidays move from hard-coded code into `policies/calendar/us-business-days.yaml`, covering 2025–2030.
  - Any date outside coverage raises `CalendarCoverageError`, which fails loudly and alerts (FR-4 AC 1). A warning alert fires 180 days before coverage ends.
- **Why:**
  - **Regulatory basis.** Reg E lets the institution define its business day, and one issuer timezone is deterministic and replayable.
  - **Fixes a landmine.** It removes the prior project's silent 2028+ miscount.
  - **Gave up:** cardholder-local fidelity. The values need Compliance confirmation (OQ-4).
- **Date:** 2026-10-28

## TD-15 — Audit chain topology

- **Options considered:**
  - A single global hash chain appended inside the command transaction under `pg_advisory_xact_lock`
  - Per-case chains
  - Asynchronous append after commit (via outbox)
  - An external ledger DB (QLDB, now end-of-life; immudb)
- **Choice made:** a single global chain, appended in-transaction with the lock taken last. Hash material: prev_hash, seq, ts, actor, case, event type, payload digest, policy/config/model versions. Payloads are separated by digest for PII (FR-26 AC 4). Verify target *(inferred)*: 1M events < 60 s.
- **Why:**
  - **Order and completeness.** Gap-free total ordering, atomic with state, so no event can be lost or reordered relative to the state it describes.
  - **Reuse.** It reuses the proven ledger design.
  - **Why not the alternatives:** per-case chains make whole-log tamper evidence weaker without anchoring. Async append opens a gap window. External ledgers add infrastructure.
  - **Optimized for:** tamper evidence and simplicity.
  - **Gave up:** write parallelism. Every commit serializes on the lock for milliseconds (AR-2). That is measured in the NFR-2 load test, and the fallback is partitioned chains + a merkle roll-up.
- **Date:** 2026-10-28

## TD-16 — Default LLM model, CI provider, budgets and breaker *(inferred default)*

- **Options considered:**
  - Local default model: `qwen2.5:7b-instruct`, `llama3.1:8b-instruct`, or a larger 14B–32B model
  - CI provider: mock, or a small real local model
  - Budgets: hard caps or alert-only
- **Choice made:**
  - **Local route:** `ollama:qwen2.5:7b-instruct`. **CI route:** `mock:golden` (deterministic). `mock` is forbidden by config validation in `dev`, `staging` and `prod`.
  - **Budgets:** per-case cost hard cap of $0.50 (exceeding it routes the case to an Analyst); hourly spend alert at $20; latency p95 alert at 8 s.
  - **Breaker:** 5 failures in 60 s, half-open after 30 s.
  - All of these are config values.
- **Why:**
  - **The model.** A 7B instruct model with strong JSON-schema adherence runs on a laptop, and the human made Ollama the default.
  - **CI.** CI must be offline and free of paid calls (NFR-10 AC 6).
  - **Hosted safety.** Forbidding the mock in hosted environments stops fake outputs from reaching real decisions.
  - **Gave up:** the quality of larger models by default (AR-1). Real-model scores are reported by `make eval-live`, not gated in CI.
- **Date:** 2026-10-28

## TD-17 — Observability backend

- **Options considered:**
  - OpenTelemetry SDK → collector, using `grafana/otel-lgtm` locally
  - Separate Jaeger + Prometheus + Grafana containers
  - A vendor APM (Datadog/New Relic)
- **Choice made:** OTel everywhere. `otel-lgtm` locally. Hosted exporters (ADOT → CloudWatch/X-Ray) are set in Terraform.
- **Why:**
  - One container gives traces, metrics, logs and dashboards (NFR-8 AC 3).
  - OTLP keeps the backend swappable.
  - **Gave up:** production-grade local retention (lgtm is a dev image) and vendor APM features.
- **Date:** 2026-10-28

## TD-18 — Where domain alerts are evaluated *(inferred default: 60 s sweep)*

- **Options considered:**
  - An in-app evaluator in the scheduler, reading DB truth
  - Prometheus/Alertmanager rules over metrics
  - CloudWatch alarms only
- **Choice made:** an in-app evaluator (clock sweep every 60 s) that writes `alerts`, shows them in the console and sends them through the notification adapter. The same rules live in `deploy/alerts/rules.yaml` and generate the CloudWatch alarms.
- **Why:**
  - **The data shape.** "T-2 business days" is a calendar computation on DB rows, not a metric threshold. Computing it from the system of record avoids metric-label cardinality (no `case_id` labels) and behaves the same locally and hosted.
  - **Cadence.** A 60 s sweep is negligible next to day-scale deadlines.
  - **Gave up:** a single alerting system. The duplication is contained by generating both from one rules file.
- **Date:** 2026-10-28

## TD-19 — Agent evaluation harness

- **Options considered:**
  - Vendor `agent-eval-blueprint` (adapters, code graders, LLM judge, pass@k, OWASP-agentic red-team YAML)
  - Build from scratch
  - promptfoo / DeepEval
- **Choice made:** vendor a pinned snapshot with `PROVENANCE.md` into `eval/_vendor/agent_eval/`, plus a `dca` adapter and golden suites built from the FR-33 corpus.
- **Why:**
  - **Reuse.** It is a catalogued, already-used asset (threat-detection TD-24).
  - **Offline and Python.** It runs offline, is written in Python, and includes injection red-team cases (NFR-9 AC 3).
  - **Gave up:** community tooling features (UIs, hosted dashboards). We also own upgrades by re-vendoring.
- **Date:** 2026-10-28

## TD-20 — Quality and static-analysis tooling *(inferred discovery default)*

- **Options considered:**
  - Lint/format: ruff vs flake8 + black + pylint
  - Types: mypy vs pyright
  - E2E: Playwright vs Cypress vs the raw-CDP runner from `agent-governance-muster`
  - IaC scan: checkov vs tfsec/trivy
  - Secrets: gitleaks vs trufflehog
- **Choice made:**
  - ruff (lint + format, including the `S` bandit rules)
  - mypy, strict on core packages
  - tsc `--noEmit` + ESLint
  - pytest + Hypothesis + pytest-cov
  - Playwright + axe-core
  - gitleaks, pip-audit, npm audit
  - terraform fmt/validate + tflint + checkov
  - import-linter
- **Why:**
  - **Discovery default.** These were the inferred tools (AS-9).
  - **ruff** is one fast tool in place of three.
  - **Playwright** has first-class axe integration for NFR-14.
  - **checkov** covers Terraform security policies offline.
  - **Gave up:** the zero-dependency CDP runner (we take a heavier dev dependency) and pyright's speed.
- **Date:** 2026-10-28

## TD-21 — Blast-radius tiering of actions

- **Options considered:**
  - Tiers B0–B4 mapped to authorizers (adapted from the `agentic-enterprise` autonomy × blast-radius model)
  - A flat "everything external needs approval" rule
  - Ad hoc per-action rules
- **Choice made:** B0 read · B1 drafts · B2 consumer-protective flags · B3 reversible money or external effects (human or eligible auto) · B4 adverse, final or customer-visible (human only). Every effect passes through one executor choke point.
- **Why:**
  - **Encodes the human's rules exactly in one place:** auto-approve only for provisional credit and chargeback filing, humans for comms, denials, finals and write-offs.
  - **Makes kill switches and reviews tractable.**
  - **Gave up:** some simplicity. Every new action type must be classified into a tier.
- **Date:** 2026-10-28

## TD-22 — Hosted deployment target (IaC only)

- **Options considered:**
  - AWS ECS Fargate + RDS
  - EKS + Helm
  - Lambda + Step Functions
  - App Runner
- **Choice made:** Terraform for ECS Fargate, RDS PostgreSQL 16 (Multi-AZ in prod), ALB/ACM, KMS, Secrets Manager, an S3 Object Lock bucket and CloudWatch, with dev/staging/prod environments. **Never applied** (OOS-6). Static checks only.
- **Why:**
  - **Specified.** The human specified ECS.
  - **Fit.** Long-running workers and a singleton scheduler suit Fargate services. It is simpler to operate than EKS.
  - **Gave up:** Kubernetes portability. Ollama is not hosted, so hosted environments use US-region managed providers.
- **Date:** 2026-10-28

## TD-23 — Enforcing module boundaries

- **Options considered:**
  - import-linter contracts in CI
  - Convention and code review only
  - Splitting every layer into separate distributions
- **Choice made:**
  - import-linter contracts:
    - agents cannot import effectful adapters or SDKs
    - `policy`, `regclock` and `confidence` are pure
    - only `dca.llm.providers` imports SDKs
  - `dca_vault` and `dca_mocks` are separate packages that never import core.
- **Why:**
  - It turns the safety architecture (§3, NFR-9) into a failing build instead of a review comment.
  - It follows the prior project's layer-boundary test.
  - **Gave up:** some refactoring friction.
- **Date:** 2026-10-28

## TD-24 — Repository and process layout

- **Options considered:**
  - A monorepo with one core Python package run in many process roles, plus separate vault/mocks packages and a console app
  - A service per agent, each in its own repo or image
  - Everything, including the vault, in one package and image
- **Choice made:** the monorepo. A single `core` image runs the `api`, `worker --task X`, `scheduler` and `mocks` roles. `vault` has its own image. `console` has its own image.
- **Why:**
  - **Consistency.** One core image means one version of policy, prompts and code per deploy, which keeps replay and debugging simple.
  - **PCI.** A separate vault image keeps the PCI boundary physical.
  - **Gave up:** independent deploy cadence per agent, and per-agent dependency isolation.
- **Date:** 2026-10-28

## TD-25 — Blob storage for evidence, LLM outputs and rendered comms

- **Options considered:**
  - Postgres `bytea`, content-addressed
  - S3 (with MinIO locally)
  - Local filesystem
- **Choice made:** Postgres `blobs` behind a `BlobStore` interface, so an S3 implementation can be added later without touching callers.
- **Why:**
  - **Transactional.** Blobs commit atomically with the audit event that references them.
  - **Volume is small:** roughly 20 blobs × 10 KB per case, about 10 GB/year even at 10×.
  - **No extra infrastructure** is needed locally.
  - **Gave up:** cheap object storage at scale, and a leaner database for backups.
- **Date:** 2026-10-28

## TD-26 — Confidence score construction *(inferred discovery default)*

- **Options considered:**
  - A weighted composite of rule coverage (R), evidence completeness (E) and model self-score (M), then calibration
  - The model self-score alone
  - A trained, calibrated classifier
  - A binary rules-only "complete/incomplete"
- **Choice made:**
  - `raw = 0.4R + 0.4E + 0.2M` (weights configurable, Σ = 1), followed by a piecewise-linear calibration map that is the identity until fitted on the golden set.
  - An LLM/table disagreement caps the score below the low threshold.
  - Computed in `decimal` at 4 dp, so replay matches bit for bit.
- **Why:**
  - **Discovery default.** This composite was inferred in discovery (AS-4).
  - **Deterministic** given recorded inputs (FR-28).
  - **Down-weights LLM self-scores,** which are poorly calibrated.
  - **Why not the alternatives:** a trained model is ML work (OOS-9, the DS sibling agent).
  - **Gave up:** statistical rigour until calibration data accumulates.
- **Date:** 2026-10-28

## TD-27 — Admin and Auditor role exclusivity

- **Options considered:**
  - A DB CHECK making `admin` and `auditor` each exclusive of all other roles
  - Allowing multi-role users with runtime checks only
- **Choice made:** the exclusive-role CHECK constraint, plus server-side RBAC.
- **Why:**
  - It enforces D-3 separation of duties structurally. No account can both change thresholds and approve, or both audit and act.
  - **Gave up:** convenience for small teams. One person needs two accounts to cover both roles.
- **Date:** 2026-10-28

## TD-28 — API style and conventions *(inferred defaults: 120/min rate limit, 30-day idempotency TTL)*

- **Options considered:**
  - REST + OpenAPI 3.1 + problem+json + a generated TS client
  - GraphQL
  - gRPC + gateway
- **Choice made:**
  - REST under `/api/v1`, RFC 9457 errors with stable codes, `Idempotency-Key`, `If-Match` versions and cursor pagination.
  - The TS client is generated with `openapi-typescript`, and a drift check runs in CI.
  - Per-principal rate limit of 120/min on intake and approvals. Idempotency keys are retained for 30 days.
- **Why:**
  - FastAPI provides this natively, and it is simple to secure and test (route × role matrix tests).
  - The contract drift check keeps console and API in sync.
  - **Gave up:** GraphQL's flexible fetching for the case-detail aggregate, which is served by one purpose-built endpoint instead.
- **Date:** 2026-10-28

## TD-29 — Secrets management *(inferred discovery default)*

- **Options considered:**
  - Env vars locally (`.env`, gitignored) + AWS Secrets Manager/KMS in Terraform
  - HashiCorp Vault
  - SOPS-encrypted files in the repo
  - SSM Parameter Store only
- **Choice made:** env vars locally, loaded as `SecretStr` via pydantic-settings, with `.env.example` placeholders committed. Secrets Manager + KMS when hosted. Bedrock has no static keys: locally it uses the configured auth-refresh command, and hosted it uses the ECS task role. `config_versions` stores secret *references* only. gitleaks runs in CI.
- **Why:**
  - **Discovery default.** This split was inferred in discovery (AS-8).
  - **Native to ECS.** Secrets Manager integrates directly with ECS task definitions.
  - **No secret ever enters the repo** (quality floor).
  - **Gave up:** cloud portability, and HashiCorp Vault's dynamic secrets.
- **Date:** 2026-10-28

## TD-30 — PII redaction method and merchant names *(inferred default for OQ-7)*

- **Options considered:**
  - Deterministic redaction: known PII values from the case/CRM record + regex patterns (email, phone, SSN, account numbers, Luhn-valid PANs) → placeholders, re-hydrated server-side only in final comms
  - NER-based redaction (Presidio/spaCy)
  - Full redaction with no re-hydration
  - Also redacting merchant names
- **Choice made:** deterministic known-value + pattern redaction with placeholders. Spelled-out digits are normalized before PAN detection. Merchant names are **allowed** in prompts. Cardholder PII is always redacted.
- **Why:**
  - **Replayable.** Deterministic redaction can be replayed (same input → same redacted prompt hash) and adds no ML dependency.
  - **Reliable on known values.** Matching against the record catches the cardholder's own identifiers.
  - **Merchant names matter** for classification and reason-code quality, and they are not cardholder PII.
  - **Gave up:** catching unknown third-party names in narratives (AR-5). The residual risk is limited by US-only providers and Bedrock guardrails.
- **Date:** 2026-10-28

## TD-31 — Inbound network events (acknowledgments, representments, outcomes)

- **Options considered:**
  - Scheduler polling `NetworkAdapter.poll_events(cursor)`
  - An inbound webhook/callback endpoint per network
- **Choice made:** cursor-based polling every 60 s through the adapter. A webhook adapter can be added later behind the same interface.
- **Why:**
  - Polling behaves identically against mocks and real systems.
  - It exposes no inbound unauthenticated surface.
  - Cursor + idempotent handling makes it replay-safe.
  - **Gave up:** up to 60 s of event latency, which is immaterial against filing windows measured in days.
- **Date:** 2026-10-28

## TD-32 — Reg Z "in dispute" hold executes without human approval *(inferred default)*

- **Options considered:**
  - Execute the hold automatically at triage as a B2 effect (`policy:<rule>` authorization)
  - Require human approval like other ledger writes
- **Choice made:** execute automatically. It is still an `effects` row: idempotent, audit-logged and visible on the timeline.
- **Why:**
  - **Required protection.** Reg Z protections (no collection or adverse reporting of the disputed amount) apply from receipt of the notice (FR-5 AC 3). The hold is consumer-protective and moves no money.
  - **Risk of waiting.** Making it wait for approval would risk violating the regulation.
  - **Gave up:** a literal reading of "a human approves every ledger write." The human's list named money movements, and this is not one. **Flagged at the review gate.**
- **Date:** 2026-10-28

## TD-33 — Network filing/response windows per reason code *(inferred discovery default)*

- **Options considered:**
  - A versioned per-network, per-reason-code table with filing and response windows
  - One uniform window per network
  - No network clocks (regulatory clocks only)
- **Choice made:**
  - `policies/network/{visa,mastercard}.yaml` with category → reason-code mapping, filing window, representment-response window and package schema.
  - Seeded from public summaries (Visa 10.4/13.1/13.3/12.6/13.6; Mastercard 4837/4855/4853/4834/4860) and marked **unconfirmed** in `/system/info` and in certification until Compliance signs off (AS-2, OQ-4).
- **Why:**
  - Windows really do vary by reason code. Missing one is a lost chargeback and a write-off.
  - A table keeps them versioned and replayable, and makes new networks data-only (NFR-12).
  - **Gave up:** authority. The seed values are not network rules.
- **Date:** 2026-10-28

## TD-34 — QA sampling rate for auto-approved actions *(inferred discovery default)*

- **Options considered:**
  - 5%
  - 10%
  - 25%
  - 100% initially, then ratchet down
- **Choice made:** 10%, configurable. Sampling is reproducible via `HMAC(sample_seed, effect_id)`.
- **Why:**
  - **Discovery default.** 10% was inferred in discovery (AS-5).
  - **Workload.** At the expected auto volume it gives Supervisors a statistically useful agreement signal without recreating the manual workload.
  - **Gave up:** faster detection of rare auto-approve errors, which a higher rate would give. An Admin can raise it at any time, with the change audit-logged.
- **Date:** 2026-10-28

## TD-35 — Customer communications always require human approval, including in auto-approve mode *(inferred discovery default, OQ-3)*

- **Options considered:**
  - Comms always human-approved
  - Auto-send regulatory acknowledgments (e.g. the Reg Z 30-day acknowledgment) when auto-approve is ON
  - Auto-send all comms for auto-eligible cases
- **Choice made:** comms are always human-approved in both modes. `auto_approve.actions` cannot include `customer_comm` (validation rejects it).
- **Why:**
  - **Conservative reading.** It is the conservative reading of the human's default mode, and letters are B4 (customer-visible and irreversible).
  - **Drafts lower the cost.** Agent drafts keep the human cost per letter low.
  - **Gave up:** some SM-2 gain. Each auto case still needs at least one human touch for its notice. This is revisited by OQ-3.
- **Date:** 2026-10-28

## TD-36 — Free-text intake extraction *(inferred discovery default)*

- **Options considered:**
  - LLM extraction into a strict schema, validated and retried, then routed to manual completion
  - Structured forms only, with no free text
  - LLM extraction with partial acceptance of valid fields
- **Choice made:** LLM `extraction` → `ExtractedClaim` (`extra="forbid"`, closed enums), at most 2 retries (configurable), then `needs_manual_completion`. **Never partial.** Unmatched transactions are flagged, not rejected.
- **Why:**
  - **Coverage.** The portal and IVR deliver narratives, and a schema gate stops malformed or injected output from flowing downstream (FR-2, NFR-9 AC 4).
  - **No silent gaps.** "Never partial" prevents silently missing fields from affecting clocks or amounts.
  - **Gave up:** some automation on borderline inputs, which go to an Analyst instead.
- **Date:** 2026-10-28

## TD-37 — Confidence thresholds *(inferred default)*

- **Options considered:**
  - low 0.70 / high 0.85
  - low 0.80 / high 0.90
  - low 0.85 / high 0.95
- **Choice made:** low 0.80 (below it, a Supervisor is required), high 0.90 (auto-eligibility criterion). Validation enforces high ≥ low.
- **Why:**
  - **A conservative start.** About 10 points of headroom separates "needs a Supervisor" from "may auto-execute".
  - **Tunable.** Both are re-tuned once calibration is fitted on the golden set (FR-9 AC 4).
  - **Gave up:** auto-approve volume early on.
- **Date:** 2026-10-28

## TD-38 — Synthetic data generator and scenario corpus *(inferred discovery default)*

- **Options considered:**
  - Port the prior generator pattern with own seeded word lists and test-range PANs
  - Faker-based random data
  - Hand-written fixtures only
  - Reuse `decision-model-exp`'s 200 fraud/SAR alerts
- **Choice made:**
  - Port the `disputes-claims-decision-engine` generator pattern into `dca.simulator`.
  - Seeded, with own word lists so output does not depend on a library version, giving byte-identical output per seed.
  - Covers both regimes, both networks, all five categories, and the named FR-33 edge-case scenarios.
  - Uses Luhn-valid **test-range** PANs only.
- **Why:**
  - **Determinism.** Same seed → same corpus → same audit head hash (NFR-11, FR-33 AC 3).
  - **Library drift.** Faker output changes across versions.
  - **Scope mismatch.** The fraud-alert set is a different domain (SAR triage).
  - **Gave up:** some realism and variety, which named scenarios mitigate.
- **Date:** 2026-10-28

## TD-39 — Availability and performance targets *(inferred discovery default)*

- **Options considered:**
  - 99.5% single-region Multi-AZ
  - 99.9% with multi-region active/passive
  - Best-effort
- **Choice made:**
  - 99.5% monthly availability on single-region Multi-AZ RDS and ≥ 2 API tasks.
  - Console and API reads p95 < 500 ms (excluding LLM calls) at 50k seeded cases and 20 concurrent users.
  - Compose stack healthy in < 2 min.
- **Why:**
  - **Discovery default.** These targets were inferred in discovery (AS-9).
  - **Downtime is tolerable.** Deadlines are measured in days, so brief downtime does not threaten SM-1, and alerts survive restarts.
  - **Gave up:** regional disaster tolerance and a higher SLA.
- **Date:** 2026-10-28

## TD-40 — Reg E / Reg Z clock parameters beyond the human's statement *(inferred default, AS-1, OQ-5)*

- **Options considered:**
  - Encode only the human-stated clocks
  - Encode the full Reg E §1005.11 / Reg Z §1026.13 parameter set as commonly read, as versioned data
- **Choice made:** the full set in `policies/clocks/reg_e.yaml` and `reg_z.yaml`, marked **unconfirmed**:
  - Reg E:
    - new-account investigate clock of 20 business days and 90-day extension, where "new account" = opened < 30 days
    - POS and foreign transactions get a 90-day extension
    - provisional-credit notice within 2 business days
    - results notice within 3 business days
    - 5-business-day honouring period on reversal
    - correction within 1 business day
  - Reg Z: acknowledgment within 30 days, and resolution within 2 cycles, ≤ 90 days.
  - The parameter version is pinned per case.
- **Why:**
  - **Coverage.** Omitting these would leave known regulatory obligations unclocked, which threatens SM-1.
  - **Low cost to correct.** Holding them as versioned data means Compliance can fix values without code changes.
  - **Gave up:** certainty. The values carry legal-interpretation risk until OQ-4 sign-off.
- **Date:** 2026-10-28

## TD-41 — Recovery objectives *(inferred default)*

- **Options considered:**
  - RPO ≤ 5 min / RTO ≤ 1 h via RDS PITR + Multi-AZ
  - Cross-region read replica for regional DR
  - Daily snapshots only
- **Choice made:** RDS PITR (7-day window) + Multi-AZ in prod, plus monthly snapshot export with a 7-year lifecycle. The restore runbook is documented. Target RPO ≤ 5 min, RTO ≤ 1 h.
- **Why:**
  - It matches the 99.5% target at modest cost and complexity.
  - Losing ≤ 5 min of work is recoverable, because external effects are idempotent and re-derivable from adapters.
  - **Gave up:** tolerance of a full region failure.
- **Date:** 2026-10-28

## TD-42 — US data-residency enforcement *(inferred default)*

- **Options considered:**
  - Documentation only
  - Config validation of provider regions + Terraform region allow-list + security-group egress restrictions
  - A network egress proxy with domain allow-list
- **Choice made:**
  - When `DCA_ENV ≠ local`, every LLM provider in a route must declare a US `region`, and validation fails otherwise.
  - Terraform `region` variables are validated against US regions.
  - Security groups restrict egress.
  - Local Ollama is exempt.
- **Why:**
  - It makes NFR-6 AC 2 a failing config instead of a policy memo, and is cheap to implement.
  - **Gave up:** non-US endpoints even where they would be cheaper or faster. We also rely on providers' declared regions instead of verifying them at the network level.
- **Date:** 2026-10-28

## TD-43 — Handling-time measurement and baseline *(inferred default, AS-6, OQ-2)*

- **Options considered:**
  - Console heartbeats while the user interacts on case/approval screens, with an idle cap
  - Analyst self-reported timers
  - Queue timestamps (claimed → submitted)
  - Full UI event sourcing
- **Choice made:** a heartbeat every 15 s with interaction, an idle cap of 60 s, and a count of touches. Per-category baselines are seeded as placeholders and flagged **unvalidated** on the dashboard until the business supplies real ones.
- **Why:**
  - It measures active human effort, which is what SM-2 targets, with low overhead and no reliance on discipline.
  - Queue timestamps would count idle time.
  - **Gave up:** precision. Off-console work isn't captured, and the SM-2 claim is provisional until OQ-2 is answered.
- **Date:** 2026-10-28

## TD-44 — Test and eval gate thresholds *(inferred default)*

- **Options considered:**
  - Line coverage: global 80%, or ≥ 80% on the safety-critical core only
  - Eval gates: 90% / 95% / 99% for classification and reason-code agreement
  - ECE: ≤ 0.05 or ≤ 0.10
- **Choice made:**
  - ≥ 80% line coverage on regclock, policy, approvals/four-eyes, audit and protect.
  - Golden-set classification accuracy ≥ 95% and reason-code agreement ≥ 95%.
  - Injection resistance 100%.
  - ECE ≤ 0.10 reported per release.
  - Chain verification of 1M events < 60 s.
  - CI gates on the mock provider.
- **Why:**
  - **Focus.** Effort goes where defects cost money or compliance.
  - **Risk is bounded.** 95% is achievable because the authoritative tables decide and the LLM only suggests. Errors lower confidence instead of changing outcomes.
  - **Gave up:** coverage enforcement on glue code, and tighter calibration until real data exists.
- **Date:** 2026-10-28

## TD-45 — Console accessibility level *(inferred default)*

- **Options considered:**
  - WCAG 2.1 AA (contrast + keyboard) on the six primary screens, checked by axe
  - Full WCAG 2.2 AA audit
  - No formal target
- **Choice made:** WCAG 2.1 AA contrast and keyboard navigation on the queue, case detail, inbox, SLA dashboard, admin and audit viewer screens, with automated axe checks in Playwright.
- **Why:**
  - An internal tool used all day by analysts still needs baseline accessibility.
  - Automated checks make it certifiable.
  - **Gave up:** a manual assistive-technology audit and 2.2-specific criteria.
- **Date:** 2026-10-28

## TD-46 — Letter languages *(inferred default, OQ-6)*

- **Options considered:**
  - English only
  - English + Spanish
  - Full i18n framework from day one
- **Choice made:** English (`en-US`) only. Template files and lookup are keyed by locale (`<notice_type>.<locale>.v<N>.j2` resolution), so adding a language is data-only.
- **Why:**
  - No multilingual requirement was stated, and each added language multiplies the templates Compliance must review.
  - **Gave up:** non-English cardholders in the MVP.
- **Date:** 2026-10-28

## TD-47 — WORM anchoring defaults *(inferred default, OQ-8)*

- **Options considered:**
  - Anchoring on in every environment
  - Off locally/dev, on in staging/prod
  - Off everywhere until requested
- **Choice made:**
  - `AUDIT_ANCHOR_S3_ENABLED=false` locally and in dev, `true` in the staging/prod Terraform variables.
  - Anchor interval 15 min.
  - Object Lock COMPLIANCE mode with retention = ts + 7 years.
  - Failures alert and retry, and never block processing.
  - Anchoring code is tested with moto.
- **Why:**
  - Local runs need no AWS credentials.
  - Environments that hold real-shaped data get external tamper evidence.
  - 15 min bounds the window of undetectable full-chain rewrite.
  - **Gave up:** external anchoring in dev, and finer anchor granularity, which would cost more S3 objects.
- **Date:** 2026-10-28

## TD-48 — Auto-approve dollar threshold and allow-list defaults *(inferred default)*

- **Options considered:**
  - Threshold: $50, $100, $250, or $500 (equal to the Supervisor threshold)
  - Allow-list: all categories, or excluding fraud/unauthorized
- **Choice made:**
  - Threshold $100 (`10000` minor units). Validation enforces ≤ the Supervisor threshold (D-4).
  - Allow-list: all five categories × both regimes (PRD FR-13 default).
  - Auto actions limited to provisional credit and chargeback filing (human-specified).
  - Mode OFF by default.
- **Why:**
  - **The human left the value open.** They made the threshold configurable without stating one. Starting at a fifth of the Supervisor threshold limits per-error exposure while QA data accumulates (TD-34).
  - **Allow-list.** Keeping all categories follows the PRD default, and Admins can narrow it.
  - **Gave up:** early auto-approve volume and the SM-2 gain that comes with it.
- **Date:** 2026-10-28

## Model allocation for the build (human decision at the review gate)
**Options considered:** credit-paced default (Opus certifies every task) · local-heavy (local models build and certify) · split by role
**Choice made:** split by role. Opus 5.5 wrote the detailed implementation plan (PLAN.md). Sonnet 5.5 and the local models (qwen3.8-flash-next:125b) build. Sonnet 5.5 checks that each task's build matches the plan; when Sonnet built a task itself, Opus checks it instead (separation of duties). Opus 5.5 certifies the final verification report (`docs/VERIFICATION.md`).
**Why:** Opus's judgment goes where it matters most (the plan and the final certification), while ~101 per-task checks run on the cheaper Sonnet. This keeps spend within the monthly credit and preserves independent certification.
**Date:** 2026-10-28

## Design approved at the review gate
**Options considered:** approve · request changes
**Choice made:** approve
**Why:** Human approved the design (35 FRs, 14 NFRs, 101 tasks). Build loop opened.
**Date:** 2026-10-29

## TD-49 — Console component test tooling (Vitest + Testing Library)
- **Decision:** How to unit/component-test the React console, alongside the Playwright and axe end-to-end/accessibility tooling chosen in TD-20.
- **Options considered:** Vitest + Testing Library · Jest + Testing Library · Playwright component testing only.
- **Choice made:** Vitest with React Testing Library (jsdom) for component tests; Playwright and axe (TD-20) stay for end-to-end and accessibility checks.
- **Why:** Vitest shares the Vite config and runs fast with native TypeScript/ESM, so there is no extra transform setup. Testing Library tests behavior the way users see it. Playwright alone is slower and too heavy for per-component checks. **Gave up:** a single test runner for everything, and Jest's larger ecosystem.
- **Date:** 2026-10-29

## TD-50 — Secrets scan: CERTIFICATION.md PAN documentation exception

- **Decision:** How to handle test-range PAN examples in `docs/CERTIFICATION.md` that describe gitleaks configuration decisions.
- **Options considered:** Mask the values (e.g. `4111••••••••••1111`) · Add an allowlist exception for the file · Leave as-is and accept false positives.
- **Choice made:** Keep `docs/CERTIFICATION.md` in `.gitleaks.worktree.toml` global allowlist so working-tree scans pass. The history scan (using bare `.gitleaks.toml`) will flag PANs in certification entries describing test data — which is acceptable since certification docs are append-only and describe known test patterns, not real card data.
- **Why:** Implementers cannot edit `docs/CERTIFICATION.md` (separation of duties). Masking requires Validator access. The worktree allowlist is the pragmatic path; history scan flags are expected noise for certification entries.
- **Date:** 2026-10-29

## TD-51 — Secrets scan: supersedes TD-50 (no CERTIFICATION.md exemption)

- **Decision:** Remove the `docs/CERTIFICATION.md` exemption introduced in TD-50.
- **Options considered:** Keep the allowlist exception · Mask the PANs in the doc and drop the exception.
- **Choice made:** Literal PANs in `docs/CERTIFICATION.md` line 113 were replaced by a prose description; `.gitleaks.worktree.toml` now exempts only the gitignored `.env`. TD-50 is superseded.
- **Why:** Working-tree and history scans now agree on docs, with no blind spot. **Gave up:** nothing material; the doc edit was made at orchestrator level because the file is Validator-owned.
- **Date:** 2026-10-29

## TD-52 — State machine: reconcile ARCHITECTURE §2.3 with §5.2/§5.6

- **Decision:** Resolve conflicts between the §2.3 diagram and the failure/auto-off/supersede behaviour in §5.2/§5.6.
- **Options considered:** Keep the §2.3 diagram table only (executor/calendar failures would raise IllegalTransition) · Add the extra edges explicitly.
- **Choice made:** Add explicit edges. Case: `received|triaged|deciding|awaiting_approval|executing|awaiting_network|representment_review → needs_attention` (the working states; `investigating` already had it; excluded: needs_manual_completion, manual_prearb, resolved, closed); the only return path stays `needs_attention → investigating` (analyst retry). Case: `executing → awaiting_approval` when auto-approve is turned OFF. Proposal: `auto_approved → pending_approval`, `executing → pending_approval` (auto-approve OFF), `approved → superseded` (draft edit before execution).
- **Why:** Keeps the table closed (FR-20) while permitting behaviours the architecture already requires. **Gave up:** a minimal table; §2.3 diagram should be updated to match.
- **Date:** 2026-10-29

## T11 · Calendar port as re-implementation · build-time
- **Decision:** how to bring in the business-day calendar from `disputes-claims-decision-engine`.
- **Options:** copy upstream source; re-implement the same contract against the YAML policy file.
- **Choice:** re-implement (`dca.regclock.calendar`), with stdlib `zoneinfo` and the existing `pyyaml` dependency.
- **Why:** upstream source was not accessible to the implementer. Optimized for a working, tested contract; gave up byte-level fidelity with upstream (noted in PROVENANCE.md).

## TD-53 — Conversational agents keep the LLM-as-function pattern *(CR-1)*

- **Decision:** How to add agent conversation (FR-36 case copilot, FR-37 cardholder chat) without weakening TD-6.
- **Options considered:**
  - A tool-calling chat agent that can query adapters and call the API
  - LLM-as-function per turn: code builds the context, the model returns a schema-validated output, and code acts on it
  - A retrieval-augmented chat over the audit log and evidence blobs
- **Choice made:** LLM-as-function per turn. The copilot gets a fixed, role-scoped context bundle and returns `{sentences[{text, cites}], suggested_actions[], self_score}`. Suggested actions come from a closed enum and run only when a human clicks them, through the normal API as that human. The cardholder chat returns only `{intent, slots, self_score}`, and a deterministic dialogue engine decides the reply.
- **Why:**
  - **Keeps TD-6's guarantees.** No tools means an injected instruction still has nothing to call (NFR-9 AC 3). Every effect still goes through human approval or auto-approve rules.
  - **Grounded answers.** The citation validator from FR-7 AC 4 is reused, so the copilot cannot assert facts that are not in the case record.
  - **Gave up:** open-ended questions across cases ("how many fraud cases at this merchant this month?") and agent-driven evidence fetching. Both could come later as read-only, scoped tools behind a new TD.
- **Date:** 2026-10-29

## TD-54 — Cardholder chat replies come only from an approved reply library *(CR-1, D-11, OQ-9)*

- **Decision:** How cardholder chat replies get human approval, given that every outbound customer communication must be human-approved.
- **Options considered:**
  - Free-form LLM replies, with each reply approved by an Analyst before it is sent
  - Free-form LLM replies, sent without approval
  - Deterministic replies from a versioned, Compliance-approved library, with slots filled from validated values; the LLM only classifies intent and extracts slots
- **Choice made:** the reply library (`policies/chat/replies.v<N>.yaml`, content-hash versioned, records the approving Compliance user). Validation rejects a library version without an approver.
- **Why:**
  - **Per-message approval breaks chat.** A cardholder will not wait minutes for each reply.
  - **Unapproved LLM text is the highest-risk option.** It can promise credit, misstate Reg E/Z rights or reveal another customer's data, and it would be B4 output with no human in the loop.
  - **Library approval is reviewable.** Compliance approves a finite set of sentences once per version. The hash of each sent reply is audit-logged.
  - **Gave up:** natural, flexible wording. Questions outside the library end in a handoff. This is still a reinterpretation of a binding rule, so OQ-9 asks the human to confirm it.
- **Date:** 2026-10-29

## TD-55 — Copilot turns run inline in the API process *(CR-1)*

- **Decision:** Where copilot LLM calls run.
- **Options considered:**
  - Enqueue a `workflow_steps` row and have a worker answer, with the console polling
  - Call the gateway inline in the API request, with a timeout
- **Choice made:** inline, `async`, with a 30 s gateway timeout and the copilot route's own failover list. The response streams the answer once it has passed validation (Server-Sent Events). A copilot failure is shown in the panel and never affects the case.
- **Why:**
  - **Nothing durable to protect.** A copilot turn changes no case state, so the queue's exactly-once and restart guarantees buy nothing.
  - **Latency.** Polling a queue would add seconds to every turn.
  - **Gave up:** isolation between slow LLM calls and API workers. NFR-1 already excludes LLM calls. The per-principal rate limit (TD-28) and per-case cost cap (TD-16) bound the load, and copilot spend has its own budget line.
- **Date:** 2026-10-29

## TD-56 — Cardholder chat principal and portal page *(CR-1, OOS-8 amended)*

- **Decision:** How the simulated portal authenticates a cardholder for chat.
- **Options considered:**
  - Anonymous chat that asks for the card number
  - A customer-scoped JWT minted by the mock portal, with a new principal type
  - Reuse `svc:intake-feed` and pass the customer reference in the body
- **Choice made:** the mocks service hosts one portal chat page and mints a short-lived RS256 JWT with `sub=cust:<customer_ref>`, `roles=[cardholder]`, audience `dca-chat`. The API maps it to a `CustomerPrincipal` whose only permissions are `chat.*` on its own customer reference. Locally the dev issuer's JWKS signs it; a real portal would be a separate issuer.
- **Why:**
  - **No PAN entry.** Asking for a card number would put PANs in chat text and widen the PCI surface.
  - **Least privilege.** A customer token can reach only its own transactions and cases. The RBAC matrix test covers the new role.
  - **Gave up:** anonymous or guest disputes. They still come through the portal/IVR feed.
- **Date:** 2026-10-29

## TD-57 — Reg E/Z notice time for chat disputes *(CR-1, OQ-11)*

- **Decision:** Which chat timestamp starts the regulatory clocks.
- **Options considered:**
  - Session start
  - First cardholder message asserting an error on an identified transaction
  - The moment the cardholder confirms and submits
- **Choice made:** the first assertion. Abandoned chats past that point still create a case in `needs_manual_completion`.
- **Why:**
  - **Conservative.** Reg E treats an oral notice as notice. Starting at submit could start the clock late if the cardholder hesitates, and drop it entirely if they abandon.
  - **Session start is too early.** Many sessions are status questions, so it would create false clocks.
  - **Gave up:** some manual-completion cases from abandoned chats. Compliance confirms through OQ-11.
- **Date:** 2026-10-29

## TD-58 — Console screens built ahead of the API, against a mock *(build-time, human decision 2026-10-29)*

- **Decision:** Start M9 (console) before M3–M6 deliver the API, as the human asked.
- **Options considered:**
  - Wait for the API and generate the client first (PLAN order, T83)
  - Build screens now against hand-written types and an in-memory mock API behind a `DisputeApi` interface
  - Build screens against a mock HTTP server (e.g. MSW)
- **Choice made:** an in-memory `MockApi` (`console/src/api/mockApi.ts`) behind the `DisputeApi` interface. It applies the server's role, four-eyes, content-hash and reason rules so the screens handle real error codes. Router `react-router` 8.4.0 and `@tanstack/react-query` 5.104.2, pinned exactly and chosen as releases older than two weeks. The console header shows a "Mock API" badge.
- **Why:**
  - **Early feedback on the UX** from the prototype, in the real stack, while the backend is built.
  - **Cheap swap later.** T83 replaces the hand-written types with the generated OpenAPI client and a real `DisputeApi` implementation; screens only use the hooks.
  - **Gave up:** contract certainty. Types may drift from the real API, which T83's generated client and drift check will catch. The mock's rule checks duplicate server logic and are not a substitute for the server tests (T52, T53).
- **Date:** 2026-10-29

## TD-59 — The Investigation Co-Pilot may choose read-only lookups *(CR-1, FR-38; narrows TD-6 for this task)*

- **Decision:** Whether the model may pick tools, which TD-6 and TD-53 ruled out.
- **Options considered:**
  - Keep TD-6: no model-chosen tools; analysts run lookups by hand
  - Let the model choose from a closed list of read-only lookups, run by code
  - Give the model general read access through tool calling
- **Choice made:** a closed enum of four read-only lookups, scoped to the case's own card, account and merchant (merchant data aggregate only). The model can only name one; code checks it applies to this case and that the user can work cases, runs it as that user, records it as evidence and in the audit log, and asks the model again with the result. One lookup per turn, a per-case limit. TD-6 still holds for every pipeline step and for anything with effects.
- **Why:**
  - **Blast radius stays at B0/B1.** The worst an injected instruction can do is trigger a read the analyst could have run, on the same customer, which is then visible as evidence.
  - **Better investigations.** "How was the card read?" becomes a one-step question instead of a hunt through systems.
  - **Gave up:** strict "no tools anywhere". Replay is unaffected because lookups are recorded as evidence, and Co-Pilot output never feeds policy (FR-36 AC 6).
- **Date:** 2026-10-29

## TD-60 — Local model through a dev-only gateway bridge *(build-time)*

- **Decision:** How the console's Co-Pilot reaches the local model before the real API exists.
- **Options considered:**
  - The browser calls Ollama directly
  - A local-only FastAPI bridge over the real `dca.llm` gateway; the console's mock backend calls it
  - Wait for the API (M5–M6)
- **Choice made:** the bridge (`backend/src/dca/api/dev_llm.py`, refuses to start unless `DCA_ENV=local`). The first slice of C14/C15 is real code: PAN detection, redaction, egress guard, Ollama provider with JSON-schema output, closed Pydantic schemas, retry and failover, per-task model routes from env. The console's mock backend builds the role-scoped bundle, validates citations and actions, runs lookups, and falls back to rule-based answers when the model is down or gives no cited answer, labelling each answer's source.
- **Why:**
  - **Model calls go through the gateway from day one** (FR-29 AC 1, FR-31), and the gateway code is the code M4 builds on.
  - **Measured, not guessed.** On qwen2.5:7b answers take ~1 s and the brief ~5 s, but the model sometimes returns nothing for answerable questions once history and lookups accumulate; qwen3.6:27b answered every test case correctly at 40–70 s per answer. Hence 7B by default, an env route for a larger brief model, and the labelled rule fallback.
  - **Gave up:** orchestration in the browser for now; it moves server-side with T83 and M5. Gateway metering isn't persisted to `llm_calls` yet (T37–T40).
- **Date:** 2026-10-29

## TD-61 — Test card numbers live in fixture files; the PAN scan rule covers the prototype too *(build-time)*

- **Decision:** How to keep `make secrets-scan` at zero findings while tests, the console and the prototype need published test card numbers.
- **Options considered:**
  - Allowlist whole test directories
  - Keep the rule strict, move card-number literals into fixture modules, and allow only the known test numbers there and in the static prototype's demo text
  - Build numbers at runtime everywhere to dodge the regex
- **Choice made:** the second. Test numbers live in `backend/tests/fixtures/pans.py` and `console/src/test/fixtures/pans.ts`. The `pan` rule's allowlist (path AND known-test-number regex) adds `console/src/test/fixtures/` and `prototype/`. False positives that weren't card numbers (the nil UUID, a "1234 5678…" placeholder) were rewritten instead of allowlisted. Generated, gitignored caches and build output are excluded from working-tree scans.
- **Why:**
  - **The rule stays meaningful.** Any other 13–19 digit sequence anywhere still fails the scan, including a real-looking number pasted into a test.
  - **One place to look.** Every card-number literal in the repo is in a fixture file or the prototype's demo copy.
  - **Gave up:** a little indirection in tests (they import the number instead of inlining it).
- **Date:** 2026-10-29
