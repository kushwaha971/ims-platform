"""T-INV-09-* — the items kind: units matched, categories created, opening stock
posted through inventory's own movement service, and the cache still replaying.
"""

from __future__ import annotations

from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from apps.imports.tests.helpers import commit, detail, upload
from apps.inventory.models import Category, Item, ItemStock, StockMovement

pytestmark = pytest.mark.django_db

HEADER = (
    "name,item_type,sku,barcode,category,unit,hsn_sac,tax_code,tax_inclusive_selling,"
    "purchase_price,selling_price,mrp,track_stock,reorder_point,opening_stock_qty,"
    "opening_stock_unit_cost,opening_stock_date,description"
)


def _ready(client: Any, text: str, capture: Any) -> dict:
    response = upload(client, "items", text, name="items.csv", capture=capture)
    assert response.status_code == 201, response.content
    return detail(client, response.json()["data"]["id"])


GOOD = "\n".join(
    [
        HEADER,
        "Sona Masoori 10kg,goods,RICE-10,,Grocery > Rice,NOS,1006,GST5,no,500,560,600,yes,3,12,480,01/04/2026,",
        "Toor Dal 1kg,goods,,,Grocery,NOS,0713,GST5,no,120,140,,yes,,20,,,",
        "Phone repair,service,,,Services,NOS,998719,GST18,no,0,300,,no,,,,,",
    ]
)


def test_items_validate_with_categories_queued_for_creation(
    owner: Any, reference: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """FR-5 — "3 categories will be created" before anything is written."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    assert job["status"] == "ready", job.get("error")
    assert job["error_rows"] == 0, job["errors"]
    assert job["totals"]["categories_created"] == 3  # Grocery, Grocery > Rice, Services
    assert "Grocery > Rice" in job["totals"]["categories_to_create"]
    assert job["preview_rows"][1]["sku"] == "auto"
    assert Item.objects.count() == 0 and Category.objects.count() == 0


def test_commit_creates_items_masters_and_opening_stock(
    owner: Any, tenant: Any, reference: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """T-INV-09-4 — opening movements through `post_movement`, and `recalc_stock` clean."""
    job = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    assert commit(owner, job["id"], django_capture_on_commit_callbacks).status_code == 202
    done = detail(owner, job["id"])
    assert done["status"] == "completed", done.get("error")
    summary = done["summary"]
    assert summary["created_items"] == 3
    assert summary["opening_movements"] == 2
    assert summary["categories_created"] == 3
    # 12 × 480 + 20 × 120 (the blank cost falls back to purchase_price).
    assert Decimal(summary["stock_value"]) == Decimal("8160.00")

    rice = Item.objects.get(tenant=tenant, sku="RICE-10")
    assert rice.category.name == "Rice" and rice.category.parent.name == "Grocery"
    dal = Item.objects.get(tenant=tenant, name="Toor Dal 1kg")
    assert dal.sku.startswith("TOOR-DAL-1KG-")  # minted by INV-01 BR-2
    service = Item.objects.get(tenant=tenant, name="Phone repair")
    assert service.track_stock is False
    opening = StockMovement.objects.get(item=rice)
    assert opening.movement_type == "opening"
    assert opening.qty == Decimal("12.000")
    assert opening.movement_date.isoformat() == "2026-04-01"
    assert ItemStock.objects.get(item=rice).on_hand == Decimal("12.000")

    out = StringIO()
    call_command("recalc_stock", stdout=out)
    assert "0 drifted" in out.getvalue()


def test_item_rules_are_reported_by_column(
    owner: Any, reference: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """FR-2's table: unknown unit, bad tax code, MRP on a service, tracked service,
    a nested category, fractional quantity for a whole-number unit, bad barcode."""
    rows = [
        HEADER,
        "A item,goods,,,,KILO,,GST5,,,,,,,,,,",
        "B item,goods,,,,NOS,,GST99,,,,,,,,,,",
        "C item,service,,,,NOS,,GST18,,,100,120,yes,,,,,",
        "D item,goods,,,A > B > C,NOS,,,,,,,,,,,,",
        "E item,goods,,,,NOS,,,,,,,yes,,2.5,10,,",
        "F item,goods,,8.90123E+12,,NOS,,,,,,,,,,,,",
        "G item,goods,,,,NOS,,GST18,no,100,200,150,,,,,,",
    ]
    job = _ready(owner, "\n".join(rows), django_capture_on_commit_callbacks)
    got = {(e["row"], e["column"], e["code"]) for e in job["errors"]}
    assert (2, "unit", "unknown_unit") in got
    assert (3, "tax_code", "invalid_tax_code") in got
    assert (4, "mrp", "mrp_not_allowed") in got
    assert (4, "track_stock", "track_stock_not_allowed") in got
    assert (5, "category", "nesting_too_deep") in got
    assert (6, "opening_stock_qty", "qty_must_be_whole") in got
    assert (7, "barcode", "invalid_barcode") in got
    assert (8, "mrp", "selling_price_above_mrp") in got
    unknown = next(e for e in job["errors"] if e["code"] == "unknown_unit")
    assert unknown["message"] == "Unit KILO not found — add it in Settings first."


def test_existing_and_repeated_codes_are_errors(
    owner: Any, tenant: Any, reference: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """BR-1 / BR-2 — an SKU in the book, and a barcode repeated within the file."""
    first = _ready(owner, GOOD, django_capture_on_commit_callbacks)
    commit(owner, first["id"], django_capture_on_commit_callbacks)
    rows = [
        HEADER,
        "Other rice,goods,RICE-10,,,NOS,,,,,,,,,,,,",
        "One,goods,,4006381333931,,NOS,,,,,,,,,,,,",
        "Two,goods,,4006381333931,,NOS,,,,,,,,,,,,",
    ]
    job = _ready(owner, "\n".join(rows), django_capture_on_commit_callbacks)
    got = {(e["row"], e["column"], e["code"]) for e in job["errors"]}
    assert (2, "sku", "duplicate_sku") in got
    assert (4, "barcode", "duplicate_in_file") in got


def test_items_import_needs_item_write_and_staff_cannot_by_default(
    tenant: Any, api_as: Any, reference: Any
) -> None:
    """Staff do not hold `inventory.item.write` by default (canon §0.9)."""
    staff, _ = api_as(tenant, role="staff")
    assert upload(staff, "items", GOOD, name="items.csv").status_code == 403
    # …but may still read the template, which is `inventory.item.read`.
    from django.urls import reverse

    assert staff.get(reverse("v1:import-template", args=["items"])).status_code == 200


def test_the_items_template_round_trips(
    owner: Any, reference: Any, django_capture_on_commit_callbacks: Any
) -> None:
    """An untouched template validates: the comment line is skipped and the two
    example rows are flagged `example_row` rather than silently accepted."""
    from django.urls import reverse

    body = owner.get(reverse("v1:import-template", args=["items"])).content
    job = _ready(owner, body.decode("utf-8"), django_capture_on_commit_callbacks)
    assert job["status"] == "ready"
    assert job["total_rows"] == 2
    assert [w["code"] for w in job["warnings"]].count("example_row") == 2
