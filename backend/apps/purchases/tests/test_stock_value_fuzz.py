"""H3 item 1 — the weighted average under a fuzzed book of REAL documents.

The costing step is a pure function with its own property tests
(`apps/inventory/tests/test_costing.py`). This file drives it the way a shop
does: purchase bills recorded and voided, invoices issued and voided, stock
adjustments in and out, in a seeded random order, through the API and services
— and then proves three things:

1. every void of a bill that nothing followed restores the item's on-hand,
   average and stock value EXACTLY (QA's 140.0001 was the 4th-decimal miss of
   this, after a bill void);
2. the cache equals a from-scratch replay (`recalc_stock`): the average to the
   4th decimal, the stock value to the paisa (and in fact to the 7th decimal),
   and every movement row's running figures;
3. `recalc_stock --check` and the nightly callable agree that nothing drifted.
"""

from __future__ import annotations

import random
from decimal import Decimal
from io import StringIO
from typing import Any
from unittest import mock

import pytest
from django.core.management import call_command

from apps.common.context import Ctx
from apps.common.money import q2
from apps.inventory.models import ItemStock, StockMovement
from apps.inventory.selectors.drift import stock_drift
from apps.inventory.services.adjustments import post_adjustment
from apps.inventory.services.integrity import check_stock
from apps.inventory.services.stock import replay_with_value
from apps.purchases.tests.conftest import line, recorded_bill, void
from apps.sales.tests.conftest import draft as draft_invoice
from apps.sales.tests.conftest import invoice_url
from apps.sales.tests.conftest import issue as issue_invoice

pytestmark = pytest.mark.django_db

#: Costs chosen so blends almost never terminate at 4 dp — the case that drifted.
COSTS = ["133.33", "149.99", "150.00", "152.50", "131.00", "99.99", "47.13", "12.07", "1.01"]


def state(item: Any) -> tuple[Decimal, Decimal, Decimal]:
    row = ItemStock.objects.get(item=item)
    return row.on_hand, row.avg_cost, row.stock_value


def test_a_fuzzed_book_of_documents_replays_exactly_and_voids_restore_exactly(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    rng = random.Random(20260928)
    ctx = Ctx.system(shop)
    items = [
        make_item(f"Item {n}", "140.00", stock=str(rng.randint(1, 9)), stock_cost="140.00")
        for n in range(4)
    ]
    supplier = make_supplier()
    customer = make_supplier(name="Walk Customer", is_customer=True, is_supplier=False)
    bills: list[str] = []
    invoices: list[str] = []
    exact_restores = 0

    def record_bill(chosen: list[Any]) -> dict:
        lines = [line(i, str(rng.randint(1, 12)), rng.choice(COSTS)) for i in chosen]
        return recorded_bill(owner, party_id=str(supplier.id), lines=lines)

    # Throttles are the security pass's concern; 140 documents in a few seconds is
    # a loop by their definition, and this test IS a loop.
    with (
        mock.patch("apps.inventory.services.low_stock.enqueue"),
        mock.patch("rest_framework.throttling.SimpleRateThrottle.allow_request", return_value=True),
    ):
        for _ in range(140):
            roll = rng.random()
            if roll < 0.25:
                bills.append(record_bill(rng.sample(items, rng.randint(1, 2)))["id"])
            elif roll < 0.40:
                # A bill voided with nothing in between must restore exactly.
                chosen = rng.sample(items, rng.randint(1, 2))
                before = {i.id: state(i) for i in chosen}
                bill = record_bill(chosen)
                assert void(owner, bill["id"]).status_code == 200
                for i in chosen:
                    if before[i.id][0] > 0:
                        assert state(i) == before[i.id], (i.name, before[i.id], state(i))
                        exact_restores += 1
                    else:
                        # From an empty shelf the bill was a restart, and its
                        # reversal to zero zeroes the average (§21.3.6 (2)).
                        assert state(i) == (before[i.id][0], Decimal("0.0000"), before[i.id][2])
            elif roll < 0.65:
                item = rng.choice(items)
                on_hand = state(item)[0]
                if on_hand < 1:
                    continue
                qty = str(rng.randint(1, int(on_hand)))
                created = draft_invoice(
                    owner, party_id=str(customer.id), lines=[{"item_id": str(item.id), "qty": qty}]
                ).json()["data"]
                issued = issue_invoice(owner, created["id"], version=created["version"])
                assert issued.status_code == 200, issued.json()
                invoices.append(created["id"])
            elif roll < 0.75 and invoices:
                target = invoices.pop(rng.randrange(len(invoices)))
                response = owner.post(
                    invoice_url(target, "void"), {"reason": "Fuzz void"}, format="json"
                )
                assert response.status_code == 200, response.json()
            elif roll < 0.85 and bills:
                target = bills.pop(rng.randrange(len(bills)))
                response = void(owner, target)
                # Goods from this bill may already be sold: the void is refused
                # whole (409 insufficient_stock) and the book is untouched.
                assert response.status_code in (200, 409), response.json()
            else:
                item = rng.choice(items)
                on_hand = state(item)[0]
                if rng.random() < 0.5 or on_hand < 1:
                    qty, cost = str(rng.randint(1, 5)), rng.choice(COSTS)
                else:
                    qty, cost = str(-rng.randint(1, int(on_hand))), None
                post_adjustment(
                    ctx=ctx,
                    payload={
                        "reason": "count",
                        "adjustment_date": "2026-09-28",
                        "lines": [{"item_id": str(item.id), "qty": qty, "unit_cost": cost}],
                    },
                )

    assert exact_restores >= 10
    assert StockMovement.objects.filter(tenant=shop).count() > 150

    # 2. cache == a from-scratch replay, item by item.
    for item in items:
        rows = list(StockMovement.objects.filter(item=item).order_by("sequence_no"))
        on_hand, avg, value, per_row = replay_with_value(rows)
        cached = ItemStock.objects.get(item=item)
        assert (cached.on_hand, cached.avg_cost) == (on_hand, avg)
        assert q2(cached.stock_value) == q2(value)  # to the paisa…
        assert cached.stock_value == value  # …and in fact to the 7th decimal
        assert q2(cached.on_hand * cached.avg_cost) == q2(on_hand * avg)  # as displayed
        for movement, exp_on_hand, exp_avg, exp_value in per_row:
            assert (movement.on_hand_after, movement.avg_cost_after, movement.value_after) == (
                exp_on_hand,
                exp_avg,
                exp_value,
            )

    # 3. the drift report, the --check gate and the nightly callable agree.
    assert stock_drift(tenant_id=shop.id) == []
    call_command("recalc_stock", "--check", stdout=StringIO())  # SystemExit(1) on drift
    summary = check_stock(tenant_id=shop.id)
    assert (summary["ok"], summary["drifted"], summary["checked"]) == (True, 0, len(items))
