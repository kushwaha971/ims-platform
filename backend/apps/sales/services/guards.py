"""The platform's two refusal hooks, answered by sales (PLT-06 FR-4, PLT-07 FR-4).

`platform_app.services.guards` may not import sales (Part 20 §20.1.4), so the
counters are registered from `SalesConfig.ready()`:

* switching the `sales` module OFF is refused while drafts exist — a draft is
  unfinished work the merchant would lose sight of;
* changing `gst_type` away from `regular` is refused while tax invoices were
  issued in the current financial year (`gst_type_locked`).
"""

from __future__ import annotations

from typing import Any

_REGISTERED = False


def drafts_count(tenant: Any) -> int:
    from apps.sales.constants import DocumentStatus
    from apps.sales.models import SalesDocument

    return SalesDocument.objects.filter(tenant=tenant, status=DocumentStatus.DRAFT).count()


def issued_tax_invoices_this_fy(tenant: Any) -> int:
    from apps.common.dates import fy_label_for, tenant_today
    from apps.sales.constants import DocumentKind, DocumentStatus
    from apps.sales.models import SalesDocument

    return (
        SalesDocument.objects.filter(
            tenant=tenant,
            kind=DocumentKind.INVOICE,
            fy_label=fy_label_for(tenant, tenant_today(tenant)),
        )
        .exclude(status=DocumentStatus.DRAFT)
        .exclude(supplier_gstin_snapshot__isnull=True)
        .count()
    )


def register_guards() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    from apps.platform_app.services.guards import (
        register_gst_lock_counter,
        register_module_off_guard,
    )

    register_module_off_guard("sales", drafts_count)
    register_gst_lock_counter(issued_tax_invoices_this_fy)
    _REGISTERED = True
