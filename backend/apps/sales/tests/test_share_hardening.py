"""Public share links, hardened (Part 27 §27.12, Part 12 §12.8, Sprint 12).

Each test names the property of §27.12 it holds: the headers on every response
(including the failures), an allow-listed payload with no internal ids and
nothing of the tenant beyond the document, expiry, revocation, and durable
per-IP and per-token budgets.
"""

from __future__ import annotations

import datetime as dt
import json
import re
from typing import Any

import pytest
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone

from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import draft, invoice_url, issue, line

pytestmark = pytest.mark.django_db

UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def _shared(owner: Any, make_item: Any, make_party: Any, **party: Any) -> tuple[dict, str]:
    party.setdefault("mobile", "+919876543210")
    doc = draft(owner, party_id=str(make_party(**party).id), lines=[line(make_item())]).json()
    issued = issue(owner, doc["data"]["id"]).json()["data"]
    link = owner.post(invoice_url(issued["id"], "share-links"), {}, format="json")
    assert link.status_code == 201, link.json()
    return issued, link.json()["data"]["url"].rsplit("/d/", 1)[1]


def _public(client: Any, token: str, **extra: Any) -> Any:
    return client.get(reverse("v1:public-document", args=[token]), **extra)


def _assert_public_headers(response: Any) -> None:
    assert response["X-Robots-Tag"] == "noindex, nofollow"
    assert response["Referrer-Policy"] == "no-referrer"
    assert response["Cache-Control"] == "private, no-store"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert "frame-ancestors 'none'" in response["Content-Security-Policy"]


def test_every_public_response_carries_noindex_and_no_referrer(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """§27.12 "Headers" — on the 404 as well as the 200: a crawler that found a
    dead link must still not index it, and the token must never ride a Referer."""
    _doc, token = _shared(owner, make_item, make_party)
    ok = _public(anonymous_client, token)
    assert ok.status_code == 200
    _assert_public_headers(ok)
    missing = _public(anonymous_client, "x" * 43)
    assert missing.status_code == 404
    _assert_public_headers(missing)


def test_the_customer_copy_carries_no_internal_id_and_nothing_else_of_the_tenant(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """§27.12 "Content" — the payload used to be the merchant's serializer minus two
    keys, so the document id, every line's item id and every receipt's payment id
    reached the customer. Now: no UUID anywhere, and no other party of the shop."""
    doc, token = _shared(owner, make_item, make_party, name="Ramesh Traders")
    # Another customer of the same shop, with a bill of their own.
    other = draft(owner, party_id=str(make_party(name="Suresh Stores").id),
                  lines=[line(make_item("Sugar", "40.00"))]).json()["data"]  # fmt: skip
    other = issue(owner, other["id"]).json()["data"]

    body = _public(anonymous_client, token).json()["data"]
    text = json.dumps(body)
    assert not UUID.search(text), UUID.search(text)
    for private in ("id", "version", "created_at", "updated_at", "created_by", "party", "links",
                    "doc_discount_allocation", "payment", "void_reason"):  # fmt: skip
        assert private not in body, private
    for row in body["lines"]:
        assert not {"id", "item_id", "against_line_id", "unit_cost_snapshot"} & set(row)
    assert body["number"] == doc["number"]
    assert body["party_snapshot"]["name"] == "Ramesh Traders"
    assert "76543" not in body["party_snapshot"]["mobile"]
    assert "Suresh" not in text and other["number"] not in text


def test_an_expired_link_is_the_same_404_as_an_unknown_one(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """§27.12 "Expiry" — enforced on every fetch, and indistinguishable from a miss."""
    doc, token = _shared(owner, make_item, make_party)
    stored = SalesDocument.objects.get(pk=doc["id"])
    stored.meta = {
        **stored.meta,
        "share_link": {
            **stored.meta["share_link"],
            "expires_at": (timezone.now() - dt.timedelta(seconds=1)).isoformat(),
        },
    }
    stored.save(update_fields=["meta"])
    expired = _public(anonymous_client, token)
    unknown = _public(anonymous_client, "y" * 43)
    assert expired.status_code == unknown.status_code == 404
    assert expired.json()["error"]["code"] == unknown.json()["error"]["code"]
    assert expired.json()["error"]["message"] == unknown.json()["error"]["message"]


def test_revoking_kills_the_link_at_once_and_is_audited(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """§27.12 "Revocation" — before this the only way to stop a link was to mint a
    new one, which hands the merchant a second live link to the same bill."""
    from apps.platform_app.models import AuditLog

    doc, token = _shared(owner, make_item, make_party)
    assert _public(anonymous_client, token).status_code == 200
    revoked = owner.post(invoice_url(doc["id"], "share-links/revoke"), {}, format="json")
    assert revoked.status_code == 200, revoked.json()
    assert revoked.json()["data"] == {"revoked": True}
    assert _public(anonymous_client, token).status_code == 404
    assert SalesDocument.objects.get(pk=doc["id"]).public_token_hash is None
    assert AuditLog.objects.filter(
        action="invoice.share_link_revoked", entity_id=doc["id"]
    ).exists()
    again = owner.post(invoice_url(doc["id"], "share-links/revoke"), {}, format="json")
    assert again.status_code == 200 and again.json()["data"] == {"revoked": False}


def test_staff_cannot_revoke_and_another_tenant_gets_404(
    shop: Any, api_as: Any, owner: Any, other_tenant: Any, make_item: Any, make_party: Any
) -> None:
    """Share-sheet §12: revoking is owner/admin; canon §0.11 rule 2: foreign ids are 404."""
    doc, _token = _shared(owner, make_item, make_party)
    staff, _m = api_as(shop, role="staff")
    url = invoice_url(doc["id"], "share-links/revoke")
    assert staff.post(url, {}, format="json").status_code == 403
    stranger, _m = api_as(other_tenant)
    assert stranger.post(url, {}, format="json").status_code == 404


def test_the_per_ip_budget_is_durable_not_per_worker(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """§27.11 — 60/min per IP, counted in PostgreSQL. It was DRF's LocMem throttle:
    one counter per gunicorn worker, emptied by a restart. Clearing the cache
    between requests (what a second worker or a restart looks like) no longer
    resets anything."""
    from apps.platform_app.models import RateLimit

    _doc, token = _shared(owner, make_item, make_party)
    for _ in range(60):
        cache.clear()
        assert _public(anonymous_client, token).status_code == 200
    cache.clear()
    refused = _public(anonymous_client, token)
    assert refused.status_code == 429
    _assert_public_headers(refused)
    assert refused.json()["error"]["code"] == "rate_limited"
    assert RateLimit.objects.filter(scope="drf:public_link").exists()


def test_one_token_has_its_own_daily_budget_across_addresses(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any, settings: Any
) -> None:
    """§27.12 "Throttle" — 600/day per token, so a leaked link hammered from many
    addresses still runs dry. Shrunk to 3 here; each request from a new IP."""
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "public_link_token": "3/day",
        },
    }
    _doc, token = _shared(owner, make_item, make_party)
    codes = [
        _public(anonymous_client, token, REMOTE_ADDR=f"203.0.113.{n}").status_code
        for n in range(1, 5)
    ]
    assert codes == [200, 200, 200, 429]
