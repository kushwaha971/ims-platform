"""`platform_invitation.email` — the identity an invitation is actually for.

`DEC-010` made email the identifier and left `mobile` an optional profile field;
`CR-2026-09-19-D` then removed mobile from the sign-up form. From that point
every account the product can create has `mobile = None`, so `accept_invitation`
— which matched `invitation.mobile == user.mobile` — could never succeed for any
of them. `CR-140` raised this as blocking `PLT-05`; this migration is the
resolution: invitations key on `email`, and `mobile` becomes what it now is, a
nullable notification channel.

`email` is added NOT NULL with a one-off `""` default rather than as a nullable
column. Any row that predates this migration is an invitation nobody could have
accepted, so there is nothing to back-fill and nothing to preserve; `""` never
equals a real `platform_user.email`, so such a row stays unacceptable — which is
the state it was already in — instead of becoming acceptable by accident.
Reversing the migration drops the column and restores `mobile` to NOT NULL.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("platform", "0005_auth_token"),
    ]

    operations = [
        migrations.AddField(
            model_name="invitation",
            name="email",
            field=models.EmailField(default="", max_length=254),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="invitation",
            name="mobile",
            field=models.CharField(blank=True, max_length=15, null=True),
        ),
        migrations.AddIndex(
            model_name="invitation",
            index=models.Index(
                fields=["email", "status"], name="ix_invitation_email_status"
            ),
        ),
    ]
