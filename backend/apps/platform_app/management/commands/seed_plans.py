"""`manage.py seed_plans` — plans and the default partner (PLT-15 FR-1).

Idempotent, like every seed (Part 21 §21.8): running it twice changes no row
count and no value a human has since edited, except the two plan rows whose
contents are specification rather than data.

**`DEC-001` is why `free` does not match Part 24 §24.9.1's table.** That table
seeds `free` with `max_users: 1`, `max_parties: 300` and
`max_invoices_per_month: 100`. `DEC-001` defaulted on 2026-09-19 to option (b):
owner plus two members free, the ledger never capped, `max_parties` and
`max_invoices_per_month` removed from enforcement on every MVP plan, with
`CR-124` amending Part 24 §24.9.1 to match. So `free` is seeded with
`max_users: 3` and the two removed keys are absent — not set to `null`, absent,
so that a reader cannot mistake them for a limit that happens to be unlimited.

`metis` is the default partner and its `default_plan` is `unlimited`, because
"the local single-user deployment seeds `unlimited` as `metis.default_plan_id`,
so nothing in the product ever blocks the person the spec is being built for"
(Part 24 §24.9.1).
"""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction

# Canon §0.3 module codes, minus what has no MVP surface.
MVP_MODULES: tuple[str, ...] = (
    "platform",
    "parties",
    "ledger",
    "inventory",
    "sales",
    "purchases",
    "payments",
    "expenses",
    "reports",
    "notifications",
    "import_export",
    "team",
    "help",
)

# code -> (name, modules, limits, price)
PLANS: dict[str, tuple[str, tuple[str, ...], dict, Any]] = {
    "free": (
        "Free",
        MVP_MODULES,
        # DEC-001: owner plus two members. `storage_mb` is reported by
        # `/auth/me` and has no enforcement point until the `files` app exists.
        {"max_users": 3, "storage_mb": 200},
        None,
    ),
    "unlimited": (
        "Unlimited",
        MVP_MODULES,
        {"max_users": None, "storage_mb": None},
        None,
    ),
}

DEFAULT_PARTNER_CODE = "metis"
DEFAULT_PARTNER_NAME = "Metis Labs"
DEFAULT_PLAN_CODE = "unlimited"


class Command(BaseCommand):
    help = "Seed the `free` and `unlimited` plans and the `metis` default partner. Idempotent."

    @transaction.atomic
    def handle(self, *args: Any, **opts: Any) -> None:
        created_plans = seed_plans()
        created_partner = seed_default_partner()
        self.stdout.write(f"plans: {created_plans} created")
        self.stdout.write(f"partners: {created_partner} created")


def seed_plans() -> int:
    from apps.platform_app.models import Plan

    created = 0
    for code, (name, modules, limits, price) in PLANS.items():
        plan, was_created = Plan.objects.get_or_create(
            code=code,
            defaults={
                "name": name,
                "modules": list(modules),
                "limits": dict(limits),
                "price_inr_month": price,
                "is_active": True,
            },
        )
        if was_created:
            created += 1
            continue
        # The two seeded plans are specification, not merchant data, so their
        # module list and limits are re-asserted rather than left to drift.
        plan.name = name
        plan.modules = list(modules)
        plan.limits = dict(limits)
        plan.is_active = True
        plan.save(update_fields=["name", "modules", "limits", "is_active", "updated_at"])
    return created


def seed_default_partner() -> int:
    """`metis` — the partner every self-serve tenant is created under (WLB-02)."""
    from apps.platform_app.models import Partner, Plan

    default_plan = Plan.objects.filter(code=DEFAULT_PLAN_CODE).first()
    partner, was_created = Partner.objects.get_or_create(
        code=DEFAULT_PARTNER_CODE,
        defaults={
            "name": DEFAULT_PARTNER_NAME,
            "allowed_modules": list(MVP_MODULES),
            "default_plan": default_plan,
            "support_contact": {
                "phone": "+919000000000",
                "whatsapp": "+919000000000",
                "email": "support@metislabs.eu",
            },
        },
    )
    if not was_created and partner.default_plan_id is None and default_plan is not None:
        partner.default_plan = default_plan
        partner.save(update_fields=["default_plan", "updated_at"])
    return int(was_created)
