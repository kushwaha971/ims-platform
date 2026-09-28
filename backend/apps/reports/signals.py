"""Signals for the reports app — the dashboard cache's write-through (RPT-01 BR-5).

Rule D9 (Part 20 §20.1.4): a signal may only do things that are safe to
lose — cache invalidation, `transaction.on_commit` notification enqueues.
Never balance maths, never ledger writes. This is the first kind.

── Why signals, and not a call in every posting service ────────────────────
BR-5 says "services that post ledger/stock/documents call
`reports.cache.invalidate(tenant_id)`". The import matrix forbids it the other
way round: `reports` may read every app, and no app may import `reports`
(Part 20 §20.1.4). A receiver registered HERE on the rows those services
write keeps the dependency pointing the right way, and a new posting path —
an import, next year's aggregator webhook — invalidates the dashboard without
anybody remembering to add a line.

── What it cannot see, and why that is safe ────────────────────────────────
`QuerySet.update()` and `bulk_create()` send no signal: the nightly overdue
job and an import's bulk insert move figures silently. The sixty-second TTL
(FR-1) bounds that staleness; a missed invalidation costs a minute, never a
wrong number for ever — which is what makes a signal the right tool here and
the wrong one for balances.

── After COMMIT, not on save ────────────────────────────────────────────────
Deleting the snapshot inside the writing transaction would let a concurrent
reader recompute from the pre-commit state and store it again, and the stale
row would then outlive the write it was meant to reflect. `on_commit` deletes
after the rows are visible to everybody.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.db.models.signals import post_delete, post_save

logger = logging.getLogger("ub.reports")

#: The rows whose writes can move a dashboard figure (FR-2 … FR-5).
WATCHED_MODELS: tuple[str, ...] = (
    "ledger.LedgerEntry",
    "parties.Party",
    "sales.SalesDocument",
    "purchases.PurchaseDocument",
    "payments.Payment",
    "expenses.Expense",
    "inventory.StockMovement",
    "inventory.StockAdjustment",
    "inventory.Item",
    "platform.Tenant",
)

#: The cached reports a business write makes stale.
INVALIDATES: tuple[str, ...] = ("dashboard",)


def _tenant_id_of(instance: Any) -> Any:
    # `platform.Tenant` IS the tenant (FR-9's "Set UPI" flag lives on it).
    if type(instance)._meta.label == "platform.Tenant":
        return instance.pk
    return getattr(instance, "tenant_id", None)


def _drop_after_commit(sender: Any, instance: Any, **kwargs: Any) -> None:
    tenant_id = _tenant_id_of(instance)
    if tenant_id is None:
        return

    def drop() -> None:
        from apps.reports.services.snapshot import invalidate

        try:
            invalidate(tenant_id=tenant_id, report_names=INVALIDATES)
        except Exception:  # pragma: no cover - a cache miss is never worth a 500
            logger.warning("reports.snapshot_invalidate_failed", extra={"tenant": str(tenant_id)})

    transaction.on_commit(drop)


def connect() -> None:
    """Called once from `ReportsConfig.ready()`."""
    from django.apps import apps

    for label in WATCHED_MODELS:
        model = apps.get_model(label)
        uid = f"reports.snapshot:{label}"
        post_save.connect(_drop_after_commit, sender=model, dispatch_uid=f"{uid}:save")
        post_delete.connect(_drop_after_commit, sender=model, dispatch_uid=f"{uid}:delete")
