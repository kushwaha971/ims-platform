"""docs/platform/14 §4.1 — a sign-in opens the business last used."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("platform", "0013_closed_day")]

    operations = [
        migrations.AddField(
            model_name="membership",
            name="last_used_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
