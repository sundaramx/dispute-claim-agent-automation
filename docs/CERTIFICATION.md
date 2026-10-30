# Certification log — dispute-claim-agent-automation

Append-only. One entry per certification attempt.

## T1 — PASS · 2026-10-29T01:30:25.000Z
- Requirements: NFR-5, NFR-13
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `git rev-parse --is-inside-work-tree && git check-ignore -q .env && ! git check-ignore -q .env.example && make -n venv` → pass

CERTIFICATION: PASS
- [x] acceptance: Repo initialised; `.gitignore` handles every required pattern correctly (`.env`/`.env.*` ignored, `.env.example` kept); `.env.example` covers every variable in §7.2 and §8.3; all 9 Makefile targets exist; the check exits 0.
- [x] sdlc: Built exactly what T1 asked for, nothing more; Makefile is clean with `.PHONY` declared; matches ARCHITECTURE §8.3 rules (gitignore first, placeholders only); there is no logic yet, so there is nothing to unit-test.
- [x] security: No secrets in the tree; placeholders only; no Bedrock credentials, ARNs, account, profile or guardrail IDs hard-coded; tfstate and `.terraform` are ignored.

## T2 — PASS · 2026-10-29T01:35:13.579Z
- Requirements: NFR-10, NFR-13
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make venv && .venv/bin/python -c "import sys, dca; assert sys.version_info[:2] == (3, 12)" && .venv/bin/pytest backend/tests/unit/test_smoke.py -q` → pass

CERTIFICATION: PASS
- [x] acceptance: check exits 0 on a fresh copy (Python 3.12.15, `dca` imports, smoke test passes); all three packages, the runtime dependencies from §1.1, the 11 dev tools, `uv.lock` (passes `uv lock --check`) and `make venv` (uv venv + `uv sync --frozen`) are in place
- [x] sdlc: scope matches T2 exactly; ruff and mypy --strict are clean; the smoke test suits a scaffold; matches ARCHITECTURE §1.1 and TD-2
- [x] security: no secrets; `.env` is git-ignored; dependencies come from the lock; two dev-only findings via checkov (asteval, ecdsa) are not in the runtime set and are left to T97

## T3 — FAIL · 2026-10-29T01:39:40.417Z
- Requirements: NFR-10
- Implementer(s): ollama:qwen3.8-flash-next:125b-mlx, anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make lint-py` → pass

CERTIFICATION: FAIL
- [✗] acceptance: `make lint-py` exits 0, but the §3 rule "nothing except `dca.llm.providers` imports anthropic/google.genai/openai" is not enforced, and mypy strict covers all packages instead of the six named
- [✗] sdlc: the mypy config doesn't do what it says; the `pure-core` contract misses `psycopg` and I/O-doing core modules; the ruff config and stub layout are fine
- [✗] security: no secrets or forbidden patterns, but the LLM SDK boundary (NFR-9, TD-23) can be bypassed from `dca.llm.*` and `dca.cli`
FIXES:
- backend/.importlinter: rewrite contract `sdk-only-in-providers` with `source_modules = dca`, `forbidden_modules = anthropic, google, openai`, and `ignore_imports = dca.llm.providers.** -> anthropic`, `dca.llm.providers.** -> google`, `dca.llm.providers.** -> openai`, plus `unmatched_ignore_imports_alerting = none`. I tested this in a scratch copy: imports from providers are kept, and imports from `dca.llm.routing`, `dca.llm.__init__` and `dca.cli` are flagged as broken.
- backend/.importlinter: in contract `pure-core`, also forbid `psycopg`, `dca.llm`, `dca.workflow`, `dca.scheduler`, `dca.audit`, `dca.approvals`, `dca.agents` and `dca.metrics`. Add `google` to the `agents-no-effects` forbidden modules so it matches "any provider SDK".
- backend/mypy.ini: replace `strict = True` in the per-module section with the explicit per-module flags: `disallow_untyped_defs`, `disallow_incomplete_defs`, `disallow_untyped_calls`, `disallow_untyped_decorators`, `disallow_any_generics`, `disallow_subclassing_any`, `check_untyped_defs`, `no_implicit_reexport`, `warn_return_any`, `strict_equality`, `extra_checks`. Put `warn_redundant_casts` and `warn_unused_ignores` in `[mypy]`. Then confirm an untyped def in `dca.api` passes and one in `dca.policy` fails.

## T3 — PASS · 2026-10-29T01:40:54.227Z
- Requirements: NFR-10
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make lint-py` → pass

CERTIFICATION: PASS
- [x] acceptance: `make lint-py` exits 0; ruff (with security rules), strict mypy on the 6 packages, the §3 import contracts and the §9 stub packages are all in place, and each gate was shown to catch a planted violation
- [x] sdlc: config is minimal and readable, matches ARCHITECTURE §3/§9 and TD-23, and adds nothing beyond the task
- [x] security: S rules enforced, no secrets in the repo, `.env` gitignored, tool caches self-ignored, boundaries keep the vault isolated and LLM SDKs confined to `dca.llm.providers`

## T4 — FAIL · 2026-10-29T01:43:02.130Z
- Requirements: NFR-10, NFR-13
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/integration/test_pg_fixture.py -q` → pass

CERTIFICATION: FAIL
- [x] acceptance: compose service matches spec (pg16 pinned by digest, 55432, tmpfs); fixture auto-starts it, gives a fresh database each session and respects DCA_TEST_DATABASE_URL; check passes
- [✗] sdlc: `make lint-py` regressed (T3 gate): ruff S603 ×2 in backend/tests/conftest.py, which violates NFR-10 AC 5 (zero errors)
- [x] security: no real secrets; test credential is loopback-only and throwaway; fixed-argv subprocess with no shell; database name passed through sql.Identifier
FIXES:
- backend/tests/conftest.py: add `# noqa: S603` with a short reason (fixed argv, no shell) to both `subprocess.run` calls (lines 27 and 39), then confirm `make lint-py` exits 0
- backend/tests/conftest.py: (recommended) replace `make_conninfo(**params)` with `make_conninfo(admin_url, dbname=name)` and move the `CREATE DATABASE` block inside the `try` so the container is always torn down

## T4 — PASS · 2026-10-29T01:44:09.196Z
- Requirements: NFR-10, NFR-13
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/integration/test_pg_fixture.py -q` → pass

CERTIFICATION: PASS
- [x] acceptance: Check passes (PG 16 confirmed); the digest-pinned compose service on 55432 with tmpfs data, the start-on-demand fixture, a new database each session and the external-URL path all work when run.
- [x] sdlc: The test checks the live server version; ruff, format and mypy are clean; the code is short and documented and matches ARCHITECTURE.md's compose-based Postgres test strategy.
- [x] security: The port listens only on this machine; the only credential is a test-only password for a throwaway tmpfs container; database names are safely quoted; subprocess calls use a fixed argument list with no shell.

## T5 — PASS · 2026-10-29T01:46:33.645Z
- Requirements: NFR-10
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `cd console && npm ci && npx tsc --noEmit && npx eslint . && npx vitest run src/App.test.tsx` → pass

CERTIFICATION: PASS
- [x] acceptance: I re-ran the T5 check and `make lint-ts` (both exit 0). Vite/React/TS strict, flat ESLint config, Vitest+jsdom+Testing Library, Playwright and @axe-core/playwright devDeps and a v3 lockfile are all present, covering NFR-10 AC 5 tsc/ESLint.
- [x] sdlc: the App shell test checks a real heading by role, ESLint rules really fire on bad code, the code is small and readable, and it matches the ARCHITECTURE.md static-check and test stack.
- [x] security: no secrets in the repo, `node_modules` and `.env` are git-ignored, npm audit found 0 vulnerabilities, and I saw no forbidden patterns.

## T6 — PASS · 2026-10-29T01:47:36.133Z
- Requirements: NFR-10
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `grep -q '^## TD-49' TRADEOFFS.md` → pass

CERTIFICATION: PASS
- [x] acceptance: TD-49 heading exists and the entry records options, choice, why (including what was given up) and date for Vitest + Testing Library alongside TD-20's Playwright and axe; check exits 0.
- [x] sdlc: added at the end of the file with a unique, in-order ID in the house format; matches the console tooling T5 installed.
- [x] security: documentation-only change; no secrets, credentials or forbidden patterns added.

## T7 — PASS · 2026-10-29T01:49:43.040Z
- Requirements: NFR-5, NFR-13
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make tools && ./.tools/bin/terraform version && ./.tools/bin/tflint --version && ./.tools/bin/gitleaks version` → pass

CERTIFICATION: PASS
- [x] acceptance: `make tools` installs pinned terraform 1.9.8, tflint 0.53.0 and gitleaks 8.21.2 for the host OS/arch into ./.tools/bin with SHA-256 verification; re-runs are idempotent and version drift is repaired; the check exits 0
- [x] sdlc: small, readable script with `set -euo pipefail` that fails closed on mismatch or missing checksum; scope matches T7 exactly; matches ARCHITECTURE/PLAN (project-local tools, nothing global)
- [x] security: no secrets; HTTPS-only downloads with `curl -f`; nothing installed on a checksum failure; `.tools/` gitignored. Advisory: checksum lists come from the same origin, so consider hardcoding expected hashes

## T8 — FAIL · 2026-10-29T01:51:34.930Z
- Requirements: NFR-5
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make secrets-scan` → pass

CERTIFICATION: FAIL
- [✗] acceptance: `make secrets-scan` passes only while `.env` is absent; after `make init-secrets` it fails with 9 findings on `.env`. The allow-list covers whole folders, not just test-range PANs as T8 requires.
- [✓] sdlc: The Makefile and `scripts/init-secrets.sh` are small and readable. Re-running doesn't overwrite `.env`, and the history scan correctly turns on once commits exist.
- [✗] security: Any kind of secret in `backend/tests/fixtures/` or `eval/corpus/` is silently allowed, and there's no rule to catch card numbers, so real PANs in source go undetected.
FIXES:
- `.gitleaks.toml`: remove `backend/tests/fixtures/.*` and `eval/corpus/.*` from the global `[allowlist].paths`.
- `.gitleaks.toml`: add a custom `[[rules]]` (e.g. `id = "pan"`) that matches 13–19 digit card numbers (optional space or dash separators). Give it a rule-scoped allowlist that suppresses matches only when the file is under `backend/tests/fixtures/` or `eval/corpus/` and the match is a known test-range PAN (e.g. the Visa, Mastercard and Amex test-range numbers). Use `[rules.allowlist]` with `paths`, `regexes` and `condition = "AND"`.
- `.gitleaks.toml` and `Makefile`: stop the working-tree scan from flagging the gitignored local `.env`. For example, add `'''^\.env$'''` to the global allowlist paths and add a step to the `secrets-scan` target that fails if `.env` is tracked (`! git ls-files --error-unmatch .env 2>/dev/null`). The history scan still catches a committed `.env`.
- Re-verify: in a scratch copy, `make init-secrets && make secrets-scan` must exit 0. An AWS key placed in `backend/tests/fixtures/` must be flagged, as must a non-test PAN in `backend/src/`.

## T8 — FAIL · 2026-10-29T01:53:42.931Z
- Requirements: NFR-5
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make secrets-scan` → pass

CERTIFICATION: FAIL
- [✗] acceptance: `make secrets-scan` exits 0 and `make init-secrets` creates every required secret, but the card-number allow-list also covers `docs/CERTIFICATION.md` and `prototype/intake.html`, beyond the two folders T8 allows.
- [x] sdlc: The Makefile, `.gitleaks.toml` and `scripts/init-secrets.sh` are small and readable. `init-secrets` never overwrites `.env` and writes it with umask 077. The history scan turns on once commits exist.
- [✗] security: The global `^\.env$` path allow-list also hides `.env` from the history scan, so a `.env` committed then removed passes. Confirmed: default gitleaks rules find 10 leaks in that commit; `make secrets-scan` reports none.
FIXES:
- `.gitleaks.toml`: remove `'''^\.env$'''` from the global `[allowlist].paths`, so the history scan (`gitleaks detect` without `--no-git`) checks a committed `.env`.
- Add `.gitleaks.worktree.toml` with `[extend] path = ".gitleaks.toml"` and a global allow-list containing only `'''^\.env$'''`. In `Makefile`, point only the `--no-git` working-tree scan at it with `--config .gitleaks.worktree.toml`; keep `--config .gitleaks.toml` for the history scan.
- `.gitleaks.toml`: remove `^docs/CERTIFICATION\.md$` and `^prototype/intake\.html$` from `[rules.allowlist].paths`. Then either mask the value in `prototype/intake.html` (e.g. `4111 •••• •••• 1111`), or log the exception in `TRADEOFFS.md` and change the T8 text in `PLAN.md` to match. Do the same for `docs/CERTIFICATION.md`.
- Re-verify in a scratch repo: `make init-secrets && make secrets-scan` exits 0. Then commit `.env` with `git add -f`, untrack it, commit again, and confirm `make secrets-scan` exits non-zero.

## T8 — FAIL · 2026-10-29T03:54:54.253Z
- Requirements: NFR-5
- Implementer(s): ollama:qwen3.8-flash-next:125b-mlx, ollama:qwen3.6:27b-mlx · Validator: anthropic:claude-sonnet-5-5
- Verify: `make secrets-scan` → pass

CERTIFICATION: FAIL
- [✗] acceptance: `make secrets-scan` exits 0 now only because the history scan is skipped. The bare `.gitleaks.toml` reports 3 PAN findings in `docs/CERTIFICATION.md` line 113, so it will fail after the first commit. The allow-list scope also exceeds the task, because `.gitleaks.worktree.toml` exempts `docs/CERTIFICATION.md` and `.env`.
- [x] sdlc: `init-secrets.sh` is idempotent, non-overwriting and uses cryptographic randomness. The Makefile targets are clear. TD-50 records the decision, but it accepts a red history scan.
- [✗] security: Allow-listing a whole documentation file from all rules weakens secret detection. The scan config should be single and strict, with zero findings in committed content.

FIXES:
- Mask or remove the literal PANs on line 113 of `docs/CERTIFICATION.md` (for example `4111…1111`, or describe them without digits). That file is Validator-owned, so the orchestrator or Validator must do this, not the Implementer.
- Delete `docs/CERTIFICATION.md` from the allow-list in `.gitleaks.worktree.toml`, so only the gitignored `.env` remains exempt (or use one config for both scans).
- Update `TRADEOFFS.md` with a new append-only entry that supersedes TD-50.
- Verify by running `gitleaks detect --no-git --config .gitleaks.toml` with `.env` excluded, or in a scratch repo that has the commit. Both must report zero leaks.

## T8 — PASS · 2026-10-29T03:57:07.747Z
- Requirements: NFR-5
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `make secrets-scan` → pass

CERTIFICATION: PASS
- [x] acceptance: `make secrets-scan` exits 0; working-tree scan + history scan (when HEAD exists) via `.gitleaks.toml`; card-number exemption limited to test cards under `backend/tests/fixtures` and `eval/corpus`; `make init-secrets` generates all required random secrets plus seeded-user passwords
- [x] sdlc: scope matches T8 (the worktree config file is a small, documented addition, TD-51); targets are simple and readable; the history branch is untested until the first commit
- [x] security: no secrets tracked; `.env` gitignored, created owner-only, never overwritten; a tracked `.env` fails the scan; random values come from Python's `secrets` module; planted secrets are detected

## T9 — FAIL · 2026-10-29T04:16:48.362Z
- Requirements: FR-20, NFR-11
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_models.py backend/tests/unit/domain/test_money_ids.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: `Decision.confidence` is a float, not the Decimal required by §6.2/§5.3 (NFR-11 replay); proposal statuses don't match the §2.3 lifecycle; `Money` takes floats despite "no floats"
- [✗] sdlc: stray `*.py-E` files in the source tree; ruff check (6 errors) and ruff format (3 files) fail; tests miss the contract gaps and one asserts float multiplication works
- [x] security: no secrets or unsafe patterns; validation gaps (negative proposal amount, bool as money) are covered under acceptance
FIXES:
- Delete `backend/src/dca/domain/ids.py-E`, `models.py-E`, `money.py-E`.
- In `backend/src/dca/domain/models.py`, make `Decision.confidence` a `Decimal` in [0,1] with at most 4 decimal places (e.g. `condecimal(ge=0, le=1, decimal_places=4)`), and add a test that the stored value is a `Decimal`.
- In `backend/src/dca/domain/models.py`, replace `PROPOSAL_STATUS_VALUES` with a `ProposalStatus` matching §2.3 exactly: `pending_approval, approved, executing, executed, failed, rejected, returned, superseded, auto_approved`. Update `test_models.py` to check every value and reject `pending` and `cancelled`.
- In `backend/src/dca/domain/models.py`, add `ge=1` to `ActionProposal.amount_minor`, make `rule_ids` items non-empty strings (`min_length=1`), and add a validator on `ConfidenceComponents` that the three weights sum to 1 (compare as Decimal). Add tests for each.
- In `backend/src/dca/domain/money.py`, reject `float` and `bool` in `__init__` and `__mul__`, and accept only `int` or `Decimal`. Raise `ValueError` when a Decimal amount has more than 2 decimal places instead of truncating. Give `__mul__` an explicit rounding mode (e.g. `ROUND_HALF_EVEN` via `quantize`) and return `NotImplemented` for anything that isn't an int or Decimal. In `backend/tests/unit/domain/test_money_ids.py`, swap `test_multiply_by_float` for a test that floats are rejected, and add tests for bool, sub-cent and rounding cases.
- In `backend/src/dca/domain/ids.py`, lowercase string input in `is_uuid_v7`.
- Run `cd backend && ../.venv/bin/ruff check --fix src/dca/domain tests/unit/domain && ../.venv/bin/ruff format src/dca/domain tests/unit/domain`, then re-run the T9 check.

## T9 — FAIL · 2026-10-29T11:42:10.633Z
- Requirements: FR-20, NFR-11
- Implementer(s): ollama:qwen3.8-flash-next:125b-mlx, ollama:qwen3.6:27b-mlx · Validator: anthropic:claude-sonnet-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_models.py backend/tests/unit/domain/test_money_ids.py -q` → pass

CERTIFICATION: FAIL
- [x] acceptance: Verify command passes (77 tests). ids, money and the six §6.2 models are present, with extra forbid, closed enums, and integer USD-only money that rejects float and bool.
- [✗] sdlc: `mypy src` reports 4 errors in `money.py` and `models.py`, so `make lint-py` fails. NaN and Infinity inputs to `Money` raise an accidental `TypeError`, and no test covers them.
- [x] security: No secrets found. Inputs are strictly validated: floats are rejected, amounts are bounded, and `extra` fields are forbidden.

FIXES:
- In `backend/src/dca/domain/models.py` (line ~172), replace `confidence: condecimal(ge=0, le=1, decimal_places=4)` with `Annotated[Decimal, Field(ge=0, le=1, decimal_places=4)]` and drop the unused `condecimal` import.
- In `backend/src/dca/domain/money.py` (line ~28), reject non-finite Decimals first, with `if not amount.is_finite(): raise ValueError(...)`. Then read `exponent` through a typed path (for example `exp = amount.as_tuple().exponent; if isinstance(exp, int) and exp < -2`) so mypy passes.
- In `backend/tests/unit/domain/test_money_ids.py`, add tests that `Money(Decimal("NaN"))` and `Money(Decimal("Infinity"))` raise `ValueError`.
- Re-run `cd backend && ../.venv/bin/mypy src && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check .` and the T9 check command. All must pass.

## T9 — FAIL · 2026-10-29T11:44:15.528Z
- Requirements: FR-20, NFR-11
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_models.py backend/tests/unit/domain/test_money_ids.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: the "integer minor units, no floats" contract is broken (`amount_minor` accepts 100.0/True/"4999"), and serialised field names (`hash_`/`type_`) contradict the exported JSON Schema and ARCHITECTURE §6.2
- [✗] sdlc: tests pass but lock in the cents-vs-dollars `Money` constructor, two tests are mislabelled, and float rejection, schema/output parity and UUIDv7 ordering are untested
- [✗] security: weak input validation on the LLM-output contract (float/bool/str coerced into money) and on case refs (trailing newline, Unicode digits, seq 0); no secrets or forbidden patterns found
FIXES:
- backend/src/dca/domain/models.py: make `amount_minor` in `ExtractedClaim` and `ActionProposal` `Annotated[StrictInt, Field(ge=1)] | None` (or `strict=True`) so float, bool and str are rejected.
- backend/src/dca/domain/models.py: add `serialize_by_alias=True` to the `model_config` of `AuditEvent` and `PrincipalRef` (Pydantic 2.14 supports it) so dumps emit `hash`/`type`, matching the JSON Schema.
- backend/src/dca/domain/money.py: make `Money(...)` take only int minor units (reject Decimal there), add an explicit `Money.from_major(Decimal)` classmethod, and block attribute assignment (e.g. a `__setattr__` that raises after init) so it is really immutable.
- backend/src/dca/domain/ids.py: use `re.fullmatch` with `[0-9]` (or `re.ASCII`) in both `_CASE_REF_PATTERN` and `UUIDV7_PATTERN`, and have `parse_case_ref` reject seq 0 to match `make_case_ref`.
- backend/tests/unit/domain/test_models.py: add tests that `amount_minor` rejects 100.0, True and "4999" (Python and JSON input), and that `model_dump(mode="json")` for each contract validates against its `model_json_schema()` field names; rename `test_weights_out_of_range` to match what it tests.
- backend/tests/unit/domain/test_money_ids.py: update the Money tests for `from_major`, add tests for the case-ref trailing newline, Unicode digits and seq 0, add a test that UUIDv7 values generated across milliseconds sort in order, and rename `test_lowercase_string_input_accepted`.

## T9 — PASS · 2026-10-29T11:46:27.001Z
- Requirements: FR-20, NFR-11
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_models.py backend/tests/unit/domain/test_money_ids.py -q` → pass

CERTIFICATION: PASS
- [x] acceptance: ids/money/models match PLAN T9 and ARCHITECTURE §6.2 exactly (extra forbid, closed enums, integer cents, USD only, UUIDv7, DSP-YYYY-NNNNNN); check passes 93/93; NFR-11 determinism holds for these modules
- [x] sdlc: tests check real behaviour (strict int inputs, schema/dump alignment, round-trips, enum completeness); ruff, ruff format and mypy are clean; code is readable and in the documented layout
- [x] security: no secrets (gitleaks clean), no forbidden patterns, input rejected by default (unknown fields, non-finite numbers, float money, out-of-range values)

## T10 — FAIL · 2026-10-30T00:46:35.038Z
- Requirements: FR-20
- Implementer(s): ollama:qwen3.6:27b-mlx · Validator: anthropic:claude-sonnet-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_state_machine.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: the case table matches §2.3 and the 84 tests pass, but proposal illegal transitions raise `IllegalProposalTransition`, which does not subclass `IllegalTransition`, so "any undefined transition raises IllegalTransition" is not met.
- [✗] sdlc: `ruff check`, `ruff format --check` and `mypy` fail on the touched files, so `make lint-py` would fail; some tests only restate the table, and none checks every pair outside it.
- [x] security: no secrets, I/O or injection surface in this pure module.

FIXES:
- In `backend/src/dca/domain/state_machine.py`, make `IllegalProposalTransition` subclass `IllegalTransition`, with the message built correctly. Add a test in `backend/tests/unit/domain/test_state_machine.py` that `validate_proposal_transition` raises `IllegalTransition`.
- In `backend/src/dca/domain/state_machine.py`, replace `set(ProposalState.__args__)  # type: ignore[arg-type]` with `typing.get_args(ProposalState)`, and do the same for `CaseState`. Then `cd backend && ../.venv/bin/mypy src` must pass.
- Run `cd backend && ../.venv/bin/ruff check --fix . && ../.venv/bin/ruff format src/dca/domain/state_machine.py tests/unit/domain/test_state_machine.py` so the module and its test file pass ruff, with the file indentation normalised to 4 spaces.
- In `backend/tests/unit/domain/test_state_machine.py`, add an exhaustive test over the product of all `CaseState` values. It should assert that `validate_transition` succeeds exactly for the pairs in `TRANSITIONS` and raises for every other pair, including an unknown state name. Add the same test for the proposal states.

## T10 — FAIL · 2026-10-30T00:47:57.598Z
- Requirements: FR-20
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_state_machine.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: all §2.3 transitions and the proposal lifecycle are present and undefined ones raise `IllegalTransition`, but no test pins the table, so a wrongly added edge passes (`triaged → closed` mutant survived)
- [✗] sdlc: code is clean and readable (ruff, format, mypy pass), but the "exhaustive" tests check the table against itself and catch nothing
- [x] security: pure domain module, no secrets, I/O or forbidden patterns; unknown states are rejected

FIXES:
- In `backend/tests/unit/domain/test_state_machine.py`, add exact-equality tests: `assert TRANSITIONS == expected` (built from `_ALLOWED`) and `assert PROPOSAL_TRANSITIONS == expected` (built from `_PROPOSAL_ALLOWED`). Also rewrite `test_case_transitions_exhaustive` and `test_proposal_transitions_exhaustive` to check against those hard-coded lists, not the module's own tables. Re-run the suite and confirm the `triaged → closed` mutant now fails.
- Orchestrator/Architecture, before T28 and T54: settle the conflict between ARCHITECTURE.md §2.3 and §5.2/§5.6 (`<any working state> → needs_attention` and the return path from `needs_attention`; `auto_approved | executing → pending_approval` on auto-approve OFF; `approved → superseded`). Record the decision in TRADEOFFS.md, then update `backend/src/dca/domain/state_machine.py` and its tests to match.

## T10 — PASS · 2026-10-30T00:49:45.088Z
- Requirements: FR-20
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/domain/test_state_machine.py -q` → pass

CERTIFICATION: PASS
- [x] acceptance: FR-20 part 1 met: closed case and proposal tables cover all §2.3 states plus the TD-52 edges, and every undefined or unknown transition raises IllegalTransition (checked against all state pairs; 111/111 tests pass)
- [x] sdlc: tests compare the table exactly and catch changes; ruff, format, mypy --strict and import contracts are clean; TD-52 recorded in TRADEOFFS (the §2.3 diagram in ARCHITECTURE.md still needs updating)
- [x] security: pure module with no I/O, secrets or forbidden patterns, and gitleaks finds nothing in the T10 files (the failing secrets scan comes from T9's test_money_ids.py, outside T10)

## T11 — FAIL · 2026-10-30T01:13:44.354Z
- Requirements: FR-4, NFR-11
- Implementer(s): ollama:qwen3.6:27b-mlx, anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/regclock/test_calendar.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: holiday YAML is wrong (no Juneteenth in any year; 2027-07-05, 2028-02-21, 2029-10-08, 2030-01-21 wrong or missing; 2027-12-31 missing by the file's own rule), and the 17:00 issuer-local cut-off is never applied (TD-14/§5.6)
- [✗] sdlc: `make lint-py` fails on calendar.py (ruff I001/E501, format, mypy yaml stubs plus line 139); tests only spot-check holidays, so they're too weak to catch bad data
- [x] security: yaml.safe_load, no secrets, pure module, no forbidden patterns
FIXES:
- Fix `policies/calendar/us-business-days.yaml`: add Juneteenth for 2025–2030 (2027 observed 2027-06-18). Replace 2027-07-04→2027-07-05, 2028-02-20→2028-02-21, 2029-10-15→2029-10-08, 2030-01-14→2030-01-21. Replace 2028-01-01 with 2027-12-31 (Saturday→Friday, the rule the file already uses). Correct the header comment to "Sat→Fri / Sun→Mon observance".
- In `backend/src/dca/regclock/calendar.py`, add a cut-off method (e.g. `effective_received_date(received_at: datetime) -> date`). It should convert an aware datetime to `issuer_tz`, roll to the next business day if the local time is at or after `cutoff_local` or the day isn't a business day, and reject naive datetimes.
- In `backend/src/dca/regclock/calendar.py`, read `timezone`, `cutoff_local` and `version` from the YAML when constructor arguments aren't given, and expose `version` as an attribute.
- In `backend/src/dca/regclock/calendar.py`, fix lint: sort the imports, wrap `_DEFAULT_YAML` (e.g. `Path(__file__).resolve().parents[4] / ...`), run `ruff format`, fix the `ref` type at line 139, and add `types-PyYAML` to the backend dev dependencies in `backend/pyproject.toml`.
- In `backend/tests/unit/regclock/test_calendar.py`, add a test that computes the 11 federal holidays per year from the rules and compares them exactly to the YAML. Add cut-off tests: 16:59 vs 17:00 New York time, a Friday-evening notice rolling to Monday, a UTC input crossing midnight in New York, and rejection of naive datetimes.

## T11 — FAIL · 2026-10-30T01:15:29.345Z
- Requirements: FR-4, NFR-11
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/regclock/test_calendar.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: calendar behaviour meets FR-4 AC 1 and NFR-11 and the check passes (33/33), but the PROVENANCE.md required by the task is factually wrong and incomplete
- [✗] sdlc: tests are strong, ruff/mypy are clean and coverage is 97%, but the provenance record doesn't follow ARCHITECTURE §1.2 (no source date, licence note or snapshot, and the contract changes aren't documented)
- [x] security: no secrets, YAML read with safe_load, no I/O beyond the policy file, times without a timezone are rejected, dates outside coverage fail loudly
FIXES:
- Rewrite `backend/src/dca/_vendor/calendar/PROVENANCE.md`: remove the "original source was not available" claim and the "should be filled in" note. Record the source path `disputes-claims-decision-engine/app/chassis/calendar.py`, source date 2026-08-01 and SHA-256 `ad2c3d0c2f73af60adb00aefe6332b54a6d1980222eb4b2264e0985a7e0f4d97` as the snapshot reference, since the repo isn't under git.
- In the same file, replace "same contract" with the actual differences: `add_business_days` now takes and returns `date` instead of `datetime` → 23:59:59 end-of-day; negative `n` is allowed instead of raising `ValueError`; `business_days_between` and `add_calendar_days` are not ported; and the 2025–2027 holiday set is confirmed identical to upstream.
- In the same file, add a licence note saying the upstream repo has no LICENSE file and the code is reused internally, as ARCHITECTURE.md §1.2 requires.

## T11 — FAIL · 2026-10-30T01:18:35.936Z
- Requirements: FR-4, NFR-11
- Implementer(s): anthropic:claude-sonnet-5-5 · Validator: anthropic:claude-opus-5-5
- Verify: `.venv/bin/pytest backend/tests/unit/regclock/test_calendar.py -q` → pass

CERTIFICATION: FAIL
- [✗] acceptance: FR-4 AC 1 met (coverage enforced loudly, 2025–2030, 180-day warning, NY timezone with 17:00 cut-off); NFR-11 AC 2 not met: calendar version is a hand label, not SHA-256 of canonical content plus label as ARCHITECTURE requires
- [✗] sdlc: tests meaningful (independent federal-rule check, cut-off/DST/UTC cases), 97% coverage, lint/format/types/import rules clean; but `coverage_warning_days` reads `date.today()` in the pure `regclock` package
- [x] security: `yaml.safe_load`, no secrets, timezone-less times rejected, no silent fallback outside coverage, no forbidden patterns
FIXES:
- In `backend/src/dca/regclock/calendar.py`, set `BusinessCalendar.version` to the SHA-256 of the YAML's canonical content (e.g. `json.dumps(cfg, sort_keys=True, separators=(",", ":"), default=str)`) combined with the YAML `version` label (e.g. `"2025.1+sha256:<hex>"`). Expose the hash as its own attribute (e.g. `content_hash`) so clocks can pin it per case.
- In `backend/tests/unit/regclock/test_calendar.py`, change `test_version_loaded` to assert the hash is present and stable across two loads, and add a test that changing one holiday (via a temp YAML through `yaml_path`) changes the version.
- In `backend/src/dca/regclock/calendar.py`, make `reference` a required argument of `coverage_warning_days` (remove the `date.today()` fallback) so the pure module never reads the wall clock; the scheduler should pass "today" in.
