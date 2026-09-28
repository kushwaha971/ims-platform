"""The platform's module-off hook, answered by purchases (PLT-06 FR-4, CR-2026-09-24-T1-E).

`platform_app.services.guards` may not import purchases (Part 20 §20.1.4), so
the counter is registered from `PurchasesConfig.ready()`. Switching the
`purchases` module OFF is refused while bills are still open — a draft the
merchant would lose sight of, or a recorded bill with money still owed to a
supplier, whose "To pay" figure would vanish from every screen with the module.

No GST-lock counter: PLT-07's `gst_type_locked` is about TAX INVOICES the shop
issued, and a purchase bill is an invoice the shop received.
"""

from __future__ import annotations

from typing import Any

_REGISTERED = False


def open_bills_count(tenant: Any) -> int:
    from apps.purchases.constants import DocumentStatus
    from apps.purchases.models import PurchaseDocument

    drafts = PurchaseDocument.objects.filter(tenant=tenant, status=DocumentStatus.DRAFT)
    unpaid = PurchaseDocument.objects.filter(
        tenant=tenant,
        status__in=(
            DocumentStatus.RECORDED,
            DocumentStatus.PARTIALLY_PAID,
            DocumentStatus.OVERDUE,
        ),
        amount_due__gt=0,
    )
    return drafts.count() + unpaid.count()


def register_guards() -> None:
    global _REGISTERED
    if _REGISTERED:
        return
    from apps.platform_app.services.guards import register_module_off_guard

    register_module_off_guard("purchases", open_bills_count)
    _REGISTERED = True
