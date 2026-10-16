"""SH-011 for purchases: a lost first-save response recovers ONE draft (ADR-063).

The purchase editor autosaves, saves on a supplier pick and saves before Record.
Before this suite a POST carried no identity, so a retry after a lost response,
or two of those saves overlapping, created a second draft bill or order with the
same supplier and lines — one more row in Drafts for the clerk to notice, and a
bill that could be recorded twice from paper the shop received once.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from typing import Any

import pytest
from django.db import close_old_connections
from django.urls import reverse

from apps.common.context import Ctx
from apps.purchases.constants import DocumentKind
from apps.purchases.models import PurchaseDocument
from apps.purchases.services import drafts

from .conftest import line, record

ROUTES = ["purchase-bill", "purchase-order"]


@pytest.mark.parametrize("route", ROUTES)
def test_retry_recovers_without_overwriting_or_resurrecting(
    owner: Any, make_supplier: Any, route: str
) -> None:
    """A retry is a LOOKUP: it never applies the retried body, and a deleted draft
    stays deleted (tombstone) instead of being silently re-created."""
    supplier = make_supplier()
    url = reverse(f"v1:{route}-list")
    body = {
        "client_draft_key": "lost-response-1",
        "party_id": str(supplier.id),
        "notes": "first",
        "document_date": "2026-10-16",
    }
    first = owner.post(url, body, format="json")
    assert first.status_code == 201, first.json()
    assert first.json()["meta"]["draft_recovered"] is False
    doc_id = first.json()["data"]["id"]

    retry = owner.post(url, {**body, "notes": "different local text"}, format="json")
    assert retry.status_code == 200, retry.json()
    assert retry.json()["data"]["id"] == doc_id
    assert retry.json()["data"]["notes"] == "first"
    assert retry.json()["meta"]["draft_recovered"] is True
    assert PurchaseDocument.objects.filter(tenant=supplier.tenant).count() == 1

    detail = reverse(f"v1:{route}-detail", args=[doc_id])
    patch = owner.patch(detail, {"version": 1, "notes": "newer server text"}, format="json")
    assert patch.status_code == 200, patch.json()
    again = owner.post(url, body, format="json")
    assert again.json()["data"]["notes"] == "newer server text"
    assert again.json()["data"]["version"] == 2

    assert owner.delete(detail).status_code == 204
    discarded = owner.post(url, body, format="json")
    assert discarded.status_code == 404, discarded.json()
    assert not PurchaseDocument.objects.filter(pk=doc_id).exists()


def test_creation_keys_are_user_tenant_and_kind_scoped(
    shop: Any, other_tenant: Any, api_as: Any
) -> None:
    """The same key from another user, another business or the other kind is a
    different draft — recovery must never hand one clerk another clerk's bill."""
    first, membership = api_as(shop)
    second, _ = api_as(shop)
    other, _ = api_as(other_tenant, user=membership.user)
    body = {"client_draft_key": "same-key", "document_date": "2026-10-16"}
    ids = set()
    for client, route in [
        (first, ROUTES[0]),
        (second, ROUTES[0]),
        (other, ROUTES[0]),
        (first, ROUTES[1]),
    ]:
        response = client.post(reverse(f"v1:{route}-list"), body, format="json")
        assert response.status_code == 201, response.json()
        ids.add(response.json()["data"]["id"])
    assert len(ids) == 4


@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
def test_concurrent_first_saves_share_one_document(shop: Any, user: Any) -> None:
    """Autosave and the supplier-pick save racing on two connections: the unique
    claim makes the second wait and then read the first's draft."""
    barrier = Barrier(2)

    def create() -> Any:
        close_old_connections()
        try:
            barrier.wait(timeout=5)
            return drafts.create_draft(
                ctx=Ctx(tenant=shop, actor=user),
                payload={"client_draft_key": "concurrent-key", "notes": "race"},
            )["document"].id
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(lambda _: create(), range(2)))
    assert ids[0] == ids[1]
    assert PurchaseDocument.objects.filter(tenant=shop).count() == 1


def test_a_recovered_recorded_bill_is_returned_as_recorded(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    """Record succeeded but the editor never saw the first create's reply: the
    retry returns the bill as it now is (recorded), never a draft to record again."""
    supplier = make_supplier()
    rice = make_item()
    url = reverse("v1:purchase-bill-list")
    body = {
        "client_draft_key": "recorded-key",
        "party_id": str(supplier.id),
        "supplier_invoice_number": "AT/900",
        "document_date": "2026-10-16",
        "lines": [line(rice, "2", "46.00")],
    }
    created = owner.post(url, body, format="json")
    assert created.status_code == 201, created.json()
    doc = created.json()["data"]
    recorded = record(owner, doc["id"], version=doc["version"])
    assert recorded.status_code == 200, recorded.json()

    retry = owner.post(url, body, format="json")
    assert retry.status_code == 200, retry.json()
    assert retry.json()["data"]["id"] == doc["id"]
    assert retry.json()["data"]["status"] == recorded.json()["data"]["status"]
    assert retry.json()["data"]["number"] == recorded.json()["data"]["number"]
    assert PurchaseDocument.objects.filter(kind=DocumentKind.PURCHASE_BILL).count() == 1


def test_failed_create_does_not_burn_recovery_key(owner: Any) -> None:
    """A refused first save rolls its claim back, so the corrected retry creates."""
    url = reverse("v1:purchase-bill-list")
    body = {"client_draft_key": "correctable-key", "document_date": "2026-10-16"}
    invalid = owner.post(url, {**body, "party_id": "00000000-0000-0000-0000-000000000000"})
    assert invalid.status_code in (400, 404), invalid.json()
    valid = owner.post(url, body, format="json")
    assert valid.status_code == 201, valid.json()
    assert owner.post(url, body, format="json").json()["data"]["id"] == valid.json()["data"]["id"]


def test_create_and_record_ignores_the_draft_key(
    owner: Any, make_supplier: Any, make_item: Any
) -> None:
    """`?record=true` is deduplicated by its Idempotency-Key (BR-13); a draft key on
    it must neither claim nor recover, or a later draft save would be handed a
    recorded bill it never created."""
    supplier = make_supplier()
    rice = make_item()
    body = {
        "client_draft_key": "direct-record",
        "party_id": str(supplier.id),
        "supplier_invoice_number": "AT/901",
        "document_date": "2026-10-16",
        "lines": [line(rice, "1", "46.00")],
    }
    response = owner.post(
        reverse("v1:purchase-bill-list") + "?record=true",
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY="direct-record-1",
    )
    assert response.status_code == 201, response.json()
    draft = owner.post(
        reverse("v1:purchase-bill-list"),
        {"client_draft_key": "direct-record", "document_date": "2026-10-16"},
        format="json",
    )
    assert draft.status_code == 201, draft.json()
    assert draft.json()["data"]["id"] != response.json()["data"]["id"]
