"""Lost first-create responses recover one logical draft, never replay stale edits."""

from __future__ import annotations

import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from typing import Any

import pytest
from django.db import close_old_connections
from django.urls import reverse

from apps.common.context import Ctx
from apps.sales.models import SalesDocument
from apps.sales.services import documents

ROUTES = ["sales-invoice", "sales-estimate", "sales-order", "sales-challan"]


@pytest.mark.parametrize("route", ROUTES)
def test_retry_recovers_without_overwriting_or_resurrecting(owner: Any, route: str) -> None:
    url = reverse(f"v1:{route}-list")
    body = {
        "client_draft_key": "lost-response-1",
        "notes": "first",
        "document_date": "2026-10-16",
        "valid_until": "2026-11-01",
        "vehicle_number": "MH12AB1234",
    }
    first = owner.post(url, body, format="json")
    assert first.status_code == 201, first.data
    doc_id = first.data["data"]["id"]
    retry = owner.post(
        url,
        {
            **body,
            "notes": "different local text",
            "valid_until": "2026-12-01",
            "vehicle_number": "DIFFERENT",
        },
        format="json",
    )
    assert retry.status_code == 200, retry.data
    assert retry.data["data"]["id"] == doc_id
    assert retry.data["data"]["notes"] == "first"
    assert retry.data["meta"]["draft_recovered"] is True
    if route == "sales-estimate":
        assert retry.data["data"]["valid_until"] == "2026-11-01"
    if route == "sales-challan":
        assert (
            SalesDocument.objects.get(pk=doc_id).meta["challan"]["vehicle_number"] == "MH12AB1234"
        )
    detail = reverse(f"v1:{route}-detail", args=[doc_id])
    patch = owner.patch(detail, {"version": 1, "notes": "newer server text"}, format="json")
    assert patch.status_code == 200, patch.data
    again = owner.post(url, body, format="json")
    assert again.data["data"]["notes"] == "newer server text"
    assert again.data["data"]["version"] == 2
    assert owner.delete(detail).status_code == 204
    discarded = owner.post(url, body, format="json")
    assert discarded.status_code == 404, discarded.data
    assert not SalesDocument.objects.filter(pk=doc_id).exists()


def test_creation_keys_are_user_tenant_and_family_scoped(
    shop: Any, other_tenant: Any, api_as: Any
) -> None:
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
        assert response.status_code == 201, response.data
        ids.add(response.data["data"]["id"])
    assert len(ids) == 4


@pytest.mark.django_db(transaction=True)
@pytest.mark.concurrency
def test_concurrent_first_saves_share_one_document(shop: Any, user: Any) -> None:
    barrier = Barrier(2)

    def create() -> Any:
        close_old_connections()
        try:
            barrier.wait(timeout=5)
            return documents.create_draft(
                ctx=Ctx(tenant=shop, actor=user),
                payload={
                    "client_draft_key": "concurrent-key",
                    "document_date": dt.date(2026, 10, 16),
                },
            )["document"].id
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(lambda _: create(), range(2)))
    assert ids[0] == ids[1]
    assert SalesDocument.objects.filter(tenant=shop).count() == 1


def test_key_survives_cache_expiry_and_recovers_posted_document(owner: Any, make_item: Any) -> None:
    from django.utils import timezone

    from apps.sales.models import DraftCreation

    url = reverse("v1:sales-estimate-list")
    item = make_item()
    body = {
        "client_draft_key": "durable-key",
        "walk_in_name": "Recovery test",
        "document_date": "2026-10-16",
        "lines": [
            {
                "item_id": str(item.id),
                "qty": "1",
                "unit_price": "100",
                "unit_code": "NOS",
                "tax_code": "GST0",
            }
        ],
    }
    response = owner.post(url, body, format="json")
    assert response.status_code == 201, response.data
    doc_id = response.data["data"]["id"]
    # Recovery is independent of the short-lived posting idempotency cache.
    DraftCreation.objects.filter(key="durable-key").update(
        created_at=timezone.now() - dt.timedelta(days=8)
    )
    sent = owner.post(
        reverse("v1:sales-estimate-detail", args=[doc_id]) + "/mark-sent",
        {"version": 1},
        format="json",
    )
    assert sent.status_code == 200, sent.data
    retry = owner.post(url, body, format="json")
    assert retry.status_code == 200
    assert retry.data["data"]["id"] == doc_id
    assert retry.data["data"]["status"] == sent.data["data"]["status"]
    assert retry.data["data"]["number"] == sent.data["data"]["number"]


def test_failed_create_does_not_burn_recovery_key(owner: Any) -> None:
    url = reverse("v1:sales-invoice-list")
    body = {"client_draft_key": "correctable-key", "document_date": "2026-10-16"}
    invalid = owner.post(url, {**body, "walk_in_mobile": "invalid"}, format="json")
    assert invalid.status_code == 400
    valid = owner.post(url, body, format="json")
    assert valid.status_code == 201, valid.data
    assert owner.post(url, body, format="json").data["data"]["id"] == valid.data["data"]["id"]
