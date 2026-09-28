"""Carry the exact stock value; derive the average from it (H3, the 140.0001 defect).

`value_after` is NULL on every existing movement: the append-only trigger
refuses UPDATEs, and it should — those rows were written by the old step, and
the replay folds a NULL-value row exactly as the old step did (value =
on_hand × avg). The cache's `stock_value` is backfilled with that same product,
so the first new movement continues from precisely where the replay stands.
Adding a nullable column fires no row trigger.
"""

import apps.common.db.fields
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0004_movement_forbid_update_delete"),
    ]

    operations = [
        migrations.AddField(
            model_name="itemstock",
            name="stock_value",
            field=apps.common.db.fields.StockValueField(decimal_places=7, default=0, max_digits=24),
        ),
        migrations.AddField(
            model_name="stockmovement",
            name="value_after",
            field=apps.common.db.fields.StockValueField(
                blank=True, decimal_places=7, max_digits=24, null=True
            ),
        ),
        migrations.RunSQL(
            "UPDATE inventory_item_stock SET stock_value = on_hand * avg_cost",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
