"""Release the Udhaar book as an app of its own (DEC-019; owner, 12 Oct 2026).

Until now the Udhaar book — You gave / You got with a person — lived inside the
Shop's menu as its Customers list. The owner's ruling is that it is a standalone
app, like Khatabook, and never part of the Shop: some businesses want only the
udhaar book. Its anchor is the new `khata` module.

Forwards:

* every plan gets the module, and every partner that already allows the whole
  MVP set gets it too (a partner restricted to fewer modules is left alone) —
  the same release rule as `lending/0004_release` and `library/0010_release`;
* every business that runs the Shop gets `khata` switched on. Those businesses
  had the udhaar book yesterday as part of the Shop, and their You gave / You
  got lines are in the `main` bucket; without this they would wake up with
  their khata gone from every menu. A business without the Shop (a library, a
  lender) did not have it and is not given it — DEC-016: a business is never
  handed an app it did not choose.

Backwards removes the code from the same rows.
"""

from __future__ import annotations

from django.db import migrations

CODE = "khata"

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
    "lending",
    "library",
)


def forwards(apps, schema_editor):  # noqa: ANN001, ANN201
    Plan = apps.get_model("platform", "Plan")
    Partner = apps.get_model("platform", "Partner")
    Tenant = apps.get_model("platform", "Tenant")
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
    for tenant in Tenant.objects.filter(enabled_modules__contains=["sales"]):
        modules = list(tenant.enabled_modules or [])
        if CODE not in modules:
            tenant.enabled_modules = [*modules, CODE]
            tenant.save(update_fields=["enabled_modules"])


def backwards(apps, schema_editor):  # noqa: ANN001, ANN201
    Plan = apps.get_model("platform", "Plan")
    Partner = apps.get_model("platform", "Partner")
    Tenant = apps.get_model("platform", "Tenant")
    for plan in Plan.objects.all():
        if CODE in (plan.modules or []):
            plan.modules = [m for m in plan.modules if m != CODE]
            plan.save(update_fields=["modules"])
    for partner in Partner.objects.all():
        if CODE in (partner.allowed_modules or []):
            partner.allowed_modules = [m for m in partner.allowed_modules if m != CODE]
            partner.save(update_fields=["allowed_modules"])
    for tenant in Tenant.objects.filter(enabled_modules__contains=[CODE]):
        tenant.enabled_modules = [m for m in tenant.enabled_modules if m != CODE]
        tenant.save(update_fields=["enabled_modules"])


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0017_otp_provider_verification_id"),
        ("lending", "0004_release"),
        ("library", "0010_release"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
