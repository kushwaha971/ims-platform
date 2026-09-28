"""Cross-module refusal hooks for PLT-06 FR-4 and PLT-07 FR-4.

Two platform rules depend on data another module owns:

* turning a module OFF is refused while it holds live data (PLT-06 FR-4 —
  "disabling `inventory` is refused while any item has `on_hand ≠ 0`;
  disabling `sales` refused while drafts exist"), and
* changing `gst_type` away from `regular` is refused while tax invoices were
  issued this financial year (PLT-07 FR-4, `gst_type_locked`).

`platform_app` may not import those modules (Part 20 §20.1.4 — it depends on
`common` alone), and it must not guess their tables either. So the owning app
registers a counter here from its `AppConfig.ready()`, and the platform asks
the registry. A module with no registered counter has nothing that can block:
today that is every module, because `inventory_item` and `sales_document` do
not exist yet — which is also why no test here fabricates them.

A counter takes the tenant and returns how many rows block the change; the
refusal carries the number so the merchant is told "12 items still have
stock", not "not allowed".
"""

from __future__ import annotations

from typing import Any, Callable

Counter = Callable[[Any], int]

_MODULE_OFF_GUARDS: dict[str, list[Counter]] = {}
_GST_LOCK_COUNTERS: list[Counter] = []


def register_module_off_guard(module: str, counter: Counter) -> None:
    """`counter(tenant)` → rows that make switching `module` off unsafe."""
    _MODULE_OFF_GUARDS.setdefault(module, []).append(counter)


def register_gst_lock_counter(counter: Counter) -> None:
    """`counter(tenant)` → non-draft tax invoices issued in the current FY."""
    _GST_LOCK_COUNTERS.append(counter)


def blocking_rows_for_module_off(tenant: Any, module: str) -> int:
    return sum(int(counter(tenant)) for counter in _MODULE_OFF_GUARDS.get(module, ()))


def issued_tax_invoices_this_fy(tenant: Any) -> int:
    return sum(int(counter(tenant)) for counter in _GST_LOCK_COUNTERS)


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    _MODULE_OFF_GUARDS.clear()
    _GST_LOCK_COUNTERS.clear()
