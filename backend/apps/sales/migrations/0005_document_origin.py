"""`sales_document` origin columns (A5, FRD 00 PLT-X05 §5, contracts §1.5).

`origin_module varchar(32)`, `origin_type varchar(48)`, `origin_id uuid`, all NULL with no
default — metadata-only on PostgreSQL, and every existing row is a counter document with no
origin. `ck_sales_document_origin_complete` keeps the three together; `ix_sales_doc_origin` is
partial, so the counter's documents cost it nothing. The FRD names this `0004`; A15 took `0004`
first (value credit lines), and the implementation plan numbers it `0005`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("sales", "0004_credit_value_lines")]

    operations = [
        migrations.AddField(
            model_name="salesdocument",
            name="origin_id",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="salesdocument",
            name="origin_module",
            field=models.CharField(blank=True, max_length=32, null=True),
        ),
        migrations.AddField(
            model_name="salesdocument",
            name="origin_type",
            field=models.CharField(blank=True, max_length=48, null=True),
        ),
        migrations.AddIndex(
            model_name="salesdocument",
            index=models.Index(
                condition=models.Q(("origin_type__isnull", False)),
                fields=["tenant", "origin_type", "origin_id"],
                name="ix_sales_doc_origin",
            ),
        ),
        migrations.AddConstraint(
            model_name="salesdocument",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    models.Q(
                        ("origin_id__isnull", True),
                        ("origin_module__isnull", True),
                        ("origin_type__isnull", True),
                    ),
                    models.Q(
                        ("origin_id__isnull", False),
                        ("origin_module__isnull", False),
                        ("origin_type__isnull", False),
                    ),
                    _connector="OR",
                ),
                name="ck_sales_document_origin_complete",
            ),
        ),
    ]
