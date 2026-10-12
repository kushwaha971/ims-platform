"""DEC-019 phase 2 — the Udhaar book is an app of its own.

The owner, 12 Oct 2026: You gave / You got is a standalone app like Khatabook,
never part of the Shop, because some businesses want only the udhaar book. Its
anchor is the `khata` module. These tests name what would go wrong otherwise:
the app missing from the registry (nobody could add it), a Shop business losing
the udhaar book it had yesterday, a library being handed an app it never chose
(DEC-016), and the Udhaar book stealing the Shop's place as the landing app.
"""

from __future__ import annotations

import importlib
from typing import Any

import pytest
from django.apps import apps as django_apps

from apps.platform_app import apps_registry
from tests.factories.platform import ALL_MODULES, PartnerFactory, PlanFactory, TenantFactory

pytestmark = pytest.mark.django_db

release = importlib.import_module("apps.platform_app.migrations.0018_release_khata")


def test_the_udhaar_book_is_registered_as_its_own_app() -> None:
    spec = apps_registry.app_spec("khata")
    assert spec is not None
    assert spec.anchor == "khata"
    assert spec.home_path == "/khata"
    # It uses the person and the ledger engine, and nothing of the Shop's.
    assert spec.capabilities == frozenset({"khata", "parties", "ledger"})


def test_a_business_running_both_still_lands_in_the_shop() -> None:
    """A Shop business that is given the Udhaar book keeps landing where it always did."""
    shop, khata = apps_registry.app_spec("shop"), apps_registry.app_spec("khata")
    assert shop is not None and khata is not None
    assert shop.order < khata.order


def test_a_business_with_khata_runs_the_udhaar_book() -> None:
    modules = [*ALL_MODULES, "khata"]
    tenant = TenantFactory(
        partner=PartnerFactory(allowed_modules=modules),
        plan=PlanFactory(modules=modules),
        enabled_modules=modules,
    )
    assert "khata" in {a.code for a in apps_registry.apps_of_business(tenant)}


def test_the_release_gives_a_shop_business_its_udhaar_book_and_nobody_else() -> None:
    """Yesterday a Shop business had the udhaar book inside the Shop; it must not wake up
    without it. A library never had it and is not handed it (DEC-016)."""
    shop = TenantFactory(enabled_modules=[*ALL_MODULES])
    library = TenantFactory(enabled_modules=["platform", "parties", "ledger", "library"])

    release.forwards(django_apps, None)

    shop.refresh_from_db()
    library.refresh_from_db()
    assert "khata" in shop.enabled_modules
    assert "khata" not in library.enabled_modules
    assert "khata" in shop.plan.modules

    release.backwards(django_apps, None)
    shop.refresh_from_db()
    assert "khata" not in shop.enabled_modules


def test_the_release_is_idempotent(tenant: Any) -> None:
    release.forwards(django_apps, None)
    release.forwards(django_apps, None)
    tenant.refresh_from_db()
    assert tenant.enabled_modules.count("khata") == 1
