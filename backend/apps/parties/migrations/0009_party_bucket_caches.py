"""`parties_party.loan_balance` and `.deposit_held` — the bucket caches (A2, contracts §1.3).

Both `numeric(14,2) NOT NULL DEFAULT 0`, added in place (a database default, no rewrite). Every
existing row is 0, which is its true value: no ledger line is in the `loan` or `deposit` bucket
until a module writes one, so no data migration and no replay is needed at landing — the replay
test runs anyway (10-architecture §10 rule 3). `deposit_held` is never negative
(`ck_party_deposit_held_non_negative`); `loan_balance` may be, as a loan can be in advance.
No index: both are read per party row.
"""

from django.db import migrations, models

import apps.common.db.fields


class Migration(migrations.Migration):
    dependencies = [("parties", "0008_add_ordering_and_search_indexes_to_party")]

    operations = [
        migrations.AddField(
            model_name="party",
            name="loan_balance",
            field=apps.common.db.fields.MoneyField(
                db_default=0, decimal_places=2, default=0, max_digits=14
            ),
        ),
        migrations.AddField(
            model_name="party",
            name="deposit_held",
            field=apps.common.db.fields.MoneyField(
                db_default=0, decimal_places=2, default=0, max_digits=14
            ),
        ),
        migrations.AddConstraint(
            model_name="party",
            constraint=models.CheckConstraint(
                condition=models.Q(("deposit_held__gte", 0)),
                name="ck_party_deposit_held_non_negative",
            ),
        ),
    ]
