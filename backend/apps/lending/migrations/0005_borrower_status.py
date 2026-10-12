"""A borrower can be blocked from new loans (owner, 12 Oct 2026).

Schema only. Every existing borrower becomes `active` through the column
default, which is what they were: nothing could block anybody before this.
Reverses by dropping the three columns and the check.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lending", "0004_release"),
    ]

    operations = [
        migrations.AddField(
            model_name="lendingborrower",
            name="blocked_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="lendingborrower",
            name="blocked_reason",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
        migrations.AddField(
            model_name="lendingborrower",
            name="status",
            field=models.CharField(default="active", max_length=10),
        ),
        migrations.AddConstraint(
            model_name="lendingborrower",
            constraint=models.CheckConstraint(
                condition=models.Q(("status__in", ["active", "blocked"])),
                name="ck_lending_borrower_status",
            ),
        ),
    ]
