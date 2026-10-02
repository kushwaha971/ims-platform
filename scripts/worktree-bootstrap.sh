#!/usr/bin/env bash
# Prepare a git worktree of this repo for a parallel development track.
# Usage: scripts/worktree-bootstrap.sh <track-name>   (run from the worktree root)
# Links the main checkout's installed node_modules (never reinstalls) and
# prints the env a track exports so its pytest uses its own test database.
set -euo pipefail
# The main checkout is wherever the shared .git lives — /home/claude/repo in the
# cloud workspace, ~/Projects/ims-platform on the owner's Mac.
MAIN=${UB_MAIN_CHECKOUT:-$(cd "$(git rev-parse --git-common-dir)/.." && pwd)}
TRACK=${1:?track name}
here=$(pwd)
[ "$here" = "$MAIN" ] && { echo "run inside a worktree, not the main checkout"; exit 1; }
for d in frontend/node_modules frontend/vendor/ml-uikit/node_modules; do
  [ -e "$here/$d" ] || ln -s "$MAIN/$d" "$here/$d"
done
echo "export UB_TEST_DB_NAME=test_ub_${TRACK//-/_}"
