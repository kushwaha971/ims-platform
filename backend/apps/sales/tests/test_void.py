"""SAL-05 — voiding an invoice: reversals by new rows, the number kept, the refusals."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest

from apps.common.dates import tenant_today
from apps.inventory.models import ItemStock, StockMovement
from apps.ledger.models import LedgerEntry
from apps.platform_app.models import AuditLog
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import (
    cash,
    credit_note_url,
    draft,
    invoice_url,
    issue,
    issue_note,
    issued_invoice,
    line,
    recalc_clean,
)

pytestmark = pytest.mark.django_db


def void(client: Any, document_id: Any, reason: str = "Duplicate bill") -> Any:
    return client.post(invoice_url(document_id, "void"), {"reason": reason}, format="json")


def test_void_reverses_stock_and_ledger_with_new_rows_dated_today(
    owner: Any, shop: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL05-1 / AC-1 / BR-2 / BR-6 — stock +2 at the snapshot cost, the debit reversed by
    a credit dated TODAY sourced to the invoice, the original marked reversed, status void,
    the number unchanged, the average back where it was; caches replay clean."""
    party, rice = make_party(), make_item()
    stock_before = ItemStock.objects.get(item=rice)
    invoice = issued_invoice(
        owner,
        party,
        [line(rice, "2")],
        document_date=(tenant_today(shop) - dt.timedelta(days=3)).isoformat(),
    )
    response = void(owner, invoice["id"])
    assert response.status_code == 200, response.json()
    data, meta = response.json()["data"], response.json()["meta"]
    assert data["status"] == "void" and data["number"] == invoice["number"]
    assert data["void_reason"] == "Duplicate bill"
    assert data["amount_due"] == "0.00"

    reversal = LedgerEntry.objects.get(pk=meta["reversals"]["ledger_entry_id"])
    assert reversal.entry_type == "reversal" and reversal.direction == "credit"
    assert reversal.entry_date == tenant_today(shop)
    assert reversal.source_type == "sales_document" and str(reversal.source_id) == invoice["id"]
    original = LedgerEntry.objects.get(source_id=invoice["id"], entry_type="invoice")
    assert original.status == "reversed" and original.reversed_by_id == reversal.id
    party.refresh_from_db()
    assert party.balance == 0

    moved = StockMovement.objects.get(pk=meta["reversals"]["stock_movement_ids"][0])
    assert moved.movement_type == "reversal" and moved.qty == Decimal("2.000")
    assert moved.movement_date == tenant_today(shop)
    stock = ItemStock.objects.get(item=rice)
    assert (stock.on_hand, stock.avg_cost) == (stock_before.on_hand, stock_before.avg_cost)
    assert AuditLog.objects.filter(action="invoice.voided", entity_id=invoice["id"]).exists()
    recalc_clean()


def test_a_voided_number_is_never_reissued(owner: Any, make_item: Any, make_party: Any) -> None:
    """TSK-SAL-05-04 / BR-1 — after voiding INV/…/0001 the next bill takes 0002, and the
    voided bill keeps 0001 in the register."""
    party, item = make_party(), make_item()
    first = issued_invoice(owner, party, [line(item, "1")])
    assert void(owner, first["id"]).status_code == 200
    second = issued_invoice(owner, party, [line(item, "1")])
    assert first["number"] == "INV/26-27/0001"
    assert second["number"] == "INV/26-27/0002"
    assert SalesDocument.objects.get(pk=first["id"]).number == "INV/26-27/0001"


def test_a_paid_walk_in_bill_reports_its_payment_for_the_follow_up(
    owner: Any, make_item: Any
) -> None:
    """T-SAL05-2 / FR-6 / FR-7 — the payment is never voided by the void; the response names
    the real receipt (`walk_in: true`) so the client can offer the money back over the
    counter, and the receipt stays `recorded` with its amount now unallocated."""
    from apps.payments.models import Allocation, Payment

    item = make_item()
    created = draft(owner, walk_in_name="Counter", lines=[line(item, "1")]).json()["data"]
    paid = issue(owner, created["id"], payment=cash(created["grand_total"])).json()["data"]
    assert paid["status"] == "paid"
    receipt = Payment.objects.get(pk=paid["payment"]["payment_id"])
    response = void(owner, paid["id"])
    assert response.status_code == 200, response.json()
    payments = response.json()["meta"]["unallocated_payments"]
    assert payments == [
        {
            "payment_id": str(receipt.id),
            "number": receipt.number,
            "amount": paid["grand_total"],
            "walk_in": True,
        }
    ]
    receipt.refresh_from_db()
    assert receipt.status == "recorded" and receipt.unallocated_amount == receipt.amount
    assert not Allocation.objects.filter(document_id=paid["id"]).exists()
    assert response.json()["data"]["payment"]["mode_breakup"][0]["mode"] == "cash"


def test_void_is_refused_while_a_credit_note_stands_against_the_invoice(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL05-3 / FR-3 — "Void credit note CN/… first"."""
    invoice = issued_invoice(owner, make_party(), [line(make_item(), "2")])
    note = owner.post(
        "/api/v1/sales/credit-notes",
        {
            "against_id": invoice["id"],
            "reason": "sales_return",
            "lines": [{"against_line_id": invoice["lines"][0]["id"], "qty": "1"}],
        },
        format="json",
    ).json()["data"]
    issued = issue_note(owner, note["id"]).json()["data"]
    refused = void(owner, invoice["id"])
    assert refused.status_code == 400
    assert refused.json()["error"]["details"]["non_field_errors"] == [
        f"Void credit note {issued['number']} first."
    ]
    owner.post(credit_note_url(note["id"], "void"), {"reason": "Undo return"})
    assert void(owner, invoice["id"]).status_code == 200


def test_voiding_twice_is_409_and_a_draft_is_deleted_not_voided(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL05-4 / T-SAL05-7 / EC-6 — second void 409 `document_already_void`; a draft 400."""
    party, item = make_party(), make_item()
    invoice = issued_invoice(owner, party, [line(item, "1")])
    assert void(owner, invoice["id"]).status_code == 200
    again = void(owner, invoice["id"])
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "document_already_void"
    a_draft = draft(owner, party_id=str(party.id), lines=[line(item, "1")]).json()["data"]
    refused = void(owner, a_draft["id"])
    assert refused.status_code == 400
    assert owner.delete(invoice_url(a_draft["id"])).status_code == 204


def test_reason_is_required_and_staff_cannot_void(
    shop: Any, api_as: Any, owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL05-5 / §10 — a two-letter reason is 400; staff and accountant are 403."""
    invoice = issued_invoice(owner, make_party(), [line(make_item(), "1")])
    assert void(owner, invoice["id"], reason="no").status_code == 400
    staff, _ = api_as(shop, role="staff")
    accountant, _ = api_as(shop, role="accountant")
    assert void(staff, invoice["id"]).status_code == 403
    assert void(accountant, invoice["id"]).status_code == 403


def test_void_after_a_later_purchase_keeps_the_replay_clean(
    owner: Any, shop: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL05-6 / CR-2026-09-24-INV-A — a stock-in at a new cost AFTER the sale and BEFORE
    the void: the reversal goes back in at the sale's snapshot, and the incremental cache
    still equals `recalc_stock`'s replay."""
    from apps.common.context import Ctx
    from apps.inventory.constants import MovementType
    from apps.inventory.services.stock import MovementLine, post_movement

    party, rice = make_party(), make_item()
    invoice = issued_invoice(owner, party, [line(rice, "10")])
    post_movement(
        ctx=Ctx.system(shop),
        line=MovementLine(
            item=rice,
            qty=Decimal("10"),
            movement_type=MovementType.ADJUST_IN,
            movement_date=tenant_today(shop),
            source_type="stock_adjustment",
            unit_cost=Decimal("500.00"),
        ),
    )
    assert void(owner, invoice["id"]).status_code == 200
    stock = ItemStock.objects.get(item=rice)
    # 30 @380 + 10 @500 → 410.00; the 10 come back at the sale's 380 → (40×410 + 10×380)/50.
    assert stock.on_hand == Decimal("50.000")
    assert stock.avg_cost == Decimal("404.0000")
    recalc_clean()


def test_voiding_an_invoice_releases_credit_applied_from_another_note(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """BR-5 — credit applied from a standalone note comes back to it as open credit."""
    party = make_party()
    labour = make_item("Labour", "100.00", "GST0", stock=None, item_type="service", hsn_sac="9987")
    invoice = issued_invoice(owner, party, [line(make_item(), "1")])
    note = owner.post(
        "/api/v1/sales/credit-notes",
        {"party_id": str(party.id), "reason": "other", "lines": [line(labour, "1")]},
        format="json",
    ).json()["data"]
    issue_note(owner, note["id"])
    owner.post(
        credit_note_url(note["id"], "apply"),
        {"invoice_id": invoice["id"], "amount": "100.00"},
        format="json",
    )
    assert SalesDocument.objects.get(pk=note["id"]).status == "applied"
    response = void(owner, invoice["id"])
    assert response.status_code == 200, response.json()
    assert response.json()["meta"]["released_credit"][0]["amount"] == "100.00"
    back = SalesDocument.objects.get(pk=note["id"])
    assert back.status == "issued" and back.amount_due == Decimal("100.00")
    recalc_clean()
