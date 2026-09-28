"""INV-08 stock summary, INV-04 masters, and the tax reference reads."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import RoleCode
from apps.inventory.models import Category

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner(api_as: Any, tenant: Any, main: Any, reference: Any) -> Any:
    return api_as(tenant, RoleCode.OWNER.value)[0]


# ── INV-08 ──────────────────────────────────────────────────────────────────


def test_summary_total_is_the_sum_of_rounded_rows(owner: Any, make_item: Any) -> None:
    """T-INV-08-1 / FR-8 / EC-5 — 3 × 46.6250 = 139.875 → 139.88, and the header
    total equals the rows displayed, not the unrounded product."""
    make_item("Rice", opening=("3", "46.625"))
    make_item("Dal", opening=("3", "46.625"))
    body = owner.get(reverse("v1:stock-summary")).json()
    assert [r["value"] for r in body["data"]] == ["139.88", "139.88"]
    assert body["meta"]["totals"] == {"items": 2, "value": "279.76"}
    assert body["meta"]["valuation_visible"] is True


def test_staff_sees_quantities_without_valuation(
    api_as: Any, tenant: Any, make_item: Any, main: Any
) -> None:
    """T-INV-08-3 / EC-4 — the API OMITS avg_cost and value, and the total is null."""
    make_item("Rice", opening=("3", "46.625"))
    staff = api_as(tenant, RoleCode.STAFF.value)[0]
    body = staff.get(reverse("v1:stock-summary")).json()
    assert "value" not in body["data"][0] and "avg_cost" not in body["data"][0]
    assert body["meta"]["totals"]["value"] is None


def test_hide_zero_and_future_as_of(owner: Any, make_item: Any) -> None:
    """FR-4 hide-zero default; §10 `as_of ≤ today`."""
    make_item("Rice", opening=("3", "1"))
    make_item("Empty")
    assert len(owner.get(reverse("v1:stock-summary")).json()["data"]) == 1
    assert len(owner.get(reverse("v1:stock-summary"), {"hide_zero": "false"}).json()["data"]) == 2
    assert owner.get(reverse("v1:stock-summary"), {"as_of": "2999-01-01"}).status_code == 400


# ── INV-04 ──────────────────────────────────────────────────────────────────


def test_category_create_is_case_insensitive_and_one_level(owner: Any) -> None:
    """T-INV-04-3/4 — "grocery" returns "Grocery" with 200; a grandchild is refused."""
    url = reverse("v1:category-list")
    grocery = owner.post(url, {"name": "Grocery"}, format="json")
    assert grocery.status_code == 201
    again = owner.post(url, {"name": "  grocery "}, format="json")
    assert (again.status_code, again.json()["meta"]["created"]) == (200, False)
    assert again.json()["data"]["id"] == grocery.json()["data"]["id"]
    rice = owner.post(
        url, {"name": "Rice", "parent_id": grocery.json()["data"]["id"]}, format="json"
    )
    deep = owner.post(
        url, {"name": "Basmati", "parent_id": rice.json()["data"]["id"]}, format="json"
    )
    assert deep.json()["error"]["details"]["field_codes"]["parent_id"] == "nesting_too_deep"
    tree = owner.get(url).json()["data"]
    assert [(c["name"], [k["name"] for k in c["children"]]) for c in tree] == [
        ("Grocery", ["Rice"])
    ]


def test_a_parent_category_filter_includes_children(
    owner: Any, make_item: Any, tenant: Any
) -> None:
    """INV-04 AC-4 — filtering by Grocery shows items filed under Grocery › Rice."""
    grocery = Category.objects.create(tenant=tenant, name="Grocery")
    rice = Category.objects.create(tenant=tenant, name="Rice", parent=grocery)
    make_item("Basmati", category_id=str(rice.id))
    make_item("Soap")
    rows = owner.get(reverse("v1:item-list"), {"category_id": str(grocery.id)}).json()["data"]
    assert [r["name"] for r in rows] == ["Basmati"]


def test_units_list_system_first_and_refuse_system_codes(
    owner: Any, api_as: Any, tenant: Any
) -> None:
    """T-INV-04-2 — a tenant cannot shadow a GST code; a custom code warns."""
    url = reverse("v1:unit-list")
    units = owner.get(url).json()["data"]
    assert units[0]["is_system"] is True and {"NOS", "KGS", "QTL", "BDL", "CAN"} <= {
        u["code"] for u in units
    }
    shadow = owner.post(url, {"code": "nos", "name": "Numbers"}, format="json")
    assert shadow.json()["error"]["details"]["field_codes"]["code"] == "duplicate_code"
    peti = owner.post(url, {"code": "peti", "name": "Peti", "allow_decimal": False}, format="json")
    assert peti.status_code == 201
    assert peti.json()["data"]["code"] == "PETI" and peti.json()["data"]["is_system"] is False
    assert peti.json()["meta"]["warnings"][0]["code"] == "not_uqc"
    accountant = api_as(tenant, RoleCode.ACCOUNTANT.value)[0]
    assert accountant.post(url, {"code": "X", "name": "X"}, format="json").status_code == 403


# ── tax reference reads ─────────────────────────────────────────────────────


def test_rates_respect_the_2025_09_21_boundary(owner: Any) -> None:
    """GST12/GST28 end on 21 Sep 2025; GST40 starts 22 Sep. `include` keeps a legacy code."""
    url = reverse("v1:tax-rates")
    before = {r["code"] for r in owner.get(url, {"as_of": "2025-09-21"}).json()["data"]}
    after = {r["code"] for r in owner.get(url, {"as_of": "2025-09-22"}).json()["data"]}
    assert {"GST12", "GST28"} <= before and "GST40" not in before
    assert "GST12" not in after and "GST40" in after
    legacy = owner.get(url, {"as_of": "2026-01-01", "include": "GST12"}).json()["data"]
    gst12 = next(r for r in legacy if r["code"] == "GST12")
    assert (gst12["is_current"], gst12["effective_to"]) == (False, "2025-09-21")


def test_hsn_search_by_code_prefix_and_by_word(owner: Any) -> None:
    """INV-01 AC-4 — "rice" finds 1006 with its default slab."""
    url = reverse("v1:tax-hsn")
    rice = owner.get(url, {"q": "rice"}).json()["data"]
    assert {
        "code": "1006",
        "description": "Rice",
        "default_tax_code": "GST5",
        "is_service": False,
    } in rice
    assert [r["code"] for r in owner.get(url, {"q": "100"}).json()["data"]] == ["1001", "1006"]
    assert owner.get(url, {"q": ""}).json()["data"] == []
