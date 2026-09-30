"""A7 — reminder source link, recipient and message group (FRD 00 PLT-X06 §5, R9, R10).

Adds `module`, `source_type`, `source_id`, `subject_label`, `recipient_party_id`
and `message_group_id` to `ledger_reminder`; the `due` and `notice` kinds; two
CHECKs (a source is both halves or neither; a notice carries no amount); and
widens `uq_reminder_auto_per_day` to `(party, due_on, kind, source_id)` NULLS NOT
DISTINCT over the module kinds, so today's party rows (source NULL) stay unique.
Reversible: the reverse drops the columns and restores the two-kind index, which
holds for every row that existed before (no `due`/`notice` rows can exist then).
`ledger_entry` is untouched, so the append-only trigger is not re-created.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ledger", "0006_entry_bucket"),
        ("parties", "0010_party_relation"),
        ("platform", "0013_closed_day"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="reminder",
            name="uq_reminder_auto_per_day",
        ),
        migrations.AddField(
            model_name="reminder",
            name="message_group_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="reminder",
            name="module",
            field=models.CharField(blank=True, db_default="", default="", max_length=32),
        ),
        migrations.AddField(
            model_name="reminder",
            name="recipient_party",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.RESTRICT,
                related_name="reminders_received",
                to="parties.party",
            ),
        ),
        migrations.AddField(
            model_name="reminder",
            name="source_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="reminder",
            name="source_type",
            field=models.CharField(blank=True, max_length=48, null=True),
        ),
        migrations.AddField(
            model_name="reminder",
            name="subject_label",
            field=models.CharField(blank=True, db_default="", default="", max_length=120),
        ),
        migrations.AlterField(
            model_name="reminder",
            name="kind",
            field=models.CharField(
                choices=[
                    ("manual", "Manual"),
                    ("auto_d1", "Day before"),
                    ("auto_d0", "Due day"),
                    ("recurring", "Recurring"),
                    ("due", "Due"),
                    ("notice", "Notice"),
                ],
                default="manual",
                max_length=12,
            ),
        ),
        migrations.AddIndex(
            model_name="reminder",
            index=models.Index(
                condition=models.Q(("source_type__isnull", False)),
                fields=["tenant", "source_type", "source_id"],
                name="ix_reminder_source",
            ),
        ),
        migrations.AddIndex(
            model_name="reminder",
            index=models.Index(
                condition=models.Q(("module", ""), _negated=True),
                fields=["tenant", "module", "source_id", "sent_at"],
                name="ix_reminder_module_sent",
            ),
        ),
        migrations.AddConstraint(
            model_name="reminder",
            constraint=models.UniqueConstraint(
                condition=models.Q(("kind__in", ["auto_d1", "auto_d0", "due", "notice"])),
                fields=("party", "due_on", "kind", "source_id"),
                name="uq_reminder_auto_per_day",
                nulls_distinct=False,
            ),
        ),
        migrations.AddConstraint(
            model_name="reminder",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("source_id__isnull", True), ("source_type__isnull", True)),
                    models.Q(("source_id__isnull", False), ("source_type__isnull", False)),
                    _connector="OR",
                ),
                name="ck_reminder_source_complete",
            ),
        ),
        migrations.AddConstraint(
            model_name="reminder",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(("kind", "notice"), _negated=True),
                    ("snapshot_balance__isnull", True),
                    _connector="OR",
                ),
                name="ck_reminder_notice_has_no_amount",
            ),
        ),
    ]
