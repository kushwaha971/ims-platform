"""PUR-01 — recording a purchase bill and every side effect it must (and must not) have."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.inventory.models import Item, ItemStock, StockMovement
from apps.inventory.selectors.drift import stock_drift
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.platform_app.models import AuditLog, DocumentSequence, TenantSetting
from apps.purchases.models import PurchaseDocument
from apps.purchases.tests.conftest import BILLS, bill_url, draft, line, record, recorded_bill

pytestmark = pytest.mark.django_db


def worked_example(make_item: Any) -> list[dict]:
    """§17.7.0 — Rice 20 NOS @ ₹46, Sugar 50 KGS @ ₹38 less 2 %, both GST5."""
    rice = make_item("Rice", "40.00", "GST5", unit_code="NOS")
    sugar = make_item("Sugar", "35.00", "GST5", unit_code="KGS")
    return [
        line(rice, "20", "46"),
        line(sugar, "50", "38", discount_type="percent", discount_value="2"),
    ]


def test_the_worked_example_posts_stock_ledger_last_cost_number_and_audit(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-1 / T-PUR-01-4 / AC-1 — the §17.7.0 bill, to the paisa: grand ₹2,921.00 after a
    −0.10 round-off; two `purchase_in` movements at 46.0000 and 37.2400; ONE ledger credit of
    the rounded total sourced to the bill; supplier balance −2,921 equal to a replay; the items'
    last cost overwritten; PB/26-27/0001; `purchase_bill.recorded` audited."""
    supplier = make_supplier(credit_days=15)
    created = draft(
        owner,
        party_id=str(supplier.id),
        supplier_invoice_number="AT/778",
        supplier_invoice_date="2026-09-17",
        document_date="2026-09-18",
        lines=worked_example(make_item),
    )
    assert created.status_code == 201, created.json()
    doc = created.json()["data"]
    assert (doc["status"], doc["number"]) == ("draft", None)
    assert doc["subtotal"] == "2782.00"
    assert (doc["cgst_total"], doc["sgst_total"], doc["igst_total"]) == ("69.55", "69.55", "0.00")
    assert (doc["round_off"], doc["grand_total"]) == ("-0.10", "2921.00")
    assert doc["itc_eligible"] is True and doc["is_inter_state"] is False

    response = record(owner, doc["id"], version=doc["version"])
    assert response.status_code == 200, response.json()
    data, meta = response.json()["data"], response.json()["meta"]
    assert data["number"] == "PB/26-27/0001" and data["status"] == "recorded"
    assert (data["amount_paid"], data["amount_due"]) == ("0.00", "2921.00")
    assert data["due_on"] == "2026-10-03"  # 18 Sep + the supplier's 15 credit days
    assert data["party_snapshot"]["name"] == "Agro Traders"
    assert [ln["inbound_unit_cost"] for ln in data["lines"]] == ["46.0000", "37.2400"]
    assert [ln["line_total"] for ln in data["lines"]] == ["966.00", "1955.10"]
    assert meta["party_balance"] == "-2921.00"

    moves = StockMovement.objects.filter(source_type="purchase_document", source_id=doc["id"])
    assert sorted((m.qty, m.unit_cost, m.movement_type) for m in moves) == [
        (Decimal("20.000"), Decimal("46.0000"), "purchase_in"),
        (Decimal("50.000"), Decimal("37.2400"), "purchase_in"),
    ]
    assert sorted(meta["movement_ids"]) == sorted(str(m.id) for m in moves)

    entry = LedgerEntry.objects.get(pk=meta["ledger_entry_id"])
    assert (entry.direction, entry.amount, entry.entry_type) == (
        "credit",
        Decimal("2921.00"),
        "purchase_bill",
    )
    assert (entry.source_type, str(entry.source_id)) == ("purchase_document", doc["id"])
    assert data["ledger_entry"] == {"id": str(entry.id)}
    supplier.refresh_from_db()
    assert (
        supplier.balance
        == Decimal("-2921.00")
        == computed_balance(tenant=supplier.tenant, party_id=supplier.id)
    )
    assert supplier.payable_total == Decimal("2921.00")

    prices = dict(Item.objects.values_list("name", "purchase_price"))
    assert prices == {"Rice": Decimal("46.00"), "Sugar": Decimal("37.24")}
    audit = AuditLog.objects.get(action=AuditAction.PURCHASE_BILL_RECORDED, entity_id=doc["id"])
    assert audit.after["number"] == "PB/26-27/0001"
    assert audit.after["ledger_entry_id"] == str(entry.id)
    assert sorted(audit.after["movement_ids"]) == sorted(meta["movement_ids"])
    assert stock_drift(tenant_id=supplier.tenant_id) == []


def test_an_inter_state_supplier_is_charged_igst(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-1 inter-state variant — a Karnataka supplier to a Maharashtra shop: IGST 5 %
    on each line's taxable value, no CGST/SGST, the same grand total."""
    supplier = make_supplier(state_code="29")
    data = recorded_bill(
        owner,
        party_id=str(supplier.id),
        document_date="2026-09-18",
        lines=worked_example(make_item),
    )
    assert data["is_inter_state"] is True
    assert (data["cgst_total"], data["sgst_total"], data["igst_total"]) == (
        "0.00",
        "0.00",
        "139.10",
    )
    assert [ln["igst"] for ln in data["lines"]] == ["46.00", "93.10"]
    assert data["grand_total"] == "2921.00"


def test_the_supplier_state_falls_back_to_the_gstin_prefix(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """§17.7.0 — with no `state_code`, the first two digits of the GSTIN decide inter-state;
    with neither, the bill is intra-state and says it assumed so (EC-13)."""
    rice = make_item("Rice", "46.00")
    by_gstin = make_supplier(name="Blr Mills", state_code=None, gstin="29AAACB1234C1Z5")
    unknown = make_supplier(name="Unknown Co", state_code=None, gstin=None)
    first = draft(owner, party_id=str(by_gstin.id), lines=[line(rice, "1")]).json()
    assert first["data"]["is_inter_state"] is True
    second = draft(owner, party_id=str(unknown.id), lines=[line(rice, "1")]).json()
    assert second["data"]["is_inter_state"] is False
    assert [w["code"] for w in second["meta"]["warnings"]] == ["supplier_state_unknown"]


def test_without_itc_the_tax_is_part_of_the_cost(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-2 — `itc_eligible=false` on a regular shop: Rice 966.00/20 = 48.3000 and
    Sugar 1955.10/50 = 39.1020, because tax that cannot be claimed is what the goods cost."""
    data = recorded_bill(
        owner,
        party_id=str(make_supplier().id),
        document_date="2026-09-18",
        itc_eligible=False,
        lines=worked_example(make_item),
    )
    assert data["itc_eligible"] is False
    assert [ln["inbound_unit_cost"] for ln in data["lines"]] == ["48.3000", "39.1020"]
    costs = sorted(StockMovement.objects.values_list("unit_cost", flat=True))
    assert costs == [Decimal("39.1020"), Decimal("48.3000")]


def test_a_composition_shop_pays_gst_as_cost_and_cannot_claim_itc(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-9 / FR-11 — the SUPPLIER still charges GST (the sales engine's tax-free rule for
    composition must not leak into a purchase), `itc_eligible` is forced false even when asked
    for, and the inbound cost includes the tax."""
    shop.gst_type = "composition"
    shop.gstin = None
    shop.save()
    data = recorded_bill(
        owner,
        party_id=str(make_supplier().id),
        document_date="2026-09-18",
        itc_eligible=True,
        lines=worked_example(make_item),
    )
    assert data["itc_eligible"] is False
    assert data["cgst_total"] == "69.55" and data["grand_total"] == "2921.00"
    assert [ln["inbound_unit_cost"] for ln in data["lines"]] == ["48.3000", "39.1020"]


def test_the_weighted_average_blends_on_stock_and_restarts_below_zero(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-3 / §32.12.4 — the Part 21 §21.3.6 formula, paisa-exact: 10 on hand at 40 plus
    20 at 46 is (400 + 920) / 30 = 44.0000; and when on-hand is ≤ 0 before the receipt the
    average is the receipt's cost, not a blend with a negative quantity."""
    from apps.common.context import Ctx
    from apps.inventory.constants import MovementType
    from apps.inventory.services.stock import MovementLine, post_movement

    supplier = make_supplier()
    rice = make_item("Rice", "40.00", stock="10", stock_cost="40.00")
    recorded_bill(owner, party_id=str(supplier.id), lines=[line(rice, "20", "46")])
    stock = ItemStock.objects.get(item=rice)
    assert (stock.on_hand, stock.avg_cost) == (Decimal("30.000"), Decimal("44.0000"))

    dal = make_item("Dal", "80.00")
    post_movement(
        ctx=Ctx.system(shop),
        line=MovementLine(
            item=dal,
            qty=Decimal("-5"),
            movement_type=MovementType.SALE_OUT,
            movement_date=stock.max_movement_date,
            source_type="stock_adjustment",
        ),
        allow_negative=True,
    )
    recorded_bill(owner, party_id=str(supplier.id), lines=[line(dal, "10", "90")])
    dal_stock = ItemStock.objects.get(item=dal)
    assert (dal_stock.on_hand, dal_stock.avg_cost) == (Decimal("5.000"), Decimal("90.0000"))
    assert stock_drift(tenant_id=shop.id) == []


def test_services_and_free_text_lines_move_no_stock(
    shop: Any, owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-8 / BR-9 / EC-4 — a service-only bill posts the ledger credit and no movement;
    a free-text line is refused at record unless the shop allows them, and then moves nothing."""
    supplier = make_supplier()
    freight = make_item(
        "Freight", "500.00", "GST18", item_type="service", track_stock=False, hsn_sac="996511"
    )
    data = recorded_bill(owner, party_id=str(supplier.id), lines=[line(freight, "1")])
    assert data["grand_total"] == "590.00"
    assert not StockMovement.objects.filter(source_id=data["id"]).exists()
    assert LedgerEntry.objects.filter(source_id=data["id"]).count() == 1

    body = {
        "party_id": str(supplier.id),
        "lines": [{"description": "Loading charges", "qty": "1", "unit_cost": "200"}],
    }
    doc = draft(owner, **body).json()["data"]
    refused = record(owner, doc["id"], version=doc["version"])
    assert refused.status_code == 400
    assert "lines.0.item_id" in refused.json()["error"]["details"]

    TenantSetting.objects.create(
        tenant=shop, key="sales.allow_free_text_lines", value={"value": True}
    )
    allowed = record(owner, doc["id"], version=doc["version"])
    assert allowed.status_code == 200, allowed.json()
    assert not StockMovement.objects.filter(source_id=doc["id"]).exists()
    assert allowed.json()["data"]["lines"][0]["inbound_unit_cost"] is None


def test_a_duplicate_supplier_invoice_is_refused_with_the_bill_it_duplicates(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-6 / AC-4 / EC-1 / EC-2 — the same supplier's AT/778 twice is 409 naming the first
    bill (typed in another case, too); another supplier may use AT/778; two drafts with the same
    number both SAVE (the refusal is at record, so a draft never loses its lines)."""
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    first = recorded_bill(
        owner,
        party_id=str(supplier.id),
        supplier_invoice_number="AT/778",
        document_date="2026-09-12",
        lines=[line(rice, "1")],
    )
    second = draft(
        owner,
        party_id=str(supplier.id),
        supplier_invoice_number=" at/778 ",
        lines=[line(rice, "2")],
    )
    assert second.status_code == 201, second.json()
    doc = second.json()["data"]
    assert doc["supplier_invoice_number"] == "at/778"
    refused = record(owner, doc["id"], version=doc["version"])
    assert refused.status_code == 409
    error = refused.json()["error"]
    assert error["code"] == "duplicate_supplier_invoice"
    assert error["details"]["existing"] == {
        "id": first["id"],
        "number": "PB/26-27/0001",
        "document_date": "2026-09-12",
    }
    assert "12/09/2026" in error["message"]

    other = make_supplier(name="Other Mills")
    recorded_bill(
        owner, party_id=str(other.id), supplier_invoice_number="AT/778", lines=[line(rice, "1")]
    )
    lookup = owner.get(
        reverse(BILLS), {"party_id": str(supplier.id), "supplier_invoice_number": "AT/778"}
    )
    assert [row["number"] for row in lookup.json()["data"] if row["status"] != "draft"] == [
        "PB/26-27/0001"
    ]


def test_the_unique_index_refuses_a_duplicate_the_friendly_check_missed(
    owner: Any, make_item: Any, make_supplier: Any, monkeypatch: Any
) -> None:
    """§32.12.4 "the constraint holds under concurrency" — a record that slips past the read
    (as a racing transaction would) is stopped by `uq_purchases_supplier_invoice` and answered
    with the SAME 409 and `details.existing`, not a 500 — and nothing it did survives."""
    from apps.purchases.services import record as record_module

    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    body = {
        "party_id": str(supplier.id),
        "supplier_invoice_number": "AT/9",
        "lines": [line(rice, "1")],
    }
    first = recorded_bill(owner, **body)
    doc = draft(owner, **body).json()["data"]

    real = record_module.existing_duplicate
    calls = {"n": 0}

    def blind_first_time(document: Any) -> Any:
        calls["n"] += 1
        return None if calls["n"] == 1 else real(document)

    monkeypatch.setattr(record_module, "existing_duplicate", blind_first_time)
    refused = record(owner, doc["id"], version=doc["version"])
    assert refused.status_code == 409, refused.json()
    assert refused.json()["error"]["details"]["existing"]["id"] == first["id"]
    assert not StockMovement.objects.filter(source_id=doc["id"]).exists()
    assert PurchaseDocument.objects.get(pk=doc["id"]).status == "draft"


@pytest.mark.django_db(transaction=True)
def test_two_racing_records_of_one_supplier_invoice_record_exactly_one(
    shop: Any, make_item: Any, make_supplier: Any, api_as: Any
) -> None:
    """§32.12.4 — two clerks press Record on two drafts of the same supplier bill at the same
    moment, on real connections: exactly one bill is recorded and the other gets 409
    `duplicate_supplier_invoice`; stock moved once."""
    import threading

    from django.db import connection

    from apps.common.context import Ctx
    from apps.common.exceptions import BusinessRuleViolation
    from apps.purchases.services.drafts import create_draft
    from apps.purchases.services.record import record_bill

    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    ctx = Ctx.system(shop)
    body = {
        "party_id": supplier.id,
        "supplier_invoice_number": "RACE/1",
        "lines": [line(rice, "3")],
    }
    ids = [create_draft(ctx=ctx, payload=dict(body))["document"].id for _ in range(2)]
    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def attempt(document_id: Any) -> None:
        try:
            barrier.wait()
            record_bill(ctx=Ctx.system(shop), document_id=document_id)
            outcomes.append("recorded")
        except BusinessRuleViolation as error:
            outcomes.append(error.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=attempt, args=(i,)) for i in ids]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert sorted(outcomes) == ["duplicate_supplier_invoice", "recorded"]
    assert PurchaseDocument.objects.filter(status="recorded").count() == 1
    assert ItemStock.objects.get(item=rice).on_hand == Decimal("3.000")


def test_an_idempotent_replay_records_once_and_a_changed_body_conflicts(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-7 / EC-11 / BR-13 — the same key after a timeout returns the original document
    with no second set of movements; the same key with a different body is 409."""
    supplier = make_supplier()
    rice = make_item("Rice", "46.00")
    body = {"party_id": str(supplier.id), "lines": [line(rice, "5")]}
    key = str(uuid.uuid4())
    url = f"{reverse(BILLS)}?record=true"
    first = owner.post(url, body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert first.status_code == 201, first.json()
    replay = owner.post(url, body, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert replay.status_code == 201
    assert replay.json()["data"]["id"] == first.json()["data"]["id"]
    assert StockMovement.objects.filter(movement_type="purchase_in").count() == 1
    assert PurchaseDocument.objects.count() == 1

    changed = owner.post(
        url, {**body, "lines": [line(rice, "6")]}, format="json", HTTP_IDEMPOTENCY_KEY=key
    )
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "idempotency_conflict"
    missing = owner.post(url, body, format="json")
    assert missing.status_code == 400


def test_a_recorded_bill_is_immutable_except_its_notes(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-10 / BR-7 — PATCHing anything but `notes` after record is 409
    `document_not_draft`; notes alone is 200; delete is refused; recording twice is refused."""
    data = recorded_bill(
        owner, party_id=str(make_supplier().id), lines=[line(make_item("Rice", "46.00"), "1")]
    )
    url = bill_url(data["id"])
    moved = owner.patch(url, {"due_on": "2026-12-01", "version": data["version"]}, format="json")
    assert moved.status_code == 409 and moved.json()["error"]["code"] == "document_not_draft"
    noted = owner.patch(url, {"notes": "Delivered late", "version": data["version"]}, format="json")
    assert noted.status_code == 200, noted.json()
    assert noted.json()["data"]["notes"] == "Delivered late"
    assert owner.delete(url).json()["error"]["code"] == "document_not_draft"
    again = record(owner, data["id"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "document_not_draft"


def test_who_may_record_and_who_may_not(
    shop: Any, api_as: Any, make_item: Any, make_supplier: Any
) -> None:
    """T-PUR-01-11 / §12 — the accountant reads bills and cannot write one; staff can record."""
    accountant, _ = api_as(shop, role="accountant")
    staff, _ = api_as(shop, role="staff")
    body = {"party_id": str(make_supplier().id), "lines": [line(make_item("Rice", "46.00"), "1")]}
    assert draft(accountant, **body).status_code == 403
    assert accountant.get(reverse(BILLS)).status_code == 200
    assert recorded_bill(staff, **body)["status"] == "recorded"


def test_a_failure_after_the_stock_step_rolls_everything_back_including_the_number(
    owner: Any, make_item: Any, make_supplier: Any, monkeypatch: Any
) -> None:
    """T-PUR-01-14 — the ledger post failing leaves no movement, no changed last cost, no
    consumed number: the next successful record is still PB/26-27/0001."""
    from apps.purchases.services import record as record_module

    rice = make_item("Rice", "40.00")
    doc = draft(owner, party_id=str(make_supplier().id), lines=[line(rice, "4", "46")]).json()[
        "data"
    ]

    def boom(**_: Any) -> Any:
        raise RuntimeError("ledger down")

    monkeypatch.setattr(record_module, "post_bill_credit", boom)
    owner.raise_request_exception = False
    failed = record(owner, doc["id"], version=doc["version"])
    assert failed.status_code == 500
    assert not StockMovement.objects.filter(source_id=doc["id"]).exists()
    assert Item.objects.get(pk=rice.pk).purchase_price == Decimal("40.00")
    assert not DocumentSequence.objects.filter(kind="purchase_bill", next_number__gt=1).exists()

    monkeypatch.undo()
    ok = record(owner, doc["id"], version=doc["version"])
    assert ok.status_code == 200 and ok.json()["data"]["number"] == "PB/26-27/0001"


def test_record_refuses_an_archived_supplier_a_customer_and_an_expired_rate(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """EC-7 / §10 / EC-9 — an archived supplier is 409 `party_archived`; a customer-only party
    is 400 on `party_id`; GST12 on a bill dated after 21/09/2025 is 400 on the line's tax code."""
    rice = make_item("Rice", "46.00")
    archived = make_supplier(name="Gone Traders", status="archived")
    doc = draft(owner, party_id=str(archived.id), lines=[line(rice, "1")]).json()["data"]
    assert record(owner, doc["id"]).json()["error"]["code"] == "party_archived"

    customer = make_supplier(name="Only Customer", is_supplier=False, is_customer=True)
    doc = draft(owner, party_id=str(customer.id), lines=[line(rice, "1")]).json()["data"]
    refused = record(owner, doc["id"])
    assert refused.status_code == 400 and "party_id" in refused.json()["error"]["details"]

    supplier = make_supplier()
    doc = draft(
        owner,
        party_id=str(supplier.id),
        document_date="2026-09-18",
        lines=[line(rice, "1", tax_code="GST12")],
    ).json()
    assert [w["code"] for w in doc["meta"]["warnings"]] == ["tax_rate_inactive"]
    refused = record(owner, doc["data"]["id"])
    assert refused.status_code == 400
    assert "lines.0.tax_code" in refused.json()["error"]["details"]


def test_a_draft_is_saved_half_entered_and_deleted_only_while_a_draft(
    owner: Any, make_item: Any, make_supplier: Any
) -> None:
    """FR-8 / AC-7 — a draft with no supplier and no lines saves; it appears under Drafts;
    DELETE removes it; a stale version is 409 so two devices cannot overwrite each other."""
    created = draft(owner, notes="Delivery at 4")
    assert created.status_code == 201, created.json()
    doc = created.json()["data"]
    listed = owner.get(reverse(BILLS), {"tab": "draft"}).json()
    assert [row["id"] for row in listed["data"]] == [doc["id"]]
    stale = owner.patch(bill_url(doc["id"]), {"notes": "x", "version": 99}, format="json")
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "stale_version"
    assert owner.delete(bill_url(doc["id"])).status_code == 204
    assert not PurchaseDocument.objects.filter(pk=doc["id"]).exists()
