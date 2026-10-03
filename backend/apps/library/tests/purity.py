"""The purity rule for B04's helpers, shared by their two test modules."""

from __future__ import annotations

import ast

#: B04's helpers, which may import one another and nothing else of the app.
PURE_SIBLINGS = frozenset({"isbn", "codes"})


def impure_imports(source: str) -> list[str]:
    """Every import in `source` that reaches Django, an app, or a sibling module.

    A relative import counts: `from ..models import Copy` names no `apps`
    prefix, yet it is the same step towards a validator that queries the
    database (B04 QA round 1, note 2). The one exception is a sibling that is
    itself one of the pure helpers (`codes` reads `isbn`).
    """
    found: list[str] = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.ImportFrom):
            name = "." * node.level + (node.module or "")
            if node.level == 1:
                targets = {node.module} if node.module else {a.name for a in node.names}
                if targets <= PURE_SIBLINGS:
                    continue
            if node.level > 0 or name.startswith(("django", "apps")):
                found.append(name)
        elif isinstance(node, ast.Import):
            found += [a.name for a in node.names if a.name.startswith(("django", "apps"))]
    return found
