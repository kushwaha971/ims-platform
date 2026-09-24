"""`sales.refresh_overdue` — the nightly derivation of `overdue` (SAL-02 BR-17, SAL-08 BR-2).

`overdue` is never set at issue: it is a function of the calendar, and the
calendar moves without anybody writing. So the job, at 00:15 IST, moves every
`issued`/`partially_paid` invoice whose `due_on` is before the tenant's today
to `overdue`. Idempotent — a second run finds nothing left to move — and one
UPDATE per tenant, because each tenant's "today" is its own timezone's.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db.models import F

from apps.common.dates import tenant_today
from apps.sales.constants import OPEN_STATUSES, DocumentStatus
from apps.sales.models import SalesDocument

logger = logging.getLogger("ub.sales")


def refresh_overdue(*, tenant: Any = None) -> dict:
    from apps.platform_app.models import Tenant

    open_docs = SalesDocument.objects.filter(status__in=OPEN_STATUSES, due_on__isnull=False)
    if tenant is not None:
        open_docs = open_docs.filter(tenant=tenant)
    tenant_ids = open_docs.values_list("tenant_id", flat=True).distinct()
    moved = 0
    for row in Tenant.objects.filter(pk__in=list(tenant_ids)):
        moved += SalesDocument.objects.filter(
            tenant=row,
            status__in=OPEN_STATUSES,
            due_on__lt=tenant_today(row),
        ).update(status=DocumentStatus.OVERDUE, version=F("version") + 1)
    logger.info("sales.refresh_overdue", extra={"moved": moved})
    return {"moved": moved}
