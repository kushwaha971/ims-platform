"""INV-06 — posting a stock adjustment: one numbered header, one movement per line.

Atomic end to end: the header, every movement, every cache move, the number
and the audit row commit together or not at all. The number is allocated LAST
(Part 20 §20.11.2 rule L4 — the sequence row is the hottest lock in the product),
after `post_movements` has taken the stock locks in `item_id` order and after the
negative-stock check has passed, so a refused adjustment never burns a number.

An adjustment never carries `reverses_id` (BR-2): "Post opposite adjustment"
(FR-9) is a new adjustment with negated quantities, not a reversal row.
"""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import q2, q3, q4
from apps.inventory.constants import (
    ADJUSTMENT_MAX_LINES,
    ADJUSTMENT_NOTE_MAX_LENGTH,
    ADJUSTMENT_NOTE_MIN_LENGTH_OTHER,
    MAX_QTY,
    MAX_UNIT_COST,
    AdjustmentReason,
    AdjustmentStatus,
    ItemStatus,
    ItemType,
    MovementSource,
    MovementType,
)
from apps.inventory.models import Item, Location, StockAdjustment
from apps.inventory.services.parsing import Errors, clean_text, parse_date, parse_decimal
from apps.inventory.services.stock import (
    MovementLine,
    default_location,
    post_movements,
    validate_qty_for_unit,
)


def value_impact(*, qty: Decimal, unit_cost: Decimal) -> Decimal:
    """BR-3 — inbound at the entered cost, outbound at the average before; 2 dp half-up."""
    return q2(qty * unit_cost)


def _parse_payload(*, ctx: Ctx, payload: dict) -> tuple[dict, list[dict]]:
    errors = Errors()
    adjustment_date = parse_date(
        payload.get("adjustment_date") or tenant_today(ctx.tenant).isoformat(),
        path="adjustment_date",
        errors=errors,
        tenant=ctx.tenant,
    )
    reason = payload.get("reason")
    if reason not in AdjustmentReason.values:
        errors.add("reason", "Choose a reason.", "invalid_choice")
    note = clean_text(payload.get("note") or "")
    if len(note) > ADJUSTMENT_NOTE_MAX_LENGTH:
        errors.add(
            "note", f"Keep the note under {ADJUSTMENT_NOTE_MAX_LENGTH} characters.", "max_length"
        )
    elif reason == AdjustmentReason.OTHER and len(note) < ADJUSTMENT_NOTE_MIN_LENGTH_OTHER:
        errors.add("note", "Describe the reason.", "required")

    location = None
    if payload.get("location_id"):
        try:
            location = Location.objects.filter(
                tenant=ctx.tenant, pk=payload["location_id"], is_active=True
            ).first()
        except (ValueError, TypeError, DjangoValidationError):
            location = None
        if location is None:
            raise NotFound("No such location.")

    raw_lines = payload.get("lines")
    if not isinstance(raw_lines, list) or not raw_lines:
        errors.add("lines", "Add items to adjust.", "required")
        raw_lines = []
    elif len(raw_lines) > ADJUSTMENT_MAX_LINES:
        errors.add("lines", "Split into another adjustment — 100 lines at most.", "too_many_lines")
        raw_lines = []

    item_ids = []
    for raw in raw_lines:
        if isinstance(raw, dict) and raw.get("item_id"):
            item_ids.append(str(raw.get("item_id")))
    try:
        items = {
            str(item.id): item
            for item in Item.objects.select_related("unit").filter(
                tenant=ctx.tenant, pk__in=item_ids
            )
        }
    except (ValueError, DjangoValidationError):
        items = {}

    seen: set[str] = set()
    lines: list[dict] = []
    for index, raw in enumerate(raw_lines):
        path = f"lines.{index}"
        if not isinstance(raw, dict):
            errors.add(f"{path}.item_id", "Choose an item.", "required")
            continue
        item_id = str(raw.get("item_id") or "")
        item = items.get(item_id)
        if not item_id:
            errors.add(f"{path}.item_id", "Choose an item.", "required")
        elif item is None:
            # Canon §0.11 rule 2 — another tenant's id is simply not found.
            errors.add(f"{path}.item_id", "Item not found.", "not_found")
        elif item_id in seen:
            errors.add(f"{path}.item_id", "Item appears twice.", "duplicate_line")
        elif item.item_type != ItemType.GOODS or not item.track_stock:
            errors.add(f"{path}.item_id", "Item does not track stock.", "track_stock_not_allowed")
        seen.add(item_id)
        qty = parse_decimal(
            raw.get("qty"),
            path=f"{path}.qty",
            errors=errors,
            places=3,
            maximum=MAX_QTY,
            required=True,
            allow_negative=True,
            allow_zero=False,
            code="invalid_qty",
            message="Quantity cannot be zero.",
        )
        if (
            qty is not None
            and item is not None
            and validate_qty_for_unit(qty, allow_decimal=item.unit.allow_decimal)
        ):
            errors.add(
                f"{path}.qty",
                f"Quantity must be a whole number for {item.unit.code}.",
                "qty_must_be_whole",
            )
        unit_cost = None
        if qty is not None and qty > 0:
            unit_cost = parse_decimal(
                raw.get("unit_cost"),
                path=f"{path}.unit_cost",
                errors=errors,
                places=4,
                maximum=MAX_UNIT_COST,
                required=True,
                message="Enter cost for stock added.",
            )
        lines.append({"index": index, "item": item, "qty": qty, "unit_cost": unit_cost})

    if errors:
        raise ValidationFailed(errors.payload())
    for line in lines:
        if line["item"].status == ItemStatus.ARCHIVED:
            raise BusinessRuleViolation(
                "item_archived",
                "This item is archived.",
                details={"item_id": str(line["item"].id), "index": line["index"]},
            )
    return (
        {
            "adjustment_date": adjustment_date,
            "reason": reason,
            "note": note,
            "location": location,
        },
        lines,
    )


@transaction.atomic
def post_adjustment(*, ctx: Ctx, payload: dict) -> StockAdjustment:
    """FR-1 — returns the header; `adjustment_lines()` reads the lines back."""
    from apps.platform_app.services.sequences import allocate_number

    header, lines = _parse_payload(ctx=ctx, payload=payload)
    location = header["location"] or default_location(ctx.tenant)

    adjustment = StockAdjustment(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        adjustment_date=header["adjustment_date"],
        location=location,
        reason=header["reason"],
        note=header["note"],
        status=AdjustmentStatus.POSTED,
    )
    movement_lines = [
        MovementLine(
            item=line["item"],
            location=location,
            qty=q3(line["qty"]),
            unit_cost=q4(line["unit_cost"]) if line["unit_cost"] is not None else None,
            movement_type=MovementType.ADJUST_IN if line["qty"] > 0 else MovementType.ADJUST_OUT,
            movement_date=header["adjustment_date"],
            source_type=MovementSource.STOCK_ADJUSTMENT,
            source_id=adjustment.id,
            reason=header["reason"],
            index=line["index"],
        )
        for line in lines
    ]
    posted = post_movements(ctx=ctx, lines=movement_lines)

    adjustment.number = allocate_number(
        tenant=ctx.tenant, kind="stock_adjustment", on_date=header["adjustment_date"]
    )
    adjustment.save(force_insert=True)

    snapshot_lines = []
    total = Decimal("0.00")
    for row in posted:
        impact = value_impact(
            qty=row.movement.qty, unit_cost=row.movement.unit_cost or Decimal("0")
        )
        total += impact
        snapshot_lines.append(
            {
                "item_id": str(row.line.item.id),
                "qty": str(row.movement.qty),
                "unit_cost": str(row.movement.unit_cost),
                "on_hand_before": str(row.on_hand_before),
                "on_hand_after": str(row.movement.on_hand_after),
                "value_impact": str(impact),
            }
        )
    write_audit(
        ctx=ctx,
        action=AuditAction.STOCK_ADJUSTMENT_POSTED,
        entity_type="inventory_stock_adjustment",
        entity_id=adjustment.id,
        after={
            "number": adjustment.number,
            "adjustment_date": adjustment.adjustment_date.isoformat(),
            "reason": adjustment.reason,
            "note": adjustment.note,
            "lines": snapshot_lines,
            "value_impact_total": str(q2(total)),
        },
        metadata={"reason": adjustment.reason},
    )
    return adjustment
