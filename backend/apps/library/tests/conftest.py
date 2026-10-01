"""Library fixtures (B01).

`library_on` is the one way a library suite switches the module on: library is
in `UNRELEASED_MODULES` (A1, ADR-041), so a tenant reaches it only when its
plan, its partner and its own switches all name it AND the
`UB_UNRELEASED_MODULES` flag is set. This mirrors `_with_new_modules` in
`apps/platform_app/tests/test_release_gate.py`.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings

LIBRARY = "library"


def entitle_library(tenant: Any) -> Any:
    """Put library on the tenant's plan, its partner and its `enabled_modules`.

    Deliberately does NOT set the flag: the release gate must still hide the
    module, which `test_skeleton.py` proves.
    """
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field) or []) | {LIBRARY}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules or []) | {LIBRARY})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    return tenant


@pytest.fixture
def library_on(tenant: Any) -> Iterator[Any]:
    """The `tenant` fixture with library entitled, switched on and released by the flag."""
    with override_settings(UB_UNRELEASED_MODULES=True):
        yield entitle_library(tenant)
