#!/usr/bin/env bash
# Serve the production build the way `output: standalone` requires.
#
# `next start` CANNOT serve this build — the standalone bundle is its own
# server and `next start` answers 500/text-plain for every chunk. The two
# copies below are the documented requirement: Next deliberately leaves
# `.next/static` and `public` out of the standalone output.
#
# `rm -rf` before each copy, because `cp -r src dst` when `dst` already exists
# copies INTO it — producing `.next/standalone/.next/static/static`, a server
# that 500s on every asset, and half an hour of looking at the wrong thing.
set -euo pipefail
FE=/home/claude/repo/frontend

pkill -f "standalone/server.js" 2>/dev/null || true
# A stale `next-server` from an earlier session holds port 3000 and serves an
# OLD build, which looks exactly like a broken new one.
pkill -f "next-server" 2>/dev/null || true
sleep 2

rm -rf "$FE/.next/standalone/.next/static" "$FE/.next/standalone/public"
cp -r "$FE/.next/static" "$FE/.next/standalone/.next/static"
cp -r "$FE/public" "$FE/.next/standalone/public"

cd "$FE/.next/standalone"
PORT=3000 HOSTNAME=0.0.0.0 setsid nohup node server.js > /tmp/claude-0/fe-run.log 2>&1 < /dev/null &
sleep 7

CHUNK=$(ls "$FE/.next/static/chunks" | grep '\.js$' | head -1)
printf 'page   %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login)"
printf 'chunk  %s %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/_next/static/chunks/$CHUNK")" \
  "$(curl -s -o /dev/null -w '%{content_type}' "http://127.0.0.1:3000/_next/static/chunks/$CHUNK")"
