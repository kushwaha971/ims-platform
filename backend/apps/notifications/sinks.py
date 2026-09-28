"""Inbound hand-offs from apps that may not import `notifications` (Part 20 §20.1.4).

Inventory sits below notifications in the dependency matrix, so it cannot call
`notify()`. Instead it exposes a sink registry
(`apps.inventory.services.low_stock.register_low_stock_sink`) and this app
registers its writer from `NotificationsConfig.ready()` with a deferred import —
the direction the matrix already allows, and invisible to the module-level
import walker by design (the same trick rule D5 uses).
"""

from __future__ import annotations

from typing import Any

#: One inbox row per tenant per 24 h window ("3 items are low on stock"); the
#: type's `group_window` does the coalescing, keyed on this.
LOW_STOCK_GROUP_KEY = "low_stock"


def low_stock_sink(event: Any) -> None:
    """Write (or coalesce into) the tenant's `low_stock` broadcast.

    `event` is inventory's `LowStockEvent`. Runs inside `deliver_alert`'s
    transaction, which locks the alert and stamps `notified_at` in the same
    commit — that is what makes delivery idempotent per alert. `ids` carries the
    ITEM id, so one item going low and then out inside the window still counts
    as one item in "{count} items are low on stock".
    """
    from apps.notifications.services.notify import notify
    from apps.platform_app.models import Tenant

    tenant = Tenant.objects.filter(pk=event.tenant_id).first()
    if tenant is None:
        return
    notify(
        tenant,
        "low_stock",
        params={
            "item_name": event.item_name,
            "level": event.level,
            "on_hand": event.on_hand,
            "unit_code": event.unit_code,
            "alert_id": event.alert_id,
        },
        group_key=LOW_STOCK_GROUP_KEY,
        ids=[event.item_id],
    )


def register() -> None:
    """Called from `NotificationsConfig.ready()`; idempotent (the registry dedupes)."""
    from apps.inventory.services.low_stock import register_low_stock_sink

    register_low_stock_sink(low_stock_sink)
