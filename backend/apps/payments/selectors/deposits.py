"""Read side of held deposits (A4b) — for the "Deposits held" report (FRD 00 PLT-X02 §11).

`reports` may read payments' selectors and no app's services (rule D4), so the
report's rows are built here and `ReportsConfig.ready()` registers the report
with `apps.reports.registry`.
"""

from __future__ import annotations

from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from django.db.models import Sum

from apps.payments.constants import DepositStatus
from apps.payments.models import HeldDeposit

HEADER = (
    "party",
    "module",
    "purpose",
    "status",
    "since",
    "received",
    "applied",
    "refunded",
    "held",
)


def _queryset(tenant: Any, params: dict) -> Any:
    rows = HeldDeposit.objects.for_tenant(tenant).select_related("party")
    module = (params or {}).get("module")
    status = (params or {}).get("status")
    if module:
        rows = rows.filter(module=module)
    if status in DepositStatus.values:
        rows = rows.filter(status=status)
    elif status != "all":
        # By default the report is what it is called: deposits still holding money.
        rows = rows.exclude(status=DepositStatus.RELEASED)
    return rows.order_by("party__name", "created_at", "id")


def deposits_held_report(tenant: Any, params: dict) -> dict:
    """`{rows, totals}` — filter `module` and `status` (`expected` | `held` |
    `released` | `all`; default: everything not released)."""
    rows = _queryset(tenant, params)
    totals = rows.aggregate(
        received=Sum("received_amount"),
        applied=Sum("applied_amount"),
        refunded=Sum("refunded_amount"),
        held=Sum("held_amount"),
    )
    return {
        "rows": [
            {
                "id": str(row.id),
                "party": {"id": str(row.party_id), "name": row.party.name},
                "module": row.module,
                "purpose": row.purpose,
                "status": row.status,
                "since": row.created_at.date().isoformat(),
                "received": str(row.received_amount),
                "applied": str(row.applied_amount),
                "refunded": str(row.refunded_amount),
                "held": str(row.held_amount),
            }
            for row in rows
        ],
        "totals": {key: str(value or Decimal("0.00")) for key, value in totals.items()},
    }


def deposits_held_csv(tenant: Any, params: dict) -> Iterable[tuple]:
    """The same rows as the screen, header first — `apps.reports.registry`'s CSV contract."""
    yield HEADER
    for row in _queryset(tenant, params):
        yield (
            row.party.name,
            row.module,
            row.purpose,
            row.status,
            row.created_at.date().isoformat(),
            row.received_amount,
            row.applied_amount,
            row.refunded_amount,
            row.held_amount,
        )
