"""B02 — the library's sixteen codenames and the four role sets (LIB-14 §9, §10).

These guard the matrix the whole module's permission checks stand on. A view
names a codename; whether the assistant at the counter, the treasurer or the
librarian holds it is decided here and only here.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.test import override_settings

from apps.common.constants import RoleCode
from apps.common.permissions_registry import (
    ENGINE_READ_PERMISSIONS,
    MODULE_OF,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    permissions_for,
)

from .conftest import entitle_library

# LIB-14 §9, copied as the assertion target (the canon-test pattern of
# `apps/common/tests/test_permissions.py`): the test's job is to catch drift.
LIBRARY_CODENAMES = {
    "library.catalogue.read",
    "library.catalogue.write",
    "library.copy.withdraw",
    "library.member.read",
    "library.member.write",
    "library.member.close",
    "library.loan.read",
    "library.loan.write",
    "library.loan.override",
    "library.loan.adjust",
    "library.charge.waive",
    "library.charge.write",
    "library.verification.run",
    "library.verification.close",
    "library.reports.read",
    "library.settings.manage",
}

# LIB-14 §10, the staff column: the assistant and the weekly volunteer.
STAFF_LIBRARY = {
    "library.catalogue.read",
    "library.catalogue.write",
    "library.member.read",
    "library.member.write",
    "library.loan.read",
    "library.loan.write",
    "library.verification.run",
}

# LIB-14 §10, the accountant column: the committee's treasurer.
ACCOUNTANT_LIBRARY = {
    "library.catalogue.read",
    "library.member.read",
    "library.loan.read",
    "library.reports.read",
}

# FR-3: off for staff, grantable per member.
DELEGABLE = {
    "library.loan.override",
    "library.charge.waive",
    "library.loan.adjust",
    "library.copy.withdraw",
}


def _library(codes: frozenset[str] | set[str]) -> set[str]:
    return {c for c in codes if c.startswith("library.")}


def test_the_registry_declares_exactly_the_sixteen() -> None:
    """FR-1: a seventeenth codename invented at a call site, or one of the
    sixteen spelt differently in the registry, would make `HasPermission`
    refuse the view at import time — or worse, accept a codename no role holds."""
    assert _library(PERMISSIONS) == LIBRARY_CODENAMES
    assert all(MODULE_OF[c] == "library" for c in LIBRARY_CODENAMES)


def test_staff_holds_exactly_the_seven() -> None:
    """T-LIB-14-2: the volunteer works the counter and nothing else. A slip
    here hands the weekly volunteer waivers, overrides or the settings."""
    assert _library(ROLE_PERMISSIONS[RoleCode.STAFF.value]) == STAFF_LIBRARY
    assert not DELEGABLE & ROLE_PERMISSIONS[RoleCode.STAFF.value]


def test_accountant_holds_exactly_the_four_reads() -> None:
    """T-LIB-14-2: the treasurer reads the money and writes nothing. The
    accountant's set is built from a `.read` suffix, so a codename that ends
    in `.read` by accident (or a write that does) changes this silently."""
    assert _library(ROLE_PERMISSIONS[RoleCode.ACCOUNTANT.value]) == ACCOUNTANT_LIBRARY


def test_owner_and_admin_hold_all_sixteen() -> None:
    """T-LIB-14-2: the librarian is the admin and runs the whole library."""
    for role in (RoleCode.OWNER, RoleCode.ADMIN):
        assert _library(ROLE_PERMISSIONS[role.value]) == LIBRARY_CODENAMES, role


def test_the_dues_engine_read_codename_now_exists() -> None:
    """A12 left `library.member.read` as a string that fails closed until the
    library registered it; B02 is the commit that makes it a real codename."""
    assert ENGINE_READ_PERMISSIONS["dues"]["library"] in PERMISSIONS


def _member_with(membership: Any, system_roles: dict, role: RoleCode, **override: Any) -> Any:
    membership.role = system_roles[role.value]
    membership.permissions_override = override or {}
    membership.save(update_fields=["role", "permissions_override"])
    return membership


@pytest.mark.django_db
def test_a_hidden_library_grants_nothing_even_to_an_explicit_allow(
    membership: Any, system_roles: dict
) -> None:
    """T-LIB-14-3: library entitled and switched on but unreleased (no flag).
    An owner — and a staff member granted `library.charge.waive` by override —
    must hold no `library.*`, or an unreleased module leaks through the
    permissions endpoint before its QA."""
    entitle_library(membership.tenant)
    with override_settings(UB_UNRELEASED_MODULES=False):
        owner = _member_with(membership, system_roles, RoleCode.OWNER)
        assert not _library(permissions_for(owner))
        staff = _member_with(
            membership, system_roles, RoleCode.STAFF, allow=["library.charge.waive"]
        )
        assert not _library(permissions_for(staff))


@pytest.mark.django_db
def test_a_switched_off_library_grants_nothing(membership: Any, system_roles: dict) -> None:
    """T-LIB-14-3: released by the flag and on the plan, but the tenant has
    switched it off: the codenames vanish from every member, override or not."""
    tenant = entitle_library(membership.tenant)
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "library"]
    tenant.save(update_fields=["enabled_modules"])
    with override_settings(UB_UNRELEASED_MODULES=True):
        owner = _member_with(membership, system_roles, RoleCode.OWNER)
        owner.tenant.refresh_from_db()
        assert not _library(permissions_for(owner))
        staff = _member_with(
            membership, system_roles, RoleCode.STAFF, allow=["library.loan.override"]
        )
        assert not _library(permissions_for(staff))


@pytest.mark.django_db
def test_with_library_on_the_role_sets_and_a_delegation_reach_the_member(
    membership: Any, system_roles: dict
) -> None:
    """The positive control for the two tests above, so neither can pass
    because nothing ever grants a library codename (the harness lesson). It
    also proves FR-3: a staff member granted waiving holds it, and a deny
    removes a role codename."""
    entitle_library(membership.tenant)
    with override_settings(UB_UNRELEASED_MODULES=True):
        owner = _member_with(membership, system_roles, RoleCode.OWNER)
        assert _library(permissions_for(owner)) == LIBRARY_CODENAMES
        staff = _member_with(
            membership,
            system_roles,
            RoleCode.STAFF,
            allow=["library.charge.waive"],
            deny=["library.loan.write"],
        )
        assert _library(permissions_for(staff)) == (STAFF_LIBRARY | {"library.charge.waive"}) - {
            "library.loan.write"
        }
