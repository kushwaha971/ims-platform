"""A15 / R51 / ADR-057 — value credit lines on `sales_document_line`.

`credit_mode` ('qty' | 'value', default 'qty', so every existing line is what it
was) and a CHECK that a value credit always names the invoice line it credits.
The exact paise are the line's existing `taxable_value`; no other column is
needed. Reversible: removing the field and the constraint loses nothing that
existed before.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0003_list_date_index"),
    ]

    operations = [
        migrations.AddField(
            model_name="salesdocumentline",
            name="credit_mode",
            field=models.CharField(
                choices=[("qty", "Quantity"), ("value", "Value")], default="qty", max_length=8
            ),
        ),
        migrations.AddConstraint(
            model_name="salesdocumentline",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("credit_mode", "qty"),
                    models.Q(("against_line__isnull", False), ("credit_mode", "value")),
                    _connector="OR",
                ),
                name="ck_sales_line_value_credit_against",
            ),
        ),
    ]
