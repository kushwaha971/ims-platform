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


# ── A5 ── the document port's fake origin (PLT-X05, T-PLT-X05-1…10) ──────────

PORT_ORIGIN = "test_membership"


class FakeOrigin:
    """An origin listener that records every call, and can block, ask or raise on demand.

    `in_atomic` is recorded with each call because BR-5 is that the listener runs INSIDE the
    sales transaction: a listener told after commit could not roll the void back.
    """

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.block: str | None = None
        self.confirm: str | None = None
        self.raise_on_void = False
        self.names: dict[str, str] = {}

    def _in_atomic(self) -> bool:
        from django.db import connection

        return connection.in_atomic_block

    def on_void(self, *, ctx: Any, origin_id: Any, document: dict, reason: str) -> None:
        self.calls.append(("void", str(origin_id), dict(document), reason, self._in_atomic()))
        if self.raise_on_void:
            raise RuntimeError("the module refuses to let go")

    def on_settlement_changed(self, *, ctx: Any, origin_id: Any, document: dict) -> None:
        self.calls.append(("settlement", str(origin_id), dict(document), self._in_atomic()))

    def check_void(self, *, tenant: Any, origin_id: Any) -> dict:
        return {"block": self.block, "confirm": self.confirm}

    def labels(self, *, tenant: Any, ids: Any) -> dict:
        return {i: self.names.get(str(i)) for i in ids}

    def of(self, kind: str) -> list[tuple]:
        return [call for call in self.calls if call[0] == kind]


@pytest.fixture
def fake_origin(db: Any) -> Any:
    """A registered `test_membership` origin of module `gym`, removed again afterwards."""
    from apps.common.seams import documents

    documents._reset_for_tests()
    listener = FakeOrigin()
    documents.register_origin(PORT_ORIGIN, module="gym", listener=listener)
    yield listener
    documents._reset_for_tests()


@pytest.fixture
def port_ctx(shop: Any, api_as: Any) -> Any:
    """A Ctx for the shop's owner — the actor a vertical endpoint would hand the port."""
    _client, member = api_as(shop)
    return Ctx(tenant=shop, actor=member.user, actor_type="user")


def membership_line(**extra: Any) -> dict:
    """The gym worked example's line: ₹2,500.00 exclusive at 18% (GST18)."""
    return {
        "description": "Quarterly membership, 1 Oct – 31 Dec 2026",
        "hsn_sac": "999723",
        "qty": Decimal("1"),
        "unit_price": Decimal("2500.00"),
        "tax_inclusive": False,
        "tax_code": "GST18",
        **extra,
    }


def port_request(party: Any, **extra: Any) -> dict:
    from apps.common.dates import tenant_today

    return {
        "origin_type": PORT_ORIGIN,
        "origin_id": extra.pop("origin_id", None) or uuid.uuid4(),
        "party_id": party.id,
        "document_date": tenant_today(party.tenant),
        "lines": [membership_line()],
        "credit_check": "skip",
        **extra,
    }
