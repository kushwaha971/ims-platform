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
the registry. A module with no registered counter has nothing that can block.
Registered today: `inventory` (items with stock) and `sales` (drafts; issued tax
invoices this FY for the GST lock), each from its own `AppConfig.ready()`.

A counter takes the tenant and returns how many rows block the change; the
refusal carries the number so the merchant is told "12 items still have
stock", not "not allowed". Since A12 each counter may carry a `label_id`, and
the refusal carries a per-counter `breakdown` beside the total (R14); a module
may also register an enable hook that seeds its presets when it is switched on
(R15).
"""

from __future__ import annotations

from typing import Any, Callable

Counter = Callable[[Any], int]
#: A12 (R15): `hook(ctx, tenant)` seeds a module's presets when it is switched on.
EnableHook = Callable[[Any, Any], None]

# Each module's counters, in registration order. A12 (R14): deduplicated by
# counter EQUALITY (a function is equal only to itself; a bound method to the
# same method of the same object) so a second `ready()` — or a test that
# registers the same function again — never doubles a count; each counter's `label_id` is held
# beside it (the list keeps its old shape, which other apps' tests reset).
_MODULE_OFF_GUARDS: dict[str, list[Counter]] = {}
_OFF_GUARD_LABELS: dict[str, dict[Counter, str | None]] = {}
_GST_LOCK_COUNTERS: list[Counter] = []
_ENABLE_HOOKS: dict[str, list[EnableHook]] = {}


def register_module_off_guard(
    module: str, counter: Counter, *, label_id: str | None = None
) -> None:
    """`counter(tenant)` → OPEN rows that make switching `module` off unsafe.

    Idempotent by counter equality (PLT-X10 BR-5; `==`, not `is`, because a
    bound method is a new object on every access): this used to append, so a
    module whose `ready()` ran twice told the merchant they had six books out
    when they had three. `label_id` is the catalogue key the refusal's
    breakdown row is drawn with (`"library.off.copiesOut"`, taking `{count}`);
    the counters registered before labels existed pass none.

    A counter must never raise (EC-3): it is called inside the switching
    request, and an exception there is a 500 rather than a refusal.
    """
    counters = _MODULE_OFF_GUARDS.setdefault(module, [])
    if any(existing == counter for existing in counters):
        return
    counters.append(counter)
    _OFF_GUARD_LABELS.setdefault(module, {})[counter] = label_id


def register_gst_lock_counter(counter: Counter) -> None:
    """`counter(tenant)` → non-draft tax invoices issued in the current FY."""
    if not any(existing == counter for existing in _GST_LOCK_COUNTERS):
        _GST_LOCK_COUNTERS.append(counter)


def module_off_blockers(tenant: Any, module: str) -> list[dict]:
    """A12 (R14): `[{label_id, count}]` for each counter with open rows.

    What the 409 `module_has_data` carries as `details.breakdown`. A counter
    that answers 0 is left out: closed history never blocks, and a line
    reading "0 deposits held" in a refusal is noise.
    """
    labels = _OFF_GUARD_LABELS.get(module, {})
    blockers: list[dict] = []
    for counter in _MODULE_OFF_GUARDS.get(module, ()):
        count = int(counter(tenant))
        if count > 0:
            blockers.append({"label_id": labels.get(counter), "count": count})
    return blockers


def blocking_rows_for_module_off(tenant: Any, module: str) -> int:
    return sum(row["count"] for row in module_off_blockers(tenant, module))


def registered_off_guard_modules() -> tuple[str, ...]:
    """The modules with at least one counter — for the guard contract test."""
    return tuple(sorted(_MODULE_OFF_GUARDS))


def issued_tax_invoices_this_fy(tenant: Any) -> int:
    return sum(int(counter(tenant)) for counter in _GST_LOCK_COUNTERS)


# ── A12 ── the enable hook (R15, PLT-X10 BR-6) ───────────────────────────────


def register_module_enable_hook(module: str, hook: EnableHook) -> None:
    """`hook(ctx, tenant)` runs when `module` is switched ON.

    Called by `update_enabled_modules` inside its transaction, after the
    dependency check, once per newly enabled module and never for a module
    that was already on. It seeds that module's presets (default plans,
    labels, settings rows) and must be idempotent itself: switching a module
    off and on again runs it again. Idempotent by hook equality.
    """
    hooks = _ENABLE_HOOKS.setdefault(module, [])
    if not any(existing == hook for existing in hooks):
        hooks.append(hook)


def run_module_enable_hooks(*, ctx: Any, tenant: Any, modules: Any) -> None:
    for module in modules:
        for hook in list(_ENABLE_HOOKS.get(module, ())):
            hook(ctx, tenant)


_BASELINE: tuple | None = None


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to what the apps' `ready()` registered — not to empty.

    A fixture calls this before AND after a test that registers a fake counter.
    Clearing outright on teardown used to strip the real inventory and sales
    guards for every later test in the process, so whether a module could be
    switched off depended on suite order. The first call snapshots the
    start-up registrations (every `ready()` has run by then) and later calls
    restore that snapshot. The real counters return 0 for a tenant with no
    items and no invoices, so a test's fake count still reads exactly.
    """
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = (
            {module: list(counters) for module, counters in _MODULE_OFF_GUARDS.items()},
            list(_GST_LOCK_COUNTERS),
            {module: dict(labels) for module, labels in _OFF_GUARD_LABELS.items()},
            {module: list(hooks) for module, hooks in _ENABLE_HOOKS.items()},
        )
    _MODULE_OFF_GUARDS.clear()
    _MODULE_OFF_GUARDS.update({module: list(c) for module, c in _BASELINE[0].items()})
    _GST_LOCK_COUNTERS[:] = _BASELINE[1]
    _OFF_GUARD_LABELS.clear()
    _OFF_GUARD_LABELS.update({module: dict(labels) for module, labels in _BASELINE[2].items()})
    _ENABLE_HOOKS.clear()
    _ENABLE_HOOKS.update({module: list(hooks) for module, hooks in _BASELINE[3].items()})
