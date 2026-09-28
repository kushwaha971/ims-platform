#!/usr/bin/env bash
# Prepare a git worktree of this repo for a parallel development track.
# Usage: scripts/worktree-bootstrap.sh <track-name>   (run from the worktree root)
# Links the main checkout's installed node_modules (never reinstalls) and
# prints the env a track exports so its pytest uses its own test database.
set -euo pipefail
MAIN=/home/claude/repo
TRACK=${1:?track name}
here=$(pwd)
[ "$here" = "$MAIN" ] && { echo "run inside a worktree, not the main checkout"; exit 1; }
for d in frontend/node_modules frontend/vendor/ml-uikit/node_modules; do
  [ -e "$here/$d" ] || ln -s "$MAIN/$d" "$here/$d"
done
echo "export UB_TEST_DB_NAME=test_ub_${TRACK//-/_}"
