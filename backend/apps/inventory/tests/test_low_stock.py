"""INV-07 — one alert per CROSSING, not per scan (Part 32 §32.9.7)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.core.management import call_command

from apps.inventory.constants import AlertLevel
from apps.inventory.models import ItemStock, LowStockAlert
from apps.inventory.services import low_stock
from apps.inventory.services.adjustments import post_adjustment
from apps.inventory.services.items import update_item

pytestmark = pytest.mark.django_db


def adjust(ctx: Any, item: Any, qty: str, cost: str | None = "10") -> None:
    post_adjustment(
        ctx=ctx,
        payload={
            "reason": "count",
            "lines": [
                {
                    "item_id": str(item.id),
                    "qty": qty,
                    "unit_cost": cost if Decimal(qty) > 0 else None,
                }
            ],
        },
    )


@pytest.mark.parametrize(
    ("on_hand", "reorder", "level"),
    [
        ("6", "5", AlertLevel.OK),
        ("5", "5", AlertLevel.LOW),  # inclusive (BR-1)
        ("4", "5", AlertLevel.LOW),
        ("0", "5", AlertLevel.OUT),
        ("-3", None, AlertLevel.OUT),  # FR-9: no reorder point still has an out level
        ("1", None, AlertLevel.OK),  # EC-4: null reorder never low
    ],
)
def test_level_truth_table(on_hand: str, reorder: str | None, level: str) -> None:
    """T-INV-07-1."""
    rp = Decimal(reorder) if reorder is not None else None
    assert low_stock.level_for(on_hand=Decimal(on_hand), reorder_point=rp) == level


def test_one_alert_per_crossing_and_rearm_after_recovery(ctx: Any, make_item: Any) -> None:
    """T-INV-07-2 / AC-2 — 6 → 4 alerts; 4 → 2 → 1 does not; up to 20 and back
    to 5 is a second crossing."""
    rice = make_item("Rice", opening=("6", "10"), reorder_point="5")
    assert LowStockAlert.objects.count() == 0
    adjust(ctx, rice, "-2")
    assert list(LowStockAlert.objects.values_list("level", "on_hand")) == [
        ("low", Decimal("4.000"))
    ]
    adjust(ctx, rice, "-2")
    adjust(ctx, rice, "-1")
    assert LowStockAlert.objects.count() == 1
    adjust(ctx, rice, "19")
    adjust(ctx, rice, "-15")
    assert LowStockAlert.objects.filter(level="low").count() == 2


def test_out_is_its_own_crossing_and_fires_once_below_zero(
    ctx: Any, make_item: Any, tenant: Any
) -> None:
    """T-INV-07-3 / EC-5 — low then out; negatives past zero do not re-notify."""
    from apps.platform_app.models import TenantSetting

    TenantSetting.objects.create(
        tenant=tenant, key="inventory.allow_negative_stock", value={"value": True}
    )
    rice = make_item("Rice", opening=("6", "10"), reorder_point="5")
    adjust(ctx, rice, "-2")
    adjust(ctx, rice, "-4")
    adjust(ctx, rice, "-3")
    assert list(LowStockAlert.objects.order_by("created_at").values_list("level", flat=True)) == [
        "low",
        "out",
    ]


def test_an_opening_below_the_reorder_point_alerts(ctx: Any, make_item: Any) -> None:
    """INV-05 BR-4 — the opening post is a movement like any other."""
    make_item("Rice", opening=("3", "10"), reorder_point="5")
    assert LowStockAlert.objects.filter(level="low").count() == 1


def test_raising_the_reorder_point_over_on_hand_is_a_crossing(ctx: Any, make_item: Any) -> None:
    """FR-1 alternate — 5 → 10 while on hand is 8."""
    rice = make_item("Rice", opening=("8", "10"), reorder_point="5")
    update_item(
        ctx=ctx,
        item_id=rice.id,
        payload={"version": rice.version, "reorder_point": "10"},
        can_adjust_stock=True,
    )
    alert = LowStockAlert.objects.get()
    assert (alert.level, alert.trigger) == ("low", "reorder_edit")


def test_the_scan_is_idempotent(ctx: Any, make_item: Any) -> None:
    """T-INV-07-5 / demo step 7 — the stored state means a re-scan writes nothing,
    and a crossing missed by the inline path (state edited behind its back) is caught once."""
    rice = make_item("Rice", opening=("8", "10"), reorder_point="10")
    assert LowStockAlert.objects.count() == 1
    ItemStock.objects.filter(item=rice).update(
        alert_level=AlertLevel.OK
    )  # simulate a missed evaluation
    assert low_stock.scan_low_stock()["alerted"] == 1
    assert low_stock.scan_low_stock()["alerted"] == 0
    assert LowStockAlert.objects.count() == 2


def test_the_notify_job_hands_the_alert_to_registered_sinks_once(
    ctx: Any, make_item: Any, settings: Any
) -> None:
    """The hand-off seam for the notifications track: no sink → recorded, not
    delivered; a sink registered later receives it exactly once."""
    received: list[low_stock.LowStockEvent] = []

    def sink(event: low_stock.LowStockEvent) -> None:
        received.append(event)

    rice = make_item("Rice", opening=("3", "10"), reorder_point="5")
    alert = LowStockAlert.objects.get()
    assert low_stock.deliver_alert(alert.id) == {"delivered": 0, "reason": "no_sink"}
    low_stock.register_low_stock_sink(sink)
    try:
        assert low_stock.deliver_alert(alert.id) == {"delivered": 1}
        assert low_stock.deliver_alert(alert.id)["reason"] == "already_notified"
    finally:
        low_stock.unregister_low_stock_sink(sink)
    event = received[0]
    assert (event.item_id, event.level, event.on_hand, event.reorder_point, event.unit_code) == (
        str(rice.id),
        "low",
        "3.000",
        "5.000",
        "NOS",
    )
    assert event.route == f"/items/{rice.id}"


def test_a_crossing_enqueues_one_notify_job(ctx: Any, make_item: Any) -> None:
    from apps.platform_app.models import Job

    make_item("Rice", opening=("3", "10"), reorder_point="5")
    assert Job.objects.filter(job_type="inventory.low_stock_notify").count() == 1


def test_the_scan_command_path_runs(ctx: Any, make_item: Any) -> None:
    """The scheduled handler is registered and returns its counts."""
    from apps.common.jobs import REGISTRY

    make_item("Rice", opening=("3", "10"), reorder_point="5")
    assert REGISTRY["inventory.scan_low_stock"].handler(None, None)["checked"] == 1
    call_command("recalc_stock")


def test_low_stock_endpoint_orders_out_first(
    api_as: Any, tenant: Any, ctx: Any, make_item: Any
) -> None:
    """T-INV-07-6 / AC-3 — 3 low + 1 out: the out item first, totals {low, out}."""
    from django.urls import reverse

    from apps.common.constants import RoleCode

    make_item("Half", opening=("5", "1"), reorder_point="10")
    make_item("Tenth", opening=("1", "1"), reorder_point="10")
    make_item("Nine", opening=("9", "1"), reorder_point="10")
    make_item("Empty", reorder_point="2")
    make_item("Plenty", opening=("50", "1"), reorder_point="10")
    client = api_as(tenant, RoleCode.STAFF.value)[0]
    body = client.get(reverse("v1:stock-low")).json()
    assert [r["item"]["name"] for r in body["data"]] == ["Empty", "Tenth", "Half", "Nine"]
    assert body["meta"]["totals"] == {"low": 3, "out": 1}
    assert body["data"][1]["suggested_qty"] == "19.000"
