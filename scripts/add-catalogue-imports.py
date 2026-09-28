#!/usr/bin/env python3
"""Add every `import 'src/i18n/catalogues/<name>';` that check-locales asks for.

Run from anywhere after `node frontend/scripts/split-locales.mjs`; it runs
check-locales, parses the "<file>: import '<catalogue>' — renders …" lines and
inserts each missing import after the file's last top-level import."""
import collections, pathlib, re, subprocess
fe = pathlib.Path(__file__).resolve().parents[1] / 'frontend'
out = subprocess.run(['node', 'scripts/check-locales.mjs'], cwd=fe, capture_output=True, text=True)
need = collections.defaultdict(set)
for l in (out.stdout + out.stderr).splitlines():
    m = re.match(r"\s+(\S+\.tsx?): import '([^']+)' —", l)
    if m: need[m.group(1)].add(f"import '{m.group(2)}';")
for f, imps in need.items():
    p = fe / f; lines = p.read_text().split('\n'); last = -1; in_imp = False
    for i, l in enumerate(lines):
        if l.startswith('import '): in_imp = True
        if in_imp and l.rstrip().endswith(';'): last, in_imp = i, False
        if not in_imp and re.match(r"(export|const|function|type|interface) ", l): break
    add = [x for x in sorted(imps) if x not in p.read_text()]
    if add:
        pos = last + 1 if last >= 0 else (1 if lines and lines[0].startswith("'use client'") else 0)
        lines[pos:pos] = add; p.write_text('\n'.join(lines)); print(f, len(add))
