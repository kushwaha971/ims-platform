#!/usr/bin/env python3
"""Three-way merge of a conflicted flat/nested JSON file during `git merge`.

Usage: scripts/merge-json.py <path> [--sort]
Reads base/ours/theirs from the index stages, applies every key theirs added,
changed or removed relative to base on top of ours, and writes the result.
Scalar numbers changed on both sides take the larger value (bundle budgets);
lists changed on both sides are concatenated without duplicates (budget notes).
A string changed differently on both sides is reported and ours is kept.
"""
import json, subprocess, sys

path = sys.argv[1]
sort = "--sort" in sys.argv


def stage(n):
    try:
        return json.loads(subprocess.check_output(["git", "show", f":{n}:{path}"]))
    except subprocess.CalledProcessError:
        return {}


conflicts = []


def merge(base, ours, theirs, where=""):
    if isinstance(ours, dict) and isinstance(theirs, dict):
        base = base if isinstance(base, dict) else {}
        out = dict(ours)
        for k in set(base) | set(theirs):
            b, o, t = base.get(k), ours.get(k), theirs.get(k)
            if k not in theirs:  # theirs removed
                if k in ours and o == b:
                    out.pop(k, None)
                continue
            if t == b:
                continue
            if k not in ours or o == b:
                out[k] = t
            elif o != t:
                out[k] = merge(b, o, t, f"{where}.{k}")
        return out
    if isinstance(ours, list) and isinstance(theirs, list):
        return ours + [x for x in theirs if x not in ours]
    if isinstance(ours, (int, float)) and isinstance(theirs, (int, float)):
        return max(ours, theirs)
    conflicts.append(where)
    return ours


result = merge(stage(1), stage(2), stage(3))
if sort:
    result = dict(sorted(result.items()))
indent = 1 if "bundle-budgets" in path else 2
with open(path, "w") as f:
    f.write(json.dumps(result, ensure_ascii=False, indent=indent) + "\n")
for c in conflicts:
    print(f"CONFLICT kept ours: {path}{c}", file=sys.stderr)
