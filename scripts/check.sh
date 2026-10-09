#!/usr/bin/env bash
# Quality gate. Prints one line per passing step and only the tail of a failing
# step's log, so agents spend tokens on failures, not on noise.
#
#   scripts/check.sh                   typecheck + lint + unit tests (whole project)
#   scripts/check.sh full              ... + production build + e2e/a11y tests
#   scripts/check.sh --scope <word>    fast checks limited to files whose path contains <word>
#                                      (lets two features be built in parallel without
#                                      failing on each other's work in progress)
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="fast"
SCOPE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    full) MODE="full" ;;
    --scope) SCOPE="$2"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

LOG_DIR="$(mktemp -d)"
FAILED=0

report() {
  local name="$1" ok="$2"
  if [[ "$ok" == 0 ]]; then
    echo "✓ $name"
  else
    echo "✗ $name"
    tail -n 40 "$LOG_DIR/$name.log" | sed 's/^/    /'
    FAILED=1
  fi
}

step() {
  local name="$1"; shift
  "$@" >"$LOG_DIR/$name.log" 2>&1
  report "$name" "$?"
}

typecheck() {
  npx next typegen >/dev/null 2>&1
  local out
  out="$(npx tsc --noEmit --pretty false 2>&1)"
  [[ -n "$SCOPE" ]] && out="$(grep -F "$SCOPE" <<<"$out")"
  echo "$out"
  [[ -z "$out" ]]
}

if [[ -n "$SCOPE" ]]; then
  mapfile -t FILES < <(git ls-files -co --exclude-standard | grep -F "$SCOPE" | grep -E '\.(ts|tsx|js|mjs)$')
  step typecheck typecheck
  if [[ ${#FILES[@]} -gt 0 ]]; then
    step lint npx eslint --max-warnings=0 "${FILES[@]}"
  else
    echo "✓ lint (no files in scope)"
  fi
  step unit npx vitest run --reporter=dot "$SCOPE"
else
  step typecheck typecheck
  step lint npx eslint --max-warnings=0 .
  step unit npx vitest run --reporter=dot
fi

if [[ "$MODE" == "full" ]]; then
  step build npx next build
  step e2e npx playwright test --reporter=line
fi

rm -rf "$LOG_DIR"
exit "$FAILED"
