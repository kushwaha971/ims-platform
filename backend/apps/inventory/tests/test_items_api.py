"""INV-01 / INV-02 / INV-03 / INV-05 over HTTP: the item master, its list and its history."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import RoleCode
from apps.inventory.models import Item, ItemStock, StockMovement
from apps.inventory.services.items import next_sku, sku_prefix
from apps.inventory.tests.conftest import unit
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db

ITEMS = "v1:item-list"


def item_url(item_id: Any, suffix: str = "") -> str:
    name = {
        "": "v1:item-detail",
        "archive": "v1:item-archive",
        "restore": "v1:item-restore",
        "movements": "v1:item-movements",
    }[suffix]
    return reverse(name, args=[str(item_id)])


@pytest.fixture
def owner(api_as: Any, tenant: Any, main: Any, reference: Any) -> Any:
    return api_as(tenant, RoleCode.OWNER.value)[0]


def create(client: Any, **fields: Any) -> Any:
    body = {"name": "Basmati Rice 5kg", "unit_id": str(unit("NOS").id), **fields}
    return client.post(reverse(ITEMS), body, format="json")


# ── BR-2: auto-SKU ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("name", "prefix"),
    [
        ("Basmati Rice 5kg", "BASMATI-RICE"),
        ("Sugar", "SUGAR"),
        ("चीनी", "ITEM"),  # EC-2 — Devanagari only
        ("Café  crème!!", "CAFE-CREME"),
        ("A very long product name", "A-VERY-LONG"),  # truncated to 12, trailing dash trimmed
    ],
)
def test_sku_prefix_follows_br_2(name: str, prefix: str) -> None:
    """T-INV-01-1 — NFKD, upper-case, runs to one dash, ≤ 12, `ITEM` fallback."""
    assert sku_prefix(name) == prefix


def test_sku_suffix_rolls_past_999(ctx: Any, make_item: Any) -> None:
    """T-INV-01-1 — 999 → 1000 widens rather than wrapping or colliding."""
    make_item("Sugar", sku="SUGAR-999")
    assert next_sku(tenant=ctx.tenant, prefix="SUGAR") == "SUGAR-1000"


def test_create_assigns_sequential_skus(owner: Any) -> None:
    """AC-1/AC-2/EC-1 — two blank-SKU saves of one name get distinct SKUs."""
    first = create(owner, name="Sugar", unit_id=str(unit("KGS").id), selling_price="42")
    second = create(owner, name="Sugar", unit_id=str(unit("KGS").id))
    assert first.status_code == 201, first.json()
    assert first.json()["data"]["sku"] == "SUGAR-001"
    assert second.json()["data"]["sku"] == "SUGAR-002"
    assert first.json()["data"]["tax_code"] == "GST0"


# ── INV-01 / INV-05: create with opening stock ──────────────────────────────


def test_create_with_opening_stock_posts_one_opening_movement(owner: Any, tenant: Any) -> None:
    """T-INV-01-4 / AC-5 — item, stock row, movement and audit rows, totals equal."""
    response = create(owner, opening_stock={"qty": "10", "unit_cost": "40"}, reorder_point="3")
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["stock"][0]["on_hand"] == "10.000"
    assert data["stock"][0]["avg_cost"] == "40.0000"
    assert data["stock"][0]["value"] == "400.00"
    assert data["opening"]["qty"] == "10.000"
    movement = StockMovement.objects.get(item_id=data["id"])
    assert (movement.movement_type, movement.sequence_no, movement.source_type) == (
        "opening",
        1,
        "item",
    )
    actions = set(AuditLog.objects.filter(tenant=tenant).values_list("action", flat=True))
    assert {"item.created", "stock.opening_posted"} <= actions


def test_opening_cost_defaults_to_purchase_price(owner: Any) -> None:
    response = create(owner, purchase_price="38", opening_stock={"qty": "5"})
    assert response.json()["data"]["stock"][0]["avg_cost"] == "38.0000"


def test_whole_units_refuse_fractional_quantities(owner: Any) -> None:
    """§17.6.0 / INV-04 AC-3 — NOS does not allow 1.5; the code rides in field_codes."""
    response = create(owner, opening_stock={"qty": "1.5", "unit_cost": "40"})
    assert response.status_code == 400
    assert (
        response.json()["error"]["details"]["field_codes"]["opening_stock.qty"]
        == "qty_must_be_whole"
    )


def test_opening_in_the_future_is_refused(owner: Any) -> None:
    """T-INV-05-4."""
    response = create(owner, opening_stock={"qty": "1", "unit_cost": "1", "as_of": "2999-01-01"})
    assert (
        response.json()["error"]["details"]["field_codes"]["opening_stock.as_of"] == "future_date"
    )


def test_a_service_cannot_track_stock(owner: Any) -> None:
    """T-INV-01-8 / BR-3."""
    response = create(owner, name="Repair", item_type="service", track_stock=True)
    assert (
        response.json()["error"]["details"]["field_codes"]["track_stock"]
        == "track_stock_not_allowed"
    )
    ok = create(owner, name="Repair", item_type="service", hsn_sac="9987")
    assert ok.status_code == 201
    assert ok.json()["data"]["track_stock"] is False
    assert ok.json()["data"]["on_hand"] is None


def test_hsn_and_sac_formats(owner: Any) -> None:
    """T-INV-01-2 — SAC must start with 99; unknown codes warn but save."""
    bad = create(owner, name="Consult", item_type="service", hsn_sac="1234")
    assert bad.json()["error"]["details"]["field_codes"]["hsn_sac"] == "invalid_sac"
    warned = create(owner, name="Widget", hsn_sac="84713010")
    assert warned.status_code == 201
    assert [w["code"] for w in warned.json()["meta"]["warnings"]] == ["hsn_unknown"]


def test_duplicate_sku_and_barcode(owner: Any) -> None:
    """T-INV-01-5 — registry codes: `duplicate_sku` 400, `barcode_exists` 409."""
    create(owner, sku="RICE-1", barcode="8901234567890")
    sku = create(owner, name="Other", sku="RICE-1")
    assert (sku.status_code, sku.json()["error"]["code"]) == (400, "duplicate_sku")
    barcode = create(owner, name="Other", barcode="8901234567890")
    assert (barcode.status_code, barcode.json()["error"]["code"]) == (409, "barcode_exists")
    assert barcode.json()["error"]["details"]["item_name"] == "Basmati Rice 5kg"


def test_barcode_checksum_is_a_warning_not_a_refusal(owner: Any) -> None:
    response = create(owner, barcode="8901234567891")
    assert response.status_code == 201
    assert response.json()["meta"]["warnings"][0]["code"] == "barcode_checksum"


def test_legacy_rate_cannot_be_chosen_for_a_new_item(owner: Any) -> None:
    """FR-6 — GST12 ended on 21/09/2025; new items may not pick it."""
    response = create(owner, tax_code="GST12")
    assert response.json()["error"]["details"]["field_codes"]["tax_code"] == "invalid_tax_code"


# ── PATCH ───────────────────────────────────────────────────────────────────


def test_patch_requires_the_current_version(owner: Any) -> None:
    """T-INV-01-7 — a stale edit is 409, and the item is unchanged."""
    data = create(owner).json()["data"]
    ok = owner.patch(
        item_url(data["id"]), {"version": data["version"], "selling_price": "450"}, format="json"
    )
    assert ok.status_code == 200, ok.json()
    stale = owner.patch(
        item_url(data["id"]), {"version": data["version"], "selling_price": "1"}, format="json"
    )
    assert stale.json()["error"]["code"] == "stale_version"
    assert Item.objects.get(pk=data["id"]).selling_price == Decimal("450.00")


def test_tracking_off_needs_zero_stock_and_on_needs_opening(owner: Any) -> None:
    """T-INV-01-6 / T-INV-05-3 / FR-8 transitions."""
    tracked = create(owner, opening_stock={"qty": "2", "unit_cost": "5"}).json()["data"]
    off = owner.patch(
        item_url(tracked["id"]),
        {"version": tracked["version"], "track_stock": False},
        format="json",
    )
    assert off.json()["error"]["code"] == "stock_nonzero"

    plain = create(owner, name="Loose tea", track_stock=False).json()["data"]
    on = owner.patch(
        item_url(plain["id"]), {"version": plain["version"], "track_stock": True}, format="json"
    )
    assert on.json()["error"]["code"] == "opening_stock_required"
    on = owner.patch(
        item_url(plain["id"]),
        {
            "version": plain["version"],
            "track_stock": True,
            "opening_stock": {"qty": "5", "unit_cost": "12"},
        },
        format="json",
    )
    assert on.status_code == 200, on.json()
    assert on.json()["data"]["on_hand"] == "5.000"  # INV-05 AC-2


def test_the_unit_locks_once_stock_has_moved(owner: Any) -> None:
    """BR-8 / EC-9."""
    data = create(owner, opening_stock={"qty": "1", "unit_cost": "1"}).json()["data"]
    response = owner.patch(
        item_url(data["id"]),
        {"version": data["version"], "unit_id": str(unit("KGS").id)},
        format="json",
    )
    assert response.json()["error"]["code"] == "unit_locked"


def test_item_type_is_immutable(owner: Any) -> None:
    data = create(owner).json()["data"]
    response = owner.patch(
        item_url(data["id"]), {"version": data["version"], "item_type": "service"}, format="json"
    )
    assert response.json()["error"]["code"] == "item_type_locked"


# ── permissions and tenancy ─────────────────────────────────────────────────


def test_accountant_reads_but_cannot_write(
    api_as: Any, tenant: Any, main: Any, reference: Any, owner: Any
) -> None:
    """T-INV-01-9."""
    accountant = api_as(tenant, RoleCode.ACCOUNTANT.value)[0]
    assert create(accountant).status_code == 403
    assert accountant.get(reverse(ITEMS)).status_code == 200


def test_another_tenants_unit_and_item_are_not_found(
    api_as: Any, other_tenant: Any, owner: Any, tenant: Any
) -> None:
    """Canon §0.11 rule 2 — cross-tenant ids are 404 / not_found, never 403."""
    from apps.inventory.models import Location, Unit

    Location.objects.create(tenant=other_tenant, code="MAIN", name="Main", is_default=True)
    foreign_unit = Unit.objects.create(tenant=other_tenant, code="PETI", name="Peti")
    response = create(owner, unit_id=str(foreign_unit.id))
    assert response.json()["error"]["details"]["field_codes"]["unit_id"] == "not_found"
    mine = create(owner).json()["data"]
    stranger = api_as(other_tenant, RoleCode.OWNER.value)[0]
    assert stranger.get(item_url(mine["id"])).status_code == 404


# ── INV-02: list, search, counts, totals, lookup, archive ───────────────────


@pytest.fixture
def shelf(owner: Any) -> dict:
    rice = create(
        owner,
        reorder_point="5",
        opening_stock={"qty": "8", "unit_cost": "46.625"},
        barcode="8901234567890",
    ).json()["data"]
    low = create(
        owner, name="Basil seeds", reorder_point="10", opening_stock={"qty": "3", "unit_cost": "10"}
    ).json()["data"]
    empty = create(owner, name="Cumin", reorder_point="2").json()["data"]
    service = create(owner, name="Delivery", item_type="service").json()["data"]
    return {"rice": rice, "low": low, "empty": empty, "service": service}


def test_search_reports_where_it_matched(owner: Any, shelf: dict) -> None:
    """T-INV-02-1 — name substring, exact SKU, barcode."""
    rows = owner.get(reverse(ITEMS), {"q": "bas"}).json()["data"]
    assert {r["name"] for r in rows} == {"Basmati Rice 5kg", "Basil seeds"}
    assert {r["match_field"] for r in rows} == {"name"}
    by_sku = owner.get(reverse(ITEMS), {"q": shelf["rice"]["sku"]}).json()["data"]
    assert [r["match_field"] for r in by_sku] == ["sku"]
    by_code = owner.get(reverse(ITEMS), {"q": "8901234567890"}).json()["data"]
    assert [r["match_field"] for r in by_code] == ["barcode"]


def test_stock_filters_counts_and_totals(owner: Any, shelf: dict) -> None:
    """T-INV-02-2/3 / AC-5 — `counts` ignore `stock`; totals are Σ rounded values."""
    body = owner.get(reverse(ITEMS), {"stock": "low"}).json()
    assert [r["name"] for r in body["data"]] == ["Basil seeds"]
    assert body["meta"]["counts"] == {"all": 4, "in": 1, "low": 1, "out": 1}
    assert body["meta"]["totals"] == {"items": 1, "stock_value": "30.00"}
    everything = owner.get(reverse(ITEMS)).json()
    assert everything["meta"]["totals"]["stock_value"] == "403.00"  # 373.00 + 30.00
    service_row = next(r for r in everything["data"] if r["name"] == "Delivery")
    assert service_row["stock_status"] is None and service_row["on_hand"] is None


def test_ordering_is_whitelisted(owner: Any, shelf: dict) -> None:
    assert owner.get(reverse(ITEMS), {"ordering": "sku; drop"}).status_code == 400
    rows = owner.get(reverse(ITEMS), {"ordering": "on_hand"}).json()["data"]
    assert rows[-1]["name"] == "Delivery"  # untracked sorts last, never first


def test_lookup_barcode_then_sku_and_archived(owner: Any, shelf: dict) -> None:
    """T-INV-02-5 / BR-4."""
    url = reverse("v1:item-lookup")
    assert owner.get(url, {"barcode": "8901234567890"}).json()["data"]["id"] == shelf["rice"]["id"]
    assert owner.get(url, {"barcode": shelf["low"]["sku"]}).json()["data"]["match_field"] == "sku"
    assert owner.get(url, {"barcode": "0000000000"}).status_code == 404


def test_archive_needs_zero_stock_and_hides_the_item(owner: Any, shelf: dict) -> None:
    """T-INV-02-4 / BR-2."""
    refused = owner.post(item_url(shelf["rice"]["id"], "archive"))
    assert (refused.status_code, refused.json()["error"]["code"]) == (409, "stock_nonzero")
    archived = owner.post(item_url(shelf["empty"]["id"], "archive"))
    assert archived.json()["data"]["status"] == "archived"
    names = {r["name"] for r in owner.get(reverse(ITEMS)).json()["data"]}
    assert "Cumin" not in names
    assert (
        owner.get(reverse("v1:item-lookup"), {"barcode": shelf["empty"]["sku"]}).status_code == 404
    )
    restored = owner.post(item_url(shelf["empty"]["id"], "restore"))
    assert restored.json()["data"]["status"] == "active"


def test_staff_cannot_archive(api_as: Any, tenant: Any, shelf: dict) -> None:
    staff = api_as(tenant, RoleCode.STAFF.value)[0]
    assert staff.post(item_url(shelf["empty"]["id"], "archive")).status_code == 403


# ── INV-03: detail and movements ────────────────────────────────────────────


def test_detail_stock_equals_the_last_movement(owner: Any, shelf: dict) -> None:
    """T-INV-03-1 / BR-1 / AC-1 — 8 NOS at 46.6250 is worth ₹373.00."""
    data = owner.get(item_url(shelf["rice"]["id"])).json()["data"]
    assert (data["on_hand"], data["avg_cost"], data["stock_value"]) == (
        "8.000",
        "46.6250",
        "373.00",
    )
    last = data["movements_recent"][0]
    assert (last["on_hand_after"], last["avg_cost_after"]) == (data["on_hand"], data["avg_cost"])
    assert data["tax_rate"]["code"] == "GST0"


def test_movements_page_by_cursor_and_filter_by_type(owner: Any, shelf: dict) -> None:
    """T-INV-03-2/3 — stable cursor, `has_more`, type filter, invalid range → 400."""
    from apps.common.context import Ctx
    from apps.inventory.services.adjustments import post_adjustment

    item = Item.objects.get(pk=shelf["rice"]["id"])
    for _ in range(3):
        post_adjustment(
            ctx=Ctx.system(item.tenant),
            payload={
                "reason": "count",
                "lines": [{"item_id": str(item.id), "qty": "1", "unit_cost": "40"}],
            },
        )
    url = item_url(item.id, "movements")
    first = owner.get(url, {"limit": 2}).json()
    assert [m["sequence_no"] for m in first["data"]] == [4, 3]
    assert first["meta"]["has_more"] is True
    second = owner.get(url, {"limit": 2, "cursor": first["meta"]["next_cursor"]}).json()
    assert [m["sequence_no"] for m in second["data"]] == [2, 1]
    assert second["meta"]["has_more"] is False
    assert second["data"][0]["source"]["number"].startswith("ADJ/")
    assert second["data"][1]["source"] == {"type": "item", "id": str(item.id), "number": None}
    openings = owner.get(url, {"type": "opening"}).json()["data"]
    assert [m["movement_type"] for m in openings] == ["opening"]
    assert owner.get(url, {"date_from": "2026-02-01", "date_to": "2026-01-01"}).status_code == 400
    assert owner.get(url, {"type": "bogus"}).status_code == 400


def test_new_tracked_item_without_stock_does_not_alert(owner: Any, shelf: dict) -> None:
    """A new item at 0 never WENT out; initialising it must not notify."""
    from apps.inventory.models import LowStockAlert

    assert not LowStockAlert.objects.filter(item_id=shelf["empty"]["id"]).exists()
    assert ItemStock.objects.get(item_id=shelf["empty"]["id"]).alert_level == "out"
