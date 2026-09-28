"""Sales fixtures: a GST-registered Maharashtra shop, items with stock, parties, request helpers."""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx

VALID_GSTIN = "27AAPFU0939F1ZV"
INVOICES = "v1:sales-invoice-list"


def invoice_url(document_id: Any, suffix: str = "") -> str:
    base = reverse("v1:sales-invoice-detail", args=[document_id])
    return f"{base}/{suffix}" if suffix else base


@pytest.fixture
def reference(db: Any) -> None:
    from apps.common.management.commands.seed_reference_data import (
        seed_hsn,
        seed_tax_rates,
        seed_units,
    )

    seed_tax_rates()
    seed_units()
    seed_hsn()


@pytest.fixture
def shop(tenant: Any, reference: Any) -> Any:
    """A regular GST tenant in Maharashtra (27) with a MAIN location."""
    from apps.inventory.models import Location

    tenant.gst_type = "regular"
    tenant.gstin = VALID_GSTIN
    tenant.state_code = "27"
    tenant.address = {"line1": "12 Market Road", "city": "Pune"}
    tenant.upi_vpa = "sharma@okhdfc"
    tenant.save()
    Location.objects.get_or_create(
        tenant=tenant, code="MAIN", defaults={"name": "Main", "is_default": True}
    )
    return tenant


@pytest.fixture
def owner(shop: Any, api_as: Any) -> Any:
    client, _ = api_as(shop)
    return client


@pytest.fixture
def make_item(shop: Any) -> Any:
    """`make_item(name, price, tax_code, stock=None, unit="NOS", inclusive=False, **extra)`."""
    from apps.inventory.models import Unit
    from apps.inventory.services.items import create_item

    def _make(
        name: str = "Basmati Rice 5kg",
        price: str = "450.00",
        tax_code: str = "GST5",
        stock: str | None = "40",
        unit_code: str = "NOS",
        inclusive: bool = False,
        **extra: Any,
    ) -> Any:
        unit = Unit.objects.get(tenant__isnull=True, code=unit_code)
        payload: dict[str, Any] = {
            "name": name,
            "unit_id": str(unit.id),
            "selling_price": price,
            "tax_code": tax_code,
            "hsn_sac": "1006",
            "tax_inclusive_selling": inclusive,
            **extra,
        }
        if stock is not None:
            payload["opening_stock"] = {"qty": stock, "unit_cost": "380.00"}
        return create_item(ctx=Ctx.system(shop), payload=payload)["item"]

    return _make


@pytest.fixture
def make_party(shop: Any) -> Any:
    from tests.factories.parties import PartyFactory

    def _make(**fields: Any) -> Any:
        fields.setdefault("name", "Ramesh Traders")
        fields.setdefault("state_code", "27")
        return PartyFactory(tenant=shop, **fields)

    return _make


def line(item: Any, qty: str = "1", **extra: Any) -> dict:
    return {"item_id": str(item.id), "qty": qty, **extra}


def draft(client: Any, **body: Any) -> Any:
    return client.post(reverse(INVOICES), body, format="json")


def issue(client: Any, document_id: Any, key: str | None = None, **body: Any) -> Any:
    return client.post(
        invoice_url(document_id, "issue"),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


def cash(amount: str) -> dict:
    return {"mode_breakup": [{"mode": "cash", "amount": amount}]}


def money(value: Any) -> Decimal:
    return Decimal(str(value))


ESTIMATES = "v1:sales-estimate-list"
CREDIT_NOTES = "v1:sales-credit-note-list"


def estimate_url(document_id: Any, suffix: str = "") -> str:
    base = reverse("v1:sales-estimate-detail", args=[document_id])
    return f"{base}/{suffix}" if suffix else base


def credit_note_url(document_id: Any, suffix: str = "") -> str:
    base = reverse("v1:sales-credit-note-detail", args=[document_id])
    return f"{base}/{suffix}" if suffix else base


def issued_invoice(client: Any, party: Any, lines: list[dict], **body: Any) -> dict:
    """Draft and issue an invoice for `party`; returns the issued document."""
    created = draft(client, party_id=str(party.id), lines=lines, **body).json()["data"]
    response = issue(client, created["id"], version=created["version"])
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def issue_note(client: Any, document_id: Any, **body: Any) -> Any:
    return client.post(
        credit_note_url(document_id, "issue"),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )


def recalc_clean() -> None:
    """`recalc_balances` and `recalc_stock` both find the caches equal to a full replay."""
    from io import StringIO

    from django.core.management import call_command

    balances, stock = StringIO(), StringIO()
    call_command("recalc_balances", stdout=balances)
    call_command("recalc_stock", stdout=stock)
    assert "0 found" in balances.getvalue(), balances.getvalue()
    assert "0 drifted" in stock.getvalue(), stock.getvalue()
