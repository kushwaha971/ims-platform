"""The entitlement replay (ATT-04 BR-1, ADR-050): `used` against Σ delta.

Two invariants, both read in one query each:

* per entitlement, `used = Σ delta` over its use rows;
* per mark, Σ delta ∈ {0, 1} — a mark holds at most one use at a time (C3).

`recalc_entitlements --check` gates on both; `--apply` rewrites only the
first (a mark holding −1 or 2 uses is a bug to read, not a number to fix).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import IntegerField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from apps.attendance.models import Entitlement, EntitlementUse


@dataclass(frozen=True)
class Drift:
    entitlement_id: Any
    tenant_id: Any
    cached: int
    replayed: int


def entitlement_drift(*, tenant_id: Any = None) -> list[Drift]:
    replay = (
        EntitlementUse.objects.filter(entitlement_id=OuterRef("pk"))
        .values("entitlement_id")
        .annotate(total=Sum("delta"))
        .values("total")
    )
    rows = Entitlement.objects.annotate(
        replayed=Coalesce(Subquery(replay, output_field=IntegerField()), Value(0))
    )
    if tenant_id is not None:
        rows = rows.filter(tenant_id=tenant_id)
    return [
        Drift(row.id, row.tenant_id, row.used, row.replayed)
        for row in rows.only("id", "tenant_id", "used").order_by("tenant_id", "id")
        if row.used != row.replayed
    ]


def marks_out_of_range(*, tenant_id: Any = None) -> list[tuple[Any, int]]:
    rows = EntitlementUse.objects.all()
    if tenant_id is not None:
        rows = rows.filter(tenant_id=tenant_id)
    return [
        (row["mark_id"], row["balance"])
        for row in rows.values("mark_id")
        .annotate(balance=Sum("delta"))
        .exclude(balance__in=[0, 1])
        .order_by("mark_id")
    ]


def apply_drift(drifts: list[Drift]) -> int:
    for drift in drifts:
        Entitlement.objects.filter(pk=drift.entitlement_id).update(used=drift.replayed)
    return len(drifts)
