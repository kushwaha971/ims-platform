"""DEC-019 (QA B10) — an expense belongs to the app it was recorded in.

Until now every expense was the business's, and the Library's profit page counted
the Shop's rent and stock purchases as its own spend. The new `app` column says
whose it is. Existing rows are filed under the app the business runs: the Shop
when it runs the Shop (the Expenses page was the Shop's for most of its life), else
the Library, else Lending. A business running the Shop and the Library cannot be
told apart row by row, and the Shop is the honest default for rows written from
the Shop's menu.
"""

from __future__ import annotations

from django.db import migrations, models


def forwards(apps, schema_editor):  # noqa: ANN001, ANN201
    Tenant = apps.get_model("platform", "Tenant")
    Expense = apps.get_model("expenses", "Expense")
    for tenant in Tenant.objects.exclude(enabled_modules__contains=["sales"]):
        modules = set(tenant.enabled_modules or [])
        app = "library" if "library" in modules else "lending" if "lending" in modules else None
        if app:
            Expense.objects.filter(tenant_id=tenant.id).update(app=app)


class Migration(migrations.Migration):
    dependencies = [
        ("expenses", "0002_expense_and_category_colour"),
        ("platform", "0018_release_khata"),
    ]

    operations = [
        migrations.AddField(
            model_name="expense",
            name="app",
            field=models.CharField(default="shop", max_length=32),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
