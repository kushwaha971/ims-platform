#!/usr/bin/env python3
"""Enforce Part 0 §0.12: one owner per normative table.

Checks, in order:
  1. DUPLICATE  a Class A fingerprint header row outside its owning file
  2. DRIFT      an `<!-- extract-of: T-nn -->` copy that differs from the owner
  3. PAIRED     Class B key sets that disagree (T-07/T-08, T-10/T-11)
  4. ORPHAN     an error code used with an HTTP status but absent from T-16

Exit 0 clean, 1 on any finding. No third-party imports (ADR-021).
"""
from __future__ import annotations

import pathlib
import re
import sys

DOCS = pathlib.Path(__file__).resolve().parent.parent / "docs"
CANON = DOCS / "00-canon.md"
INDEX_HEADING = "### 0.12.2"

# Chapter number -> file, derived from the filenames themselves.
FILES = sorted(DOCS.glob("*.md"))


def cells(line: str) -> list[str]:
    """Normalised cell list of a markdown table row."""
    if not line.lstrip().startswith("|"):
        return []
    raw = line.strip().strip("|").split("|")
    out = []
    for c in raw:
        c = c.strip()
        c = re.sub(r"[`*_]", "", c)
        out.append(c.lower())
    return out


def section(path: pathlib.Path, heading: str) -> list[str]:
    """Lines of one section, heading exclusive, up to the next heading of equal or higher level."""
    lines = path.read_text(encoding="utf-8").splitlines()
    level = len(heading.split(" ")[0])  # unused marker length; headings are '### 0.12.2'
    out, inside = [], False
    for ln in lines:
        if ln.startswith(heading):
            inside = True
            continue
        if inside and re.match(r"^#{2,3} ", ln):
            break
        if inside:
            out.append(ln)
    return out


def parse_index() -> list[dict]:
    rows = []
    for ln in section(CANON, INDEX_HEADING):
        c = cells(ln)
        if len(c) != 7 or c[0] in ("id", "---") or set(c[0]) <= {"-", ":"}:
            continue
        if not re.match(r"^t-\d+$", c[0]):
            continue
        rows.append(
            {
                "id": c[0].upper(),
                "table": c[1],
                "owner": c[2],
                "cls": c[3],
                "key": c[4],
                "fingerprint": [p.strip() for p in c[5].split(";")] if c[5] != "—" else [],
            }
        )
    return rows


def owner_file(owner: str) -> pathlib.Path | None:
    """'part 22 §22.1.1' -> docs/22-*.md ; a literal docs/ path is taken as given."""
    m = re.search(r"docs/([\w.\-]+\.md)", owner)
    if m:
        return DOCS / m.group(1)
    m = re.search(r"part (\d+)(?:-(\d+))?", owner)
    if not m:
        return None
    stem = m.group(1).zfill(2) + (f"-{m.group(2)}" if m.group(2) else "")
    hits = [p for p in FILES if p.name.startswith(stem + "-")]
    return hits[0] if hits else None


def iter_lines(path: pathlib.Path):
    """Yield (lineno, text) outside fenced code blocks."""
    fenced = False
    for i, ln in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if ln.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if not fenced:
            yield i, ln


def check_duplicates(index) -> list[str]:
    findings = []
    for row in index:
        if row["cls"] != "a" or not row["fingerprint"]:
            continue
        own = owner_file(row["owner"])
        if own is None:
            findings.append(f"{row['id']}: owner '{row['owner']}' does not resolve to a file")
            continue
        for path in FILES:
            prev = ""
            for no, ln in iter_lines(path):
                if cells(ln) == row["fingerprint"]:
                    if path == own:
                        prev = ln
                        continue
                    if f"extract-of: {row['id'].lower()}" in prev.lower():
                        prev = ln
                        continue
                    findings.append(
                        f"{row['id']} DUPLICATE  {path.name}:{no} carries the header of "
                        f"'{row['table']}', owned by {row['owner']}. Replace it with a cross-reference "
                        f"(Part 0 §0.12.3)."
                    )
                prev = ln
    return findings


def table_after(path: pathlib.Path, fingerprint: list[str]) -> list[list[str]]:
    rows, taking = [], False
    for _, ln in iter_lines(path):
        c = cells(ln)
        if c == fingerprint:
            taking = True
            continue
        if taking:
            if not c:
                break
            if set("".join(c)) <= {"-", ":", " "}:
                continue
            rows.append(c)
    return rows


def check_extracts(index) -> list[str]:
    findings = []
    by_id = {r["id"]: r for r in index}
    for path in FILES:
        prev = ""
        for no, ln in iter_lines(path):
            m = re.search(r"extract-of:\s*(T-\d+)", prev, re.I)
            if m and cells(ln):
                row = by_id.get(m.group(1).upper())
                if row is None:
                    findings.append(f"{path.name}:{no} extract-of names unknown table {m.group(1)}")
                else:
                    own = owner_file(row["owner"])
                    if own and table_after(own, row["fingerprint"]) != table_after(path, row["fingerprint"]):
                        findings.append(
                            f"{row['id']} DRIFT  {path.name}:{no} is declared an extract of "
                            f"{row['owner']} and differs from it."
                        )
            prev = ln
    return findings


PATH_RE = re.compile(r"\b(GET|POST|PATCH|PUT|DELETE)\s+`?(/[a-z0-9{}/.\-]+)")


def check_paths() -> list[str]:
    """T-10 / T-11: every path in Part 22's headings is in canon §0.8 and vice versa."""
    canon_paths = set()
    for ln in section(CANON, "## 0.8"):
        for p in re.findall(r"(?<![\w`])(/[a-z][a-z0-9{}*/.\-]*(?:\|[a-z\-]+)*)", ln):
            head, _, alts = p.rstrip(".").partition("|")
            canon_paths.add(head)
            base = head.rsplit("/", 1)[0]
            for alt in alts.split("|"):
                if alt:
                    canon_paths.add(f"{base}/{alt}")
    api = next((p for p in FILES if p.name.startswith("22-")), None)
    if api is None:
        return ["T-11: Part 22 not found"]
    spec_paths = set()
    for _, ln in iter_lines(api):
        if ln.startswith("###") or ln.startswith("- `"):
            for meth, p in PATH_RE.findall(ln):
                spec_paths.add(p.rstrip("."))
    def norm(p: str) -> list[str]:
        return [re.sub(r"\{[^}]*\}", "*", s) for s in p.strip("/").split("/")]

    canon_norm = [norm(p) for p in canon_paths]

    def covered(p: str) -> bool:
        got = norm(p)
        for want in canon_norm:
            if len(want) != len(got):
                continue
            if all(w == "*" or w == g or g == "*" for w, g in zip(want, got)):
                return True
        return False

    missing = sorted(p for p in spec_paths if not covered(p))
    return [
        f"T-10 PAIRED  {p} has a contract in Part 22 and no row in canon §0.8" for p in missing
    ]


def check_tables() -> list[str]:
    """T-07 / T-08: every table named in canon §0.6 is defined in Part 21 §21.3."""
    canon_tables = set()
    for ln in section(CANON, "## 0.6"):
        for t in re.findall(r"`([a-z][a-z0-9_]+)`", ln):
            if "_" in t:
                canon_tables.add(t)
    db = next((p for p in FILES if p.name.startswith("21-")), None)
    if db is None:
        return ["T-08: Part 21 not found"]
    defined = set(re.findall(r"\*\*`([a-z][a-z0-9_]+)`\*\*", db.read_text(encoding="utf-8")))
    return [
        f"T-07 PAIRED  `{t}` is in canon §0.6 and is not defined in Part 21 §21.3"
        for t in sorted(canon_tables - defined)
    ]


CODE_NEAR_STATUS = re.compile(
    r"\b(?:400|401|403|404|409|410|412|422|429|500|503)\b[^`\n]{0,24}`([a-z][a-z0-9_]{3,40})`"
)


def check_error_codes(index) -> list[str]:
    row = next((r for r in index if r["id"] == "T-16"), None)
    if row is None:
        return ["T-16: not in the index"]
    own = owner_file(row["owner"])
    registered = {c[0] for c in table_after(own, row["fingerprint"])} if own else set()
    if own:  # every registry row is `| `code` | <status> | …`
        registered |= set(
            re.findall(r"^\| `([a-z][a-z0-9_]+)` \| \d{3} \|", own.read_text(encoding="utf-8"), re.M)
        )
    findings = []
    for path in FILES:
        if path.name[:2] in {"41", "42", "43"}:  # review chapters quote codes as evidence
            continue
        for no, ln in iter_lines(path):
            if path == own and ln.lstrip().startswith("|"):
                continue  # the registry's own rows, whose `details` keys are not codes
            for code in CODE_NEAR_STATUS.findall(ln):
                if code not in registered and code not in FIELD_WORDS:
                    findings.append(
                        f"T-16 ORPHAN  {path.name}:{no} uses `{code}` with an HTTP status and it is "
                        f"not in the registry at {row['owner']}."
                    )
    return sorted(set(findings))


# Words that look like codes and are field names, statuses or parameters.
FIELD_WORDS = set()
FIELD_WORD_FILE = DOCS.parent / "scripts" / "not_error_codes.txt"
if FIELD_WORD_FILE.exists():
    FIELD_WORDS = {w.strip() for w in FIELD_WORD_FILE.read_text().split() if w.strip()}


def main() -> int:
    index = parse_index()
    if len(index) < 40:
        print(f"check_table_ownership: parsed only {len(index)} index rows; canon §0.12.2 is malformed")
        return 1
    findings = (
        check_duplicates(index)
        + check_extracts(index)
        + check_paths()
        + check_tables()
        + check_error_codes(index)
    )
    for f in findings:
        print(f)
    print(f"\n{len(index)} owned tables checked, {len(findings)} finding(s).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
