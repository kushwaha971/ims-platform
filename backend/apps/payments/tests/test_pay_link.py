"""Shop P0 — the UPI pay link: one https page and QR for any amount owed, in every module.

The defects these prevent: a link whose amount can be edited in the address bar; a
link that keeps paying an old UPI ID after the shop changed it; a page that names
the product rather than the business; a "pay" line with no UPI ID behind it; a
reminder whose link opens a page for some other sum than the message names; and the
desk's QR closed to a library or lender without the payments module.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.core import signing

from apps.payments.services.pay_link import make_pay_link, resolve_pay_link

pytestmark = pytest.mark.django_db

PUBLIC = "/api/v1/public/pay/"


def token_of(url: str) -> str:
    return url.split("/pay/", 1)[1]


def test_the_desk_gets_a_link_and_a_qr_and_the_page_shows_the_same(
    owner: Any, shop: Any, client: Any
) -> None:
    response = owner.post(
        "/api/v1/payments/pay-links",
        {"amount": "900", "reference": "LIB-0007"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    link = response.json()["data"]
    assert link["url"].startswith("http") and "/pay/" in link["url"]
    assert "am=900.00" in link["upi_url"] and link["qr"]["size"] > 20

    page = client.get(PUBLIC + token_of(link["url"]))
    assert page.status_code == 200, page.json()
    body = page.json()["data"]
    assert body["amount"] == "900.00" and body["reference"] == "LIB0007"
    assert body["business_name"] == (shop.legal_name or shop.name)
    assert body["upi_url"] == link["upi_url"]
    assert "YourKhata" not in str(body) and page["X-Robots-Tag"] == "noindex, nofollow"


def test_an_edited_amount_is_a_dead_link_and_so_is_garbage(client: Any, shop: Any) -> None:
    link = make_pay_link(tenant=shop, amount=Decimal("900"))
    forged = signing.TimestampSigner(salt="something-else", sep=".").sign(f"{shop.id.hex}_9.00_")
    assert client.get(PUBLIC + forged).status_code == 404
    tampered = token_of(link["url"]).replace("_900.00_", "_9.00_", 1)
    assert tampered != token_of(link["url"])
    assert client.get(PUBLIC + tampered).status_code == 404
    assert client.get(PUBLIC + "nonsense").status_code == 404


def test_the_page_pays_the_upi_id_the_shop_has_now(shop: Any) -> None:
    link = make_pay_link(tenant=shop, amount=Decimal("100"))
    shop.upi_vpa = "newid@okicici"
    shop.save(update_fields=["upi_vpa"])
    assert "pa=newid@okicici" in resolve_pay_link(token_of(link["url"]))["upi_url"]
    shop.upi_vpa = ""
    shop.save(update_fields=["upi_vpa"])
    from apps.common.exceptions import NotFound

    with pytest.raises(NotFound):
        resolve_pay_link(token_of(link["url"]))


def test_no_upi_id_means_no_link_and_the_desk_is_told(owner: Any, shop: Any) -> None:
    shop.upi_vpa = ""
    shop.save(update_fields=["upi_vpa"])
    assert make_pay_link(tenant=shop, amount=Decimal("10")) is None
    refused = owner.post("/api/v1/payments/pay-links", {"amount": "10"}, format="json")
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "upi_not_configured"


def test_the_token_is_short_enough_for_a_text_message(shop: Any) -> None:
    link = make_pay_link(tenant=shop, amount=Decimal("12345.67"), reference="LN-0001")
    assert len(token_of(link["url"])) <= 110, link["url"]
    assert "_12345.67_LN0001." in token_of(link["url"]) and ":" not in token_of(link["url"])
    assert resolve_pay_link(token_of(link["url"]))["amount"] == "12345.67"
