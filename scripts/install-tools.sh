#!/usr/bin/env bash
# Install pinned terraform, tflint, gitleaks into ./.tools/bin (project-local, idempotent).
# Each archive is verified against the publisher's SHA-256 checksum file for the pinned version.
set -euo pipefail

TERRAFORM_VERSION=1.9.8
TFLINT_VERSION=0.53.0
GITLEAKS_VERSION=8.21.2

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/.tools/bin"
TMP="$ROOT/.tools/tmp" # scratch space, gitignored via .tools/
mkdir -p "$BIN" "$TMP"

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "unsupported OS" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64; GL_ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64; GL_ARCH=arm64 ;;
  *) echo "unsupported arch" >&2; exit 1 ;;
esac

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

installed() { # NAME VERSION
  [ -x "$BIN/$1" ] || return 1
  local out
  out="$("$BIN/$1" --version 2>&1 || "$BIN/$1" version 2>&1 || true)"
  case "$out" in *"$2"*) return 0 ;; *) return 1 ;; esac
}

# install_tool NAME VERSION ARCHIVE_URL SUMS_URL ARCHIVE_FILENAME KIND
install_tool() {
  local name=$1 want=$2 url=$3 sums=$4 file=$5 kind=$6
  if installed "$name" "$want"; then echo "$name $want already installed"; return; fi
  echo "installing $name $want"
  curl -fsSL -o "$TMP/$file" "$url"
  curl -fsSL -o "$TMP/$name.sums" "$sums"
  local expected actual
  expected="$(awk -v f="$file" '$2==f || $2=="*"f {print $1}' "$TMP/$name.sums")"
  [ -n "$expected" ] || { echo "no checksum for $file" >&2; exit 1; }
  actual="$(sha256 "$TMP/$file")"
  [ "$expected" = "$actual" ] || { echo "SHA-256 mismatch for $name" >&2; exit 1; }
  mkdir -p "$TMP/x-$name"
  if [ "$kind" = zip ]; then unzip -qo "$TMP/$file" -d "$TMP/x-$name"; else tar -xzf "$TMP/$file" -C "$TMP/x-$name"; fi
  install -m 0755 "$TMP/x-$name/$name" "$BIN/$name"
}

install_tool terraform "$TERRAFORM_VERSION" \
  "https://releases.hashicorp.com/terraform/$TERRAFORM_VERSION/terraform_${TERRAFORM_VERSION}_${OS}_${ARCH}.zip" \
  "https://releases.hashicorp.com/terraform/$TERRAFORM_VERSION/terraform_${TERRAFORM_VERSION}_SHA256SUMS" \
  "terraform_${TERRAFORM_VERSION}_${OS}_${ARCH}.zip" zip
install_tool tflint "$TFLINT_VERSION" \
  "https://github.com/terraform-linters/tflint/releases/download/v$TFLINT_VERSION/tflint_${OS}_${ARCH}.zip" \
  "https://github.com/terraform-linters/tflint/releases/download/v$TFLINT_VERSION/checksums.txt" \
  "tflint_${OS}_${ARCH}.zip" zip
install_tool gitleaks "$GITLEAKS_VERSION" \
  "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/gitleaks_${GITLEAKS_VERSION}_${OS}_${GL_ARCH}.tar.gz" \
  "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/gitleaks_${GITLEAKS_VERSION}_checksums.txt" \
  "gitleaks_${GITLEAKS_VERSION}_${OS}_${GL_ARCH}.tar.gz" tgz
