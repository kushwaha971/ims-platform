"""B01 — the library app skeleton, its first migration and its release gate."""

from __future__ import annotations

from typing import Any

import pytest
from django.apps import apps as django_apps
from django.db.migrations.loader import MigrationLoader

from apps.library.tests.conftest import entitle_library
from apps.platform_app.services import entitlements

pytestmark = pytest.mark.django_db

#: Plan §1.4 rule 2 / §3: library 0001 depends only on fixed Wave B core heads
#: (G2: no `sales 0005` — library has no FK to sales and may not import it).
WAVE_B_HEADS = {
    ("ledger", "0007_reminder_source"),
    ("parties", "0010_party_relation"),
    ("payments", "0004_held_deposit"),
    ("platform", "0013_closed_day"),
}


def test_library_is_released_and_effective_once_entitled_and_switched_on(tenant: Any) -> None:
    """Released on 10 Oct 2026 (PLT-X11 BR-4): with the plan, the partner and
    the switch all naming library it IS effective, with no development flag.

    And only then: `test_a_business_without_library_does_not_have_it` below.
    """
    tenant = entitle_library(tenant)
    assert "library" in tenant.enabled_modules
    assert "library" in entitlements.effective_modules(tenant)


def test_a_business_without_library_does_not_have_it(tenant: Any) -> None:
    """Releasing the module puts it on plans; it switches it on for nobody."""
    assert "library" not in (tenant.enabled_modules or [])
    assert "library" not in entitlements.effective_modules(tenant)


def test_the_fixture_really_turns_library_on(library_on: Any) -> None:
    """With `library_on`, library is effective.

    Prevents a fixture that cannot fail: every later library suite relies on it,
    and a fixture that silently leaves the module off would make each of them
    test the refusal instead of the feature (CLAUDE.md, the LED-03 harness lesson).
    """
    assert "library" in entitlements.effective_modules(library_on)


def test_0001_depends_on_the_wave_b_heads() -> None:
    """The graph edges of `library 0001_initial` are exactly the fixed core heads.

    Prevents a dependency on some other track's branch migration, which would
    make the merge order of the three Wave B tracks matter (plan §1.4 rule 2).
    """
    loader = MigrationLoader(None, ignore_no_migrations=True)
    node = loader.graph.node_map[("library", "0001_initial")]
    assert {parent.key for parent in node.parents} == WAVE_B_HEADS


def test_the_app_is_installed_under_its_label() -> None:
    """`apps.library` is installed with label `library`, so `library_*` tables,
    `tenant_data` autodiscovery and the import matrix all see it."""
    config = django_apps.get_app_config("library")
    assert config.name == "apps.library"
