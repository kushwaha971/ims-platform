"""PLT-06 FR-4 — "Stock" cannot be switched off while any item has stock.

Protects the integration gap QA found: `platform_app.services.guards` had a
registry but inventory registered nothing, so an owner could switch the module
off over a shelf of counted stock.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import RoleCode

pytestmark = pytest.mark.django_db


@pytest.fixture
def fresh_guards(monkeypatch: Any) -> Any:
    """What `register_guards()` itself wires, independent of suite order."""
    from apps.inventory.services import guards as inventory_guards
    from apps.platform_app.services import guards as platform_guards

    monkeypatch.setattr(platform_guards, "_MODULE_OFF_GUARDS", {})
    monkeypatch.setattr(platform_guards, "_GST_LOCK_COUNTERS", [])
    monkeypatch.setattr(inventory_guards, "_REGISTERED", False)
    inventory_guards.register_guards()
    return platform_guards


def test_items_with_stock_block_and_empty_items_do_not(
    fresh_guards: Any, tenant: Any, make_item: Any
) -> None:
    make_item("Empty shelf")  # tracked, never stocked
    make_item("Consulting", item_type="service", track_stock=False)
    assert fresh_guards.blocking_rows_for_module_off(tenant, "inventory") == 0
    make_item("Rice", opening=("3", "10"))
    make_item("Dal", opening=("2", "10"))
    assert fresh_guards.blocking_rows_for_module_off(tenant, "inventory") == 2
    # Registering twice (a second `ready()`) must not double the count.
    from apps.inventory.services import guards as inventory_guards

    inventory_guards.register_guards()
    assert fresh_guards.blocking_rows_for_module_off(tenant, "inventory") == 2


def test_switching_stock_off_with_stock_is_refused_over_http(
    fresh_guards: Any, api_as: Any, tenant: Any, make_item: Any
) -> None:
    """End to end through `PATCH /tenants/current`: 409 `module_has_data`, with the count."""
    make_item("Rice", opening=("3", "10"))
    owner = api_as(tenant, RoleCode.OWNER.value)[0]
    modules = [m for m in tenant.enabled_modules if m != "inventory"]
    response = owner.patch(
        reverse("v1:tenant-current"), {"enabled_modules": modules}, format="json"
    )
    assert response.status_code == 409, response.content
    # A12 (R14) added `breakdown` beside the unchanged `module` and `count`.
    assert response.json()["error"]["details"] == {
        "module": "inventory",
        "count": 1,
        "breakdown": [{"label_id": None, "count": 1}],
    }


def test_ready_registered_the_inventory_guard() -> None:
    """Start-up wiring: without `InventoryConfig.ready()` calling it, nothing blocks."""
    from apps.inventory.services import guards as inventory_guards
    from apps.platform_app.services import guards as platform_guards

    platform_guards._reset_for_tests()  # restores, never empties, the start-up set
    assert inventory_guards.items_with_stock in platform_guards._MODULE_OFF_GUARDS["inventory"]
