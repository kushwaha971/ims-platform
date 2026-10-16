"""Shop P0 — debit notes (PUR-07): goods back to the supplier, the bill and the khata both less.

The defects these prevent: returning more than was bought, or the same goods twice;
a return credit priced at today's rate instead of its bill's rate; a note that moves the
khata but leaves the bill still asking for the full amount (or the reverse); a void
that leaves the goods "gone" or the bill short; a bill voided out from under its
note; and a payment arithmetic that forgets the note and lets the bill be overpaid.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.inventory.models import ItemStock
from apps.ledger.models import LedgerEntry
from apps.purchases.models import PurchaseDocument
from apps.purchases.tests.conftest import bill_url, draft, line, record, recorded_bill, void

pytestmark = pytest.mark.django_db

NOTES = "v1:purchase-debit-note-list"


def note_url(document_id: Any, verb: str | None = None) -> str:
    base = reverse("v1:purchase-debit-note-detail", args=[document_id])
    return f"{base}/{verb}" if verb else base


def return_goods(client: Any, bill: dict, *rows: tuple[int, str], **extra: Any) -> Any:
    body = {
        "against_id": bill["id"],
        "reason": "damaged_goods",
        "lines": [{"bill_line_no": n, "qty": q} for n, q in rows],
        **extra,
    }
    return client.post(reverse(NOTES), body, format="json")


def on_hand(item: Any) -> Decimal:
    return ItemStock.objects.get(item=item).on_hand


def test_a_return_takes_the_goods_off_the_shelf_and_the_amount_off_the_bill(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice, dal = (
        make_supplier(),
        make_item("Rice", "100.00", "GST5"),
        make_item("Dal", "50.00", "GST0"),
    )
    bill = recorded_bill(
        owner,
        party_id=str(supplier.id),
        supplier_invoice_number="AT/778",
        lines=[line(rice, "20", "100.00"), line(dal, "10", "50.00")],
    )
    assert bill["grand_total"] == "2600.00"
    response = return_goods(owner, bill, (1, "5"), reason_note="Torn bags")
    assert response.status_code == 201, response.json()
    note = response.json()["data"]
    assert (note["kind"], note["status"], note["number"]) == (
        "debit_note",
        "issued",
        "DN/26-27/0001",
    )
    assert note["grand_total"] == "525.00"  # 5 × 100 + GST 5 %
    assert note["links"]["against"]["id"] == bill["id"]
    # The bill's own number stays the bill's: the duplicate-invoice index never sees the note.
    assert note["supplier_invoice_number"] is None
    assert note["links"]["supplier_invoice_number"] == "AT/778"
    assert note["links"]["applied"] == "525.00" and note["amount_due"] == "0.00"
    assert on_hand(rice) == 15 and on_hand(dal) == 10

    after = owner.get(bill_url(bill["id"])).json()["data"]
    assert after["amount_due"] == "2075.00"
    assert after["links"]["returned"] == {"1": "5.000"}
    assert [n["number"] for n in after["links"]["debit_notes"]] == ["DN/26-27/0001"]
    supplier.refresh_from_db()
    assert supplier.shop_balance == Decimal("-2075.00")  # the shop owes 2,075 now
    entry = LedgerEntry.objects.get(source_id=note["id"])
    assert (entry.direction, entry.entry_type, entry.amount) == (
        "debit",
        "debit_note",
        Decimal("525.00"),
    )


def test_the_cap_is_what_was_bought_less_what_already_went_back(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item()
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "10", "46.00")])
    assert return_goods(owner, bill, (1, "6")).status_code == 201
    refused = return_goods(owner, bill, (1, "5"))
    assert refused.status_code == 400
    assert "Only 4" in refused.json()["error"]["details"]["lines.0.qty"][0]
    assert return_goods(owner, bill, (1, "0")).status_code == 400  # nothing to return
    assert return_goods(owner, bill, (9, "1")).status_code == 400  # not a line of the bill
    assert return_goods(owner, bill, (1, "4")).status_code == 201


def test_a_paid_bill_leaves_the_return_as_credit_with_the_supplier(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item("Rice", "100.00", "GST0")
    created = draft(owner, party_id=str(supplier.id), lines=[line(rice, "10", "100.00")])
    doc = created.json()["data"]
    paid = record(
        owner,
        doc["id"],
        version=doc["version"],
        payment={"mode_breakup": [{"mode": "cash", "amount": "1000.00"}]},
    )
    bill = paid.json()["data"]
    assert bill["status"] == "paid", paid.json()
    note = return_goods(owner, bill, (1, "2")).json()["data"]
    assert note["links"]["applied"] == "0.00" and note["amount_due"] == "200.00"
    supplier.refresh_from_db()
    assert supplier.shop_balance == Decimal("200.00")  # the supplier owes the shop now
    listing = owner.get(reverse(NOTES)).json()
    assert listing["meta"]["totals"]["amount_due"] == "200.00"


def test_the_bill_cannot_then_be_paid_past_what_it_still_asks(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    from apps.purchases.services.payment_seam import apply_payment

    supplier, rice = make_supplier(), make_item("Rice", "100.00", "GST0")
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "10", "100.00")])
    return_goods(owner, bill, (1, "3"))
    document = PurchaseDocument.objects.get(pk=bill["id"])
    import datetime as dt

    paid = apply_payment(document=document, amount=Decimal("700.00"), today=dt.date.today())
    assert (paid.amount_due, paid.status) == (Decimal("0.00"), "paid")


def test_void_brings_the_goods_and_the_bill_back_and_a_noted_bill_waits(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    supplier, rice = make_supplier(), make_item("Rice", "100.00", "GST0")
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "10", "100.00")])
    note = return_goods(owner, bill, (1, "4")).json()["data"]
    refused = void(owner, bill["id"])
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "has_dependent_documents"

    assert (
        owner.post(note_url(note["id"], "void"), {"reason": "x"}, format="json").status_code == 400
    )
    voided = owner.post(
        note_url(note["id"], "void"), {"reason": "Supplier refused it"}, format="json"
    )
    assert voided.status_code == 200, voided.json()
    assert voided.json()["data"]["status"] == "void"
    assert on_hand(rice) == 10
    after = owner.get(bill_url(bill["id"])).json()["data"]
    assert (after["amount_due"], after["links"]["returned"]) == ("1000.00", {})
    supplier.refresh_from_db()
    assert supplier.shop_balance == Decimal("-1000.00")
    assert void(owner, bill["id"]).status_code == 200  # free to void now


def test_goods_already_sold_cannot_be_sent_back_unless_negative_stock_is_allowed(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    from apps.common.context import Ctx
    from apps.inventory.services.stock import MovementLine, post_movements

    supplier, rice = make_supplier(), make_item("Rice", "100.00", "GST0")
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "10", "100.00")])
    post_movements(
        ctx=Ctx.system(supplier.tenant),
        lines=[
            MovementLine(
                item=rice,
                qty=Decimal("-9"),
                movement_type="adjust_out",
                movement_date=rice.created_at.date(),
                source_type="manual",
                unit_cost=None,
                reason="damage",
            )
        ],
    )
    refused = return_goods(owner, bill, (1, "4"))
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "insufficient_stock"
    # A price correction moves nothing, so it goes through.
    fixed = return_goods(owner, bill, (1, "4"), restock=False, reason="rate_correction")
    assert fixed.status_code == 201 and on_hand(rice) == 1


def test_the_accountant_reads_notes_and_staff_cannot_void_one(
    shop: Any, owner: Any, api_as: Any, make_supplier: Any, make_item: Any
) -> None:
    bill = recorded_bill(
        owner, party_id=str(make_supplier().id), lines=[line(make_item(), "5", "46.00")]
    )
    accountant, _ = api_as(shop, role="accountant")
    assert accountant.get(reverse(NOTES)).status_code == 200
    assert return_goods(accountant, bill, (1, "1")).status_code == 403
    staff, _ = api_as(shop, role="staff")
    note = return_goods(staff, bill, (1, "1")).json()["data"]
    assert (
        staff.post(note_url(note["id"], "void"), {"reason": "Wrong"}, format="json").status_code
        == 403
    )
    assert owner.get(bill_url(note["id"])).status_code == 404  # never a bill


def test_retry_of_a_return_replays_without_moving_stock_or_money_twice(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    """A lost response followed by Retry must not send the same bags back twice."""
    supplier, rice = make_supplier(), make_item("Rice", "100.00", "GST0")
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "10", "100.00")])
    body = {
        "against_id": bill["id"],
        "reason": "damaged_goods",
        "lines": [{"bill_line_no": 1, "qty": "2"}],
    }
    first = owner.post(reverse(NOTES), body, format="json", HTTP_IDEMPOTENCY_KEY="return-retry")
    replay = owner.post(reverse(NOTES), body, format="json", HTTP_IDEMPOTENCY_KEY="return-retry")
    assert first.status_code == replay.status_code == 201
    assert replay.json()["data"]["id"] == first.json()["data"]["id"]
    assert replay["Idempotent-Replayed"] == "true"
    assert on_hand(rice) == 8
    supplier.refresh_from_db()
    assert supplier.shop_balance == Decimal("-800.00")
    changed = {**body, "reason": "short_supply"}
    conflict = owner.post(
        reverse(NOTES), changed, format="json", HTTP_IDEMPOTENCY_KEY="return-retry"
    )
    assert conflict.status_code == 409
    assert on_hand(rice) == 8


@pytest.mark.parametrize("drain", [0, 37])
@pytest.mark.parametrize("restock", [True, False])
def test_mixed_cost_return_credits_bill_price_but_stock_uses_weighted_average(
    owner: Any, shop: Any, make_supplier: Any, make_item: Any, drain: int, restock: bool
) -> None:
    """D-01 (owner, 16 Oct): supplier credit is bill-priced, stock out is average-cost.

    Mixed stock and a depleted shelf must follow the same costing owner as
    ordinary outbounds, and a return void must reconcile with immutable replay.
    """
    import datetime as dt

    from apps.common.context import Ctx
    from apps.common.money import q2
    from apps.inventory.models import StockMovement
    from apps.inventory.services.stock import MovementLine, post_movements, replay_with_value

    supplier = make_supplier()
    rice = make_item("Mixed rice", "300.00", "GST5", stock="29", stock_cost="300.00")
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "10", "320.00")])
    stock = ItemStock.objects.get(item=rice)
    assert stock.on_hand == Decimal("39.000")
    assert stock.stock_value == Decimal("11900.0000000")
    assert stock.avg_cost == Decimal("305.1282")
    if drain:
        post_movements(
            ctx=Ctx.system(shop),
            lines=[
                MovementLine(
                    item=rice,
                    qty=-Decimal(drain),
                    movement_type="adjustment_out",
                    movement_date=dt.date.fromisoformat(bill["document_date"]),
                    source_type="manual",
                    reason="count",
                )
            ],
        )
        stock.refresh_from_db()
    before_qty, before_value = stock.on_hand, stock.stock_value
    result = return_goods(
        owner,
        bill,
        (1, "2"),
        restock=restock,
        reason="damaged_goods" if restock else "rate_correction",
    )
    assert result.status_code == 201, result.json()
    note = result.json()["data"]
    assert note["grand_total"] == "672.00"  # original bill: 2 × 320 + 5% GST
    supplier.refresh_from_db()
    assert supplier.shop_balance == Decimal("-2688.00")
    stock.refresh_from_db()
    moves = StockMovement.objects.filter(source_id=note["id"])
    if restock:
        movement = moves.get()
        assert movement.unit_cost == Decimal("305.1282")
        assert q2(movement.qty * movement.unit_cost) == Decimal("-610.26")
        assert stock.on_hand == before_qty - 2
        assert q2(stock.stock_value) == (Decimal("0.00") if drain else Decimal("11289.74"))
    else:
        assert not moves.exists()
        assert (stock.on_hand, stock.stock_value) == (before_qty, before_value)

    def assert_replay() -> None:
        expected_qty, expected_avg, expected_value, _ = replay_with_value(
            StockMovement.objects.filter(item=rice).order_by("sequence_no")
        )
        assert (stock.on_hand, stock.avg_cost, stock.stock_value) == (
            expected_qty,
            expected_avg,
            expected_value,
        )

    assert_replay()
    undone = owner.post(
        note_url(note["id"], "void"), {"reason": "Return entered by mistake"}, format="json"
    )
    assert undone.status_code == 200, undone.json()
    stock.refresh_from_db()
    assert stock.on_hand == before_qty
    assert q2(stock.stock_value) == q2(before_value)
    supplier.refresh_from_db()
    assert supplier.shop_balance == Decimal("-3360.00")
    assert_replay()
