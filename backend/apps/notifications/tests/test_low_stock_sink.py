"""INV-07 → NTF-01: a low-stock crossing reaches the inbox, once.

Protects the integration QA found missing: inventory recorded `LowStockAlert`
rows and enqueued `inventory.low_stock_notify`, but no sink was registered, so
every alert ended `no_sink` and nobody was told.
"""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.context import Ctx
from apps.inventory.models import LowStockAlert
from apps.inventory.services import low_stock
from apps.notifications import sinks
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db


@pytest.fixture
def ctx(tenant: Any) -> Ctx:
    from apps.common.management.commands.seed_reference_data import seed_tax_rates, seed_units
    from apps.inventory.models import Location

    seed_tax_rates()
    seed_units()
    Location.objects.create(tenant=tenant, code="MAIN", name="Main", is_default=True)
    return Ctx.system(tenant)


def _item(ctx: Ctx, name: str, qty: str, reorder: str) -> Any:
    from apps.inventory.models import Unit
    from apps.inventory.services.items import create_item

    nos = Unit.objects.get(tenant__isnull=True, code="NOS")
    return create_item(
        ctx=ctx,
        payload={
            "name": name,
            "unit_id": str(nos.id),
            "reorder_point": reorder,
            "opening_stock": {"qty": qty, "unit_cost": "10"},
        },
    )["item"]


def test_the_notifications_app_registers_its_sink_at_start_up() -> None:
    """Without this the job below finds no sink and returns `no_sink`."""
    assert sinks.low_stock_sink in low_stock.registered_sinks()


def test_a_crossing_writes_one_grouped_broadcast_and_stamps_notified_at(
    ctx: Ctx, tenant: Any
) -> None:
    rice = _item(ctx, "Rice", "3", "5")
    alert = LowStockAlert.objects.get(item=rice)

    assert low_stock.deliver_alert(alert.id) == {"delivered": len(low_stock.registered_sinks())}
    alert.refresh_from_db()
    assert alert.notified_at is not None

    row = Notification.objects.get(tenant=tenant, type="low_stock")
    assert row.user_id is None  # a broadcast, visible by `inventory.stock.read`
    assert row.group_key == sinks.LOW_STOCK_GROUP_KEY
    assert row.data["ids"] == [str(rice.id)]
    assert row.count == 1

    # Idempotent on the alert: the job retried (same `low_stock:<alert id>`
    # token) delivers nothing and the inbox row is untouched.
    assert low_stock.deliver_alert(alert.id)["reason"] == "already_notified"
    row.refresh_from_db()
    assert row.count == 1
    assert Notification.objects.filter(type="low_stock").count() == 1


def test_a_second_item_coalesces_into_the_same_row(ctx: Ctx, tenant: Any) -> None:
    """The 24 h group window: "2 items are low on stock", not two rows."""
    for name in ("Rice", "Dal"):
        item = _item(ctx, name, "2", "5")
        low_stock.deliver_alert(LowStockAlert.objects.get(item=item).id)
    row = Notification.objects.get(tenant=tenant, type="low_stock")
    assert row.count == 2
    assert row.title.startswith("2 ")


def test_a_failing_sink_leaves_the_alert_undelivered_for_the_retry(
    ctx: Ctx, tenant: Any, monkeypatch: Any
) -> None:
    """All-or-nothing: an exception rolls back the inbox write AND the stamp,
    so the job's retry delivers it rather than losing it or doubling it."""
    rice = _item(ctx, "Rice", "3", "5")
    alert = LowStockAlert.objects.get(item=rice)

    def boom(event: Any) -> None:
        raise RuntimeError("down")

    monkeypatch.setattr(low_stock, "_SINKS", [sinks.low_stock_sink, boom])
    with pytest.raises(RuntimeError):
        low_stock.deliver_alert(alert.id)
    alert.refresh_from_db()
    assert alert.notified_at is None
    assert not Notification.objects.filter(type="low_stock").exists()

    monkeypatch.setattr(low_stock, "_SINKS", [sinks.low_stock_sink])
    assert low_stock.deliver_alert(alert.id) == {"delivered": 1}
    assert Notification.objects.filter(type="low_stock").count() == 1
