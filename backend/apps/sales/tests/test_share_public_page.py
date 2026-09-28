"""The customer's share page payload (SAL-03 FR-4/FR-5, Part 27 §27.12, launch blocker).

`/d/<token>` used to be a stub that never called the API, so none of what the
page needs had a caller: the shop's logo (which lives behind the session-only
`/files/{id}`), the "Pay ₹X" UPI link and its QR, and the shop's language. The
payload grew those three blocks, and these tests hold each one to an
allow-list — a block that grows a key the paper does not carry fails here.
"""

from __future__ import annotations

import io
import itertools
from decimal import Decimal
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.sales.models import SalesDocument
from apps.sales.serializers.public import (
    BRANDING_FIELDS,
    DOCUMENT_FIELDS,
    EXTRA_KEYS,
    LINE_FIELDS,
    PARTY_SNAPSHOT_FIELDS,
    PAYMENT_FIELDS,
    SUPPLIER_FIELDS,
    UPI_FIELDS,
)
from apps.sales.services.share import public_pay_intent
from apps.sales.tests.conftest import cash, draft, invoice_url, issue, line

pytestmark = pytest.mark.django_db


def _share(owner: Any, document_id: str) -> str:
    link = owner.post(invoice_url(document_id, "share-links"), {}, format="json")
    assert link.status_code == 201, link.json()
    return link.json()["data"]["url"].rsplit("/d/", 1)[1]


_MOBILES = itertools.count(9876543210)


def _issued(owner: Any, make_item: Any, make_party: Any, **issue_body: Any) -> dict:
    party = make_party(mobile=f"+91{next(_MOBILES)}")
    doc = draft(owner, party_id=str(party.id), lines=[line(make_item())]).json()["data"]
    issued = issue(owner, doc["id"], **issue_body)
    assert issued.status_code == 200, issued.json()
    return issued.json()["data"]


def _public(client: Any, token: str) -> Any:
    return client.get(reverse("v1:public-document", args=[token]))


def _png() -> SimpleUploadedFile:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (300, 120), (20, 90, 200)).save(out, format="PNG")
    return SimpleUploadedFile("logo.png", out.getvalue(), content_type="image/png")


def test_the_payload_is_exactly_the_allow_list_at_every_level(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """§27.12 "Content" — nothing beyond the allow-list, at the top level AND
    inside every nested block. The earlier test forbade a list of known-private
    keys; this one fails on ANY new key, which is the only form of the rule that
    survives the merchant's serializer growing a field next month."""
    doc = _issued(owner, make_item, make_party, payment=cash("100.00"))
    body = _public(anonymous_client, _share(owner, doc["id"])).json()["data"]

    assert set(body) <= set(DOCUMENT_FIELDS) | set(EXTRA_KEYS), set(body) - set(DOCUMENT_FIELDS)
    assert set(body["supplier"]) <= set(SUPPLIER_FIELDS)
    assert set(body["party_snapshot"]) <= set(PARTY_SNAPSHOT_FIELDS)
    assert body["lines"] and all(set(row) <= set(LINE_FIELDS) for row in body["lines"])
    assert body["payments"] and all(set(row) <= set(PAYMENT_FIELDS) for row in body["payments"])
    assert set(body["tenant_branding"]) == set(BRANDING_FIELDS)
    assert set(body["upi"]) == set(UPI_FIELDS)
    assert set(body["upi"]["qr"]) == {"size", "modules"}
    assert body["locale"] in {"en", "hi"}


def test_pay_block_carries_the_amount_due_while_money_is_owed(
    owner: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """FR-4 / EC-7 — "Pay ₹X" is the amount DUE at the moment the customer opens the
    link, not the bill's total: a part-paid bill asks only for what is left."""
    doc = _issued(owner, make_item, make_party, payment=cash("100.00"))
    upi = _public(anonymous_client, _share(owner, doc["id"])).json()["data"]["upi"]
    assert Decimal(upi["amount"]) == Decimal(doc["amount_due"]) > 0
    assert f"am={doc['amount_due']}" in upi["upi_url"] and upi["upi_url"].startswith("upi://pay?")
    assert upi["qr"]["size"] == len(upi["qr"]["modules"])


def test_no_pay_block_when_paid_void_unconfigured_or_not_a_bill(
    owner: Any, shop: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """EC-6 / SAL-14 EC-5 — a paid bill has nothing to pay; a void one must never
    invite a payment; a shop without a UPI ID (or with the QR switched off) shows
    no pay block rather than an error; an estimate or a credit note is not a bill."""
    item = make_item("Soap", "10.00", "GST0")
    walk = draft(owner, lines=[line(item)]).json()["data"]
    paid = issue(owner, walk["id"], payment=cash("10.00")).json()["data"]
    assert _public(anonymous_client, _share(owner, paid["id"])).json()["data"]["upi"] is None

    due = _issued(owner, make_item, make_party)
    token = _share(owner, due["id"])
    assert _public(anonymous_client, token).json()["data"]["upi"] is not None
    voided = owner.post(invoice_url(due["id"], "void"), {"reason": "Duplicate"}, format="json")
    assert voided.status_code == 200, voided.json()
    after_void = _public(anonymous_client, token).json()["data"]
    assert after_void["status"] == "void" and after_void["upi"] is None

    other = _issued(owner, make_item, make_party)
    document = SalesDocument.objects.select_related("tenant").get(pk=other["id"])
    for kind in ("estimate", "credit_note"):
        document.kind = kind
        assert public_pay_intent(document) is None, kind
    document.kind = "invoice"
    assert public_pay_intent(document) is not None

    shop.upi_vpa = None
    shop.save()
    document.tenant.refresh_from_db()
    assert public_pay_intent(document) is None


def test_the_shops_language_travels_with_the_bill(
    owner: Any, shop: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """The page opens in Hindi for a Hindi shop even on a phone that sends no
    Accept-Language — the customer reads the bill in the shop's language."""
    token = _share(owner, _issued(owner, make_item, make_party)["id"])
    assert _public(anonymous_client, token).json()["data"]["locale"] == "en"
    shop.locale = "hi"
    shop.save()
    assert _public(anonymous_client, token).json()["data"]["locale"] == "hi"


def test_the_logo_is_served_under_the_token_and_dies_with_it(
    owner: Any, shop: Any, api_as: Any, anonymous_client: Any, make_item: Any, make_party: Any
) -> None:
    """The customer has no session, so `/files/{id}` answers 401 for the logo on
    their page. It is streamed under the SAME token instead — readable exactly as
    long as the bill is, 404 once revoked, and never an attachment id."""
    doc = _issued(owner, make_item, make_party)
    token = _share(owner, doc["id"])
    assert _public(anonymous_client, token).json()["data"]["tenant_branding"]["logo_url"] is None
    missing = anonymous_client.get(reverse("v1:public-document-logo", args=[token]))
    assert missing.status_code == 404

    client, _ = api_as(shop)
    uploaded = client.put(reverse("v1:tenant-branding"), {"logo": _png()}, format="multipart")
    assert uploaded.status_code == 200, uploaded.json()

    branding = _public(anonymous_client, token).json()["data"]["tenant_branding"]
    assert branding["logo_url"] == reverse("v1:public-document-logo", args=[token])
    image = anonymous_client.get(branding["logo_url"])
    assert image.status_code == 200 and image["Content-Type"] == "image/png"
    assert image["Referrer-Policy"] == "no-referrer" and image["Cache-Control"] == "private, no-store"

    owner.post(invoice_url(doc["id"], "share-links/revoke"), {}, format="json")
    assert anonymous_client.get(branding["logo_url"]).status_code == 404
