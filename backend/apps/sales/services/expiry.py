"""`sales.expire_estimates` — the nightly `sent → expired` (SAL-01 FR-5, T-SAL01-7).

`valid_until < today` in EACH tenant's timezone, so a Mumbai shop's estimate
valid "till 25 Sep" is still valid at 23:59 IST on the 25th and expired at the
first run after midnight. Idempotent: a second run finds nothing left in
`sent`. Batched 500 rows per UPDATE (§20), and each moved estimate gets its
`estimate.expired` audit row with actor_type `system` (§16).
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction
from django.db.models import F

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.sales.constants import DocumentKind, DocumentStatus
from apps.sales.models import SalesDocument

logger = logging.getLogger("ub.sales")
BATCH = 500


def _expire_tenant(tenant: Any) -> int:
    today = tenant_today(tenant)
    ctx = Ctx.system(tenant)
    moved = 0
    while True:
        with transaction.atomic():
            ids = list(
                SalesDocument.objects.select_for_update(skip_locked=True)
                .filter(
                    tenant=tenant,
                    kind=DocumentKind.ESTIMATE,
                    status=DocumentStatus.SENT,
                    valid_until__lt=today,
                )
                .values_list("id", flat=True)[:BATCH]
            )
            if not ids:
                return moved
            SalesDocument.objects.filter(pk__in=ids).update(
                status=DocumentStatus.EXPIRED, version=F("version") + 1
            )
            for document_id in ids:
                write_audit(
                    ctx=ctx,
                    action=AuditAction.ESTIMATE_EXPIRED,
                    entity_type="sales_document",
                    entity_id=document_id,
                    before={"status": DocumentStatus.SENT},
                    after={"status": DocumentStatus.EXPIRED},
                )
            moved += len(ids)


def expire_estimates(*, tenant: Any = None) -> dict:
    from apps.platform_app.models import Tenant

    sent = SalesDocument.objects.filter(
        kind=DocumentKind.ESTIMATE, status=DocumentStatus.SENT, valid_until__isnull=False
    )
    if tenant is not None:
        sent = sent.filter(tenant=tenant)
    tenant_ids = list(sent.values_list("tenant_id", flat=True).distinct())
    moved = sum(_expire_tenant(row) for row in Tenant.objects.filter(pk__in=tenant_ids))
    logger.info("sales.expire_estimates", extra={"moved": moved})
    return {"moved": moved}
