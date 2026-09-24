"""Inventory test fixtures: reference data, a MAIN location, and item builders."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from apps.common.context import Ctx


@pytest.fixture
def reference(db: Any) -> None:
    """GST slabs (with the 2025-09-21 boundary), UQC units and the starter HSN list."""
    from apps.common.management.commands.seed_reference_data import (
        seed_hsn,
        seed_tax_rates,
        seed_units,
    )

    seed_tax_rates()
    seed_units()
    seed_hsn()


@pytest.fixture
def main(db: Any, tenant: Any) -> Any:
    from apps.inventory.models import Location

    return Location.objects.create(tenant=tenant, code="MAIN", name="Main", is_default=True)


@pytest.fixture
def ctx(tenant: Any, main: Any, reference: Any) -> Ctx:
    return Ctx.system(tenant)


def unit(code: str) -> Any:
    from apps.inventory.models import Unit

    return Unit.objects.get(tenant__isnull=True, code=code)


@pytest.fixture
def make_item(ctx: Ctx) -> Any:
    """`make_item(name, unit="NOS", opening=("10", "40"), **fields)` through the service."""
    from apps.inventory.services.items import create_item

    def _make(
        name: str = "Basmati Rice 5kg",
        unit_code: str = "NOS",
        opening: tuple | None = None,
        **fields: Any,
    ) -> Any:
        payload: dict[str, Any] = {"name": name, "unit_id": str(unit(unit_code).id), **fields}
        if opening is not None:
            qty, cost, *rest = opening
            payload["opening_stock"] = {
                "qty": qty,
                "unit_cost": cost,
                **({"as_of": rest[0]} if rest else {}),
            }
        return create_item(ctx=ctx, payload=payload)["item"]

    return _make


def stock_of(item: Any) -> tuple[Decimal, Decimal]:
    from apps.inventory.models import ItemStock

    row = ItemStock.objects.get(item=item)
    return row.on_hand, row.avg_cost
