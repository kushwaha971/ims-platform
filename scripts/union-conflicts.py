#!/usr/bin/env python3
"""Resolve every conflict hunk in the given files by keeping ours, then theirs.
For parallel tracks that appended to the same spot; review the result."""
import re, sys
for path in sys.argv[1:]:
    text = open(path).read()
    pat = re.compile(r"^<<<<<<< [^\n]*\n(.*?)^=======\n(.*?)^>>>>>>> [^\n]*\n", re.S | re.M)
    text = pat.sub(lambda m: m.group(1) + m.group(2), text)
    open(path, "w").write(text)
