"""`purchases.refresh_overdue` — the nightly derivation of `overdue` for bills (PUR-01 FR-10).

The schedule row has existed in `apps/common/jobs.py` since Sprint 0 with no
handler behind it, so every night's job dead-lettered. Same shape as
`sales.refresh_overdue`: every `recorded` / `partially_paid` bill whose
`due_on` is before the tenant's own today moves to `overdue`. Idempotent — a
second run finds nothing to move — and one UPDATE per tenant, because each
tenant's "today" is its own timezone's. `overdue` is stored so the Overdue tab
is an index scan (PUR-03 BR-2).
"""

from __future__ import annotations

import logging
from typing import Any

from django.db.models import F

from apps.common.dates import tenant_today
from apps.purchases.constants import OPEN_STATUSES, DocumentStatus
from apps.purchases.models import PurchaseDocument

logger = logging.getLogger("ub.purchases")


def refresh_overdue(*, tenant: Any = None) -> dict:
    from apps.platform_app.models import Tenant

    open_docs = PurchaseDocument.objects.filter(status__in=OPEN_STATUSES, due_on__isnull=False)
    if tenant is not None:
        open_docs = open_docs.filter(tenant=tenant)
    tenant_ids = open_docs.values_list("tenant_id", flat=True).distinct()
    moved = 0
    for row in Tenant.objects.filter(pk__in=list(tenant_ids)):
        moved += PurchaseDocument.objects.filter(
            tenant=row,
            status__in=OPEN_STATUSES,
            due_on__lt=tenant_today(row),
        ).update(status=DocumentStatus.OVERDUE, version=F("version") + 1)
    logger.info("purchases.refresh_overdue", extra={"moved": moved})
    return {"moved": moved}
