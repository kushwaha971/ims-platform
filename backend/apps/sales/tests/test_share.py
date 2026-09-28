"""SAL-03 — share links, the public page and the UPI intent."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.platform_app.models import AuditLog
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import cash, draft, invoice_url, issue, line

pytestmark = pytest.mark.django_db


def _issued_to_party(owner: Any, make_item: Any, make_party: Any) -> dict:
    doc = draft(owner, party_id=str(make_party(mobile="+919876543210").id),
                lines=[line(make_item())]).json()["data"]  # fmt: skip
    return issue(owner, doc["id"]).json()["data"]


def test_share_link_round_trip_and_regenerate(owner: Any, anonymous_client: Any, make_item: Any,
                                              make_party: Any) -> None:  # fmt: skip
    """T-SAL03-6 / T-SAL03-7 — 201 with a /d/ URL; only the hash is stored; the public GET masks
    the mobile and carries no cost; regenerating (revoke, then share) kills the old token (404)."""
    doc = _issued_to_party(owner, make_item, make_party)
    first = owner.post(invoice_url(doc["id"], "share-links"), {}, format="json")
    assert first.status_code == 201, first.json()
    token = first.json()["data"]["url"].rsplit("/d/", 1)[1]
    stored = SalesDocument.objects.get(pk=doc["id"])
    assert stored.public_token_hash and token not in stored.public_token_hash

    public = anonymous_client.get(reverse("v1:public-document", args=[token]))
    assert public.status_code == 200 and public["X-Robots-Tag"] == "noindex, nofollow"
    data = public.json()["data"]
    assert data["number"] == doc["number"] and "created_by" not in data
    assert (
        data["party_snapshot"]["mobile"].endswith("210")
        and "76543" not in data["party_snapshot"]["mobile"]
    )
    assert all("unit_cost_snapshot" not in ln for ln in data["lines"])

    owner.post(invoice_url(doc["id"], "share-links/revoke"), {}, format="json")
    fresh = owner.post(invoice_url(doc["id"], "share-links"), {"expires_in_days": 7}, format="json")
    assert fresh.json()["data"]["url"].rsplit("/d/", 1)[1] != token
    assert anonymous_client.get(reverse("v1:public-document", args=[token])).status_code == 404


def test_sharing_again_returns_the_same_live_link_uat_d1(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """UAT D1 — every Copy link / Share on WhatsApp minted a new token and silently killed
    the link the customer already had ("not available"). Sharing is idempotent while the
    link is live, the URL is still not stored (only its hash), and no second audit row."""
    doc = _issued_to_party(owner, make_item, make_party)
    first = owner.post(invoice_url(doc["id"], "share-links"), {"channel": "link"}, format="json")
    second = owner.post(
        invoice_url(doc["id"], "share-links"), {"channel": "whatsapp"}, format="json"
    )
    url = first.json()["data"]["url"]
    assert second.json()["data"]["url"] == url
    assert second.json()["data"]["expires_at"] == first.json()["data"]["expires_at"]
    assert second.json()["data"]["reused"] is True
    token = url.rsplit("/d/", 1)[1]
    assert anonymous_client.get(reverse("v1:public-document", args=[token])).status_code == 200
    stored = SalesDocument.objects.get(pk=doc["id"])
    assert token not in str(stored.meta) and token not in stored.public_token_hash
    assert AuditLog.objects.filter(entity_id=doc["id"], action__startswith="invoice.share_link")\
        .count() == 1  # fmt: skip


def test_an_expired_or_legacy_link_is_replaced_not_reused_uat_d1(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """UAT D1 — only a LIVE link is handed back: an expired one, or a legacy link minted
    before tokens were derivable (no nonce), gets a fresh link rather than a dead URL."""
    doc = _issued_to_party(owner, make_item, make_party)
    first = owner.post(invoice_url(doc["id"], "share-links"), {}, format="json").json()["data"]
    stored = SalesDocument.objects.get(pk=doc["id"])
    link = dict(stored.meta["share_link"])
    link["expires_at"] = (timezone.now() - dt.timedelta(seconds=1)).isoformat()
    stored.meta = {**stored.meta, "share_link": link}
    stored.save(update_fields=["meta"])
    second = owner.post(invoice_url(doc["id"], "share-links"), {}, format="json").json()["data"]
    assert second["url"] != first["url"] and second["reused"] is False

    stored.refresh_from_db()
    legacy = {k: v for k, v in stored.meta["share_link"].items() if k != "nonce"}
    stored.meta = {**stored.meta, "share_link": legacy}
    stored.save(update_fields=["meta"])
    third = owner.post(invoice_url(doc["id"], "share-links"), {}, format="json").json()["data"]
    assert third["url"] != second["url"]
    token = third["url"].rsplit("/d/", 1)[1]
    assert anonymous_client.get(reverse("v1:public-document", args=[token])).status_code == 200


def test_share_link_refuses_drafts_and_bad_expiry(
    owner: Any, make_item: Any, make_party: Any
) -> None:
    """§10 — expiry 1–90 days; a draft is not shareable."""
    doc = draft(owner, lines=[line(make_item())]).json()["data"]
    assert owner.post(invoice_url(doc["id"], "share-links"), {}, format="json").status_code == 409
    issued = _issued_to_party(owner, make_item, make_party)
    bad = owner.post(
        invoice_url(issued["id"], "share-links"), {"expires_in_days": 91}, format="json"
    )
    assert bad.status_code == 400


def test_accountant_can_share(shop: Any, api_as: Any, owner: Any, make_item: Any,
                              make_party: Any) -> None:  # fmt: skip
    """T-SAL03-11 — sharing is a READ permission."""
    doc = _issued_to_party(owner, make_item, make_party)
    accountant, _ = api_as(shop, role="accountant")
    assert (
        accountant.post(invoice_url(doc["id"], "share-links"), {}, format="json").status_code == 201
    )


def test_upi_intent_is_dynamic_while_due_and_static_when_paid(owner: Any, shop: Any, make_item: Any,
                                                              make_party: Any) -> None:  # fmt: skip
    """FR-4 / BR-2 / AC-4 — `am` = amount due, tn = number, tr = 12 hex; a paid bill's QR has no am;
    no VPA → 409 `upi_not_configured`."""
    doc = _issued_to_party(owner, make_item, make_party)
    intent = owner.get(invoice_url(doc["id"], "upi-intent")).json()["data"]
    assert f"am={doc['amount_due']}" in intent["upi_url"]
    assert "tn=INV%2F26-27%2F0001" in intent["upi_url"]
    assert intent["qr"]["size"] == len(intent["qr"]["modules"])

    item = make_item("Soap", "10.00", "GST0")
    walk = draft(owner, lines=[line(item)]).json()["data"]
    paid = issue(owner, walk["id"], payment=cash("10.00")).json()["data"]
    assert "am=" not in owner.get(invoice_url(paid["id"], "upi-intent")).json()["data"]["upi_url"]

    shop.upi_vpa = None
    shop.save()
    refused = owner.get(invoice_url(doc["id"], "upi-intent"))
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "upi_not_configured"


def test_qr_svg_endpoint_draws_only_upi_urls(owner: Any) -> None:
    """PAY-03 seam — `/payments/qr.svg` returns SVG for a UPI URL and 400 for anything else."""
    ok = owner.get(reverse("v1:payments-qr-svg"), {"data": "upi://pay?pa=a@okhdfc&pn=A&cu=INR"})
    assert ok.status_code == 200 and ok["Content-Type"] == "image/svg+xml"
    assert owner.get(reverse("v1:payments-qr-svg"), {"data": "https://evil"}).status_code == 400
