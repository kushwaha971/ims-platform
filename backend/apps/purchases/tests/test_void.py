"""PUR-04 — voiding a bill: stock and khata revert exactly, the number stays, nothing is deleted."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from apps.common.audit import AuditAction
from apps.common.dates import tenant_today
from apps.inventory.models import ItemStock, StockMovement
from apps.inventory.selectors.drift import stock_drift
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.platform_app.models import AuditLog, TenantSetting
from apps.purchases.models import PurchaseDocument
from apps.purchases.tests.conftest import bill_url, draft, line, recorded_bill, void

pytestmark = pytest.mark.django_db


def sell(shop: Any, item: Any, qty: str) -> None:
    """A sale_out through the one writer, as SAL-02 posts it."""
    from apps.common.context import Ctx
    from apps.inventory.constants import MovementType
    from apps.inventory.services.stock import MovementLine, post_movement

    post_movement(
        ctx=Ctx.system(shop),
        line=MovementLine(
            item=item,
            qty=-Decimal(qty),
            movement_type=MovementType.SALE_OUT,
            movement_date=tenant_today(shop),
            source_type="sales_document",
        ),
    )


def assert_books_clean(shop: Any, party: Any) -> None:
    """§32.12.4 — `recalc_stock` and `recalc_balances` find nothing after a void."""
    party.refresh_from_db()
    assert stock_drift(tenant_id=shop.id) == []
    assert party.balance == computed_balance(tenant=shop, party_id=party.id)


def test_void_reverses_stock_and_khata_and_keeps_the_number(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-04-1 / AC-1 / BR-1 / BR-2 — every `purchase_in` gets a `reversal` of −qty at the
    SAME cost pointing back at it, dated today; the credit gets a debit reversal of ₹2,921
    dated today and sourced to the bill; the balance returns to where it was; the bill is
    `void` with its number, reason, actor and time; no row is deleted."""
    supplier = make_supplier()
    rice = make_item("Rice", "40.00", unit_code="NOS")
    sugar = make_item("Sugar", "35.00", unit_code="KGS")
    data = recorded_bill(
        owner,
        party_id=str(supplier.id),
        document_date="2026-09-18",
        lines=[
            line(rice, "20", "46"),
            line(sugar, "50", "38", discount_type="percent", discount_value="2"),
        ],
    )
    response = void(owner, data["id"], "Entered twice")
    assert response.status_code == 200, response.json()
    voided, meta = response.json()["data"], response.json()["meta"]
    assert (voided["status"], voided["number"]) == ("void", data["number"])
    assert voided["void_reason"] == "Entered twice"
    assert voided["voided_by"] is not None and voided["voided_at"]

    moves = StockMovement.objects.filter(source_id=data["id"]).order_by("created_at")
    originals = [m for m in moves if m.movement_type == "purchase_in"]
    reversals = [m for m in moves if m.movement_type == "reversal"]
    assert len(originals) == len(reversals) == 2
    assert {(r.reverses_id, r.qty, r.unit_cost) for r in reversals} == {
        (o.id, -o.qty, o.unit_cost) for o in originals
    }
    assert all(r.movement_date == tenant_today(shop) for r in reversals)
    assert sorted(meta["reversal_movements"]) == sorted(str(r.id) for r in reversals)
    assert ItemStock.objects.get(item=rice).on_hand == Decimal("0.000")

    reversal = LedgerEntry.objects.get(pk=meta["reversal_ledger_entry_id"])
    assert (reversal.direction, reversal.amount, reversal.entry_type) == (
        "debit",
        Decimal("2921.00"),
        "reversal",
    )
    assert (reversal.source_type, str(reversal.source_id)) == ("purchase_document", data["id"])
    assert reversal.entry_date == tenant_today(shop)
    assert reversal.reverses.status == "reversed"
    assert meta["party_balance"] == "0.00"
    assert meta["released_payments"] == []
    audit = AuditLog.objects.get(action=AuditAction.PURCHASE_BILL_VOIDED, entity_id=data["id"])
    assert audit.metadata["reason"] == "Entered twice"
    assert audit.before["status"] == "recorded" and audit.after["status"] == "void"
    assert_books_clean(shop, supplier)


def test_goods_already_sold_refuse_the_void_unless_negative_stock_is_allowed(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-04-2 / AC-4 / EC-1 — bought 20, sold 8: the void needs 20 back and would leave −8,
    so it is 409 `insufficient_stock` naming the item and what is available, and NOTHING moved
    (khata included). With `inventory.allow_negative_stock` on, the same void succeeds."""
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    data = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "20", "46")])
    sell(shop, rice, "8")

    refused = void(owner, data["id"])
    assert refused.status_code == 409
    error = refused.json()["error"]
    assert error["code"] == "insufficient_stock"
    assert error["details"]["lines"] == [
        {
            "index": 0,
            "item_id": str(rice.id),
            "item_name": "Rice",
            "requested": "20.000",
            "available": "12.000",
            "unit_code": "NOS",
        }
    ]
    assert PurchaseDocument.objects.get(pk=data["id"]).status == "recorded"
    assert not LedgerEntry.objects.filter(entry_type="reversal").exists()

    TenantSetting.objects.create(
        tenant=shop, key="inventory.allow_negative_stock", value={"value": True}
    )
    assert void(owner, data["id"]).status_code == 200
    assert ItemStock.objects.get(item=rice).on_hand == Decimal("-8.000")
    assert_books_clean(shop, supplier)


def test_a_void_restores_the_average_by_arrival_order(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """CR-2026-09-24-INV-A (overriding PUR-04 FR-4's "average unchanged") — a void's reversal
    REMOVES the value its receipt blended in, applied in arrival order by the same function
    `recalc_stock` replays.

    10 on hand at 40, a bill of 10 at 60 → 20 at 50; voiding it alone → 10 at 40 again.
    With a sale in between (bill → 20 at 50, sell 5 → 15 at 50), the void leaves
    (15 × 50 − 10 × 60) / 5 = 30.0000 — the receipt's value leaves at the receipt's cost,
    whatever arrived after it — and the replay agrees to the paisa."""
    supplier = make_supplier()
    oil = make_item("Oil", "40.00", stock="10", stock_cost="40.00")
    first = recorded_bill(owner, party_id=str(supplier.id), lines=[line(oil, "10", "60")])
    stock = ItemStock.objects.get(item=oil)
    assert (stock.on_hand, stock.avg_cost) == (Decimal("20.000"), Decimal("50.0000"))
    assert void(owner, first["id"]).status_code == 200
    stock.refresh_from_db()
    assert (stock.on_hand, stock.avg_cost) == (Decimal("10.000"), Decimal("40.0000"))

    second = recorded_bill(owner, party_id=str(supplier.id), lines=[line(oil, "10", "60")])
    sell(shop, oil, "5")
    stock.refresh_from_db()
    assert (stock.on_hand, stock.avg_cost) == (Decimal("15.000"), Decimal("50.0000"))
    assert void(owner, second["id"]).status_code == 200
    stock.refresh_from_db()
    assert (stock.on_hand, stock.avg_cost) == (Decimal("5.000"), Decimal("30.0000"))
    assert_books_clean(shop, supplier)


def test_a_void_restores_the_average_to_the_last_decimal(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """QA final-pass Low (H3 item 1): 3 on hand at 140, a bill of 6 at 150 blends to
    146.6667; voiding it showed 140.0001, because the reversal removed value from
    `on_hand × avg` — a product of the ROUNDED average — instead of the value the
    receipt actually added. The cache now carries the exact stock value and derives
    the average from it, so a void with nothing in between restores it exactly."""
    supplier = make_supplier()
    ghee = make_item("Ghee", "140.00", stock="3", stock_cost="140.00")
    bill = recorded_bill(owner, party_id=str(supplier.id), lines=[line(ghee, "6", "150")])
    stock = ItemStock.objects.get(item=ghee)
    assert (stock.on_hand, stock.avg_cost) == (Decimal("9.000"), Decimal("146.6667"))
    assert void(owner, bill["id"]).status_code == 200
    stock.refresh_from_db()
    assert (stock.on_hand, stock.avg_cost) == (Decimal("3.000"), Decimal("140.0000"))
    assert stock.stock_value == Decimal("420.0000000")
    assert_books_clean(shop, supplier)


def test_void_refuses_a_draft_a_second_void_and_the_counter(
    shop: Any, owner: Any, api_as: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-04-3 / §12 — a draft is deleted, not voided (409 `document_not_recorded`); voiding
    twice is 409 `document_already_void`; staff may record but not void (403); a reason under
    three characters is 400."""
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    pending = draft(owner, party_id=str(supplier.id), lines=[line(rice, "1")]).json()["data"]
    assert void(owner, pending["id"]).json()["error"]["code"] == "document_not_recorded"

    data = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "1")])
    staff, _ = api_as(shop, role="staff")
    assert void(staff, data["id"]).status_code == 403
    short = void(owner, data["id"], "no")
    assert short.status_code == 400 and "reason" in short.json()["error"]["details"]
    assert void(owner, data["id"]).status_code == 200
    again = void(owner, data["id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "document_already_void"


def test_the_same_supplier_invoice_can_be_entered_again_after_a_void(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-04-4 / T-PUR-01-6 / FR-6 — the duplicate index excludes void bills, so the correct
    bill can be recorded under the same AT/778; the voided one keeps PB/…/0001."""
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    body = {"party_id": str(supplier.id), "supplier_invoice_number": "AT/778"}
    wrong = recorded_bill(owner, **body, lines=[line(rice, "10")])
    assert void(owner, wrong["id"], "Wrong quantity").status_code == 200
    right = recorded_bill(owner, **body, lines=[line(rice, "12")])
    assert (wrong["number"], right["number"]) == ("PB/26-27/0001", "PB/26-27/0002")


def test_void_calls_the_payments_seam_inside_its_transaction(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any, monkeypatch: Any
) -> None:
    """FR-2d seam — a listener the payments app registers is called with the bill being voided
    and its released payment ids are returned in `meta.released_payments`; a listener that
    fails rolls the whole void back.

    The listener list is swapped for a private one rather than cleared afterwards: clearing
    it also removed the payments app's own listener (registered in `ready()`), so every void
    later in the same run silently stopped releasing supplier payments (PUR-02)."""
    from apps.purchases.services import payment_seam

    monkeypatch.setattr(payment_seam, "_VOID_LISTENERS", [])
    seen: list[str] = []

    def release(ctx: Any, document: Any) -> list:
        seen.append(document.number)
        return ["pay-1"]

    payment_seam.register_void_listener(release)
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    data = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "1")])
    response = void(owner, data["id"])
    assert response.json()["meta"]["released_payments"] == ["pay-1"]
    assert seen == [data["number"]]

    def explode(ctx: Any, document: Any) -> list:
        raise RuntimeError("payments down")

    payment_seam.register_void_listener(explode)
    other = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "1")])
    owner.raise_request_exception = False
    assert void(owner, other["id"]).status_code == 500
    assert PurchaseDocument.objects.get(pk=other["id"]).status == "recorded"
    assert StockMovement.objects.filter(movement_type="reversal").count() == 1


def test_apply_payment_moves_paid_due_and_status_by_the_br5_rule(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """PUR-02 seam / BR-5 — ₹1,000 on a ₹2,000 bill is `partially_paid` with ₹1,000 due, the
    rest is `paid`; undoing a payment on a past-due bill goes straight to `overdue`; more than
    is due is `over_allocated`; a void bill takes nothing (`document_not_open`)."""
    import datetime as dt

    from apps.common.exceptions import BusinessRuleViolation
    from apps.purchases.services.payment_seam import apply_payment

    rice = make_item("Rice", "2000.00", "GST0")
    data = recorded_bill(owner, party_id=str(make_supplier().id), lines=[line(rice, "1")])
    bill = PurchaseDocument.objects.get(pk=data["id"])
    today = dt.date(2026, 9, 25)
    apply_payment(document=bill, amount=Decimal("1000.00"), today=today)
    assert (bill.status, bill.amount_due) == ("partially_paid", Decimal("1000.00"))
    apply_payment(document=bill, amount=Decimal("1000.00"), today=today)
    assert (bill.status, bill.amount_due) == ("paid", Decimal("0.00"))
    with pytest.raises(BusinessRuleViolation) as over:
        apply_payment(document=bill, amount=Decimal("0.01"), today=today)
    assert over.value.code == "over_allocated"
    bill.due_on = dt.date(2026, 9, 20)
    apply_payment(document=bill, amount=Decimal("-500.00"), today=today)
    assert (bill.status, bill.amount_due) == ("overdue", Decimal("500.00"))
    bill.status = "void"
    with pytest.raises(BusinessRuleViolation) as closed:
        apply_payment(document=bill, amount=Decimal("1.00"), today=today)
    assert closed.value.code == "document_not_open"


def test_the_nightly_job_marks_past_due_bills_overdue(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any, monkeypatch: Any
) -> None:
    """FR-10 — `purchases.refresh_overdue` (scheduled since Sprint 0, handler new here) moves a
    recorded bill whose due date has passed to `overdue`, leaves a current one, and is
    idempotent. The module-off guard counts open bills.

    The guard registry is module state other suites reset, so this test gives
    `register_guards()` a fresh one rather than depending on suite order."""
    from apps.platform_app.services import guards as platform_guards
    from apps.purchases.services import guards as purchase_guards
    from apps.purchases.services.overdue import refresh_overdue

    monkeypatch.setattr(platform_guards, "_MODULE_OFF_GUARDS", {})
    monkeypatch.setattr(purchase_guards, "_REGISTERED", False)
    purchase_guards.register_guards()
    blocking_rows_for_module_off = platform_guards.blocking_rows_for_module_off

    rice = make_item("Rice", "46.00")
    supplier = make_supplier()
    late = recorded_bill(
        owner, party_id=str(supplier.id), document_date="2026-09-01", lines=[line(rice, "1")]
    )
    current = recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "1")])
    PurchaseDocument.objects.filter(pk=current["id"]).update(due_on="2099-01-01")
    assert refresh_overdue(tenant=shop) == {"moved": 1}
    assert refresh_overdue(tenant=shop) == {"moved": 0}
    statuses = {str(k): v for k, v in PurchaseDocument.objects.values_list("id", "status")}
    assert (statuses[late["id"]], statuses[current["id"]]) == ("overdue", "recorded")
    assert blocking_rows_for_module_off(shop, "purchases") == 2


def test_the_detail_carries_what_the_void_dialog_lists(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """FR-3 / AC-2 — the consequences are computed from `GET /purchases/bills/{id}`: which lines
    move stock (a service line does not), their quantities and units, and the khata amount."""
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    freight = make_item(
        "Freight", "100.00", "GST18", item_type="service", track_stock=False, hsn_sac="996511"
    )
    data = recorded_bill(
        owner, party_id=str(supplier.id), lines=[line(rice, "20"), line(freight, "1")]
    )
    detail = owner.get(bill_url(data["id"])).json()["data"]
    assert [
        (ln["description"], ln["qty"], ln["unit_code"], ln["track_stock"]) for ln in detail["lines"]
    ] == [
        ("Rice", "20.000", "NOS", True),
        ("Freight", "1.000", "NOS", False),
    ]
    assert detail["grand_total"] == data["grand_total"]
