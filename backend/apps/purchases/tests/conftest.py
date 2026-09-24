"""Purchases fixtures: a GST-registered Maharashtra shop, suppliers, items, request helpers.

Its own copy rather than an import of the sales fixtures: the two suites
should be able to change independently, and the §17.7.0 worked example needs
items with a known unit (NOS for rice, KGS for sugar) and no opening stock.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx

TENANT_GSTIN = "27AAPFU0939F1ZV"
SUPPLIER_GSTIN = "27AAACR5055K1Z5"
BILLS = "v1:purchase-bill-list"


def bill_url(document_id: Any, suffix: str = "") -> str:
    base = reverse("v1:purchase-bill-detail", args=[document_id])
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
    tenant.gstin = TENANT_GSTIN
    tenant.state_code = "27"
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
    """`make_item(name, cost, tax_code, unit_code="NOS", stock=None, **extra)`."""
    from apps.inventory.models import Unit
    from apps.inventory.services.items import create_item

    def _make(
        name: str = "Rice",
        cost: str = "46.00",
        tax_code: str = "GST5",
        unit_code: str = "NOS",
        stock: str | None = None,
        stock_cost: str | None = None,
        **extra: Any,
    ) -> Any:
        unit = Unit.objects.get(tenant__isnull=True, code=unit_code)
        payload: dict[str, Any] = {
            "name": name,
            "unit_id": str(unit.id),
            "selling_price": "99.00",
            "purchase_price": cost,
            "tax_code": tax_code,
            "hsn_sac": "1006",
            **extra,
        }
        if stock is not None:
            payload["opening_stock"] = {"qty": stock, "unit_cost": stock_cost or cost}
        return create_item(ctx=Ctx.system(shop), payload=payload)["item"]

    return _make


@pytest.fixture
def make_supplier(shop: Any) -> Any:
    from tests.factories.parties import PartyFactory

    def _make(**fields: Any) -> Any:
        fields.setdefault("name", "Agro Traders")
        fields.setdefault("state_code", "27")
        fields.setdefault("is_supplier", True)
        fields.setdefault("is_customer", False)
        return PartyFactory(tenant=shop, **fields)

    return _make


def line(item: Any, qty: str, cost: str | None = None, **extra: Any) -> dict:
    body: dict[str, Any] = {"item_id": str(item.id), "qty": qty, **extra}
    if cost is not None:
        body["unit_cost"] = cost
    return body


def draft(client: Any, **body: Any) -> Any:
    return client.post(reverse(BILLS), body, format="json")


def record(client: Any, document_id: Any, key: str | None = None, **body: Any) -> Any:
    return client.post(
        bill_url(document_id, "record"),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


def void(client: Any, document_id: Any, reason: str = "Entered twice") -> Any:
    return client.post(bill_url(document_id, "void"), {"reason": reason}, format="json")


def recorded_bill(client: Any, **body: Any) -> dict:
    """Draft then record; returns the recorded document (asserts both succeeded)."""
    created = draft(client, **body)
    assert created.status_code == 201, created.json()
    doc = created.json()["data"]
    response = record(client, doc["id"], version=doc["version"])
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def money(value: Any) -> Decimal:
    return Decimal(str(value))
