#!/usr/bin/env bash
# scripts/smoke.sh — Part 29 §29.6.3. Run after every deploy; exits non-zero on
# any failure. Automated checks prove the stack is up; the two-minute manual pass
# below proves it is right.
#
#   scripts/smoke.sh https://app.udhaarbook.in                 # production: one origin behind nginx
#   scripts/smoke.sh http://localhost:3000 http://localhost:8000   # local: frontend, then API origin
#
# Sprint 12 runbook walk: this script could not pass against the product. It
# asserted `/system/health`'s `checks.migrations` and `checks.scheduler` — a
# shape §29.3.4 specifies and the endpoint does not return (it answers
# `{status, env}`; the database check is `/system/ready`) — and fetched
# `/api/v1/public/branding`, a route that does not exist. Every check below is
# against something that exists; the scheduler is checked on the host with
# `manage.py scheduler_health`, which is what the compose healthcheck runs.
set -euo pipefail
BASE="${1:?usage: smoke.sh <base-url> [api-base-url]}"
API="${2:-$BASE}"
fail() { echo "SMOKE FAIL: $*" >&2; exit 1; }

curl -sf "$API/api/v1/system/health" | jq -e '.data.status=="ok"'                    >/dev/null || fail health
curl -sf "$API/api/v1/system/ready"  | jq -e '.data.database=="ok"'                  >/dev/null || fail database
if [ -n "${EXPECTED_VERSION:-}" ]; then
  curl -sf "$API/api/v1/system/version" | jq -e --arg v "$EXPECTED_VERSION" '.data.version==$v' >/dev/null || fail version
fi
[ "$(curl -sLo /dev/null -w '%{http_code}' "$BASE/")" = "200" ]                       || fail frontend
[ "$(curl -so /dev/null -w '%{http_code}' "$BASE/login")" = "200" ]                   || fail login-page
[ "$(curl -so /dev/null -w '%{http_code}' "$API/api/v1/parties")" = "401" ]           || fail auth-required
# Part 27 §27.12 — a dead share token is a 404 that still says noindex / no-referrer.
headers="$(curl -s -D- -o/dev/null "$API/api/v1/public/d/smoke-not-a-token")"
echo "$headers" | grep -qi '^x-robots-tag: noindex'                                   || fail public-noindex
echo "$headers" | grep -qi '^referrer-policy: no-referrer'                            || fail public-referrer
curl -s -D- -o/dev/null "$API/api/v1/system/health" | grep -qi '^x-content-type-options: nosniff' \
                                                                                      || fail nosniff
if [ -f "$(dirname "$0")/smoke-static-asset" ]; then
  curl -sfI "$BASE/static/$(cat "$(dirname "$0")/smoke-static-asset")" | grep -q '200' || fail static
fi
curl -sf "$API/api/v1/system/health" -H 'X-Request-Id: smoke-1' -D- -o/dev/null \
  | grep -qi 'x-request-id: smoke-1'                                                  || fail request-id
echo "SMOKE OK"
echo
echo "On the host: docker compose exec scheduler python manage.py scheduler_health --max-age 300"
echo "Now the two-minute manual pass: log in as a test tenant, open the dashboard,"
echo "open a party's statement, open one invoice's print view."
