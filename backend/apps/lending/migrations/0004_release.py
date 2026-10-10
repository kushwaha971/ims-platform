"""Release Lending & collections to merchants (PLT-X11 BR-4; owner, 10 Oct 2026).

Until now `lending` was in `UNRELEASED_MODULES`: built, tested and hidden. The
owner asked for it to be switched on for the coming deployment, so this is the
release data migration ADR-041 prescribes, shipped in the same commit that
removes the code from that set and adds it to `seed_plans.MVP_MODULES` — a
fresh database (seeded) and an existing one (migrated) therefore converge.

Forwards: every plan gets the module, and every partner that already allows the
whole MVP set gets it too (a partner deliberately restricted to fewer modules
is left alone). No tenant's `enabled_modules` is touched: a business gets the
module when it is created for it, or when its owner switches it on.

Backwards removes the code from the same rows.
"""

from __future__ import annotations

from django.db import migrations

CODE = "lending"

# `seed_plans.MVP_MODULES` as it stood the day before, written out literally.
MVP_BEFORE = (
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


def forwards(apps, schema_editor):  # noqa: ANN001, ANN201
    Plan = apps.get_model("platform", "Plan")
    Partner = apps.get_model("platform", "Partner")
    for plan in Plan.objects.all():
        modules = list(plan.modules or [])
        if CODE not in modules:
            plan.modules = [*modules, CODE]
            plan.save(update_fields=["modules"])
    for partner in Partner.objects.all():
        allowed = list(partner.allowed_modules or [])
        if set(MVP_BEFORE) <= set(allowed) and CODE not in allowed:
            partner.allowed_modules = [*allowed, CODE]
            partner.save(update_fields=["allowed_modules"])


def backwards(apps, schema_editor):  # noqa: ANN001, ANN201
    Plan = apps.get_model("platform", "Plan")
    Partner = apps.get_model("platform", "Partner")
    for plan in Plan.objects.all():
        if CODE in (plan.modules or []):
            plan.modules = [m for m in plan.modules if m != CODE]
            plan.save(update_fields=["modules"])
    for partner in Partner.objects.all():
        if CODE in (partner.allowed_modules or []):
            partner.allowed_modules = [m for m in partner.allowed_modules if m != CODE]
            partner.save(update_fields=["allowed_modules"])


class Migration(migrations.Migration):
    dependencies = [
        ("lending", "0003_status_reason"),
        ("platform", "0017_otp_provider_verification_id"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
