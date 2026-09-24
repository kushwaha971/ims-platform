"""INV-01 / INV-02 / INV-05 — the item master and its opening stock (fat service).

Everything that decides anything about an item is here: validation that mirrors
the client's `itemSchema`, the auto-SKU algorithm (BR-2), the `track_stock`
transition guards (FR-8), the opening movement (INV-05) and archive/restore.
The viewset authenticates, authorises and delegates.

── Deliberately NOT here, with reasons ──────────────────────────────────────
**Image upload (FR-10).** `files_attachment` belongs to the files track and has
no table on this branch; `image_attachment_id` is a nullable column so the
upload lands as a service change. **Module toggle `inventory.enabled` (BR-10)**
is the `ModuleEnabled` gate on the routes, not a per-field rule here.
"""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion, ValidationFailed
from apps.common.money import q2, q3, q4
from apps.inventory.constants import (
    BARCODE_MAX_LENGTH,
    BARCODE_MIN_LENGTH,
    DEFAULT_TAX_CODE,
    DEFAULT_UNIT_CODE,
    DESCRIPTION_MAX_LENGTH,
    MAX_AMOUNT,
    MAX_QTY,
    MAX_UNIT_COST,
    NAME_MAX_LENGTH,
    SKU_FALLBACK_PREFIX,
    SKU_MAX_LENGTH,
    SKU_PREFIX_MAX,
    SKU_RETRIES,
    AlertTrigger,
    ItemStatus,
    ItemType,
    MovementSource,
    MovementType,
)
from apps.inventory.models import Category, Item, ItemStock, StockMovement, Unit
from apps.inventory.services.parsing import (
    Errors,
    clean_text,
    parse_bool,
    parse_date,
    parse_decimal,
)
from apps.inventory.services.stock import (
    MovementLine,
    default_location,
    ensure_stock_rows,
    lock_stock_rows,
    post_movement,
    validate_qty_for_unit,
)

SKU_RE = re.compile(r"^[A-Za-z0-9._/-]+$")
BARCODE_RE = re.compile(r"^[A-Za-z0-9-]+$")
HSN_GOODS_RE = re.compile(r"^\d{4}(\d{2}(\d{2})?)?$")
HSN_SERVICE_RE = re.compile(r"^99\d{2}(\d{2})?$")

#: The fields a PATCH may carry. `item_type` is accepted only to refuse a change.
EDITABLE_FIELDS = (
    "name",
    "item_type",
    "category_id",
    "unit_id",
    "sku",
    "barcode",
    "hsn_sac",
    "tax_code",
    "tax_inclusive_selling",
    "selling_price",
    "purchase_price",
    "mrp",
    "track_stock",
    "reorder_point",
    "description",
)

AUDITED_FIELDS = EDITABLE_FIELDS


# ── BR-2: the auto-SKU algorithm ─────────────────────────────────────────────


def sku_prefix(name: str) -> str:
    """(a)–(c): NFKD, upper-case, non-[A-Z0-9] runs → `-`, ≤ 12, else `ITEM`."""
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).upper()
    text = re.sub(r"[^A-Z0-9]+", "-", text).strip("-")
    text = text[:SKU_PREFIX_MAX].rstrip("-")
    return text or SKU_FALLBACK_PREFIX


def next_sku(*, tenant: Any, prefix: str) -> str:
    """(d): the highest numeric suffix among `^<prefix>-(\\d{3,})$` plus one.

    Soft-deleted items are included: BR-1 frees a deleted item's SKU for reuse
    by hand, but the generator never re-mints a number that once meant a
    different item on some old printout.
    """
    pattern = rf"^{re.escape(prefix)}-(\d{{3,}})$"
    highest = 0
    for sku in Item.all_objects.filter(tenant=tenant, sku__regex=pattern).values_list(
        "sku", flat=True
    ):
        highest = max(highest, int(sku.rsplit("-", 1)[1]))
    return f"{prefix}-{str(highest + 1).zfill(3)}"


def suggest_sku(*, tenant: Any, name: str) -> str:
    return next_sku(tenant=tenant, prefix=sku_prefix(name))


# ── validation ──────────────────────────────────────────────────────────────


def ean_upc_checksum_ok(code: str) -> bool | None:
    """True/False for a 12/13-digit code, None when the rule does not apply."""
    if not code.isdigit() or len(code) not in (12, 13):
        return None
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    # Weights alternate 3,1 from the digit next to the check digit.
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return (10 - total % 10) % 10 == check


def _resolve_unit(tenant: Any, unit_id: Any) -> Unit | None:
    """System or this tenant's unit. Another tenant's id is simply not found (§19)."""
    if not unit_id:
        return None
    try:
        return Unit.objects.filter(Q(tenant__isnull=True) | Q(tenant=tenant), pk=unit_id).first()
    except (ValueError, TypeError, DjangoValidationError):  # a malformed uuid is "not found"
        return None


def _resolve_category(tenant: Any, category_id: Any) -> Category | None:
    try:
        return Category.objects.filter(tenant=tenant, pk=category_id).first()
    except (ValueError, TypeError, DjangoValidationError):
        return None


def default_unit(tenant: Any) -> Unit | None:
    return Unit.objects.filter(tenant__isnull=True, code=DEFAULT_UNIT_CODE).first()


def _validate(*, ctx: Ctx, data: dict, item: Item | None) -> tuple[dict, Errors, list[dict]]:
    """Every §10 rule, collected. `item` is None on create; on edit `data` is partial.

    Returns `(cleaned, errors, warnings)`. `cleaned` holds only keys present in
    `data` (or defaulted on create).
    """
    from apps.tax.selectors.rates import code_exists, hsn_known, rate_for

    errors = Errors()
    warnings: list[dict] = []
    cleaned: dict[str, Any] = {}
    creating = item is None

    def has(key: str) -> bool:
        return creating or key in data

    def current(key: str) -> Any:
        return cleaned[key] if key in cleaned else getattr(item, key, None)

    if has("name"):
        name = clean_text(data.get("name"))
        if not name:
            errors.add("name", "Enter an item name.", "required")
        elif len(name) > NAME_MAX_LENGTH:
            errors.add("name", f"Keep the name under {NAME_MAX_LENGTH} characters.", "max_length")
        cleaned["name"] = name

    if creating:
        item_type = data.get("item_type") or ItemType.GOODS
        if item_type not in ItemType.values:
            errors.add("item_type", "Choose Goods or Service.", "invalid_choice")
            item_type = ItemType.GOODS
        cleaned["item_type"] = item_type
    elif "item_type" in data and data["item_type"] != item.item_type:
        # INV-05 EC-5 — immutable after create; the answer is a new item.
        raise BusinessRuleViolation(
            "item_type_locked",
            "You cannot change the item type now.",
            details={"item_id": str(item.id)},
        )
    item_type = cleaned.get("item_type") or item.item_type
    is_service = item_type == ItemType.SERVICE

    if has("unit_id"):
        unit = _resolve_unit(ctx.tenant, data.get("unit_id")) if data.get("unit_id") else None
        if unit is None and creating and not data.get("unit_id"):
            unit = default_unit(ctx.tenant)
        if unit is None:
            if data.get("unit_id"):
                errors.add("unit_id", "Unit not found.", "not_found")
            else:
                errors.add("unit_id", "Choose a unit.", "required")
        cleaned["unit"] = unit

    if has("category_id"):
        raw = data.get("category_id")
        category = None
        if raw:
            category = _resolve_category(ctx.tenant, raw)
            if category is None:
                errors.add("category_id", "Category not found.", "not_found")
        cleaned["category"] = category

    if has("sku"):
        sku = clean_text(data.get("sku") or "").replace(" ", "")
        if sku:
            if len(sku) > SKU_MAX_LENGTH or not SKU_RE.match(sku):
                errors.add(
                    "sku",
                    "Use letters, digits and . _ / - only, up to 48 characters.",
                    "invalid_sku",
                )
        elif not creating:
            errors.add("sku", "An item needs a SKU.", "required")
        cleaned["sku"] = sku or None

    if has("barcode"):
        barcode = (data.get("barcode") or "").strip() or None
        if barcode is not None:
            if not (
                BARCODE_MIN_LENGTH <= len(barcode) <= BARCODE_MAX_LENGTH
            ) or not BARCODE_RE.match(barcode):
                errors.add(
                    "barcode", "Barcodes are 4–48 letters, digits or dashes.", "invalid_barcode"
                )
            elif ean_upc_checksum_ok(barcode) is False:
                warnings.append(
                    {
                        "code": "barcode_checksum",
                        "field": "barcode",
                        "message": "Check digit doesn't match — scanned correctly?",
                    }
                )
        cleaned["barcode"] = barcode

    if has("hsn_sac"):
        hsn = (data.get("hsn_sac") or "").strip() or None
        if hsn is not None:
            if is_service and not HSN_SERVICE_RE.match(hsn):
                errors.add("hsn_sac", "SAC must start with 99 and be 4 or 6 digits.", "invalid_sac")
            elif not is_service and not HSN_GOODS_RE.match(hsn):
                errors.add("hsn_sac", "HSN must be 4, 6 or 8 digits.", "invalid_hsn")
            elif not hsn_known(hsn) and not hsn_known(hsn[:4]):
                warnings.append(
                    {
                        "code": "hsn_unknown",
                        "field": "hsn_sac",
                        "message": "Code not in HSN master — double-check.",
                    }
                )
        cleaned["hsn_sac"] = hsn

    if has("tax_code"):
        tax_code = (data.get("tax_code") or "").strip() or (DEFAULT_TAX_CODE if creating else "")
        today = tenant_today(ctx.tenant)
        already_on_item = item is not None and item.tax_code == tax_code
        if not tax_code or not code_exists(tenant=ctx.tenant, code=tax_code):
            errors.add("tax_code", "Select a GST rate.", "invalid_tax_code")
        elif rate_for(tenant=ctx.tenant, code=tax_code, on_date=today) is None:
            if already_on_item:
                warnings.append(
                    {
                        "code": "tax_rate_legacy",
                        "field": "tax_code",
                        "message": "This rate has ended — update recommended.",
                    }
                )
            else:
                errors.add("tax_code", "This GST rate is no longer in force.", "invalid_tax_code")
        cleaned["tax_code"] = tax_code

    if has("tax_inclusive_selling"):
        cleaned["tax_inclusive_selling"] = parse_bool(data.get("tax_inclusive_selling"), False)

    for key in ("selling_price", "purchase_price"):
        if has(key):
            value = parse_decimal(
                data.get(key), path=key, errors=errors, places=2, maximum=MAX_AMOUNT
            )
            cleaned[key] = q2(value) if value is not None else Decimal("0.00")

    if has("mrp"):
        mrp = parse_decimal(
            data.get("mrp"), path="mrp", errors=errors, places=2, maximum=MAX_AMOUNT
        )
        if mrp is not None and is_service:
            errors.add("mrp", "MRP applies to goods only.", "mrp_not_allowed")
        cleaned["mrp"] = q2(mrp) if mrp is not None else None

    if has("track_stock"):
        track = parse_bool(data.get("track_stock"), not is_service)
        if track and is_service:
            errors.add("track_stock", "Services cannot track stock.", "track_stock_not_allowed")
        cleaned["track_stock"] = track and not is_service
    elif creating:
        cleaned["track_stock"] = not is_service

    unit = cleaned.get("unit") if "unit" in cleaned else (item.unit if item else None)
    allow_decimal = bool(unit.allow_decimal) if unit is not None else True

    if has("reorder_point"):
        rp = parse_decimal(
            data.get("reorder_point"),
            path="reorder_point",
            errors=errors,
            places=3,
            maximum=MAX_QTY,
            code="invalid_qty",
            message="Enter a valid quantity.",
        )
        if rp is not None:
            if validate_qty_for_unit(rp, allow_decimal=allow_decimal):
                errors.add(
                    "reorder_point",
                    f"Reorder point must be a whole number for {unit.code}.",
                    "qty_must_be_whole",
                )
            if not current("track_stock"):
                rp = None  # only meaningful with tracking; dropped rather than refused
        cleaned["reorder_point"] = q3(rp) if rp is not None else None

    if has("description"):
        description = clean_text(data.get("description") or "", multiline=True)
        if len(description) > DESCRIPTION_MAX_LENGTH:
            errors.add(
                "description", f"Keep it under {DESCRIPTION_MAX_LENGTH} characters.", "max_length"
            )
        cleaned["description"] = description

    # Cross-field: selling ≤ MRP, compared tax-inclusive (§10).
    mrp = current("mrp")
    selling = current("selling_price")
    if mrp is not None and selling is not None and not errors.details.get("mrp"):
        inclusive = selling
        if not current("tax_inclusive_selling"):
            rate = rate_for(
                tenant=ctx.tenant,
                code=current("tax_code") or DEFAULT_TAX_CODE,
                on_date=tenant_today(ctx.tenant),
            )
            if rate is not None:
                inclusive = q2(selling * (1 + rate.rate / 100))
        if inclusive > mrp:
            errors.add(
                "selling_price", "Selling price cannot exceed MRP.", "selling_price_above_mrp"
            )

    return cleaned, errors, warnings


def _parse_opening(
    *, ctx: Ctx, raw: Any, unit: Unit | None, fallback_cost: Decimal | None, errors: Errors
) -> dict | None:
    if not raw:
        return None
    if not isinstance(raw, dict):
        errors.add("opening_stock", "Opening stock must be an object.", "invalid")
        return None
    allow_decimal = bool(unit.allow_decimal) if unit is not None else True
    qty = parse_decimal(
        raw.get("qty"),
        path="opening_stock.qty",
        errors=errors,
        places=3,
        maximum=MAX_QTY,
        required=True,
        allow_zero=False,
        code="invalid_qty",
        message="Enter opening quantity.",
    )
    if qty is not None and validate_qty_for_unit(qty, allow_decimal=allow_decimal):
        errors.add(
            "opening_stock.qty",
            f"Quantity must be a whole number for {unit.code}.",
            "qty_must_be_whole",
        )
    raw_cost = raw.get("unit_cost")
    if raw_cost in (None, "") and fallback_cost is not None:
        raw_cost = fallback_cost
    cost = parse_decimal(
        raw_cost,
        path="opening_stock.unit_cost",
        errors=errors,
        places=4,
        maximum=MAX_UNIT_COST,
        required=True,
        message="Enter cost per unit.",
    )
    as_of = raw.get("as_of") or tenant_today(ctx.tenant).isoformat()
    movement_date = parse_date(as_of, path="opening_stock.as_of", errors=errors, tenant=ctx.tenant)
    return {"qty": qty, "unit_cost": cost, "as_of": movement_date}


def _snapshot(item: Item) -> dict:
    return {
        "name": item.name,
        "item_type": item.item_type,
        "category_id": str(item.category_id) if item.category_id else None,
        "unit_id": str(item.unit_id),
        "sku": item.sku,
        "barcode": item.barcode,
        "hsn_sac": item.hsn_sac,
        "tax_code": item.tax_code,
        "tax_inclusive_selling": item.tax_inclusive_selling,
        "selling_price": str(item.selling_price),
        "purchase_price": str(item.purchase_price),
        "mrp": str(item.mrp) if item.mrp is not None else None,
        "track_stock": item.track_stock,
        "reorder_point": str(item.reorder_point) if item.reorder_point is not None else None,
        "description": item.description,
        "status": item.status,
    }


def _check_codes_free(
    *, tenant: Any, sku: str | None, barcode: str | None, exclude_id: Any = None
) -> None:
    """BR-1 — unique among non-deleted items; archived items still hold their codes."""
    base = Item.objects.filter(tenant=tenant)
    if exclude_id is not None:
        base = base.exclude(pk=exclude_id)
    if sku:
        other = base.filter(sku=sku).only("id", "name").first()
        if other is not None:
            raise BusinessRuleViolation(
                "duplicate_sku",
                "This SKU is already used.",
                details={
                    "sku": [f"SKU already used by {other.name}."],
                    "item_id": str(other.id),
                    "field_codes": {"sku": "duplicate_sku"},
                },
            )
    if barcode:
        other = base.filter(barcode=barcode).only("id", "name").first()
        if other is not None:
            raise BusinessRuleViolation(
                "barcode_exists",
                "This barcode is already used.",
                details={
                    "barcode": [f"Barcode already used by {other.name}."],
                    "item_id": str(other.id),
                    "item_name": other.name,
                    "field_codes": {"barcode": "barcode_exists"},
                },
            )


def _post_opening(*, ctx: Ctx, item: Item, opening: dict, path: str) -> StockMovement:
    """INV-05 — exactly one `opening` movement, always the item's first."""
    location = default_location(ctx.tenant)
    # Lock first, so the two checks below cannot race another first movement.
    ensure_stock_rows(tenant=ctx.tenant, pairs=[(item.id, location.id)])
    lock_stock_rows(tenant=ctx.tenant, pairs=[(item.id, location.id)])
    existing = StockMovement.objects.filter(item=item, location=location)
    opening_row = existing.filter(movement_type=MovementType.OPENING).only("id").first()
    if opening_row is not None:
        raise BusinessRuleViolation(
            "opening_exists",
            "This item already has an opening stock entry.",
            details={"movement_id": str(opening_row.id)},
        )
    count = existing.count()
    if count:
        raise BusinessRuleViolation(
            "item_has_movements",
            "This item already has stock history. Use Adjust stock instead.",
            details={"movement_count": count},
        )
    posted = post_movement(
        ctx=ctx,
        line=MovementLine(
            item=item,
            location=location,
            qty=opening["qty"],
            unit_cost=q4(opening["unit_cost"]),
            movement_type=MovementType.OPENING,
            movement_date=opening["as_of"],
            source_type=MovementSource.ITEM,
            source_id=item.id,
        ),
        # An opening is inbound; the negative policy cannot refuse it.
        allow_negative=True,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.STOCK_OPENING_POSTED,
        entity_type="inventory_stock_movement",
        entity_id=posted.movement.id,
        after={
            "item_id": str(item.id),
            "qty": str(posted.movement.qty),
            "unit_cost": str(posted.movement.unit_cost),
            "movement_date": posted.movement.movement_date.isoformat(),
        },
        metadata={"path": path},
    )
    return posted.movement


def _init_stock_row(*, ctx: Ctx, item: Item) -> None:
    """A tracked item gets its MAIN stock row at once, with its level initialised."""
    from apps.inventory.services.low_stock import initialise_level

    location = default_location(ctx.tenant)
    ensure_stock_rows(tenant=ctx.tenant, pairs=[(item.id, location.id)])
    stock = lock_stock_rows(tenant=ctx.tenant, pairs=[(item.id, location.id)])[
        (item.id, location.id)
    ]
    initialise_level(item=item, stock=stock)


# ── create / update ─────────────────────────────────────────────────────────


@transaction.atomic
def create_item(*, ctx: Ctx, payload: dict) -> dict:
    """FR-1/FR-2/FR-7 — `{item, warnings}`; opening stock in the same transaction."""
    cleaned, errors, warnings = _validate(ctx=ctx, data=payload, item=None)
    opening = None
    if payload.get("opening_stock"):
        if not cleaned.get("track_stock"):
            errors.add(
                "opening_stock",
                "Turn on stock tracking to add opening stock.",
                "track_stock_not_allowed",
            )
        else:
            opening = _parse_opening(
                ctx=ctx,
                raw=payload.get("opening_stock"),
                unit=cleaned.get("unit"),
                fallback_cost=cleaned.get("purchase_price"),
                errors=errors,
            )
    if errors:
        raise ValidationFailed(errors.payload())

    _check_codes_free(tenant=ctx.tenant, sku=cleaned.get("sku"), barcode=cleaned.get("barcode"))
    fields = {k: v for k, v in cleaned.items() if k not in ("sku",)}
    item = None
    if cleaned.get("sku"):
        item = _insert(ctx=ctx, fields=fields, sku=cleaned["sku"])
    else:
        prefix = sku_prefix(cleaned["name"])
        for _attempt in range(SKU_RETRIES + 1):
            candidate = next_sku(tenant=ctx.tenant, prefix=prefix)
            try:
                with transaction.atomic():
                    item = _insert(ctx=ctx, fields=fields, sku=candidate)
                break
            except IntegrityError as exc:
                if "uq_item_tenant_sku" not in str(exc):
                    raise
                continue
        if item is None:
            raise BusinessRuleViolation(
                "sku_generation_failed",
                "Couldn't generate a SKU. Enter one and save again.",
                details={},
            )

    if item.track_stock and opening is None:
        # Without an opening the row starts at 0 and its level is initialised
        # silently. WITH one it is left at `ok`, so the opening post is
        # evaluated like any movement and an opening at or below the reorder
        # point alerts (INV-05 BR-4) — initialising to `out` first would make
        # 0 → 3 look like a recovery and swallow it.
        _init_stock_row(ctx=ctx, item=item)
    write_audit(
        ctx=ctx,
        action=AuditAction.ITEM_CREATED,
        entity_type="inventory_item",
        entity_id=item.id,
        after=_snapshot(item),
        metadata={
            "has_opening_stock": opening is not None,
            "sku_generated": not cleaned.get("sku"),
        },
    )
    if opening is not None:
        _post_opening(ctx=ctx, item=item, opening=opening, path="create")
    return {"item": item, "warnings": warnings}


def _insert(*, ctx: Ctx, fields: dict, sku: str) -> Item:
    """Insert; a barcode race lost to a concurrent save becomes the 409 it should be."""
    try:
        with transaction.atomic():
            return Item.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if ctx.actor_type == "user" else None,
                sku=sku,
                **fields,
            )
    except IntegrityError as exc:
        if "uq_item_tenant_barcode" in str(exc):
            _check_codes_free(tenant=ctx.tenant, sku=None, barcode=fields.get("barcode"))
        raise


def lock_item(*, tenant: Any, item_id: Any) -> Item | None:
    try:
        return (
            Item.objects.select_for_update(of=("self",))
            .select_related("unit", "category")
            .filter(tenant=tenant, pk=item_id)
            .first()
        )
    except (ValueError, TypeError, DjangoValidationError):
        return None


@transaction.atomic
def update_item(*, ctx: Ctx, item_id: Any, payload: dict, can_adjust_stock: bool) -> dict:
    """FR-8 transitions, BR-8 unit lock, optimistic `version` — `{item, warnings}`."""
    item = lock_item(tenant=ctx.tenant, item_id=item_id)
    if item is None:
        raise NotFound("No such item.")
    version = payload.get("version")
    try:
        version = int(version) if version is not None else None
    except (TypeError, ValueError):
        version = None
    if version is None:
        raise ValidationFailed(
            {
                "version": ["Send the version you are editing."],
                "field_codes": {"version": "required"},
            }
        )
    if version != item.version:
        raise StaleVersion(current_version=item.version)

    data = {k: payload[k] for k in EDITABLE_FIELDS if k in payload}
    cleaned, errors, warnings = _validate(ctx=ctx, data=data, item=item)
    location = default_location(ctx.tenant)

    has_movements = StockMovement.objects.filter(item=item).exists()
    if (
        "unit" in cleaned
        and cleaned["unit"] is not None
        and cleaned["unit"].pk != item.unit_id
        and has_movements
    ):
        raise BusinessRuleViolation(
            "unit_locked",
            "The unit can't change once stock has moved. Create a new item instead.",
            details={"item_id": str(item.id)},
        )

    opening = None
    turning_on = "track_stock" in cleaned and cleaned["track_stock"] and not item.track_stock
    turning_off = "track_stock" in cleaned and not cleaned["track_stock"] and item.track_stock
    if turning_on:
        if not payload.get("opening_stock") and not has_movements:
            raise BusinessRuleViolation(
                "opening_stock_required",
                "Enter the opening stock to start tracking this item.",
                details={"item_id": str(item.id)},
            )
        if payload.get("opening_stock"):
            if not can_adjust_stock:
                from apps.common.exceptions import PermissionDenied

                raise PermissionDenied(
                    "Adding opening stock later needs the stock-adjust permission."
                )
            opening = _parse_opening(
                ctx=ctx,
                raw=payload.get("opening_stock"),
                unit=cleaned.get("unit") or item.unit,
                fallback_cost=cleaned.get("purchase_price", item.purchase_price),
                errors=errors,
            )
    if errors:
        raise ValidationFailed(errors.payload())
    if turning_off:
        stock = ItemStock.objects.select_for_update().filter(item=item, location=location).first()
        if stock is not None and stock.on_hand != 0:
            raise BusinessRuleViolation(
                "stock_nonzero",
                "Adjust the stock to zero first.",
                details={"on_hand": str(stock.on_hand)},
            )

    _check_codes_free(
        tenant=ctx.tenant,
        sku=cleaned.get("sku") if cleaned.get("sku") != item.sku else None,
        barcode=cleaned.get("barcode") if cleaned.get("barcode") != item.barcode else None,
        exclude_id=item.pk,
    )

    before = _snapshot(item)
    old_reorder = item.reorder_point
    for key, value in cleaned.items():
        setattr(item, key, value)
    item.version = item.version + 1
    try:
        with transaction.atomic():
            item.save()
    except IntegrityError:
        _check_codes_free(tenant=ctx.tenant, sku=item.sku, barcode=item.barcode, exclude_id=item.pk)
        raise
    after = _snapshot(item)
    changed_before, changed_after = diff_fields(before, after, fields=before.keys())
    if changed_after:
        write_audit(
            ctx=ctx,
            action=AuditAction.ITEM_UPDATED,
            entity_type="inventory_item",
            entity_id=item.id,
            before=changed_before,
            after=changed_after,
        )
    if opening is not None:
        _post_opening(ctx=ctx, item=item, opening=opening, path="patch")
    elif turning_on:
        _init_stock_row(ctx=ctx, item=item)

    if item.track_stock and "reorder_point" in cleaned and cleaned["reorder_point"] != old_reorder:
        # FR-1's second trigger: raising the reorder point over the current
        # on-hand is a crossing, evaluated under the stock lock like a movement.
        from apps.inventory.services.low_stock import evaluate_crossing

        ensure_stock_rows(tenant=ctx.tenant, pairs=[(item.id, location.id)])
        stock = lock_stock_rows(tenant=ctx.tenant, pairs=[(item.id, location.id)])[
            (item.id, location.id)
        ]
        evaluate_crossing(ctx=ctx, item=item, stock=stock, trigger=AlertTrigger.REORDER_EDIT)
    return {"item": item, "warnings": warnings}


# ── archive / restore (INV-02 FR-8/FR-9) ────────────────────────────────────


@transaction.atomic
def archive_item(*, ctx: Ctx, item_id: Any) -> Item:
    """A status change, never a delete: an item that moved stock is evidence."""
    item = lock_item(tenant=ctx.tenant, item_id=item_id)
    if item is None:
        raise NotFound("No such item.")
    if item.status == ItemStatus.ARCHIVED:
        return item
    # The stock lock is the one `post_movements` takes, so a movement and an
    # archive of the same item serialise and cannot interleave.
    rows = list(ItemStock.objects.select_for_update().filter(item=item).order_by("location_id"))
    on_hand = sum((row.on_hand for row in rows), Decimal("0.000"))
    if on_hand != 0:
        raise BusinessRuleViolation(
            "stock_nonzero",
            "Adjust the stock to zero first.",
            details={"on_hand": str(q3(on_hand))},
        )
    item.status = ItemStatus.ARCHIVED
    item.version += 1
    item.save(update_fields=["status", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.ITEM_ARCHIVED,
        entity_type="inventory_item",
        entity_id=item.id,
        before={"status": ItemStatus.ACTIVE},
        after={"status": ItemStatus.ARCHIVED},
    )
    return item


@transaction.atomic
def restore_item(*, ctx: Ctx, item_id: Any) -> Item:
    item = lock_item(tenant=ctx.tenant, item_id=item_id)
    if item is None:
        raise NotFound("No such item.")
    if item.status == ItemStatus.ACTIVE:
        return item
    item.status = ItemStatus.ACTIVE
    item.version += 1
    item.save(update_fields=["status", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.ITEM_RESTORED,
        entity_type="inventory_item",
        entity_id=item.id,
        before={"status": ItemStatus.ARCHIVED},
        after={"status": ItemStatus.ACTIVE},
    )
    return item
