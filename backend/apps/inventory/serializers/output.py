"""Wire shapes for the inventory API (Part 22 §22.6 plus the FRD deltas).

Plain functions rather than `ModelSerializer`s: every shape here is assembled
from annotations and a handful of batched lookups, and writing them as
functions keeps each response's query count visible at the call site. Money,
quantities and costs are strings (canon rule 3); dates are ISO.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.money import q2
from apps.inventory.models import Item, ItemStock, StockAdjustment, StockMovement, Unit


def _s(value: Any) -> str | None:
    return None if value is None else str(value)


def _user(user: Any) -> dict | None:
    if user is None:
        return None
    name = (
        getattr(user, "full_name", "") or getattr(user, "name", "") or getattr(user, "email", "")
    ).strip()
    return {"id": str(user.id), "name": name or "Removed user"}


def unit_dict(unit: Unit, *, uqc_codes: frozenset[str] | None = None) -> dict:
    return {
        "id": str(unit.id),
        "code": unit.code,
        "name": unit.name,
        "allow_decimal": unit.allow_decimal,
        "is_system": unit.tenant_id is None,
        "is_uqc": unit.tenant_id is None if uqc_codes is None else unit.code in uqc_codes,
    }


def category_dict(category: Any) -> dict | None:
    if category is None:
        return None
    return {
        "id": str(category.id),
        "name": category.name,
        "parent_id": _s(category.parent_id),
    }


def item_row(item: Item) -> dict:
    """INV-02 §14 — one list row (also the lookup response)."""
    return {
        "id": str(item.id),
        "name": item.name,
        "sku": item.sku,
        "barcode": item.barcode,
        "item_type": item.item_type,
        "category": (
            {"id": str(item.category.id), "name": item.category.name} if item.category else None
        ),
        "unit": {
            "id": str(item.unit.id),
            "code": item.unit.code,
            "allow_decimal": item.unit.allow_decimal,
        },
        "selling_price": str(item.selling_price),
        "purchase_price": str(item.purchase_price),
        "tax_code": item.tax_code,
        "track_stock": item.track_stock,
        "on_hand": _s(getattr(item, "on_hand", None)),
        "avg_cost": _s(getattr(item, "avg_cost", None)),
        "reorder_point": _s(item.reorder_point),
        "stock_status": getattr(item, "stock_status", None),
        "stock_value": _s(getattr(item, "stock_value", None)),
        "status": item.status,
        "match_field": getattr(item, "match_field", None),
        "updated_at": item.updated_at.isoformat(),
    }


def movement_dict(movement: StockMovement, *, numbers: dict[Any, str]) -> dict:
    value = None
    if movement.unit_cost is not None:
        value = str(q2(movement.qty * movement.unit_cost))
    return {
        "id": str(movement.id),
        "sequence_no": movement.sequence_no,
        "movement_date": movement.movement_date.isoformat(),
        "movement_type": movement.movement_type,
        "qty": str(movement.qty),
        "unit_cost": _s(movement.unit_cost),
        "value": value,
        "on_hand_after": str(movement.on_hand_after),
        "avg_cost_after": str(movement.avg_cost_after),
        "reason": movement.reason,
        "source": {
            "type": movement.source_type,
            "id": _s(movement.source_id),
            "number": numbers.get(movement.source_id),
        },
        "reverses_id": _s(movement.reverses_id),
        "is_backdated": bool(getattr(movement, "is_backdated", False)),
        "created_by": _user(movement.created_by),
        "created_at": movement.created_at.isoformat(),
    }


def item_detail_dict(
    item: Item,
    *,
    tax_rate: dict | None,
    stock: list[ItemStock],
    opening: StockMovement | None,
    recent: list[dict],
    has_movements: bool,
) -> dict:
    """INV-01 §14 / INV-03 §14 — the full item."""
    row = item_row(item)
    row.update(
        {
            "category": category_dict(item.category),
            "unit": {
                "id": str(item.unit.id),
                "code": item.unit.code,
                "name": item.unit.name,
                "allow_decimal": item.unit.allow_decimal,
            },
            "hsn_sac": item.hsn_sac,
            "tax_rate": tax_rate,
            "tax_inclusive_selling": item.tax_inclusive_selling,
            "mrp": _s(item.mrp),
            "description": item.description,
            "image_url": None,
            "version": item.version,
            "created_at": item.created_at.isoformat(),
            "stock": (
                [
                    {
                        "location": {
                            "id": str(s.location.id),
                            "code": s.location.code,
                            "name": s.location.name,
                        },
                        "on_hand": str(s.on_hand),
                        "avg_cost": str(s.avg_cost),
                        "value": str(q2(s.on_hand * s.avg_cost)),
                        "last_movement_at": (
                            s.last_movement_at.isoformat() if s.last_movement_at else None
                        ),
                    }
                    for s in stock
                ]
                if item.track_stock
                else []
            ),
            "opening": (
                {
                    "qty": str(opening.qty),
                    "unit_cost": _s(opening.unit_cost),
                    "movement_date": opening.movement_date.isoformat(),
                }
                if opening
                else None
            ),
            "has_movements": has_movements,
            "movements_recent": recent,
        }
    )
    row.pop("match_field", None)
    return row


def adjustment_dict(adjustment: StockAdjustment, movements: list[StockMovement]) -> dict:
    """INV-06 §14 — header plus lines with before/after and value impact."""
    lines = []
    total = Decimal("0.00")
    for index, movement in enumerate(sorted(movements, key=lambda m: (m.created_at, m.id))):
        cost = movement.unit_cost or Decimal("0")
        impact = q2(movement.qty * cost)
        total += impact
        lines.append(
            {
                "index": index,
                "movement_id": str(movement.id),
                "item": {
                    "id": str(movement.item.id),
                    "name": movement.item.name,
                    "sku": movement.item.sku,
                    "unit_code": movement.item.unit.code,
                },
                "movement_type": movement.movement_type,
                "qty": str(movement.qty),
                "unit_cost": _s(movement.unit_cost),
                "on_hand_before": str(movement.on_hand_after - movement.qty),
                "on_hand_after": str(movement.on_hand_after),
                "avg_cost_after": str(movement.avg_cost_after),
                "value_impact": str(impact),
            }
        )
    return {
        "id": str(adjustment.id),
        "number": adjustment.number,
        "adjustment_date": adjustment.adjustment_date.isoformat(),
        "reason": adjustment.reason,
        "note": adjustment.note,
        "status": adjustment.status,
        "location": {
            "id": str(adjustment.location.id),
            "code": adjustment.location.code,
            "name": adjustment.location.name,
        },
        "lines": lines,
        "value_impact_total": str(q2(total)),
        "created_by": _user(adjustment.created_by),
        "created_at": adjustment.created_at.isoformat(),
    }
