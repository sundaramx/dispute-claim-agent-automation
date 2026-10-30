.PHONY: secrets-scan init-secrets venv tools lint-py lint-ts test ci up seed health
venv:
	uv venv --allow-existing --python 3.12 .venv
	UV_PROJECT_ENVIRONMENT=$(CURDIR)/.venv uv sync --frozen --project backend
tools:
	./scripts/install-tools.sh
lint-py:
	cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check . && ../.venv/bin/mypy src && ../.venv/bin/lint-imports
lint-ts:
	cd console && npm ci && npx tsc --noEmit && npx eslint .
test:
	@echo "TODO: test (not yet implemented)"
ci:
	@echo "TODO: ci (not yet implemented)"
up:
	@echo "TODO: up (not yet implemented)"
seed:
	@echo "TODO: seed (not yet implemented)"
health:
	@echo "TODO: health (not yet implemented)"
secrets-scan:
	@! git ls-files --error-unmatch .env >/dev/null 2>&1 || { echo ".env is tracked"; exit 1; }
	./.tools/bin/gitleaks detect --no-git --source . --config .gitleaks.worktree.toml --redact --no-banner
	@if git rev-parse --verify -q HEAD >/dev/null; then ./.tools/bin/gitleaks detect --source . --config .gitleaks.toml --redact --no-banner; else echo "no git history yet; skipped history scan"; fi
init-secrets:
	./scripts/init-secrets.sh
