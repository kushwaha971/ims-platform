"""Typed numbers and the perpetual counters (LIB-02 BR-2/BR-3; LIB-04 FR-2; ADR-051).

A library continuing a paper register types its numbers (accession numbers in
B05, school admission numbers as member numbers in B07). A typed all-digit
number at or above the counter raises it, so the next automatic number never
collides with it; a suffixed number (`4512-A`) never moves it. Shared by both
counters so the rule is written once.
"""

from __future__ import annotations

from typing import Any

from apps.library.services import codes
from apps.platform_app.services import sequences


def counter_prefix(tenant: Any, kind: str) -> str:
    from apps.platform_app.models import DocumentSequence

    row = DocumentSequence.objects.filter(
        tenant=tenant, kind=kind, fy_label=sequences.PERPETUAL
    ).first()
    if row is not None:
        return row.prefix
    # No number taken yet: the series' prefix is the kind's default, which is what the first
    # `allocate_counter` will write. Reading "" here let a typed M-0042 slip past an "M-"
    # series and the counter later hand out M-0042 again (B07 QA).
    spec = sequences.number_kind(kind)
    return spec.default_prefix if spec is not None else ""


def raise_for_typed(ctx: Any, kind: str, numbers: list[str]) -> None:
    """BR-2/BR-3, called LAST in the writing transaction (the sequence row is the last lock)."""
    prefix = counter_prefix(ctx.tenant, kind)
    values = [v for v in (codes.numeric_value(n, prefix=prefix) for n in numbers) if v is not None]
    if not values:
        return
    highest = max(values)
    if highest > sequences.MAX_NEXT_NUMBER:
        return  # beyond the counter's range: it can never collide
    if highest >= sequences.peek_counter(tenant=ctx.tenant, kind=kind):
        # At the ceiling the counter cannot hold highest + 1; parking it AT the ceiling is
        # enough, because `allocate_counter` never hands out its last value (QA-B05-2).
        sequences.raise_counter(
            ctx=ctx, kind=kind, next_number=min(highest + 1, sequences.MAX_NEXT_NUMBER), via="typed"
        )
