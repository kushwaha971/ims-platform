"""QA F10 — a business running Library can bring its register in from a file.

The import wizard is the `import_export` module, and until now only the Shop
listed it among the modules it brings: a business that chose Library alone at
sign-up (DEC-016) never had it, so its owner's Import action was hidden and the
server refused the upload. `library`'s AppSpec now carries it; this switches it on
for the businesses already running Library, where their plan includes it — the
same rule `set_app_running` applies for a business switching the app on today.

Backwards leaves `import_export` alone: by then a business may also run the Shop,
which needs it, and there is no telling the two apart.
"""

from __future__ import annotations

from django.db import migrations

CODE = "library"
MODULE = "import_export"


def forwards(apps, schema_editor):  # noqa: ANN001, ANN201
    Tenant = apps.get_model("platform", "Tenant")
    for tenant in Tenant.objects.filter(enabled_modules__contains=[CODE]).select_related("plan"):
        modules = list(tenant.enabled_modules or [])
        if MODULE not in modules and MODULE in (tenant.plan.modules or []):
            tenant.enabled_modules = [*modules, MODULE]
            tenant.save(update_fields=["enabled_modules"])


class Migration(migrations.Migration):
    dependencies = [
        ("library", "0010_release"),
        ("platform", "0018_release_khata"),
    ]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
