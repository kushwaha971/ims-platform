"""INV-06 — stock adjustments over HTTP: the arithmetic, the policy, the wire."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.common.constants import RoleCode
from apps.inventory.models import StockAdjustment, StockMovement
from apps.inventory.tests.conftest import stock_of
from apps.platform_app.models import TenantSetting
from tests.fixtures import build_access_token

pytestmark = pytest.mark.django_db

URL = "v1:stock-adjustment-list"


@pytest.fixture
def owner(api_as: Any, tenant: Any, main: Any, reference: Any) -> Any:
    return api_as(tenant, RoleCode.OWNER.value)[0]


def post(client: Any, lines: list[dict], key: str | None = None, **header: Any) -> Any:
    body = {"reason": "damage", "lines": lines, **header}
    return client.post(
        reverse(URL), body, format="json", HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4())
    )


def line(item: Any, qty: str, cost: str | None = None) -> dict:
    return {"item_id": str(item.id), "qty": qty, "unit_cost": cost}


def test_outbound_keeps_the_average_and_numbers_sequentially(owner: Any, make_item: Any) -> None:
    """AC-1 — Sugar 5 KGS @ 44, −3 damage → 2 KGS @ 44, one adjust_out at 44.0000."""
    sugar = make_item("Sugar", "KGS", opening=("5", "44"))
    response = post(owner, [line(sugar, "-3")])
    assert response.status_code == 201, response.json()
    data = response.json()["data"]
    assert data["number"].startswith("ADJ/") and data["number"].endswith("/0001")
    only = data["lines"][0]
    assert (only["qty"], only["unit_cost"], only["on_hand_before"], only["on_hand_after"]) == (
        "-3.000",
        "44.0000",
        "5.000",
        "2.000",
    )
    assert only["value_impact"] == "-132.00"
    assert data["value_impact_total"] == "-132.00"
    movement = StockMovement.objects.get(item=sugar, movement_type="adjust_out")
    assert movement.reason == "damage"
    assert stock_of(sugar) == (movement.on_hand_after, movement.avg_cost_after)
    second = post(owner, [line(sugar, "-1")]).json()["data"]
    assert second["number"].endswith("/0002")


def test_inbound_blends_the_average(owner: Any, make_item: Any) -> None:
    """AC-2 — 5 @ 50 plus 3 @ 41 → 8 @ 46.6250."""
    rice = make_item("Rice", opening=("5", "50"))
    post(owner, [line(rice, "3", "41")], reason="count")
    assert [str(v) for v in stock_of(rice)] == ["8.000", "46.6250"]


def test_several_items_share_one_header(owner: Any, make_item: Any) -> None:
    """AC-3."""
    items = [make_item(f"Item {n}", opening=("10", "1")) for n in range(3)]
    data = post(owner, [line(i, "-1") for i in items], reason="count").json()["data"]
    assert len(data["lines"]) == 3
    assert StockAdjustment.objects.count() == 1
    assert StockMovement.objects.filter(source_id=data["id"]).count() == 3


def test_negative_stock_off_refuses_every_short_line_and_writes_nothing(
    owner: Any, make_item: Any
) -> None:
    """AC-4 / FR-6 — 409 with `details.lines[]` for ALL offending lines; no rows."""
    a = make_item("A", opening=("5", "1"))
    b = make_item("B", opening=("1", "1"))
    ok = make_item("C", opening=("9", "1"))
    response = post(owner, [line(a, "-8"), line(ok, "-1"), line(b, "-2")])
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "insufficient_stock"
    assert [
        (d["index"], d["requested"], d["available"], d["unit_code"])
        for d in error["details"]["lines"]
    ] == [
        (0, "8.000", "5.000", "NOS"),
        (2, "2.000", "1.000", "NOS"),
    ]
    assert StockAdjustment.objects.count() == 0
    assert StockMovement.objects.filter(movement_type="adjust_out").count() == 0


def test_negative_stock_on_posts_below_zero_and_the_next_inbound_resets(
    owner: Any, make_item: Any, tenant: Any
) -> None:
    """BR-8 — with the setting on, −3 is posted; a later inbound restarts the average."""
    TenantSetting.objects.create(
        tenant=tenant, key="inventory.allow_negative_stock", value={"value": True}
    )
    rice = make_item("Rice", opening=("5", "44"))
    assert post(owner, [line(rice, "-8")]).status_code == 201
    assert str(stock_of(rice)[0]) == "-3.000"
    post(owner, [line(rice, "12", "50")], reason="count")
    assert [str(v) for v in stock_of(rice)] == ["9.000", "50.0000"]


@pytest.mark.parametrize(
    ("body", "path", "code"),
    [
        ({"reason": "other", "note": "x"}, "note", "required"),
        ({"reason": "bogus"}, "reason", "invalid_choice"),
        ({"adjustment_date": "2999-01-01"}, "adjustment_date", "future_date"),
    ],
)
def test_header_validation(owner: Any, make_item: Any, body: dict, path: str, code: str) -> None:
    """T-INV-06-5 — header rules, with the code in field_codes."""
    rice = make_item("Rice", opening=("5", "1"))
    response = post(owner, [line(rice, "-1")], **body)
    assert response.status_code == 400
    assert response.json()["error"]["details"]["field_codes"][path] == code


def test_line_validation(owner: Any, make_item: Any) -> None:
    """Duplicate lines, services, zero, fractions of a whole unit, missing inbound cost."""
    rice = make_item("Rice", opening=("5", "1"))
    service = make_item("Delivery", item_type="service")
    response = post(
        owner,
        [
            line(rice, "-1"),
            line(rice, "-1"),
            line(service, "1", "1"),
            line(rice, "0.5", "1"),
            line(rice, "2"),
        ],
    )
    codes = response.json()["error"]["details"]["field_codes"]
    assert codes["lines.1.item_id"] == "duplicate_line"
    assert codes["lines.2.item_id"] == "track_stock_not_allowed"
    assert codes["lines.3.qty"] == "qty_must_be_whole"
    assert codes["lines.4.unit_cost"] == "required"
    assert response.json()["error"]["details"]["lines"]["4"]["unit_cost"]


def test_the_idempotency_key_is_required_and_replays(owner: Any, make_item: Any) -> None:
    """EC-8 — a lost response retried with the same key moves the stock ONCE."""
    rice = make_item("Rice", opening=("5", "1"))
    missing = owner.post(
        reverse(URL), {"reason": "damage", "lines": [line(rice, "-1")]}, format="json"
    )
    assert missing.status_code == 400
    first = post(owner, [line(rice, "-1")], key="k-1")
    again = post(owner, [line(rice, "-1")], key="k-1")
    assert again.status_code == 201 and again["Idempotent-Replayed"] == "true"
    assert again.json()["data"]["id"] == first.json()["data"]["id"]
    assert str(stock_of(rice)[0]) == "4.000"
    conflict = post(owner, [line(rice, "-2")], key="k-1")
    assert conflict.json()["error"]["code"] == "idempotency_conflict"


def test_staff_needs_the_override(api_as: Any, tenant: Any, make_item: Any, main: Any) -> None:
    """T-INV-06-6 / BR-7 — absent from the staff role; granted per member."""
    rice = make_item("Rice", opening=("5", "1"))
    staff, member = api_as(tenant, RoleCode.STAFF.value)
    assert post(staff, [line(rice, "-1")]).status_code == 403
    member.permissions_override = {"allow": ["inventory.stock.adjust"]}
    member.permissions_version += 1
    member.save()
    client = APIClient()  # a fresh token carrying the bumped permissions version
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
    assert post(client, [line(rice, "-1")]).status_code == 201


def test_detail_is_readable_by_the_accountant_and_has_no_edit(
    api_as: Any, owner: Any, tenant: Any, make_item: Any
) -> None:
    """AC-6 — number, reason, note, posted-by and lines; no PATCH, no DELETE."""
    rice = make_item("Rice", opening=("5", "1"))
    data = post(owner, [line(rice, "-1")], note="Rain").json()["data"]
    accountant = api_as(tenant, RoleCode.ACCOUNTANT.value)[0]
    url = reverse("v1:stock-adjustment-detail", args=[data["id"]])
    detail = accountant.get(url).json()["data"]
    assert (detail["number"], detail["note"], len(detail["lines"])) == (data["number"], "Rain", 1)
    assert owner.patch(url, {"note": "x"}, format="json").status_code == 405
    assert owner.delete(url).status_code == 405


def test_archived_item_is_refused(owner: Any, make_item: Any) -> None:
    """EC-2 — 409 `item_archived` via the API."""
    from apps.inventory.constants import ItemStatus
    from apps.inventory.models import Item

    rice = make_item("Rice")
    Item.objects.filter(pk=rice.pk).update(status=ItemStatus.ARCHIVED)
    response = post(owner, [line(rice, "1", "1")])
    assert response.json()["error"]["code"] == "item_archived"
