"""Lending fixtures: the module entitled, switched on and released by the flag."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings

LENDING = "lending"


def entitle_lending(tenant: Any) -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field) or []) | {LENDING}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules or []) | {LENDING})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    return tenant


@pytest.fixture
def lending_on(tenant: Any) -> Iterator[Any]:
    with override_settings(UB_UNRELEASED_MODULES=True):
        yield entitle_lending(tenant)
