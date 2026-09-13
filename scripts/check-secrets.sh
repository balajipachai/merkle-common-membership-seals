#!/usr/bin/env bash
# Fails the build if any tracked (or about-to-be-tracked) file contains a
# private key, mnemonic, well-known anvil/hardhat key, API key, or a
# credentialed URL. Run as part of `npm test`.
#
# Written for bash 3.2 (macOS system bash) as well as bash 4+: no mapfile,
# no associative arrays.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

FILE_LIST="$(mktemp)"
trap 'rm -f "$FILE_LIST" "${FILE_LIST}.scan"' EXIT

if git rev-parse --git-dir >/dev/null 2>&1; then
  git ls-files > "$FILE_LIST"
  git diff --cached --name-only --diff-filter=ACM >> "$FILE_LIST" 2>/dev/null || true
else
  # No git repo yet: approximate "tracked files" by walking the tree and
  # excluding what .gitignore excludes, so cupboard/, real member CSVs, and
  # .env.local are never scanned as if they were about to be committed.
  find . -type f \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -not -path "./.next/*" \
    -not -path "./.cache/*" \
    -not -path "./cupboard/*" \
    -not -path "./contracts/dependencies/*" \
    -not -path "./contracts/out/*" \
    -not -path "./contracts/cache/*" \
    -not -path "./contracts/broadcast/*/31337/*" \
    -not -name "*.csv" \
    -not -name ".env" \
    -not -name ".env.local" \
    -not -name ".env.*.local" \
    -not -name "*.tsbuildinfo" \
    | sed 's|^\./||' >> "$FILE_LIST"
  # ...except the one CSV meant to be tracked: the fake example fixture.
  [ -f "examples/members.example.csv" ] && echo "examples/members.example.csv" >> "$FILE_LIST"
fi
sort -u -o "$FILE_LIST" "$FILE_LIST"

FAIL=0

# Excludes this script (it necessarily contains the patterns as text) and
# lockfiles (too noisy / not a secret surface).
grep -vE '^(scripts/check-secrets\.sh|package-lock\.json|contracts/soldeer\.lock)$' "$FILE_LIST" > "${FILE_LIST}.scan" || true

fail_on_pattern() {
  pattern="$1"
  description="$2"
  matches=""
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    if grep -IlE "$pattern" "$f" >/dev/null 2>&1; then
      matches="$matches
  - $f"
    fi
  done < "${FILE_LIST}.scan"
  if [ -n "$matches" ]; then
    echo "FAIL: $description"
    echo "$matches"
    FAIL=1
  fi
}

# 1. Raw 0x-prefixed 32-byte private keys (64 hex chars).
fail_on_pattern '0x[0-9a-fA-F]{64}' "possible raw private key (0x + 64 hex chars)"

# 2. Well-known anvil/hardhat default account private keys (first three, with and without 0x).
fail_on_pattern 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' "well-known anvil/hardhat default private key #0"
fail_on_pattern '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' "well-known anvil/hardhat default private key #1"
fail_on_pattern '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' "well-known anvil/hardhat default private key #2"

# 3. BIP-39 mnemonic-shaped credential assignment (12+ lowercase words after '=').
fail_on_pattern '(MNEMONIC|SEED_PHRASE)[[:space:]]*=[[:space:]]*"?([a-z]+[[:space:]]+){11,}[a-z]+' "possible mnemonic/seed phrase"
# The well-known anvil/Hardhat default mnemonic, anywhere, regardless of assignment shape.
fail_on_pattern 'test test test test test test test test test test test junk' "well-known anvil/hardhat default mnemonic"

# 4. PEM-encoded private key material.
fail_on_pattern 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' "PEM private key block"

# 5. Credentialed URLs (scheme://user:pass@host).
matches=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  hits="$(grep -IEo '[a-zA-Z][a-zA-Z0-9+.-]*://[^/@[:space:]"'"'"']+:[^/@[:space:]"'"'"']+@' "$f" 2>/dev/null || true)"
  [ -n "$hits" ] && matches="$matches
  - $f"
done < "${FILE_LIST}.scan"
if [ -n "$matches" ]; then
  echo "FAIL: URL with an embedded credential"
  echo "$matches"
  FAIL=1
fi

# 6. A BASESCAN_API_KEY / any *_API_KEY assigned to something other than empty/placeholder,
#    outside of .env.example.
matches=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    .env.example) continue ;;
  esac
  hits="$(grep -E '^[A-Z_]*API_KEY=.+' "$f" 2>/dev/null || true)"
  [ -n "$hits" ] && matches="$matches
  - $f"
done < "${FILE_LIST}.scan"
if [ -n "$matches" ]; then
  echo "FAIL: an API key looks set to a real value in a tracked file"
  echo "$matches"
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "check-secrets: one or more checks failed. Remove the secret and use environment variables instead."
  exit 1
fi

echo "check-secrets: clean"
