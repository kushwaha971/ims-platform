"""The importer registry (IMP-01 FR-1, BR-4).

The framework owns file mechanics and scalars; a spec owns meaning. A spec
declares its columns, how to load the tenant-wide lookups once (`preflight`),
how to judge one row (`validate_row`) and how to create what the rows describe
(`commit_rows`) — through the owning module's services, never a model write
(BR-6). Adding a third kind is a new module that calls `register()`; nothing in
`services/engine.py` changes, which is TSK-CHS-IMPORT-02's acceptance.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True, slots=True)
class ColumnSpec:
    """One template column.

    `aliases` are other spellings of the header the importer accepts (PTY-10
    FR-3's synonyms, without the mapping screen): a header is matched after
    case, space and dash folding, so `Opening Balance` finds `opening_balance`
    with no alias at all. `help` is the `#` comment line's text for the column.
    """

    name: str
    required: bool = False
    help: str = ""
    aliases: tuple[str, ...] = ()
    #: The key the preview row carries for this column (defaults to `name`).
    preview_key: str | None = None
    #: How the preview renders it: `text`, `money`, `qty`, `date`, `bool`.
    kind: str = "text"


@dataclass(slots=True)
class RowResult:
    """What `validate_row` returns: the cleaned row, its errors and warnings.

    An error is `(column, code, message)`; the engine adds the row number and
    the echoed value. `preview` is the row as the importer UNDERSTOOD it, for
    the review step — a shifted column is visible there at a glance (AC-3).
    """

    clean: dict[str, Any] = field(default_factory=dict)
    errors: list[tuple[str, str, str]] = field(default_factory=list)
    warnings: list[tuple[str, str, str]] = field(default_factory=list)
    preview: dict[str, Any] = field(default_factory=dict)

    def error(self, column: str, code: str, message: str) -> None:
        self.errors.append((column, code, message))

    def warn(self, column: str, code: str, message: str) -> None:
        self.warnings.append((column, code, message))


@dataclass(frozen=True, slots=True)
class ImporterSpec:
    kind: str
    #: i18n key for the kind's name on screen.
    label: str
    columns: tuple[ColumnSpec, ...]
    template_rows: tuple[Mapping[str, str], ...]
    #: Every codename here is required to upload AND to commit (BR-10).
    required_permissions: tuple[str, ...]
    #: Codename that lets a member see the template, the job and its errors.
    read_permission: str
    #: `preflight(tenant) -> ctx` — tenant-wide lookups, loaded ONCE per run.
    preflight: Callable[[Any], dict]
    #: `validate_row(ctx, row, number) -> RowResult`; must issue no query per row
    #: that `preflight` could have answered.
    validate_row: Callable[[dict, dict[str, str], int], RowResult]
    #: `commit_rows(ctx, service_ctx, rows, progress) -> summary`, inside one
    #: transaction; `progress(n)` is called after each row.
    commit_rows: Callable[[dict, Any, list[tuple[int, dict]], Callable[[int], None]], dict]
    #: FR-5 — the columns a repeat of which is a `duplicate_in_file` error.
    unique_columns: tuple[str, ...] = ()
    max_rows: int = 10_000
    #: Modules whose `ModuleEnabled` gate must be open for this kind, beyond
    #: `import_export` itself, which every kind needs.
    modules: tuple[str, ...] = ()
    #: The keys of `summary` the completion card shows, in order.
    summary_fields: tuple[str, ...] = ()
    #: Where "Go to …" on the completion card leads.
    records_route: str = "/"
    #: `totals(ctx) -> dict` after validation — figures the review step shows
    #: over the whole file (PTY-10 FR-7's opening totals, INV-09's categories).
    totals: Callable[[dict], dict] | None = None
    #: R28 — the column `is_example` compares against the template rows. A
    #: library copy has no `name`; its example row is known by its accession.
    example_key: str = "name"

    @property
    def column_names(self) -> tuple[str, ...]:
        return tuple(column.name for column in self.columns)

    @property
    def required_columns(self) -> tuple[str, ...]:
        return tuple(column.name for column in self.columns if column.required)

    def is_example(self, row: Mapping[str, str]) -> bool:
        """FR-2 — an untouched template row is flagged, never silently created."""
        key = self.example_key
        value = (row.get(key) or "").strip().lower()
        return bool(value) and any(
            value == (example.get(key) or "").strip().lower() for example in self.template_rows
        )


_REGISTRY: dict[str, ImporterSpec] = {}
_LOADED = False


def register(spec: ImporterSpec) -> ImporterSpec:
    """Add an importer kind (R28). Idempotent by `kind`: the same spec, or an
    equal one, is a no-op and returns the registered spec (a second `ready()`
    or a re-imported mapper is harmless); a DIFFERENT spec under a used kind
    still raises — two modules must never share one."""
    existing = _REGISTRY.get(spec.kind)
    if existing is not None:
        if existing == spec:
            return existing
        raise ImproperlyConfigured(f"Importer {spec.kind!r} registered twice")
    _REGISTRY[spec.kind] = spec
    return spec


def get(kind: str) -> ImporterSpec | None:
    _ensure_loaded()
    return _REGISTRY.get(kind)


def kinds() -> tuple[str, ...]:
    _ensure_loaded()
    return tuple(_REGISTRY)


_BASELINE: dict[str, ImporterSpec] | None = None


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to the start-up kinds (the MVP mappers plus every `ready()`)."""
    global _BASELINE
    _ensure_loaded()
    if _BASELINE is None:
        _BASELINE = dict(_REGISTRY)
    _REGISTRY.clear()
    _REGISTRY.update(_BASELINE)


def _ensure_loaded() -> None:
    """Import the MVP mappers on first use (they register themselves).

    A flag rather than `if _REGISTRY`: a test that imports one mapper directly
    would otherwise leave the registry holding one kind forever.
    """
    global _LOADED
    if _LOADED:
        return
    _LOADED = True
    from apps.imports.mappers import items, parties  # noqa: F401
