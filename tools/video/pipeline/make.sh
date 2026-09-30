#!/usr/bin/env bash
# End-to-end build of one video:  pipeline/make.sh <mobile|desktop|superadmin> [--dry] [--only=ch1,ch2]
#
#   1. export.mjs   story -> build/<v>/narration.json + scripts/<v>.md
#   2. tts.py       narration -> build/<v>/audio/<seg>.wav + durations.json (Kokoro hm_omega)
#   3. record.mjs   Playwright drives each segment for exactly its narration length
#                   (device-pixel JPEG frames + wall-clock marks) -> build/<v>/rec/<ch>/
#   4. edit.py      cards + recordings -> captions (ASS, Noto Sans) + cursor + loudnorm
#                   -> out/<v>.mp4 (H.264/AAC), out/<v>.srt, out/<v>.chapters.txt,
#                      out/<v>.review.jpg, out/<v>.edit-report.json
#
# --dry rehearses the actions only (no waits, one PNG per segment in build/<v>/rec/<ch>/).
# Exit code 3 from record.mjs = a password field was visible: the take is rejected.
set -euo pipefail
V="$1"; shift || true
cd "$(dirname "$0")"
node export.mjs "$V"
python3 tts.py build "$V"
node export.mjs "$V"                      # again, so the script shows measured durations
node record.mjs "$V" "$@"
if [[ " $* " != *" --dry "* ]]; then
  ONLY=$(printf '%s\n' "$@" | sed -n 's/^--only=//p')
  python3 edit.py "$V" ${ONLY:+--only "$ONLY"}
  python3 - "$V" <<'PY'
import json, sys
v = sys.argv[1]
log = json.load(open(f"/home/claude/video/build/{v}/record-log.json"))
bad = [l for l in log["log"] if l["kind"] in ("action-failed", "expect-failed", "pageerror")]
over = [l for l in log["log"] if l["kind"] == "overrun"]
print(f"review: {len(bad)} failed actions/expectations, {len(over)} overruns, {len(log['leaks'])} privacy hits")
for l in bad: print("  ", l)
for l in log["leaks"]: print("  LEAK", l)
PY
fi
