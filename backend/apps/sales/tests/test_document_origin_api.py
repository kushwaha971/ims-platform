"""A5 — the origin on the sales API: reads, filters, and the columns only the port writes.

`sales_document.(origin_module, origin_type, origin_id)` is a polymorphic pointer to the module
row that asked for the document (FRD 00 PLT-X05 §4). The invoice list and the invoice page show
it ("From Gym · Membership M-0042"); a module reads its own invoices back through
`?origin_type=…&origin_id=…`; and nothing but the port may set it (BR-4).
"""

from __future__ import annotations

import ast
import pathlib
import uuid
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.common.seams import documents as port
from apps.sales.tests.conftest import (
    INVOICES,
    PORT_ORIGIN,
    draft,
    invoice_url,
    issued_invoice,
    line,
    port_request,
)

pytestmark = pytest.mark.django_db


def _module_invoice(ctx: Any, party: Any, **extra: Any) -> dict:
    return port.issue_document(ctx=ctx, request=port_request(party, **extra))


def test_list_rows_and_the_detail_carry_the_origin(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any, make_item: Any
) -> None:
    """`origin: {module, type, id, label} | null` — the label is the module's own words, and a
    counter sale says `null` rather than an empty object a client would have to interpret."""
    party = make_party()
    origin_id = uuid.uuid4()
    fake_origin.names[str(origin_id)] = "Membership M-0042"
    issued = _module_invoice(port_ctx, party, origin_id=origin_id)
    counter = issued_invoice(owner, party, [line(make_item())])

    rows = {row["id"]: row for row in owner.get(reverse(INVOICES)).json()["data"]}
    expected = {
        "module": "gym",
        "type": PORT_ORIGIN,
        "id": str(origin_id),
        "label": "Membership M-0042",
    }
    assert rows[str(issued["document_id"])]["origin"] == expected
    assert rows[counter["id"]]["origin"] is None
    detail = owner.get(invoice_url(issued["document_id"])).json()["data"]
    assert detail["origin"] == expected
    assert owner.get(invoice_url(counter["id"])).json()["data"]["origin"] is None


def test_a_page_of_origins_is_labelled_in_one_call_per_type(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """The label function is asked once for the page, not once per row: a list of 25 module
    invoices is not 25 calls into the module."""
    party = make_party()
    for _ in range(3):
        _module_invoice(port_ctx, party)
    asked: list[set] = []
    real = fake_origin.labels

    def counting(*, tenant: Any, ids: Any) -> dict:
        asked.append(set(ids))
        return real(tenant=tenant, ids=ids)

    fake_origin.labels = counting  # type: ignore[method-assign]
    assert owner.get(reverse(INVOICES)).status_code == 200
    assert len(asked) == 1 and len(asked[0]) == 3


def test_an_unregistered_origin_reads_record_not_found(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """EC-4 — a module removed in code: the badge still says where the document came from and
    that the record is gone, instead of vanishing or erroring."""
    from apps.sales.models import SalesDocument

    issued = _module_invoice(port_ctx, make_party())
    SalesDocument.objects.filter(pk=issued["document_id"]).update(origin_type="gone_thing")
    detail = owner.get(invoice_url(issued["document_id"])).json()["data"]
    assert detail["origin"]["label"] == "Record not found"


def test_the_list_filters_by_origin(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any, make_item: Any
) -> None:
    """`?origin_module=gym` for the list chip; `?origin_type=&origin_id=` for a module reading
    back its own invoices through the public endpoint (FRD §7) rather than importing sales."""
    from apps.sales.models import SalesDocument

    party = make_party()
    wanted = _module_invoice(port_ctx, party)
    other = _module_invoice(port_ctx, party)
    counter = issued_invoice(owner, party, [line(make_item())])

    def ids(**params: Any) -> set[str]:
        return {row["id"] for row in owner.get(reverse(INVOICES), params).json()["data"]}

    assert ids(origin_module="gym") == {str(wanted["document_id"]), str(other["document_id"])}
    doc = SalesDocument.objects.get(pk=wanted["document_id"])
    assert ids(origin_type=PORT_ORIGIN, origin_id=str(doc.origin_id)) == {str(doc.id)}
    assert counter["id"] not in ids(origin_module="gym")


@pytest.mark.parametrize("key", ["origin_module", "origin_type", "origin_id"])
def test_the_sales_api_refuses_origin_keys(
    owner: Any, make_party: Any, make_item: Any, key: str
) -> None:
    """BR-4 — the origin is written once, by the port. A client that could send one could make
    a counter sale look like a membership fee, and a module's void listener would then run for
    a document it never issued."""
    body = {
        "party_id": str(make_party().id),
        "lines": [line(make_item())],
        key: str(uuid.uuid4()) if key == "origin_id" else "gym",
    }
    response = draft(owner, **body)
    assert response.status_code == 400
    assert key in response.json()["error"]["details"]


def test_the_origin_columns_are_all_or_nothing(shop: Any, make_party: Any) -> None:
    """`ck_sales_document_origin_complete` — a type without an id (or a module) is a pointer
    to nothing, and the listener lookup would run for it."""
    from apps.sales.models import SalesDocument

    document = SalesDocument.objects.create(
        tenant=shop,
        kind="invoice",
        status="draft",
        document_date="2026-10-01",
        place_of_supply_state="27",
        fy_label="2026-27",
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        SalesDocument.objects.filter(pk=document.pk).update(origin_type=PORT_ORIGIN)
    with pytest.raises(IntegrityError), transaction.atomic():
        SalesDocument.objects.filter(pk=document.pk).update(
            origin_type=PORT_ORIGIN, origin_id=uuid.uuid4()
        )
    SalesDocument.objects.filter(pk=document.pk).update(
        origin_type=PORT_ORIGIN, origin_id=uuid.uuid4(), origin_module="gym"
    )


def test_every_caller_of_refresh_invoice_amounts_hands_on_its_ctx() -> None:
    """R1 — `on_settlement_changed` needs the caller's `ctx`, so every call site passes one.
    A caller added later without it would raise at run time for a module document only, which
    no counter-sale test would ever reach; this reads the source instead."""
    apps_root = pathlib.Path(__file__).resolve().parents[2]
    offenders = []
    for path in apps_root.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if name == "refresh_invoice_amounts" and "ctx" not in {k.arg for k in node.keywords}:
                offenders.append(f"{path.relative_to(apps_root)}:{node.lineno}")
    assert offenders == []
