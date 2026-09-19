#!/usr/bin/env bash
# scripts/smoke.sh — Part 29 §29.6.3. Run after every deploy; exits non-zero on
# any failure. Automated checks prove the stack is up; the two-minute manual pass
# below proves it is right.
set -euo pipefail
BASE="${1:?usage: smoke.sh <base-url>}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

curl -sf "$BASE/api/v1/system/health" | jq -e '.data.status=="ok"'                   || fail health
curl -sf "$BASE/api/v1/system/health" | jq -e '.data.checks.migrations=="applied"'   || fail migrations
curl -sf "$BASE/api/v1/system/health" | jq -e '.data.checks.scheduler.status=="ok"'  || fail scheduler
if [ -n "${EXPECTED_VERSION:-}" ]; then
  curl -sf "$BASE/api/v1/system/version" | jq -e --arg v "$EXPECTED_VERSION" '.data.version==$v' || fail version
fi
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/")" = "200" ]                        || fail frontend
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/login")" = "200" ]                   || fail login-page
curl -sf "$BASE/api/v1/public/branding?host=$(echo "$BASE" | sed -E 's#https?://##; s#/.*##')" \
  | jq -e '.data.app_name'                                                            || fail branding
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/api/v1/parties")" = "401" ]          || fail auth-required
if [ -f "$(dirname "$0")/smoke-static-asset" ]; then
  curl -sfI "$BASE/static/$(cat "$(dirname "$0")/smoke-static-asset")" | grep -q '200' || fail static
fi
curl -sf "$BASE/api/v1/system/health" -H 'X-Request-Id: smoke-1' -D- -o/dev/null \
  | grep -qi 'x-request-id: smoke-1'                                                  || fail request-id
echo "SMOKE OK"
echo
echo "Now the two-minute manual pass: log in as a test tenant, open the dashboard,"
echo "open a party's statement, open one invoice's print view."
