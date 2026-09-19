"""The permission registry and `HasPermission` (Part 20 §20.5.5, task S0-35)."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.urls import reverse

from apps.common.constants import RoleCode
from apps.common.permissions import HasPermission
from apps.common.permissions_registry import (
    MODULE_OF,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    permissions_for,
)

# Canon §0.9, copied here as the *assertion target* — this is the one place a
# literal copy is correct, because the test's whole job is to catch drift.
CANON_PERMISSIONS = {
    "platform.tenant.manage",
    "platform.members.manage",
    "platform.branding.manage",
    "platform.audit.read",
    "parties.party.read",
    "parties.party.write",
    "parties.party.delete",
    "parties.party.export",
    "ledger.entry.read",
    "ledger.entry.write",
    "ledger.entry.correct",
    "ledger.reminder.write",
    "ledger.statement.export",
    "inventory.item.read",
    "inventory.item.write",
    "inventory.item.delete",
    "inventory.stock.adjust",
    "inventory.stock.read",
    "inventory.location.manage",
    "sales.estimate.read",
    "sales.estimate.write",
    "sales.invoice.read",
    "sales.invoice.write",
    "sales.invoice.void",
    "sales.credit_note.write",
    "purchases.bill.read",
    "purchases.bill.write",
    "purchases.bill.void",
    "purchases.order.write",
    "payments.payment.read",
    "payments.payment.write",
    "payments.payment.void",
    "payments.request.write",
    "expenses.expense.read",
    "expenses.expense.write",
    "expenses.expense.void",
    "reports.basic.read",
    "reports.financial.read",
    "reports.export",
    "notifications.settings.manage",
}


def test_registry_equals_canon_exactly() -> None:
    assert set(PERMISSIONS) == CANON_PERMISSIONS


# Canon §0.9 states the format `<module>.<resource>.<action>` and then lists one
# codename with two parts. It is reproduced exactly (the registry test above is
# the authority), so the format assertion names the exception rather than
# silently widening to two-or-three parts. Recorded in NOTES-FOR-REVIEW.md.
CANON_FORMAT_EXCEPTIONS = {"reports.export"}


def test_every_codename_is_module_resource_action() -> None:
    """Canon §0.9 fixes the format `<module>.<resource>.<action>`."""
    actions = {
        "read",
        "write",
        "delete",
        "approve",
        "export",
        "manage",
        "correct",
        "adjust",
        "void",
    }
    for codename in PERMISSIONS - CANON_FORMAT_EXCEPTIONS:
        parts = codename.split(".")
        assert len(parts) == 3, f"{codename} is not <module>.<resource>.<action>"
        module, resource, action = parts
        assert module and resource
        assert action in actions, f"{codename} has an action outside canon §0.9"


def test_the_only_two_part_codename_is_the_documented_one() -> None:
    two_part = {p for p in PERMISSIONS if p.count(".") != 2}
    assert two_part == CANON_FORMAT_EXCEPTIONS


def test_owner_has_everything() -> None:
    assert ROLE_PERMISSIONS[RoleCode.OWNER.value] == PERMISSIONS


def test_admin_lacks_only_tenant_manage() -> None:
    assert PERMISSIONS - ROLE_PERMISSIONS[RoleCode.ADMIN.value] == {"platform.tenant.manage"}


def test_staff_exclusions_match_canon() -> None:
    staff = ROLE_PERMISSIONS[RoleCode.STAFF.value]
    assert not any(p.endswith(".void") for p in staff)
    assert "ledger.entry.correct" not in staff
    assert "reports.financial.read" not in staff
    assert not any(p.startswith("platform.") for p in staff)
    # Stock adjust is off by default and granted per member via an override.
    assert "inventory.stock.adjust" not in staff


def test_accountant_has_no_writes() -> None:
    accountant = ROLE_PERMISSIONS[RoleCode.ACCOUNTANT.value]
    assert not any(p.endswith(".write") for p in accountant)
    assert "reports.export" in accountant
    assert "platform.audit.read" in accountant


def test_unknown_codename_fails_at_import_time() -> None:
    with pytest.raises(ImproperlyConfigured):
        HasPermission({"list": "parties.party.invented"})


@pytest.mark.django_db
def test_permissions_for_applies_overrides_and_module_gating(
    membership: Any, system_roles: dict
) -> None:
    membership.role = system_roles[RoleCode.STAFF.value]
    membership.save(update_fields=["role"])
    membership.permissions_override = {
        "allow": ["inventory.stock.adjust"],
        "deny": ["sales.invoice.write"],
    }
    effective = permissions_for(membership)
    assert "inventory.stock.adjust" in effective
    assert "sales.invoice.write" not in effective

    # Deny wins even when the same codename is allowed.
    membership.permissions_override = {
        "allow": ["sales.invoice.write"],
        "deny": ["sales.invoice.write"],
    }
    assert "sales.invoice.write" not in permissions_for(membership)


@pytest.mark.django_db
def test_module_gating_removes_permissions_of_a_disabled_module(membership: Any) -> None:
    membership.tenant.enabled_modules = ["platform", "parties"]
    membership.tenant.save(update_fields=["enabled_modules"])
    effective = permissions_for(membership)
    assert "parties.party.read" in effective
    assert "sales.invoice.write" not in effective
    # platform.* is never module-gated: it is how a tenant switches modules on.
    assert "platform.tenant.manage" in effective


@pytest.mark.django_db
def test_accountant_is_denied_a_write_endpoint(tenant: Any, api_as: Any) -> None:
    """The gate itself, over HTTP. An accountant may read parties."""
    client, _member = api_as(tenant, role=RoleCode.ACCOUNTANT.value)
    assert client.get(reverse("v1:party-list")).status_code == 200


@pytest.mark.django_db
def test_member_without_the_codename_gets_403_permission_denied(tenant: Any, api_as: Any) -> None:
    client, member = api_as(tenant, role=RoleCode.STAFF.value)
    member.permissions_override = {"deny": ["parties.party.read"]}
    member.save(update_fields=["permissions_override"])

    response = client.get(reverse("v1:party-list"))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


@pytest.mark.django_db
def test_disabled_module_is_403_module_disabled_not_permission_denied(
    tenant: Any, api_as: Any
) -> None:
    """Part 20 §20.5.5: entitlement is checked before authorisation."""
    tenant.enabled_modules = ["platform"]
    tenant.save(update_fields=["enabled_modules"])
    client, _member = api_as(tenant)

    response = client.get(reverse("v1:party-list"))
    assert response.status_code == 403
    body = response.json()["error"]
    assert body["code"] == "module_disabled"
    assert body["details"]["module"] == "parties"


@pytest.mark.django_db
def test_stale_permissions_version_is_401_token_stale(tenant: Any, api_as: Any) -> None:
    """A role change takes effect on the member's next request (Part 21 §21.3.1)."""
    client, member = api_as(tenant)
    member.permissions_version += 1
    member.save(update_fields=["permissions_version"])

    response = client.get(reverse("v1:party-list"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_stale"


def test_module_of_maps_every_codename() -> None:
    assert set(MODULE_OF) == set(PERMISSIONS)
