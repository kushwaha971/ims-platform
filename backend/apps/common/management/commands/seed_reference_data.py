"""`manage.py seed_reference_data` — idempotent reference seeds (Part 32 S0-39).

Part 21 §21.8: seed data lives in idempotent management commands, not in
migrations. Running this twice changes no row count.

Seeds, in order:

1. The four system roles with the codename sets of canon §0.9. The authority on
   those sets is `apps.common.permissions_registry.ROLE_PERMISSIONS`; this
   command copies them into `platform_role.permissions` so `GET /roles` can serve
   them, and `test_roles.py` asserts the two never diverge.
2. GST tax rates, including the 2025-09-21 boundary: `GST12` and `GST28` are
   legacy slabs whose `effective_to` is 2025-09-21, and the GST-2.0 slabs
   `GST5` / `GST18` / `GST40` run from 2025-09-22.
3. The system UQC units, with `tenant = NULL`.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.common.constants import RoleCode
from apps.common.permissions_registry import ROLE_PERMISSIONS

GST_REFORM_FROM = dt.date(2025, 9, 22)
GST_LEGACY_TO = dt.date(2025, 9, 21)
GST_ORIGIN = dt.date(2017, 7, 1)

ROLE_NAMES = {
    RoleCode.OWNER.value: "Owner",
    RoleCode.ADMIN.value: "Admin",
    RoleCode.STAFF.value: "Staff",
    RoleCode.ACCOUNTANT.value: "Accountant",
}

# (code, name, rate, cess, effective_from, effective_to)
TAX_RATES: tuple[tuple[str, str, str, str, dt.date, dt.date | None], ...] = (
    ("GST0", "GST 0%", "0.000", "0.000", GST_ORIGIN, None),
    ("GST0_25", "GST 0.25%", "0.250", "0.000", GST_ORIGIN, None),
    ("GST3", "GST 3%", "3.000", "0.000", GST_ORIGIN, None),
    ("GST5", "GST 5%", "5.000", "0.000", GST_ORIGIN, None),
    ("GST12", "GST 12% (legacy)", "12.000", "0.000", GST_ORIGIN, GST_LEGACY_TO),
    ("GST18", "GST 18%", "18.000", "0.000", GST_ORIGIN, None),
    ("GST28", "GST 28% (legacy)", "28.000", "0.000", GST_ORIGIN, GST_LEGACY_TO),
    ("GST40", "GST 40%", "40.000", "0.000", GST_REFORM_FROM, None),
    ("EXEMPT", "Exempt", "0.000", "0.000", GST_ORIGIN, None),
    ("NIL", "Nil rated", "0.000", "0.000", GST_ORIGIN, None),
    ("NONGST", "Non-GST supply", "0.000", "0.000", GST_ORIGIN, None),
)

# (code, name, allow_decimal) — GST Unique Quantity Codes.
UNITS: tuple[tuple[str, str, bool], ...] = (
    ("NOS", "Numbers", False),
    ("PCS", "Pieces", False),
    ("KGS", "Kilograms", True),
    ("GMS", "Grams", True),
    ("LTR", "Litres", True),
    ("MLT", "Millilitres", True),
    ("MTR", "Metres", True),
    ("CMS", "Centimetres", True),
    ("SQF", "Square feet", True),
    ("SQM", "Square metres", True),
    ("BOX", "Box", False),
    ("BAG", "Bags", False),
    ("BTL", "Bottles", False),
    ("PAC", "Packs", False),
    ("SET", "Sets", False),
    ("DOZ", "Dozens", False),
    ("PRS", "Pairs", False),
    ("ROL", "Rolls", False),
    ("TON", "Tonnes", True),
    ("HRS", "Hours", True),
    # INV-04 FR-1 names three more UQC codes the Sprint 0 list did not carry.
    ("BDL", "Bundles", False),
    ("QTL", "Quintal", True),
    ("CAN", "Cans", False),
)

# INV-01 FR-4 — a STARTER HSN/SAC master, so HSN search answers something on a
# fresh install ("rice" → 1006 → GST5 is the Sprint 6 demo). Part 32 names a
# `seed_hsn` loading the full public master; that file is a download this repo
# does not carry, and FR-4 allows free typing of any code not in the master (with
# the `hsn_unknown` warning), so a partial master degrades to a hint, not a block.
# Default slabs are the GST-2.0 ones in force from 22 Sep 2025 — a suggestion the
# merchant confirms, never a rate stored on the item (INV-01 BR-4).
# (code, description, default_tax_code, is_service)
HSN_STARTER: tuple[tuple[str, str, str, bool], ...] = (
    ("0401", "Milk and cream, fresh, not concentrated", "EXEMPT", False),
    ("0405", "Butter, ghee and other fats derived from milk", "GST5", False),
    ("0406", "Cheese and paneer", "GST5", False),
    ("0407", "Birds' eggs, in shell", "EXEMPT", False),
    ("0701", "Potatoes, fresh or chilled", "EXEMPT", False),
    ("0703", "Onions, garlic, fresh or chilled", "EXEMPT", False),
    ("0713", "Dried leguminous vegetables (pulses, dal)", "GST5", False),
    ("0801", "Coconuts, cashew nuts", "GST5", False),
    ("0902", "Tea", "GST5", False),
    ("0901", "Coffee", "GST5", False),
    ("0904", "Pepper and chilli, dried or ground", "GST5", False),
    ("0910", "Ginger, turmeric and other spices", "GST5", False),
    ("1001", "Wheat and meslin", "EXEMPT", False),
    ("1006", "Rice", "GST5", False),
    ("1101", "Wheat or meslin flour (atta, maida)", "GST5", False),
    ("1507", "Soya-bean oil", "GST5", False),
    ("1508", "Groundnut oil", "GST5", False),
    ("1514", "Rapeseed, colza or mustard oil", "GST5", False),
    ("1701", "Cane or beet sugar", "GST5", False),
    ("1704", "Sugar confectionery", "GST5", False),
    ("1806", "Chocolate and food preparations containing cocoa", "GST5", False),
    ("1902", "Pasta, noodles, vermicelli", "GST5", False),
    ("1905", "Bread, biscuits, cakes and bakery products", "GST5", False),
    ("2106", "Food preparations n.e.s. (namkeen, bhujia)", "GST5", False),
    ("2201", "Waters, including mineral and aerated water, unsweetened", "GST5", False),
    ("2202", "Aerated and sweetened beverages", "GST40", False),
    ("2501", "Salt", "EXEMPT", False),
    ("2523", "Portland cement", "GST18", False),
    ("3305", "Hair preparations (shampoo, hair oil)", "GST5", False),
    ("3306", "Oral hygiene preparations (toothpaste)", "GST5", False),
    ("3401", "Soap, washing bars", "GST5", False),
    ("3402", "Detergents and washing preparations", "GST18", False),
    ("4820", "Registers, account books, notebooks", "EXEMPT", False),
    ("6109", "T-shirts and vests, knitted", "GST5", False),
    ("6403", "Footwear with outer soles of rubber or leather", "GST5", False),
    ("8415", "Air-conditioning machines", "GST18", False),
    ("8517", "Telephones, mobile phones", "GST18", False),
    ("8528", "Monitors and television receivers", "GST18", False),
    ("9608", "Ball-point pens, markers", "GST18", False),
    ("9954", "Construction services", "GST18", True),
    ("9963", "Accommodation, food and beverage services", "GST5", True),
    ("9964", "Passenger transport services", "GST5", True),
    ("9971", "Financial and related services", "GST18", True),
    ("9983", "Other professional, technical and business services", "GST18", True),
    ("9985", "Support services", "GST18", True),
    ("9987", "Maintenance, repair and installation services", "GST18", True),
    ("9997", "Other services", "GST18", True),
)

# Part 21 §21.3.10: the seeded expense categories.
EXPENSE_CATEGORIES: tuple[tuple[str, str], ...] = (
    ("rent", "Rent"),
    ("salaries", "Salaries"),
    ("electricity", "Electricity"),
    ("transport", "Transport"),
    ("purchases_misc", "Purchases-misc"),
    ("food", "Food"),
    ("marketing", "Marketing"),
    ("fees", "Fees"),
    ("other", "Other"),
)


class Command(BaseCommand):
    help = "Seed system roles, GST tax rates and system units. Idempotent."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--tenant",
            default=None,
            help="Also seed the per-tenant reference data (expense categories) for this tenant id.",
        )

    @transaction.atomic
    def handle(self, *args: Any, **opts: Any) -> None:
        counts = {
            "roles": seed_roles(),
            "tax_rates": seed_tax_rates(),
            "units": seed_units(),
            "hsn": seed_hsn(),
        }
        if opts["tenant"]:
            from apps.platform_app.models import Tenant

            tenant = Tenant.objects.get(pk=opts["tenant"])
            counts["expense_categories"] = seed_expense_categories(tenant)
        for name, created in counts.items():
            self.stdout.write(f"{name}: {created} created")


def seed_roles() -> int:
    """The four system roles (canon §0.9). `tenant` is NULL for a system role."""
    from apps.platform_app.models import Role

    created = 0
    for code, permissions in ROLE_PERMISSIONS.items():
        role, was_created = Role.objects.get_or_create(
            tenant=None,
            code=code,
            defaults={
                "name": ROLE_NAMES[code],
                "is_system": True,
                "permissions": sorted(permissions),
            },
        )
        if was_created:
            created += 1
        else:
            wanted = sorted(permissions)
            if role.permissions != wanted or role.name != ROLE_NAMES[code]:
                role.permissions = wanted
                role.name = ROLE_NAMES[code]
                role.is_system = True
                role.save(update_fields=["permissions", "name", "is_system", "updated_at"])
    return created


def seed_tax_rates() -> int:
    """Global GST slabs, with the 2025-09-21 legacy boundary (table T-25)."""
    from apps.tax.models import TaxRate

    created = 0
    for code, name, rate, cess, effective_from, effective_to in TAX_RATES:
        _row, was_created = TaxRate.objects.get_or_create(
            tenant=None,
            code=code,
            effective_from=effective_from,
            defaults={
                "name": name,
                "rate": Decimal(rate),
                "cess_rate": Decimal(cess),
                "effective_to": effective_to,
                "is_active": True,
            },
        )
        created += int(was_created)
    return created


def seed_units() -> int:
    """System UQC units, `tenant = NULL` (Part 21 §21.3.6)."""
    from apps.inventory.models import Unit

    created = 0
    for code, name, allow_decimal in UNITS:
        _row, was_created = Unit.objects.get_or_create(
            tenant=None,
            code=code,
            defaults={"name": name, "allow_decimal": allow_decimal, "is_system": True},
        )
        created += int(was_created)
    return created


def seed_hsn() -> int:
    """The starter HSN/SAC master (INV-01 FR-4). Idempotent by code."""
    from apps.tax.models import HsnCode

    created = 0
    for code, description, tax_code, is_service in HSN_STARTER:
        _row, was_created = HsnCode.objects.get_or_create(
            code=code,
            defaults={
                "description": description,
                "default_tax_code": tax_code,
                "is_service": is_service,
            },
        )
        created += int(was_created)
    return created


def seed_expense_categories(tenant: Any) -> int:
    """Per-tenant expense categories (Part 21 §21.3.10).

    These are tenant rows, not global ones, because a merchant renames them.
    Called at onboarding and by `seed_reference_data --tenant`.
    """
    from apps.expenses.models import ExpenseCategory

    created = 0
    for order, (system_code, name) in enumerate(EXPENSE_CATEGORIES):
        _row, was_created = ExpenseCategory.objects.get_or_create(
            tenant=tenant,
            name=name,
            defaults={"system_code": system_code, "is_system": True, "sort_order": order},
        )
        created += int(was_created)
    return created
