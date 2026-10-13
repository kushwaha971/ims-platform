"""QA B38 — a sale cannot silently consume stock first available after its date."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest

from apps.common.dates import tenant_today
from apps.inventory.models import StockMovement
from apps.platform_app.models import TenantSetting
from apps.sales.models import SalesDocument
from apps.sales.tests.conftest import draft, issue, line

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("allow_negative", [False, True])
def test_a_sale_before_opening_stock_obeys_the_negative_stock_policy(
    owner: Any, shop: Any, make_item: Any, make_party: Any, allow_negative: bool
) -> None:
    """B38 refuses unavailable dated stock, or warns when the owner permits negative stock."""
    opening = tenant_today(shop) - dt.timedelta(days=10)
    sale_date = opening - dt.timedelta(days=5)
    item = make_item(
        "Later Rice",
        "100.00",
        "GST0",
        stock=None,
        unit_code="KGS",
        opening_stock={"qty": "10", "unit_cost": "80", "as_of": opening.isoformat()},
    )
    TenantSetting.objects.create(
        tenant=shop, key="inventory.allow_negative_stock", value={"value": allow_negative}
    )
    document = draft(
        owner,
        party_id=str(make_party().id),
        document_date=sale_date.isoformat(),
        lines=[line(item, "2.5")],
    ).json()["data"]
    count = StockMovement.objects.filter(item=item).count()
    response = issue(owner, document["id"], version=document["version"])
    if allow_negative:
        assert response.status_code == 200, response.json()
        warnings = response.json()["meta"]["warnings"]
        assert any(w["code"] == "stock_before_available_date" for w in warnings), warnings
        warning = next(w for w in warnings if w["code"] == "stock_before_available_date")
        assert warning["details"]["as_of"] == sale_date.isoformat()
        assert warning["details"]["opening_date"] == opening.isoformat()
    else:
        assert response.status_code == 409, response.json()
        details = response.json()["error"]["details"]
        assert details["lines"][0]["available"] == "0.000"
        assert details["lines"][0]["as_of"] == sale_date.isoformat()
        assert details["lines"][0]["opening_date"] == opening.isoformat()
        assert StockMovement.objects.filter(item=item).count() == count
        assert SalesDocument.objects.get(pk=document["id"]).status == "draft"


@pytest.mark.parametrize("quantities", [["5"], ["2", "2"]])
def test_a_sale_cannot_borrow_later_inbound_stock_or_repeat_its_dated_balance(
    owner: Any, shop: Any, make_item: Any, make_party: Any, quantities: list[str]
) -> None:
    """B38 checks dated quantity and cumulative repeated lines, not only the opening date."""
    from decimal import Decimal

    from apps.common.context import Ctx
    from apps.inventory.constants import MovementType
    from apps.inventory.services.stock import MovementLine, post_movement

    today = tenant_today(shop)
    opening = today - dt.timedelta(days=30)
    sale = today - dt.timedelta(days=20)
    item = make_item(
        "Dated Rice",
        "100.00",
        "GST0",
        stock=None,
        unit_code="KGS",
        opening_stock={"qty": "3", "unit_cost": "80", "as_of": opening.isoformat()},
    )
    post_movement(
        ctx=Ctx.system(shop),
        line=MovementLine(
            item=item,
            qty=Decimal("10"),
            movement_type=MovementType.PURCHASE_IN,
            movement_date=today - dt.timedelta(days=5),
            source_type="qa-fixture",
            unit_cost=Decimal("80"),
        ),
    )
    created = draft(
        owner,
        party_id=str(make_party().id),
        document_date=sale.isoformat(),
        lines=[line(item, qty) for qty in quantities],
    )
    assert created.status_code == 201, created.json()
    document = created.json()["data"]
    response = issue(owner, document["id"], version=document["version"])
    assert response.status_code == 409, response.json()
    shortage = response.json()["error"]["details"]["lines"][0]
    assert shortage["as_of"] == sale.isoformat()
    assert shortage["available"] == ("3.000" if len(quantities) == 1 else "1.000")
    assert StockMovement.objects.filter(item=item).count() == 2


def test_a_dated_shortage_reports_the_stock_on_that_date_not_todays_lower_stock(
    owner: Any, shop: Any, make_item: Any, make_party: Any
) -> None:
    """B38's dated explanation must report historical availability when today's is lower."""
    from decimal import Decimal

    from apps.common.context import Ctx
    from apps.inventory.constants import MovementType
    from apps.inventory.services.stock import MovementLine, post_movement

    today = tenant_today(shop)
    item = make_item(
        "Historical Rice",
        "100.00",
        "GST0",
        stock=None,
        unit_code="KGS",
        opening_stock={
            "qty": "3",
            "unit_cost": "80",
            "as_of": (today - dt.timedelta(days=30)).isoformat(),
        },
    )
    post_movement(
        ctx=Ctx.system(shop),
        line=MovementLine(
            item=item,
            qty=Decimal("-2"),
            movement_type=MovementType.SALE_OUT,
            movement_date=today,
            source_type="qa-fixture",
        ),
    )
    created = draft(
        owner,
        party_id=str(make_party().id),
        document_date=(today - dt.timedelta(days=20)).isoformat(),
        lines=[line(item, "5")],
    )
    assert created.status_code == 201, created.json()
    document = created.json()["data"]
    response = issue(owner, document["id"], version=document["version"])
    assert response.status_code == 409, response.json()
    assert response.json()["error"]["details"]["lines"][0]["available"] == "3.000"
