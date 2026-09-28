#!/usr/bin/env python3
"""Resolve a conflict in frontend/src/redux/invalidation/registry.ts after the
typePrefix rewrite: keep ours (prefix registry) and add every thunk the other
branch registered by import, looked up by its createAsyncThunk typePrefix."""
import re, subprocess, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[1]
path = 'frontend/src/redux/invalidation/registry.ts'
ours = subprocess.check_output(['git', 'show', f':2:{path}'], cwd=root).decode()
theirs = subprocess.check_output(['git', 'show', f':3:{path}'], cwd=root).decode()
if 'import {' in ours.split('export const QUERIES')[0] and "'/" not in ours:
    ours, theirs = theirs, ours  # make `ours` the prefix-style file
imp = {}
for m in re.finditer(r"import \{([^}]*)\} from '([^']+)'", theirs):
    for n in m.group(1).split(','):
        n = n.strip()
        if n: imp[n] = m.group(2)
qi = theirs.index('QUERIES'); mi = theirs.index('MUTATIONS', qi)
def prefix(name):
    mod = imp[name].replace('modules/', 'frontend/src/modules/', 1)
    for ext in ('.ts', '.tsx'):
        f = root / (mod + ext)
        if f.exists():
            m = re.search(r"export const " + name + r" = createAsyncThunk[\s\S]*?\(\s*'([^']+)'", f.read_text())
            if m: return m.group(1)
    sys.exit(f'no prefix for {name} in {mod}')
missing = [n for n in imp if not re.search(r"\b" + n + r"\b", ours)]
q = [n for n in missing if re.search(r"\b" + n + r"\b", theirs[qi:mi])]
mu = [n for n in missing if re.search(r"\b" + n + r"\b", theirs[mi:]) and n not in q]
def add(block, names, text, label):
    if not names: return text
    i = text.index('export const ' + block + ' = {'); j = text.index('\n}', i)
    ins = ''.join(f"\n  {n}: '{prefix(n)}'," for n in names)
    return text[:j] + f"\n  // {label}" + ins + text[j:]
label = sys.argv[1] if len(sys.argv) > 1 else 'merged track'
out = add('MUTATIONS', mu, add('QUERIES', q, ours, label), label)
(root / path).write_text(out)
print('added queries', q, 'mutations', mu)
