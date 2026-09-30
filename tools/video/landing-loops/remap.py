"""remap.py OLD_MARKS_DIR specs.json > specs.new.json

Re-times the landing-loop specs after a re-record. Each spec piece [a, b, speed]
is in seconds from its chapter's capture start. A time t is re-expressed as
(segment id, offset inside that segment) against the OLD take's marks, then
mapped onto the NEW take's mark for the same segment. Chapters whose old marks
are missing keep their times (same TTS durations, so the segment grid barely
moves) and are flagged on stderr for a visual check.
"""
import json
import os
import sys

OLD, SPEC = sys.argv[1], sys.argv[2]
NEW = '/home/claude/video/build'


def segs(path):
    if not os.path.exists(path):
        return None
    m = json.load(open(path))['marks']
    return [(x['id'], x['t'] / 1000) for x in m if x['kind'] == 'seg']


def remap(t, old, new):
    if not old or not new:
        return t
    nd = dict(new)
    cur = None
    for sid, st in old:
        if st <= t:
            cur = (sid, st)
    if cur is None or cur[0] not in nd:
        return t
    return round(nd[cur[0]] + (t - cur[1]), 2)


specs = json.load(open(SPEC))
for name, v in specs.items():
    for s in v['segs']:
        ch = s['cap']
        base = 'desktop' if ch.startswith('d') else 'mobile'
        old = segs(f'{OLD}/{base}/{ch}/marks.json')
        new = segs(f'{NEW}/{base}/rec/{ch}/marks.json')
        if not old:
            print(f'{name}: {ch} has no old marks, times kept', file=sys.stderr)
        pieces = []
        for a, b, sp in s['pieces']:
            na = remap(a, old, new)
            nb = remap(b, old, new) if remap(b, old, new) > na else na + (b - a)
            # keep contiguous pieces contiguous
            if pieces and abs(pieces[-1][1] - na) < 0.5 and abs(a - s['pieces'][len(pieces) - 1][1]) < 1e-6:
                na = pieces[-1][1]
            pieces.append([na, round(nb, 2), sp])
        if pieces != s['pieces']:
            print(f'{name}: {ch} {s["pieces"]} -> {pieces}', file=sys.stderr)
        s['pieces'] = pieces
print(json.dumps(specs, indent=1))
