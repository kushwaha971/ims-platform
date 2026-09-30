"""A6 — `parties_relation` (FRD 00 PLT-X04 §5, contracts §1.3, ADR-046).

A guardian or payer linked to a person. Both ends RESTRICT (a party is archived,
never deleted); the CHECKs refuse a self relation, an unknown kind and an end
date before the start. Reversible: the table is new and nothing else reads it.
"""


import apps.common.db.fields
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("parties", "0009_party_bucket_caches"),
        ("platform", "0013_closed_day"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PartyRelation",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=apps.common.db.fields.uuid7,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "kind",
                    models.CharField(
                        choices=[("guardian", "Guardian"), ("payer", "Pays for")], max_length=12
                    ),
                ),
                ("receives_messages", models.BooleanField(db_default=False, default=False)),
                ("from_on", models.DateField()),
                ("to_on", models.DateField(blank=True, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "party",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="relations_as_person",
                        to="parties.party",
                    ),
                ),
                (
                    "related_party",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="relations_as_related",
                        to="parties.party",
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="+",
                        to="platform.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "parties_relation",
                "indexes": [
                    models.Index(fields=["tenant", "party"], name="ix_party_relation_party"),
                    models.Index(
                        fields=["tenant", "related_party"], name="ix_party_relation_related"
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("tenant", "party", "related_party", "kind"),
                        name="uq_party_relation",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("party", models.F("related_party")), _negated=True),
                        name="ck_party_relation_not_self",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(("kind__in", ["guardian", "payer"])),
                        name="ck_party_relation_kind",
                    ),
                    models.CheckConstraint(
                        condition=models.Q(
                            ("to_on__isnull", True),
                            ("to_on__gte", models.F("from_on")),
                            _connector="OR",
                        ),
                        name="ck_party_relation_dates",
                    ),
                ],
            },
        ),
    ]
