"""The importer registry, made safe for modules to fill (R28, contracts §1.9, A10).

Verticals register importers (library copies and members, gym members) from
their own `ready()`; the registry was a raise-on-second-call dict whose mappers
registered at import time. The defects prevented: a second import of a mapper
module (or a second `ready()`) crashing start-up; two modules silently sharing
a `kind`, so one importer replaces the other; and `is_example` reading `name`
for every kind — a library copy's template row has no `name`, only a title and
an accession number, so an untouched example row would have been imported as a
real copy (IMP-01 FR-2).
"""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.imports import registry
from apps.imports.registry import ColumnSpec, ImporterSpec, RowResult


@pytest.fixture(autouse=True)
def _restore() -> Any:
    registry._reset_for_tests()
    yield
    registry._reset_for_tests()


def _spec(**overrides: Any) -> ImporterSpec:
    fields: dict[str, Any] = {
        "kind": "inventory_probe",
        "label": "imports.kind.probe",
        "columns": (ColumnSpec("accession", required=True), ColumnSpec("title")),
        "template_rows": ({"accession": "ACC-0001", "title": "Godaan"},),
        "required_permissions": ("inventory.item.write",),
        "read_permission": "inventory.item.read",
        "preflight": _preflight,
        "validate_row": _validate,
        "commit_rows": _commit,
        "example_key": "accession",
    }
    fields.update(overrides)
    return ImporterSpec(**fields)


def _preflight(tenant: Any) -> dict:
    return {}


def _validate(ctx: dict, row: dict[str, str], number: int) -> RowResult:
    return RowResult(clean=dict(row))


def _commit(ctx: dict, service_ctx: Any, rows: list, progress: Any) -> dict:
    return {"created": len(rows)}


def test_registering_the_same_spec_twice_is_harmless() -> None:
    spec = _spec()
    assert registry.register(spec) is spec
    assert registry.register(spec) is spec
    assert registry.register(_spec()) is spec  # an EQUAL spec is the same registration
    assert registry.get("inventory_probe") is spec


def test_a_different_spec_under_a_used_kind_still_raises() -> None:
    registry.register(_spec())
    with pytest.raises(ImproperlyConfigured):
        registry.register(_spec(max_rows=10))
    with pytest.raises(ImproperlyConfigured):
        registry.register(dataclasses.replace(registry.get("parties"), max_rows=1))


def test_is_example_reads_the_spec_example_key() -> None:
    """R28: `example_key` names the column `is_example` reads."""
    spec = _spec()
    assert spec.is_example({"accession": " acc-0001 ", "title": "Something else"})
    assert not spec.is_example({"accession": "ACC-0002", "title": "Godaan"})


def test_example_key_defaults_to_name_so_the_core_kinds_are_unchanged() -> None:
    parties = registry.get("parties")
    assert parties is not None and parties.example_key == "name"
    example = dict(parties.template_rows[0])
    assert parties.is_example(example)


def test_reset_restores_the_start_up_kinds() -> None:
    before = registry.kinds()
    registry.register(_spec())
    registry._reset_for_tests()
    assert registry.kinds() == before
    assert {"parties", "items"} <= set(before)
