#!/usr/bin/env bash
# Generate a local .env from .env.example with random secrets. Never overwrites.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { echo ".env exists; leaving untouched"; exit 0; }
rnd() { python3 -c "import secrets;print(secrets.token_urlsafe(${1:-32}))"; }
umask 077
: > .env
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    DB_*_PASSWORD=*|DCA_VAULT_DEK=*|DCA_FINGERPRINT_HMAC_KEY=*|DCA_PII_PLACEHOLDER_KEY=*)
      echo "${line%%=*}=$(rnd 32)" >> .env ;;
    *) echo "$line" >> .env ;;
  esac
done < .env.example
for u in analyst1 analyst2 supervisor1 supervisor2 auditor1 admin1; do
  echo "DCA_SEED_PASSWORD_$(echo $u | tr a-z A-Z)=$(rnd 18)" >> .env
done
echo "wrote .env"
