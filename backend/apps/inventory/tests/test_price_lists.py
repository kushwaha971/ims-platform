"""Shop gap §1.6 — price lists: a named rate card for a group of parties.

These pin the resolution order (a pinned rate beats the list's percentage,
which moves the selling price to the paisa), that names are unique without
regard to case, that deleting a list takes its parties off it, that a party
on no list gets no rates (the bill keeps the item's own price), and who may do
what: reading is the item read right, pricing is the item write right.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import RoleCode
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

LISTS = "v1:price-list-list"


@pytest.fixture
def owner(api_as: Any, tenant: Any, main: Any, reference: Any) -> Any:
    return api_as(tenant, RoleCode.OWNER.value)[0]


def _url(name: str, **kw: Any) -> str:
    return reverse(f"v1:price-list-{name}", kwargs=kw or None)


def test_a_list_prices_by_percentage_and_pinned_rates_win(
    owner: Any, tenant: Any, make_item: Any
) -> None:
    rice = make_item("Rice", selling_price="450.00")
    dal = make_item("Dal", selling_price="99.99")
    oil = make_item("Oil", selling_price="200.00")
    made = owner.post(_url("list"), {"name": "Wholesale", "adjust_percent": "-5"}, format="json")
    assert made.status_code == 201, made.content
    list_id = made.json()["data"]["id"]
    assert owner.post(_url("list"), {"name": "wholesale"}, format="json").status_code == 400

    pinned = owner.put(
        _url("set-rate", pk=list_id), {"item_id": str(oil.id), "rate": "170"}, format="json"
    )
    assert pinned.status_code == 200, pinned.content

    ramesh = b.party(tenant, "Ramesh")
    put = owner.put(
        _url("assign"), {"party_id": str(ramesh.id), "price_list_id": list_id}, format="json"
    )
    assert put.json()["data"] == {"id": list_id, "name": "Wholesale"}

    got = owner.get(
        _url("for-party"),
        {"party": str(ramesh.id), "items": f"{rice.id},{dal.id},{oil.id}"},
    ).json()["data"]
    assert got["price_list"]["name"] == "Wholesale"
    assert got["rates"][str(rice.id)]["rate"] == "427.50"
    assert got["rates"][str(dal.id)]["rate"] == "94.99"  # 94.9905 to the paisa
    assert got["rates"][str(oil.id)] == {"rate": "170.00", "pinned": True, "tax_inclusive": False}

    listed = owner.get(_url("list")).json()["data"]
    assert listed[0]["rate_count"] == 1 and listed[0]["party_count"] == 1
    rates = owner.get(_url("rates", pk=list_id)).json()["data"]["rates"]
    assert rates[0]["item"]["name"] == "Oil" and rates[0]["from_percent"] == "190.00"

    # Unpin, and the percentage applies again.
    owner.put(_url("set-rate", pk=list_id), {"item_id": str(oil.id), "rate": None}, format="json")
    again = owner.get(_url("for-party"), {"party": str(ramesh.id), "items": str(oil.id)})
    assert again.json()["data"]["rates"][str(oil.id)]["rate"] == "190.00"


def test_deleting_a_list_takes_its_parties_off_it(owner: Any, tenant: Any, make_item: Any) -> None:
    rice = make_item("Rice", selling_price="450.00")
    list_id = owner.post(_url("list"), {"name": "Dealer"}, format="json").json()["data"]["id"]
    ramesh = b.party(tenant, "Ramesh")
    owner.put(_url("assign"), {"party_id": str(ramesh.id), "price_list_id": list_id}, format="json")
    assert owner.delete(_url("detail", pk=list_id)).status_code == 200
    got = owner.get(_url("for-party"), {"party": str(ramesh.id), "items": str(rice.id)})
    assert got.json()["data"] == {"price_list": None, "rates": {}}
    assert owner.get(_url("list")).json()["data"] == []
    # The name is free again.
    assert owner.post(_url("list"), {"name": "Dealer"}, format="json").status_code == 201


def test_validation_and_rename(owner: Any) -> None:
    bad = owner.post(_url("list"), {"name": "", "adjust_percent": "-150"}, format="json")
    assert bad.status_code == 400
    details = bad.json()["error"]["details"]
    assert "name" in details and "adjust_percent" in details
    list_id = owner.post(_url("list"), {"name": "Retail"}, format="json").json()["data"]["id"]
    renamed = owner.patch(_url("detail", pk=list_id), {"adjust_percent": "10"}, format="json")
    assert renamed.json()["data"]["adjust_percent"] == "10.00"
    assert renamed.json()["data"]["name"] == "Retail"


def test_staff_may_read_rates_but_not_set_prices(
    owner: Any, api_as: Any, tenant: Any, make_item: Any
) -> None:
    rice = make_item("Rice", selling_price="100.00")
    list_id = owner.post(
        _url("list"), {"name": "Wholesale", "adjust_percent": "-10"}, format="json"
    ).json()["data"]["id"]
    ramesh = b.party(tenant, "Ramesh")
    owner.put(_url("assign"), {"party_id": str(ramesh.id), "price_list_id": list_id}, format="json")
    staff, member = api_as(tenant, RoleCode.STAFF.value)
    member.permissions_override = {"deny": ["inventory.item.write"]}
    member.save(update_fields=["permissions_override"])
    got = staff.get(_url("for-party"), {"party": str(ramesh.id), "items": str(rice.id)})
    assert got.status_code == 200
    assert got.json()["data"]["rates"][str(rice.id)]["rate"] == "90.00"
    assert staff.post(_url("list"), {"name": "Mine"}, format="json").status_code == 403
    assert (
        staff.put(
            _url("assign"), {"party_id": str(ramesh.id), "price_list_id": None}, format="json"
        ).status_code
        == 403
    )
