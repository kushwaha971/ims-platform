"""SAL-02 / SAL-07 — issuing an invoice and every side effect it must (and must not) have."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.inventory.models import ItemStock, StockMovement
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.platform_app.models import AuditLog, DocumentSequence, TenantSetting
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import INVOICES, cash, draft, invoice_url, issue, line, money

pytestmark = pytest.mark.django_db


def br10_lines(make_item: Any) -> list[dict]:
    rice = make_item("Basmati Rice 5kg", "450.00", "GST5")
    oil = make_item("Cooking Oil 1L", "160.00", "GST5", inclusive=True)
    soap = make_item("Detergent 1kg", "95.00", "GST18")
    return [
        line(rice, "2", discount_type="percent", discount_value="5"),
        line(oil, "3"),
        line(soap, "4"),
    ]


def test_credit_sale_posts_stock_ledger_number_and_audit(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL02-10 / AC-2 / AC-5 / AC-8 — the BR-10 invoice to a party: number INV/26-27/0001,
    stock down, one ledger debit of the ROUNDED total linked back, balance moved, audit written."""
    party = make_party()
    body = {
        "party_id": str(party.id),
        "document_date": "2026-09-18",
        "discount_type": "amount",
        "discount_value": "50.00",
        "lines": br10_lines(make_item),
    }
    created = draft(owner, **body)
    assert created.status_code == 201, created.json()
    doc = created.json()["data"]
    assert doc["status"] == "draft" and doc["number"] is None
    assert doc["grand_total"] == "1772.00" and doc["round_off"] == "-0.19"

    response = issue(owner, doc["id"], version=doc["version"])
    assert response.status_code == 200, response.json()
    data, meta = response.json()["data"], response.json()["meta"]
    assert data["number"] == "INV/26-27/0001"
    assert data["status"] == "issued" and data["amount_due"] == "1772.00"
    assert data["cgst_total"] == "65.02" and data["sgst_total"] == "65.03"
    assert data["due_on"] == "2026-10-03"  # 18 Sep + the preset's 15 days
    assert data["party_snapshot"]["name"] == "Ramesh Traders"
    assert meta["party_balance"] == "1772.00"

    entry = LedgerEntry.objects.get(pk=meta["ledger_entry_id"])
    assert (entry.direction, entry.amount, entry.entry_type) == (
        "debit",
        Decimal("1772.00"),
        "invoice",
    )
    assert (entry.source_type, str(entry.source_id)) == ("sales_document", doc["id"])
    party.refresh_from_db()
    assert (
        party.balance
        == Decimal("1772.00")
        == computed_balance(tenant=party.tenant, party_id=party.id)
    )
    moves = StockMovement.objects.filter(source_type="sales_document", source_id=doc["id"])
    assert sorted(m.qty for m in moves) == [Decimal("-4.000"), Decimal("-3.000"), Decimal("-2.000")]
    assert all(m.movement_type == "sale_out" for m in moves)
    stored = SalesDocument.objects.get(pk=doc["id"])
    assert all(ln.unit_cost_snapshot == Decimal("380.0000") for ln in stored.lines.all())
    assert AuditLog.objects.filter(action=AuditAction.INVOICE_ISSUED, entity_id=doc["id"]).exists()


def test_inter_state_invoice_splits_igst(owner: Any, make_item: Any, make_party: Any) -> None:
    """T-SAL02-16 / AC-3 — POS 24 from a 27 shop: IGST only, CGST/SGST zero."""
    party = make_party(state_code="24")
    created = draft(
        owner,
        party_id=str(party.id),
        document_date="2026-09-18",
        discount_type="amount",
        discount_value="50.00",
        lines=br10_lines(make_item),
    )
    data = issue(owner, created.json()["data"]["id"]).json()["data"]
    assert data["is_inter_state"] is True and data["place_of_supply_state"] == "24"
    assert data["igst_total"] == "130.05" and data["cgst_total"] == "0.00"


def test_composition_forces_bill_of_supply_and_refuses_invoice(
    owner: Any, shop: Any, make_item: Any
) -> None:
    """T-SAL02-8 / AC-7 — composition: omitted kind → bill_of_supply with zero tax; kind=invoice → 400."""
    shop.gst_type = "composition"
    shop.save()
    item = make_item(tax_code="GST18")
    refused = draft(owner, kind="invoice", lines=[line(item)])
    assert refused.status_code == 400 and refused.json()["error"]["code"] == "kind_not_allowed"
    data = draft(owner, lines=[line(item)]).json()["data"]
    assert data["kind"] == "bill_of_supply" and data["cgst_total"] == "0.00"
    assert data["lines"][0]["tax_code"] == "GST18" and data["lines"][0]["tax_rate"] == "0.000"


def test_insufficient_stock_writes_nothing(
    owner: Any, make_item: Any, make_party: Any, shop: Any
) -> None:
    """T-SAL02-9 / FR-8 — stock 1, qty 2 → 409 with per-line detail; no movement, no ledger,
    and the sequence unchanged (the number is allocated after the stock check)."""
    item = make_item(stock="1")
    party = make_party()
    doc = draft(owner, party_id=str(party.id), lines=[line(item, "2")]).json()["data"]
    response = issue(owner, doc["id"])
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "insufficient_stock"
    assert error["details"]["lines"][0]["requested"] == "2.000"
    assert error["details"]["lines"][0]["available"] == "1.000"
    assert not StockMovement.objects.filter(source_type="sales_document").exists()
    assert not LedgerEntry.objects.filter(party=party).exists()
    assert (
        not DocumentSequence.objects.filter(tenant=shop, kind="invoice").exists()
        or DocumentSequence.objects.get(tenant=shop, kind="invoice", fy_label="2026-27").next_number
        == 1
    )
    assert SalesDocument.objects.get(pk=doc["id"]).status == "draft"


def test_negative_stock_setting_lets_the_sale_through(
    owner: Any, make_item: Any, shop: Any
) -> None:
    """EC-15 — with `inventory.allow_negative_stock` on, on-hand goes negative."""
    TenantSetting.objects.update_or_create(
        tenant=shop, key="inventory.allow_negative_stock", defaults={"value": {"value": True}}
    )
    item = make_item(stock="1", price="100.00")
    doc = draft(owner, walk_in_name="Walk-in", lines=[line(item, "3")]).json()["data"]
    response = issue(owner, doc["id"], payment=cash(doc["grand_total"]))
    assert response.status_code == 200, response.json()
    assert ItemStock.objects.get(item=item).on_hand == Decimal("-2.000")


def test_walk_in_requires_full_payment_and_posts_no_ledger(owner: Any, make_item: Any) -> None:
    """T-SAL07-1 / T-SAL02-12 / AC-3 (SAL-07) — none → 400, partial → 400, full → paid, no ledger rows."""
    item = make_item(price="100.00", tax_code="GST0")
    doc = draft(owner, lines=[line(item, "2")]).json()["data"]
    assert doc["party"] is None
    none = issue(owner, doc["id"])
    assert none.status_code == 400 and "payment" in none.json()["error"]["details"]
    partial = issue(owner, doc["id"], payment=cash("100.00"))
    assert partial.json()["error"]["details"]["payment"] == ["Walk-in sale must be paid in full"]
    split = {
        "mode_breakup": [
            {"mode": "upi", "amount": "150.00", "reference": "UTR1"},
            {"mode": "cash", "amount": "50.00"},
        ]
    }
    paid = issue(owner, doc["id"], payment=split)
    assert paid.status_code == 200, paid.json()
    data = paid.json()["data"]
    assert data["status"] == "paid" and data["amount_due"] == "0.00" and data["due_on"] is None
    assert [r["mode"] for r in data["payment"]["mode_breakup"]] == ["upi", "cash"]
    assert not LedgerEntry.objects.exists()


def test_party_payment_at_issue_is_recorded_through_payments(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """PAY-01 replaced the seam — a party sale may take a payment at issue, and it becomes
    a receipt (the payments suite covers the allocation and the khata in full)."""
    doc = draft(owner, party_id=str(make_party().id), lines=[line(make_item())]).json()["data"]
    response = issue(owner, doc["id"], payment=cash("472.50"))
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["amount_paid"] == "472.50"
    assert response.json()["data"]["payment"]["number"].startswith("RCT/")


def test_credit_limit_warn_block_and_override(
    owner: Any, make_item: Any, make_party: Any, shop: Any, api_as: Any
) -> None:
    """T-SAL02-13 / AC-9 — warn → warnings; block → 409; staff override refused; owner override
    → issued with the override audited as its own row."""
    item = make_item(price="1000.00", tax_code="GST0", stock="100")
    party = make_party(credit_limit=Decimal("1500.00"))
    first = draft(owner, party_id=str(party.id), lines=[line(item, "2")]).json()["data"]
    warned = issue(owner, first["id"])
    assert warned.status_code == 200
    assert warned.json()["meta"]["warnings"][0]["code"] == "credit_limit_exceeded"

    TenantSetting.objects.update_or_create(
        tenant=shop, key="ledger.credit_limit_mode", defaults={"value": {"mode": "block"}}
    )
    staff, _ = api_as(shop, role="staff")
    second = draft(staff, party_id=str(party.id), lines=[line(item, "1")]).json()["data"]
    blocked = issue(staff, second["id"])
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "credit_limit_exceeded"
    not_allowed = issue(staff, second["id"], override=True)
    assert not_allowed.json()["error"]["code"] == "override_not_allowed"
    ok = issue(owner, second["id"], override=True)
    assert ok.status_code == 200
    assert AuditLog.objects.filter(action=AuditAction.CREDIT_LIMIT_OVERRIDDEN).count() == 1


def test_idempotent_replay_and_conflict(owner: Any, make_item: Any, make_party: Any) -> None:
    """T-SAL02-14 / EC-8 / EC-9 — same key replays with no second ledger row; key missing → 400."""
    party = make_party()
    doc = draft(owner, party_id=str(party.id), lines=[line(make_item())]).json()["data"]
    missing = owner.post(invoice_url(doc["id"], "issue"), {}, format="json")
    assert missing.status_code == 400
    key = str(uuid.uuid4())
    first = issue(owner, doc["id"], key=key)
    again = issue(owner, doc["id"], key=key)
    assert again.status_code == 200 and again["Idempotent-Replayed"] == "true"
    assert again.json()["data"]["number"] == first.json()["data"]["number"]
    assert LedgerEntry.objects.filter(party=party).count() == 1
    conflict = issue(owner, doc["id"], key=key, override=True)
    assert (
        conflict.status_code == 409 and conflict.json()["error"]["code"] == "idempotency_conflict"
    )


def test_create_and_issue_in_one_call(owner: Any, make_item: Any) -> None:
    """FR-13 — `POST ?issue=true` issues atomically; without a key it is refused."""
    item = make_item(price="100.00", tax_code="GST0")
    url = reverse(INVOICES) + "?issue=true"
    body = {"lines": [line(item)], "payment": cash("100.00")}
    assert owner.post(url, body, format="json").status_code == 400
    response = owner.post(url, body, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
    assert response.status_code == 201, response.json()
    assert response.json()["data"]["status"] == "paid"


def test_regular_tenant_without_gstin_cannot_issue_a_tax_invoice(
    owner: Any, shop: Any, make_item: Any
) -> None:
    """AC-6 / FR-16 — Rule 46 hard failure: "Add your GSTIN in Business profile"."""
    shop.gstin = None
    shop.save()
    doc = draft(owner, lines=[line(make_item(price="10.00", tax_code="GST0"))]).json()["data"]
    response = issue(owner, doc["id"], payment=cash("10.00"))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "rule46_failed"
    assert response.json()["error"]["message"] == "Add your GSTIN in Business profile"


def test_legacy_rate_after_reform_blocks_issue_but_not_the_draft(
    owner: Any, make_item: Any
) -> None:
    """FR-17 / T-SAL02-6 — GST12 dated after 2025-09-21: the draft saves with a warning, issue is 400
    naming the rate and suggesting current ones."""
    item = make_item(tax_code="GST5")
    saved = draft(owner, document_date="2026-09-18", lines=[line(item, tax_code="GST12")])
    assert saved.status_code == 201
    assert saved.json()["meta"]["warnings"][0]["code"] == "rate_not_applicable"
    response = issue(owner, saved.json()["data"]["id"], payment=cash("1000"))
    assert response.status_code == 400
    message = response.json()["error"]["details"]["lines.0.tax_code"][0]
    assert message.startswith("Rate GST12 is not applicable on 2026-09-18")


def test_previous_fy_backdate_uses_that_years_series(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """EC-10 / T-SAL02-7 — dated 31 Mar 2026 → `INV/25-26/0001`, ≤ 16 characters."""
    doc = draft(
        owner, party_id=str(make_party().id), document_date="2026-03-31", lines=[line(make_item())]
    ).json()["data"]
    number = issue(owner, doc["id"]).json()["data"]["number"]
    assert number == "INV/25-26/0001" and len(number) <= 16


def test_zero_value_invoice_is_paid_without_a_ledger_row(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """EC-5 — a 100 % discount: grand 0, status paid, no ledger entry (amount must be > 0)."""
    party = make_party()
    doc = draft(
        owner,
        party_id=str(party.id),
        discount_type="percent",
        discount_value="100",
        lines=[line(make_item())],
    ).json()["data"]
    data = issue(owner, doc["id"]).json()["data"]
    assert data["grand_total"] == "0.00" and data["status"] == "paid"
    assert not LedgerEntry.objects.filter(party=party).exists()


def test_accountant_reads_but_cannot_write(shop: Any, api_as: Any, make_item: Any) -> None:
    """T-SAL02-21 — accountant POST → 403; list → 200."""
    accountant, _ = api_as(shop, role="accountant")
    assert accountant.get(reverse(INVOICES)).status_code == 200
    assert draft(accountant, lines=[]).status_code == 403


def test_the_money_moved_matches_money(owner: Any, make_item: Any, make_party: Any) -> None:
    """BR-9 end to end — the stored lines sum to the stored totals after issue."""
    doc = draft(owner, party_id=str(make_party().id), lines=br10_lines(make_item)).json()["data"]
    data = issue(owner, doc["id"]).json()["data"]
    total = sum(money(ln["line_total"]) for ln in data["lines"])
    assert total + money(data["round_off"]) == money(data["grand_total"])
