"""INV-09 — the items mapper.

Validation judges each row from lookups `preflight` loaded once — units by code,
categories by lower-cased path, the GST codes in force today, the HSN master,
the SKUs and barcodes already in the book — so a 5,000-row file issues no query
per row (INV-09 §5). The commit then calls `create_item()` per row, in file
order, which is the code path `POST /items` uses: it re-validates every rule
authoritatively, mints blank SKUs by INV-01 BR-2 (file order decides the
numbering, FR-3) and posts the opening movement through inventory's own
`post_movement()` in the same transaction. Nothing here writes a model.

Categories named in the sheet are created first, in one pass, through
`create_category()` (BR-3: `Grocery` → top level, `Grocery > Rice` → a child,
the parent made too if missing). Units are never created (BR-4, UQC discipline).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.imports.registry import ColumnSpec, ImporterSpec, RowResult, register
from apps.imports.services import coerce
from apps.imports.services.coerce import CoerceError

ITEM_TYPES = ("goods", "service")
CATEGORY_SEPARATOR = ">"
#: FR-7 — items cap lower than the framework's 10,000.
MAX_ITEM_ROWS = 5_000

COLUMNS = (
    ColumnSpec(
        "name", required=True, help="required; up to 160 characters", aliases=("item_name", "item")
    ),
    ColumnSpec("item_type", help="goods or service (default goods)", aliases=("type",)),
    ColumnSpec(
        "sku",
        help="blank to generate one; letters, digits and . _ / -",
        aliases=("item_code", "code"),
    ),
    ColumnSpec(
        "barcode",
        help="4 to 48 letters or digits; format the column as Text",
        aliases=("ean", "upc"),
    ),
    ColumnSpec("category", help="a name, or Parent > Child; created if missing"),
    ColumnSpec(
        "unit",
        required=True,
        help="a unit code such as NOS, KGS, LTR — add new units in Settings first",
        aliases=("uom", "unit_code"),
    ),
    ColumnSpec(
        "hsn_sac", help="4, 6 or 8 digits (SAC starts with 99)", aliases=("hsn", "sac", "hsn_code")
    ),
    ColumnSpec(
        "tax_code", help="GST0, GST5, GST18 … (default GST0)", aliases=("gst", "gst_rate", "tax")
    ),
    ColumnSpec(
        "tax_inclusive_selling", help="yes or no (default no)", aliases=("price_includes_tax",)
    ),
    ColumnSpec(
        "purchase_price",
        help="amount, e.g. 420.00",
        aliases=("cost_price", "purchase"),
        kind="money",
    ),
    ColumnSpec(
        "selling_price",
        help="amount, e.g. 450.00",
        aliases=("sale_price", "price", "rate"),
        kind="money",
    ),
    ColumnSpec("mrp", help="amount; goods only", kind="money"),
    ColumnSpec(
        "track_stock", help="yes or no (default yes for goods)", aliases=("track_inventory",)
    ),
    ColumnSpec(
        "reorder_point",
        help="quantity at which to reorder",
        aliases=("reorder_level", "min_stock"),
        kind="qty",
    ),
    ColumnSpec(
        "opening_stock_qty",
        help="quantity in hand today",
        aliases=("opening_qty", "opening_stock", "stock", "quantity"),
        kind="qty",
    ),
    ColumnSpec(
        "opening_stock_unit_cost",
        help="cost per unit; blank uses purchase_price",
        aliases=("opening_cost", "unit_cost"),
        kind="money",
    ),
    ColumnSpec(
        "opening_stock_date",
        help="dd/mm/yyyy; blank means today",
        aliases=("opening_as_of", "opening_date"),
        kind="date",
    ),
    ColumnSpec("description", help="up to 2000 characters", aliases=("notes",)),
)

TEMPLATE_ROWS = (
    {
        "name": "Basmati Rice 5kg",
        "item_type": "goods",
        "barcode": "8901234567890",
        "category": "Grocery",
        "unit": "NOS",
        "hsn_sac": "1006",
        "tax_code": "GST5",
        "tax_inclusive_selling": "false",
        "purchase_price": "420.00",
        "selling_price": "450.00",
        "mrp": "480.00",
        "track_stock": "true",
        "reorder_point": "5",
        "opening_stock_qty": "10",
        "opening_stock_unit_cost": "400.0000",
        "opening_stock_date": "2026-04-01",
    },
    {
        "name": "Repair service",
        "item_type": "service",
        "unit": "NOS",
        "hsn_sac": "998719",
        "tax_code": "GST18",
        "tax_inclusive_selling": "false",
        "purchase_price": "0",
        "selling_price": "500.00",
        "track_stock": "false",
    },
)


def preflight(tenant: Any) -> dict:
    from django.db.models import Q

    from apps.common.dates import tenant_today
    from apps.inventory.models import Category, Item, Unit
    from apps.tax.models import HsnCode
    from apps.tax.selectors.rates import rates_on

    today = tenant_today(tenant)
    units: dict[str, Any] = {}
    # System first, then the tenant's own — a tenant code never shadows a UQC
    # (create_unit refuses that), so the order only matters for determinism.
    for unit in Unit.objects.filter(Q(tenant__isnull=True) | Q(tenant=tenant)).order_by(
        "-is_system"
    ):
        units.setdefault(unit.code.upper(), unit)
    categories: dict[str, Any] = {}
    rows = list(Category.objects.filter(tenant=tenant).select_related("parent"))
    for category in rows:
        if category.parent_id is None:
            categories[category.name.lower()] = category
    for category in rows:
        if category.parent_id is not None and category.parent is not None:
            categories[f"{category.parent.name.lower()}>{category.name.lower()}"] = category
    skus = set()
    barcodes = set()
    for sku, barcode in (
        Item.objects.filter(tenant=tenant).values_list("sku", "barcode").iterator(chunk_size=2000)
    ):
        if sku:
            skus.add(sku.lower())
        if barcode:
            barcodes.add(barcode)
    return {
        "tenant": tenant,
        "today": today,
        "units": units,
        "categories": categories,
        "rates": {
            row["code"]: Decimal(str(row["rate"])) for row in rates_on(tenant=tenant, on_date=today)
        },
        "hsn": set(HsnCode.objects.values_list("code", flat=True)),
        "skus": skus,
        "barcodes": barcodes,
        #: `path → (display parent, display child)` for the categories to create.
        "new_categories": {},
        "names": 0,
        "existing_names": _existing_names(tenant),
        "stock_value": Decimal("0.00"),
    }


def _existing_names(tenant: Any) -> set[str]:
    from apps.inventory.models import Item

    return {
        name.lower()
        for name in Item.objects.filter(tenant=tenant)
        .values_list("name", flat=True)
        .iterator(chunk_size=2000)
    }


def _category_path(raw: str) -> tuple[str, str | None] | None:
    """`Grocery` → (`Grocery`, None); `Grocery > Rice` → (`Grocery`, `Rice`)."""
    from apps.inventory.constants import CATEGORY_NAME_MAX_LENGTH
    from apps.inventory.services.parsing import clean_text

    if coerce.is_blank(raw):
        return None
    parts = [clean_text(part) for part in coerce.text(raw).split(CATEGORY_SEPARATOR)]
    if len(parts) > 2:
        raise CoerceError("nesting_too_deep", "Only one level of sub-categories: Parent > Child.")
    if any(not part for part in parts):
        raise CoerceError("invalid_category", "Write the category as Parent > Child.")
    if any(len(part) > CATEGORY_NAME_MAX_LENGTH for part in parts):
        raise CoerceError(
            "max_length", f"Keep each category under {CATEGORY_NAME_MAX_LENGTH} characters."
        )
    return parts[0], (parts[1] if len(parts) == 2 else None)


def validate_row(ctx: dict, row: dict[str, str], number: int) -> RowResult:
    """INV-09 FR-2's table, every field reported."""
    from apps.inventory.constants import (
        BARCODE_MAX_LENGTH,
        BARCODE_MIN_LENGTH,
        DEFAULT_TAX_CODE,
        DESCRIPTION_MAX_LENGTH,
        MAX_AMOUNT,
        MAX_QTY,
        MAX_UNIT_COST,
        NAME_MAX_LENGTH,
        SKU_MAX_LENGTH,
    )
    from apps.inventory.services.items import (
        BARCODE_RE,
        HSN_GOODS_RE,
        HSN_SERVICE_RE,
        SKU_RE,
        ean_upc_checksum_ok,
    )
    from apps.inventory.services.parsing import clean_text
    from apps.inventory.services.stock import validate_qty_for_unit

    result = RowResult()
    clean: dict[str, Any] = {}

    def attempt(column: str, fn: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(row.get(column, ""), *args, **kwargs)
        except CoerceError as exc:
            result.error(column, exc.code, exc.message)
            return None

    name = clean_text(coerce.text(row.get("name")))
    if not name:
        result.error("name", "required", "Name is required.")
    elif len(name) > NAME_MAX_LENGTH:
        result.error("name", "max_length", f"Keep the name under {NAME_MAX_LENGTH} characters.")
    clean["name"] = name
    if name and name.lower() in ctx["existing_names"]:
        ctx["names"] += 1

    item_type = (
        attempt("item_type", coerce.choice, ITEM_TYPES, message="Use goods or service.") or "goods"
    )
    clean["item_type"] = item_type
    is_service = item_type == "service"

    # ── unit: matched, never created (BR-4) ──────────────────────────────────
    unit = None
    raw_unit = coerce.text(row.get("unit")).upper().replace(" ", "")
    if not raw_unit:
        result.error("unit", "required", "Unit is required — for example NOS.")
    else:
        unit = ctx["units"].get(raw_unit)
        if unit is None:
            result.error(
                "unit", "unknown_unit", f"Unit {raw_unit} not found — add it in Settings first."
            )
        else:
            clean["unit_id"] = str(unit.id)

    # ── category: matched or queued for creation (BR-3) ──────────────────────
    path = attempt("category", _category_path)
    category_label = None
    if path:
        parent, child = path
        key = parent.lower() if child is None else f"{parent.lower()}>{child.lower()}"
        category_label = parent if child is None else f"{parent} > {child}"
        existing = ctx["categories"].get(key)
        if existing is not None:
            clean["category_id"] = str(existing.id)
        else:
            if key not in ctx["new_categories"]:
                ctx["new_categories"][key] = (parent, child)
                result.warn(
                    "category", "category_created", f"Category {category_label} will be created."
                )
            clean["category_key"] = key

    # ── codes ────────────────────────────────────────────────────────────────
    sku = coerce.text(row.get("sku")).replace(" ", "")
    if sku and not coerce.is_blank(sku):
        if len(sku) > SKU_MAX_LENGTH or not SKU_RE.match(sku):
            result.error(
                "sku", "invalid_sku", "Use letters, digits and . _ / - only, up to 48 characters."
            )
        elif sku.lower() in ctx["skus"]:
            result.error("sku", "duplicate_sku", "SKU already exists.")
        clean["sku"] = sku
    barcode = coerce.text(row.get("barcode"))
    if barcode and not coerce.is_blank(barcode):
        if coerce.SCIENTIFIC.match(barcode):
            result.error(
                "barcode",
                "invalid_barcode",
                "Excel shortened this barcode — format the column as Text.",
            )
        elif not (BARCODE_MIN_LENGTH <= len(barcode) <= BARCODE_MAX_LENGTH) or not BARCODE_RE.match(
            barcode
        ):
            result.error(
                "barcode", "invalid_barcode", "Barcodes are 4–48 letters, digits or dashes."
            )
        elif barcode in ctx["barcodes"]:
            result.error("barcode", "duplicate_barcode", "Barcode already exists.")
        elif ean_upc_checksum_ok(barcode) is False:
            result.warn(
                "barcode", "barcode_checksum", "Check digit doesn't match — scanned correctly?"
            )
        clean["barcode"] = barcode

    hsn = coerce.text(row.get("hsn_sac")).replace(" ", "")
    if hsn and not coerce.is_blank(hsn):
        if is_service and not HSN_SERVICE_RE.match(hsn):
            result.error("hsn_sac", "invalid_sac", "SAC must start with 99 and be 4 or 6 digits.")
        elif not is_service and not HSN_GOODS_RE.match(hsn):
            result.error("hsn_sac", "invalid_hsn", "HSN must be 4, 6 or 8 digits.")
        elif hsn not in ctx["hsn"] and hsn[:4] not in ctx["hsn"]:
            result.warn("hsn_sac", "hsn_unknown", "Code not in the HSN list — double-check.")
        clean["hsn_sac"] = hsn

    tax_code = coerce.text(row.get("tax_code")).upper().replace(" ", "") or DEFAULT_TAX_CODE
    if tax_code not in ctx["rates"]:
        result.error(
            "tax_code", "invalid_tax_code", "Unknown or expired GST code — use GST0, GST5, GST18 …"
        )
    clean["tax_code"] = tax_code
    inclusive = attempt("tax_inclusive_selling", coerce.boolean)
    clean["tax_inclusive_selling"] = bool(inclusive)

    # ── prices ───────────────────────────────────────────────────────────────
    maximum = Decimal(MAX_AMOUNT)
    purchase = attempt("purchase_price", coerce.money, maximum=maximum)
    selling = attempt("selling_price", coerce.money, maximum=maximum)
    mrp = attempt("mrp", coerce.money, maximum=maximum)
    clean["purchase_price"] = str(purchase if purchase is not None else Decimal("0.00"))
    clean["selling_price"] = str(selling if selling is not None else Decimal("0.00"))
    if mrp is not None:
        if is_service:
            result.error("mrp", "mrp_not_allowed", "MRP applies to goods only.")
        else:
            clean["mrp"] = str(mrp)
            inclusive_price = selling or Decimal("0")
            if not inclusive and tax_code in ctx["rates"]:
                inclusive_price = (inclusive_price * (1 + ctx["rates"][tax_code] / 100)).quantize(
                    Decimal("0.01")
                )
            if inclusive_price > mrp:
                result.error("mrp", "selling_price_above_mrp", "Selling price cannot exceed MRP.")

    # ── stock ────────────────────────────────────────────────────────────────
    track = attempt("track_stock", coerce.boolean)
    if track is None:
        track = not is_service
    if track and is_service:
        result.error("track_stock", "track_stock_not_allowed", "Services cannot track stock.")
        track = False
    clean["track_stock"] = track
    allow_decimal = bool(unit.allow_decimal) if unit is not None else True
    unit_code = unit.code if unit is not None else raw_unit

    reorder = attempt("reorder_point", coerce.quantity, maximum=Decimal(MAX_QTY))
    if reorder is not None:
        if validate_qty_for_unit(reorder, allow_decimal=allow_decimal):
            result.error(
                "reorder_point",
                "qty_must_be_whole",
                f"Reorder point must be a whole number for {unit_code}.",
            )
        elif track:
            clean["reorder_point"] = str(reorder)

    qty = attempt("opening_stock_qty", coerce.quantity, maximum=Decimal(MAX_QTY))
    cost = attempt("opening_stock_unit_cost", coerce.unit_cost, maximum=Decimal(MAX_UNIT_COST))
    as_of = attempt("opening_stock_date", coerce.date_value, today=ctx["today"])
    if qty is not None:
        if qty <= 0:
            result.error(
                "opening_stock_qty", "invalid_qty", "Opening quantity must be more than zero."
            )
        elif not track:
            result.error(
                "opening_stock_qty",
                "track_stock_not_allowed",
                "Turn on track_stock to add opening stock.",
            )
        elif validate_qty_for_unit(qty, allow_decimal=allow_decimal):
            result.error(
                "opening_stock_qty",
                "qty_must_be_whole",
                f"Quantity must be a whole number for {unit_code}.",
            )
        else:
            unit_cost = cost if cost is not None else purchase
            if unit_cost is None:
                result.error(
                    "opening_stock_unit_cost",
                    "required",
                    "Enter a cost per unit, or a purchase_price.",
                )
            else:
                clean["opening_stock"] = {
                    "qty": str(qty),
                    "unit_cost": str(unit_cost),
                    "as_of": (as_of or ctx["today"]).isoformat(),
                }
                ctx["stock_value"] += (qty * unit_cost).quantize(Decimal("0.01"))

    description = attempt("description", coerce.optional_text, max_length=DESCRIPTION_MAX_LENGTH)
    if description:
        clean["description"] = description

    result.clean = clean
    result.preview = {
        "name": name,
        "item_type": item_type,
        "sku": clean.get("sku") or "auto",
        "barcode": clean.get("barcode"),
        "category": category_label,
        "unit": unit_code or None,
        "tax_code": tax_code,
        "purchase_price": clean["purchase_price"],
        "selling_price": clean["selling_price"],
        "mrp": clean.get("mrp"),
        "track_stock": track,
        "opening_stock_qty": clean["opening_stock"]["qty"] if "opening_stock" in clean else None,
        "opening_stock_unit_cost": (
            clean["opening_stock"]["unit_cost"] if "opening_stock" in clean else None
        ),
    }
    return result


def _create_categories(ctx: dict, service_ctx: Any) -> tuple[dict[str, str], int]:
    """Every queued category, parents first, through `create_category()`."""
    from apps.inventory.services.masters import create_category

    ids: dict[str, str] = {}
    created = 0
    for key, (parent_name, child_name) in sorted(
        ctx["new_categories"].items(), key=lambda pair: pair[1][1] is not None
    ):
        parent_key = parent_name.lower()
        if parent_key not in ids:
            existing = ctx["categories"].get(parent_key)
            if existing is not None:
                ids[parent_key] = str(existing.id)
            else:
                parent, made = create_category(ctx=service_ctx, name=parent_name)
                ids[parent_key] = str(parent.id)
                created += int(made)
        if child_name is not None:
            child, made = create_category(
                ctx=service_ctx, name=child_name, parent_id=ids[parent_key]
            )
            ids[key] = str(child.id)
            created += int(made)
    return ids, created


def commit_rows(ctx: dict, service_ctx: Any, rows: list[tuple[int, dict]], progress: Any) -> dict:
    """Masters first, then `create_item()` per row in file order (FR-3)."""
    from apps.common.money import q2
    from apps.inventory.services.items import create_item

    category_ids, categories_created = _create_categories(ctx, service_ctx)
    created = 0
    openings = 0
    stock_value = Decimal("0.00")
    for index, (_number, clean) in enumerate(rows, start=1):
        payload = {k: v for k, v in clean.items() if k != "category_key"}
        if clean.get("category_key"):
            payload["category_id"] = category_ids[clean["category_key"]]
        create_item(ctx=service_ctx, payload=payload)
        created += 1
        opening = clean.get("opening_stock")
        if opening:
            openings += 1
            stock_value += q2(Decimal(opening["qty"]) * Decimal(opening["unit_cost"]))
        progress(index)
    return {
        "created_items": created,
        "opening_movements": openings,
        "categories_created": categories_created,
        "stock_value": str(stock_value),
    }


def preview_totals(ctx: dict) -> dict:
    """FR-5/FR-9 — categories that will be created, and the opening stock value."""
    return {
        "categories_to_create": sorted(
            parent if child is None else f"{parent} > {child}"
            for parent, child in ctx["new_categories"].values()
        )[:50],
        "categories_created": len(ctx["new_categories"]),
        "stock_value": str(ctx["stock_value"]),
        "existing_names": ctx["names"],
    }


SPEC = register(
    ImporterSpec(
        kind="items",
        label="imports.kind.items",
        columns=COLUMNS,
        template_rows=TEMPLATE_ROWS,
        # INV-05's opening stock is part of creating an item on this route
        # (`POST /items` takes it with `inventory.item.write` alone), so the
        # import asks for the same codename and not `inventory.stock.adjust`.
        required_permissions=("inventory.item.write",),
        read_permission="inventory.item.read",
        preflight=preflight,
        validate_row=validate_row,
        commit_rows=commit_rows,
        unique_columns=("sku", "barcode"),
        max_rows=MAX_ITEM_ROWS,
        modules=("inventory",),
        summary_fields=("created_items", "opening_movements", "categories_created", "stock_value"),
        records_route="/items",
        totals=preview_totals,
    )
)
