"""SAL-01 — estimates: validity, the status walk, conversion, expiry, and no side effects."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.inventory.models import Item, StockMovement
from apps.ledger.models import LedgerEntry
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import ESTIMATES, INVOICES, estimate_url, invoice_url, issue, line

pytestmark = pytest.mark.django_db


def new_estimate(client: Any, **body: Any) -> Any:
    return client.post(reverse(ESTIMATES), body, format="json")


def sent_estimate(client: Any, party: Any, item: Any, qty: str = "2") -> dict:
    created = new_estimate(client, party_id=str(party.id), lines=[line(item, qty)])
    assert created.status_code == 201, created.json()
    response = client.post(
        estimate_url(created.json()["data"]["id"], "mark-sent"), {}, format="json"
    )
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def test_valid_until_defaults_to_fifteen_days_after_the_date(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-1 / FR-4 — an estimate saved without a validity is valid for 15 days."""
    response = new_estimate(
        owner,
        party_id=str(make_party().id),
        document_date="2026-09-10",
        lines=[line(make_item())],
    )
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["kind"] == "estimate" and data["status"] == "draft"
    assert data["valid_until"] == "2026-09-25"


def test_valid_until_before_the_date_is_refused(owner: Any, make_item: Any) -> None:
    """§10 — "Valid-until must be on or after the document date"."""
    response = new_estimate(
        owner,
        walk_in_name="Walk-in",
        document_date="2026-09-10",
        valid_until="2026-09-01",
        lines=[line(make_item())],
    )
    assert response.status_code == 400
    assert "valid_until" in response.json()["error"]["details"]


def test_regular_tenant_estimate_carries_estimated_gst(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """AC-1 — a regular tenant's estimate shows the tax the invoice will charge."""
    data = new_estimate(
        owner, party_id=str(make_party().id), lines=[line(make_item(), "2")]
    ).json()["data"]
    assert data["taxable_total"] == "900.00"
    assert data["cgst_total"] == "22.50" and data["sgst_total"] == "22.50"
    assert data["grand_total"] == "945.00"


def test_composition_tenant_estimate_has_no_tax(
    owner: Any, shop: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-2 / BR-3 — composition (and unregistered) estimates price without tax rows."""
    item = make_item()
    shop.gst_type = "composition"
    shop.save(update_fields=["gst_type"])
    data = new_estimate(owner, party_id=str(make_party().id), lines=[line(item, "2")]).json()[
        "data"
    ]
    assert data["cgst_total"] == data["sgst_total"] == data["igst_total"] == "0.00"
    assert data["grand_total"] == "900.00"


def test_number_is_taken_at_mark_sent_not_at_draft(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-3 / FR-2 — a draft has no number; `mark-sent` takes EST/26-27/0001."""
    created = new_estimate(owner, party_id=str(make_party().id), lines=[line(make_item())]).json()[
        "data"
    ]
    assert created["number"] is None
    sent = owner.post(estimate_url(created["id"], "mark-sent"), {}, format="json").json()["data"]
    assert sent["status"] == "sent"
    assert sent["number"] == "EST/26-27/0001"
    again = owner.post(estimate_url(created["id"], "mark-sent"), {}, format="json")
    assert again.status_code == 409 and again.json()["error"]["code"] == "document_not_draft"


def test_accept_then_convert_makes_a_draft_invoice_and_a_second_convert_is_409(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-4 / AC-3 / BR-6 — convert: a DRAFT invoice with the estimate's lines and
    `converted_from`; the estimate becomes `converted`; converting again is 409."""
    estimate = sent_estimate(owner, make_party(), make_item(), "3")
    accepted = owner.post(estimate_url(estimate["id"], "mark-accepted"), {}, format="json")
    assert accepted.json()["data"]["status"] == "accepted"

    response = owner.post(estimate_url(estimate["id"], "convert"), {}, format="json")
    assert response.status_code == 201, response.json()
    invoice = response.json()["data"]
    assert invoice["kind"] == "invoice" and invoice["status"] == "draft"
    assert invoice["lines"][0]["qty"] == "3.000"
    assert invoice["lines"][0]["unit_price"] == "450.0000"
    assert invoice["links"]["converted_from"]["id"] == estimate["id"]

    after = owner.get(estimate_url(estimate["id"])).json()["data"]
    assert after["status"] == "converted"
    assert after["links"]["converted_to"]["id"] == invoice["id"]

    second = owner.post(estimate_url(estimate["id"], "convert"), {}, format="json")
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "document_not_draft"


def test_convert_refreshes_the_tax_code_and_warns(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-5 / FR-7 — an item whose tax code changed since the quote comes back
    with today's code and a `tax_code_changed` warning; the price is not touched."""
    item = make_item()
    estimate = sent_estimate(owner, make_party(), item)
    Item.objects.filter(pk=item.pk).update(tax_code="GST18")

    response = owner.post(estimate_url(estimate["id"], "convert"), {}, format="json")
    assert response.status_code == 201, response.json()
    codes = [w["code"] for w in response.json()["meta"]["warnings"]]
    assert "tax_code_changed" in codes
    invoice_line = response.json()["data"]["lines"][0]
    assert invoice_line["tax_code"] == "GST18" and invoice_line["unit_price"] == "450.0000"


def test_no_stock_or_ledger_row_is_ever_written_by_an_estimate(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-6 / FR-8 / BR-1 — create, send, accept, reject a second: nothing moves."""
    party, item = make_party(), make_item()
    movements = StockMovement.objects.count()
    first = sent_estimate(owner, party, item)
    owner.post(estimate_url(first["id"], "mark-accepted"), {}, format="json")
    second = sent_estimate(owner, party, item)
    rejected = owner.post(
        estimate_url(second["id"], "mark-rejected"), {"note": "Too costly"}, format="json"
    )
    assert rejected.json()["data"]["status"] == "rejected"
    assert StockMovement.objects.count() == movements
    assert not LedgerEntry.objects.filter(party=party).exists()
    party.refresh_from_db()
    assert party.balance == 0


def test_invoice_routes_never_see_an_estimate(owner: Any, make_item: Any, make_party: Any) -> None:
    """AC-5 / BR-1 — the invoice list excludes estimates and `/invoices/<estimate>` is 404,
    so no invoice figure (list totals, issue, share) can include or touch one."""
    estimate = sent_estimate(owner, make_party(), make_item())
    listing = owner.get(reverse(INVOICES), {"tab": "all"}).json()
    assert all(row["id"] != estimate["id"] for row in listing["data"])
    assert owner.get(invoice_url(estimate["id"])).status_code == 404
    assert issue(owner, estimate["id"]).status_code == 404


def test_estimates_list_tabs_and_totals(owner: Any, make_item: Any, make_party: Any) -> None:
    """FR-10 — status tabs with counts; totals over the tab."""
    party, item = make_party(), make_item()
    sent_estimate(owner, party, item)
    new_estimate(owner, party_id=str(party.id), lines=[line(item)])
    body = owner.get(reverse(ESTIMATES)).json()
    assert body["meta"]["tabs"]["sent"] == 1 and body["meta"]["tabs"]["draft"] == 1
    assert body["meta"]["totals"]["count"] == 2
    sent_only = owner.get(reverse(ESTIMATES), {"tab": "sent"}).json()
    assert [row["status"] for row in sent_only["data"]] == ["sent"]


def test_expire_estimates_moves_only_passed_validity_and_is_idempotent(
    owner: Any, shop: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-7 / AC-4 — `valid_until` before the tenant's today → expired; a second run
    moves nothing; an estimate valid today stays sent."""
    from apps.sales.services.expiry import expire_estimates

    today = tenant_today(shop)
    party, item = make_party(), make_item()
    old = new_estimate(
        owner,
        party_id=str(party.id),
        document_date=(today - dt.timedelta(days=20)).isoformat(),
        valid_until=(today - dt.timedelta(days=1)).isoformat(),
        lines=[line(item)],
    ).json()["data"]
    sent = owner.post(estimate_url(old["id"], "mark-sent"), {}, format="json").json()
    assert [w["code"] for w in sent["meta"]["warnings"]] == ["validity_passed"]
    fresh = new_estimate(
        owner, party_id=str(party.id), valid_until=today.isoformat(), lines=[line(item)]
    ).json()["data"]
    owner.post(estimate_url(fresh["id"], "mark-sent"), {}, format="json")

    assert expire_estimates(tenant=shop) == {"moved": 1}
    assert expire_estimates(tenant=shop) == {"moved": 0}
    assert SalesDocument.objects.get(pk=old["id"]).status == "expired"
    assert SalesDocument.objects.get(pk=fresh["id"]).status == "sent"

    # BR-5 — an expired estimate may still be converted.
    converted = owner.post(estimate_url(old["id"], "convert"), {}, format="json")
    assert converted.status_code == 201
    assert converted.json()["data"]["document_date"] == today.isoformat()


def test_a_voided_conversion_frees_the_estimate_to_convert_again(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """SAL-05 EC-9 — BR-6 is relaxed when the invoice the estimate became is void."""
    estimate = sent_estimate(owner, make_party(), make_item())
    invoice = owner.post(estimate_url(estimate["id"], "convert"), {}, format="json").json()["data"]
    issued = issue(owner, invoice["id"], version=invoice["version"]).json()["data"]
    voided = owner.post(invoice_url(issued["id"], "void"), {"reason": "Wrong rate"}, format="json")
    assert voided.status_code == 200, voided.json()
    again = owner.post(estimate_url(estimate["id"], "convert"), {}, format="json")
    assert again.status_code == 201, again.json()
    assert again.json()["data"]["id"] != invoice["id"]


def test_permissions_accountant_reads_staff_converts(
    shop: Any, api_as: Any, owner: Any, make_item: Any, make_party: Any
) -> None:
    """T-SAL01-9 — accountant 403 on create; staff creates, sends and converts."""
    accountant, _ = api_as(shop, role="accountant")
    staff, _ = api_as(shop, role="staff")
    assert accountant.get(reverse(ESTIMATES)).status_code == 200
    assert new_estimate(accountant, walk_in_name="X", lines=[]).status_code == 403
    estimate = sent_estimate(staff, make_party(), make_item())
    assert staff.post(estimate_url(estimate["id"], "convert"), {}, format="json").status_code == 201


def test_only_a_draft_estimate_is_deleted(owner: Any, make_item: Any, make_party: Any) -> None:
    """FR-12 — DELETE a draft → 204; a sent estimate → 409."""
    party, item = make_party(), make_item()
    draft_row = new_estimate(owner, party_id=str(party.id), lines=[line(item)]).json()["data"]
    assert owner.delete(estimate_url(draft_row["id"])).status_code == 204
    sent = sent_estimate(owner, party, item)
    assert owner.delete(estimate_url(sent["id"])).status_code == 409
