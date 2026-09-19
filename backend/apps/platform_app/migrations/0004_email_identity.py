"""Email becomes the login identifier; mobile becomes optional (DEC-010).

Written by hand rather than taken from `makemigrations` for one reason: the
auto-generated version alters `platform_user.email` to `NOT NULL UNIQUE`
without first putting a value in the rows that have none, which fails on any
database that already holds a user. The backfill has to run **before** the
`AlterField`, and it has to be reversible, so it is spelled out here.

Reversibility. Forward is safe on a populated database. Backward restores the
pre-DEC-010 shape exactly — nullable unique-where-not-null `email`, `NOT NULL
UNIQUE` mobile — and therefore fails if any row created since has no mobile,
which is a row the old schema had no way to represent. That is a property of
the decision, not a defect in the migration: the reverse is for a database that
has not been used under the new shape.
"""

from __future__ import annotations

from django.db import migrations, models

SYNTHETIC_DOMAIN = "mobile.invalid"  # RFC 2606 §2 — never routable


def backfill_emails(apps, schema_editor):
    """Give every user without an address one derived from their number.

    `.invalid` is reserved precisely so an address built from it cannot be
    delivered to by accident. Such a user can sign in only through the OTP flow
    (`UB_AUTH_OTP_ENABLED=1`) and must be given a real address before password
    login or a password reset can work for them, which is the honest outcome:
    the account never had an address to prove.
    """
    User = apps.get_model("platform", "User")
    for user in User.objects.filter(models.Q(email__isnull=True) | models.Q(email="")):
        digits = "".join(c for c in (user.mobile or "") if c.isdigit()) or str(user.pk).replace(
            "-", ""
        )
        User.objects.filter(pk=user.pk).update(email=f"{digits}@{SYNTHETIC_DOMAIN}")


def unfill_emails(apps, schema_editor):
    """Undo exactly what `backfill_emails` wrote, and nothing a person typed."""
    User = apps.get_model("platform", "User")
    User.objects.filter(email__endswith=f"@{SYNTHETIC_DOMAIN}").update(email=None)


class Migration(migrations.Migration):

    dependencies = [
        ("platform", "0003_rate_limit_and_tenantless_idempotency"),
    ]

    operations = [
        migrations.RunPython(backfill_emails, unfill_emails),
        migrations.RemoveConstraint(
            model_name="user",
            name="uq_user_email_notnull",
        ),
        migrations.AlterField(
            model_name="user",
            name="email",
            field=models.EmailField(max_length=254, unique=True),
        ),
        migrations.AlterField(
            model_name="user",
            name="mobile",
            field=models.CharField(blank=True, max_length=15, null=True),
        ),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                condition=models.Q(("mobile__isnull", False)),
                fields=("mobile",),
                name="uq_user_mobile_notnull",
            ),
        ),
        migrations.AddField(
            model_name="user",
            name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
