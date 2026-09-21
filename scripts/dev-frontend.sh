#!/usr/bin/env bash
# scripts/dev-frontend.sh — the native (no Docker) frontend.
#
# One thing only, and it is the thing that is easy to get wrong: outside compose,
# API_PROXY_TARGET's default (`http://backend:8000`) is a compose service name
# that does not resolve on a developer's machine, so the server-side rewrite
# fails while the browser-side calls succeed — which looks like a backend fault
# and is not one.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

PORT="${PORT:-3000}"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://localhost:8000}"

[ -d node_modules ] || { echo "── Installing dependencies ──"; npm ci; }

echo "── Serving on http://localhost:$PORT (API at $API_PROXY_TARGET) ──"
exec npx next dev -p "$PORT"
