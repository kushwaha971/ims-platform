"""`seed_reference_data` is idempotent and matches the registry (task S0-39)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from apps.common.permissions_registry import ROLE_PERMISSIONS
from apps.expenses.models import ExpenseCategory
from apps.inventory.models import Unit
from apps.platform_app.models import Role
from apps.tax.models import TaxRate

pytestmark = pytest.mark.django_db


def _seed(**kwargs: Any) -> str:
    out = StringIO()
    call_command("seed_reference_data", stdout=out, **kwargs)
    return out.getvalue()


def test_running_twice_changes_no_row_count() -> None:
    _seed()
    counts = (Role.objects.count(), TaxRate.objects.count(), Unit.objects.count())
    _seed()
    assert (Role.objects.count(), TaxRate.objects.count(), Unit.objects.count()) == counts


def test_the_four_system_roles_are_seeded_with_tenant_null() -> None:
    _seed()
    roles = Role.objects.filter(tenant__isnull=True, is_system=True)
    assert set(roles.values_list("code", flat=True)) == {"owner", "admin", "staff", "accountant"}


def test_the_seeded_role_rows_never_diverge_from_the_code_registry() -> None:
    """Part 20 §20.5.5: `ROLE_PERMISSIONS` is the authority; the rows must agree."""
    _seed()
    for role in Role.objects.filter(is_system=True):
        assert set(role.permissions) == set(ROLE_PERMISSIONS[role.code]), role.code


def test_a_drifted_role_row_is_repaired_on_the_next_run() -> None:
    _seed()
    role = Role.objects.get(code="staff", tenant__isnull=True)
    role.permissions = ["parties.party.read"]
    role.save(update_fields=["permissions"])

    _seed()
    role.refresh_from_db()
    assert set(role.permissions) == set(ROLE_PERMISSIONS["staff"])


def test_gst12_carries_the_2025_09_21_boundary() -> None:
    _seed()
    legacy = TaxRate.objects.get(code="GST12", tenant__isnull=True)
    assert legacy.effective_to == dt.date(2025, 9, 21)
    assert legacy.rate == Decimal("12.000")

    assert TaxRate.objects.get(code="GST28").effective_to == dt.date(2025, 9, 21)


def test_the_gst_2_0_slabs_are_open_ended() -> None:
    _seed()
    for code in ("GST0", "GST5", "GST18", "GST40"):
        assert TaxRate.objects.get(code=code).effective_to is None


def test_gst40_starts_at_the_reform_date() -> None:
    _seed()
    assert TaxRate.objects.get(code="GST40").effective_from == dt.date(2025, 9, 22)


def test_every_canon_tax_code_exists() -> None:
    _seed()
    codes = set(TaxRate.objects.values_list("code", flat=True))
    assert codes == {
        "GST0",
        "GST0_25",
        "GST3",
        "GST5",
        "GST12",
        "GST18",
        "GST28",
        "GST40",
        "EXEMPT",
        "NIL",
        "NONGST",
    }


def test_system_units_are_global_rows() -> None:
    _seed()
    assert Unit.objects.filter(tenant__isnull=True, is_system=True).count() >= 20
    nos = Unit.objects.get(code="NOS")
    assert nos.allow_decimal is False
    assert Unit.objects.get(code="KGS").allow_decimal is True


def test_expense_categories_are_seeded_per_tenant(tenant: Any) -> None:
    _seed(tenant=str(tenant.id))
    names = set(ExpenseCategory.objects.for_tenant(tenant).values_list("name", flat=True))
    assert names == {
        "Rent",
        "Salaries",
        "Electricity",
        "Transport",
        "Purchases-misc",
        "Food",
        "Marketing",
        "Fees",
        "Other",
    }
    _seed(tenant=str(tenant.id))
    assert ExpenseCategory.objects.for_tenant(tenant).count() == 9
