"""The four steps of `issue_invoice` that talk to another app (inventory, parties).

Split out so `issue.py` reads as the ordered list BR-16 is, and so each step
calls the owning app's service rather than restating its rule (Part 20 D9 —
explicit calls, never signals).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation
from apps.sales.services import settings as sales_settings
from apps.sales.services.rule46 import check_rule46


class _LineView:
    """A stored-line-shaped view of a built row, for the Rule 46 checklist."""

    def __init__(self, row: dict) -> None:
        self.hsn_sac = row.get("hsn_sac")
        self.description = row.get("description")


def rule46_for(tenant: Any, document: Any, rows: list[dict]) -> dict:
    return check_rule46(
        tenant=tenant,
        document=document,
        lines=[_LineView(row) for row in rows],
        require_hsn_b2b=sales_settings.require_hsn_b2b(tenant),
    )


def post_stock(ctx: Ctx, document: Any, rows: list[dict]) -> dict[int, Decimal | None]:
    """FR-7/FR-8 — `sale_out` for tracked goods; returns `{line_no: unit_cost}` (COGS at avg).

    Services and untracked goods never move stock (BR-19, EC-14) and keep a
    NULL cost snapshot. The inventory service locks in item order (L2) and
    refuses every short line at once.
    """
    from apps.inventory.constants import ItemType, MovementType
    from apps.inventory.services.stock import MovementLine, post_movements

    movement_lines = []
    for row in rows:
        item = row.get("item")
        if item is None or item.item_type != ItemType.GOODS or not item.track_stock:
            continue
        movement_lines.append(
            MovementLine(
                item=item,
                qty=-row["qty"],
                movement_type=MovementType.SALE_OUT,
                movement_date=document.document_date,
                source_type="sales_document",
                source_id=document.id,
                index=row["line_no"] - 1,
            )
        )
    posted = post_movements(ctx=ctx, lines=movement_lines)
    return {p.line.index + 1: p.movement.unit_cost for p in posted}


def credit_check(
    ctx: Ctx, party: Any, amount: Decimal, *, override: bool
) -> tuple[dict | None, bool]:
    """BR-13 on the LOCKED party. Returns `(warning or None, overridden)`."""
    from apps.parties.services.credit import (
        CREDIT_MODE_BLOCK,
        check_credit,
        credit_mode,
        may_override,
    )

    decision = check_credit(party=party, amount=amount, mode=credit_mode(ctx.tenant))
    details = {
        "limit": str(decision["limit"]) if decision["limit"] is not None else None,
        "balance_after": str(decision["exposure_after"]),
        "over_by": str(decision["over_by"]),
    }
    overridden = False
    if decision["status"] == CREDIT_MODE_BLOCK:
        if not override:
            raise BusinessRuleViolation(
                "credit_limit_exceeded",
                "This invoice would put them past their credit limit.",
                details=details,
            )
        if not may_override(tenant=ctx.tenant, user=ctx.actor):
            raise BusinessRuleViolation(
                "override_not_allowed",
                "Only an owner or admin can go past a credit limit.",
                details=details,
            )
        overridden = True
    if decision["status"] in ("warn", CREDIT_MODE_BLOCK):
        return (
            {
                "code": "credit_limit_exceeded",
                "message": "This invoice takes them past their credit limit.",
                "details": details,
            },
            overridden,
        )
    return None, overridden


def party_snapshot(party: Any, document: Any) -> dict:
    """FR-7 — what the document must keep saying when the party is edited later."""
    if party is None:
        return {
            "name": document.walk_in_name or "",
            "gstin": None,
            "state_code": document.place_of_supply_state,
            "mobile": document.walk_in_mobile,
            "address": {},
        }
    address = dict(party.billing_address or {})
    return {
        "name": party.name,
        "gstin": party.gstin or None,
        "state_code": party.state_code or address.get("state_code"),
        "mobile": party.mobile,
        "address": {k: address.get(k, "") for k in ("line1", "line2", "city", "state", "pincode")},
        "shipping_address": dict(party.shipping_address or {}) or None,
    }
