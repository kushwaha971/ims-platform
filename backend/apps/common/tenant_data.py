"""The tenant-data registry: what a business owns, table by table (PLT-10).

Two jobs read this and nothing else: the full export (FR-1) and the deletion
job (FR-5, Part 21 §21.5). Each app declares its own tables in a module called
`tenant_data.py` beside its `models.py`; `ensure_loaded()` imports every such
module through Django's own `autodiscover_modules`. So when `sales`,
`purchases` or `payments` gain tables, they add one file and register there —
nothing in `platform_app` changes, and `platform_app` never imports them.

── Why the ORDER is computed rather than written down ─────────────────────
Every tenant FK is `RESTRICT` and Django creates its foreign keys
`DEFERRABLE INITIALLY DEFERRED`, so the deletion job must drain children
before parents or the commit fails. A hand-written list is a list that the
first new table silently breaks. `deletion_order()` sorts the registered models
topologically over their own foreign keys, so a registering app only says
"this table is mine" and the order follows from the schema.

── Why an unregistered table STOPS deletion ───────────────────────────────
`unregistered_tenant_models()` lists every installed model with a foreign key
to `platform.Tenant` that nobody registered, and the deletion job refuses to
start while one of them holds a row of the business being deleted
(`unregistered_tables_holding`): deleting a business around a table nobody
declared either fails half-way on a RESTRICT or leaves that table's rows
behind, and both are worse than not starting. `tests/.../test_tenant_data.py`
asserts the list is empty apart from apps that have not been built yet.

Rule D1: this module imports no other app. Models are resolved by label at call
time through `django.apps.apps`.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from typing import Any

from django.apps import apps

TENANT_MODEL = "platform.Tenant"


@dataclass(frozen=True, slots=True)
class TenantTable:
    """One table a business owns.

    `model` is the Django label (`"ledger.LedgerEntry"`). `export_name` is the
    CSV the full export writes it to, or None for tables that are bookkeeping
    rather than records (idempotency keys, sessions). `tenant_path` is the ORM
    lookup that reaches the tenant — `"tenant"` for nearly everything,
    `"party__tenant"` for a join table without its own column.

    `triggers` are database triggers that refuse DELETE on this table (the
    append-only ledger and stock log); the deletion job disables exactly these,
    inside the transaction that deletes this tenant's rows, and says so here
    where a reader can see it (ledger migration 0002's docstring).

    `purge` replaces the default `DELETE` with a callable
    `(tenant, queryset) -> int` — the audit log is anonymised, not deleted
    (BR-3); jobs keep the running deletion job itself. `rows` replaces the
    default export row source with `(tenant) -> (header, iterable of rows)`.
    `exclude_fields` keeps secrets (token hashes) out of a CSV. `attachments`
    names the stored files the export copies alongside the CSVs.
    """

    model: str
    export_name: str | None = None
    tenant_path: str = "tenant"
    triggers: tuple[str, ...] = ()
    exclude_fields: tuple[str, ...] = ()
    purge: Callable[[Any, Any], int] | None = None
    rows: Callable[[Any], tuple[list[str], Iterable[Iterable[Any]]]] | None = None
    #: `(tenant) -> iterable of (archive name, storage key)` — files under
    #: `MEDIA_ROOT` that belong in the export's `attachments/` folder.
    attachments: Callable[[Any], Iterable[tuple[str, str]]] | None = None
    #: Tables this one must be deleted BEFORE even though no FK says so.
    before: tuple[str, ...] = field(default=())

    def model_class(self) -> Any:
        return apps.get_model(self.model)

    def queryset(self, tenant: Any) -> Any:
        """Every row of this table the tenant owns, soft-deleted rows included."""
        model = self.model_class()
        return model._base_manager.filter(**{self.tenant_path: tenant})


REGISTRY: dict[str, TenantTable] = {}

#: Apps whose tables exist in the schema but whose owners have not registered
#: them yet. Deletion still REFUSES while one of their tables holds a row (see
#: `unregistered_tenant_models`); this set only stops the architecture test from
#: failing on a merge that lands models before their `tenant_data.py`. Remove an
#: app from here in the same change that adds its registrations.
PENDING_APPS: frozenset[str] = frozenset({"sales", "purchases", "imports", "reports"})


def register(*tables: TenantTable) -> None:
    """Declare tables. Idempotent by label, so a module imported twice is harmless."""
    for table in tables:
        REGISTRY[table.model] = table


_loaded = False


def ensure_loaded() -> None:
    """Import every installed app's `tenant_data` module, once per process."""
    global _loaded
    if _loaded:
        return
    from django.utils.module_loading import autodiscover_modules

    autodiscover_modules("tenant_data")
    _loaded = True


def _tenant_scoped_models() -> list[Any]:
    """Every concrete model with a foreign key to `platform.Tenant`, except the tenant."""
    tenant_model = apps.get_model(TENANT_MODEL)
    found = []
    for model in apps.get_models():
        if model is tenant_model or model._meta.abstract or model._meta.proxy:
            continue
        for fk in model._meta.concrete_fields:
            if fk.is_relation and fk.related_model is tenant_model:
                found.append(model)
                break
    return found


def unregistered_tenant_models(*, include_pending: bool = True) -> list[str]:
    """Labels of tenant-FK models nobody registered (the deletion job's stop list)."""
    ensure_loaded()
    missing = []
    for model in _tenant_scoped_models():
        label = model._meta.label
        if label in REGISTRY:
            continue
        if not include_pending and model._meta.app_label in PENDING_APPS:
            continue
        missing.append(label)
    return sorted(missing)


def unregistered_tables_holding(tenant: Any) -> list[str]:
    """Unregistered tenant-FK models that hold at least one row of THIS tenant.

    The deletion job's actual stop condition. A table on the pending list that
    has no row for the business being deleted cannot be left behind or trip a
    RESTRICT, so it must not block a deletion the owner asked for; one that DOES
    hold a row stops the job before anything is removed.
    """
    tenant_model = apps.get_model(TENANT_MODEL)
    holding = []
    for label in unregistered_tenant_models():
        model = apps.get_model(label)
        for fk in model._meta.concrete_fields:
            if (
                fk.is_relation
                and fk.related_model is tenant_model
                and model._base_manager.filter(**{fk.name: tenant}).exists()
            ):
                holding.append(label)
                break
    return holding


def deletion_order() -> list[TenantTable]:
    """Registered tables, children before parents (Part 21 §21.5).

    Kahn's algorithm over "A references B ⇒ A is deleted before B", restricted
    to registered models; self-references are ignored (one statement deletes
    both ends). Ties break on the label so the order is stable run to run,
    which is what makes a resumed job resume at the same table.
    """
    ensure_loaded()
    labels = sorted(REGISTRY)
    must_precede: dict[str, set[str]] = {label: set() for label in labels}  # label -> parents
    for label in labels:
        model = REGISTRY[label].model_class()
        for fk in model._meta.concrete_fields:
            if not fk.is_relation or fk.related_model is None:
                continue
            target = fk.related_model._meta.label
            if target in REGISTRY and target != label:
                must_precede[label].add(target)
        for later in REGISTRY[label].before:
            if later in REGISTRY:
                must_precede[label].add(later)

    # child -> parents means: delete child, then parents. Build indegree on
    # "number of unregistered-yet-deleted children pointing at me".
    children: dict[str, set[str]] = {label: set() for label in labels}
    for child, parents in must_precede.items():
        for parent in parents:
            children[parent].add(child)
    remaining = {label: len(kids) for label, kids in children.items()}
    ready = sorted(label for label, count in remaining.items() if count == 0)
    order: list[str] = []
    while ready:
        label = ready.pop(0)
        order.append(label)
        for parent in sorted(must_precede[label]):
            remaining[parent] -= 1
            if remaining[parent] == 0:
                ready.append(parent)
                ready.sort()
    if len(order) != len(labels):
        cyclic = sorted(set(labels) - set(order))
        raise RuntimeError(f"tenant tables form a foreign-key cycle: {cyclic}")
    return [REGISTRY[label] for label in order]


def export_tables() -> list[TenantTable]:
    """Registered tables that the full export writes, in a stable order."""
    ensure_loaded()
    return [REGISTRY[label] for label in sorted(REGISTRY) if REGISTRY[label].export_name]
