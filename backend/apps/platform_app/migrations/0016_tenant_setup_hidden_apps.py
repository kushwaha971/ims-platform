from django.contrib.postgres.fields import ArrayField
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("platform", "0015_membership_app_grants")]

    operations = [
        migrations.AddField(
            model_name="tenant",
            name="setup_hidden_apps",
            field=ArrayField(
                base_field=models.CharField(max_length=32), blank=True, default=list, size=None
            ),
        ),
    ]
