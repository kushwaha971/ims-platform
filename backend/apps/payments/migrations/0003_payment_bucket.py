"""`payments_payment.bucket` — the ledger bucket a payment posted in (A4a, R5, contracts §1.4).

`varchar(8) NOT NULL DEFAULT 'main'` with the ledger's CHECK (`ck_payment_bucket`), added in place
(a database default, no rewrite). Every existing payment is `main`, which is true of all of them:
their khata lines are `main` (ledger 0006). Written once by `record_payment` and never changed.
The deferred Σ-allocations trigger of 0002 is unchanged; it is what makes a concurrent
over-allocation by `allocate_existing` fail at commit.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("payments", "0002_money_invariants")]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="bucket",
            field=models.CharField(
                choices=[("main", "Shop"), ("loan", "Loan"), ("deposit", "Deposit")],
                db_default="main",
                default="main",
                max_length=8,
            ),
        ),
        migrations.AddConstraint(
            model_name="payment",
            constraint=models.CheckConstraint(
                condition=models.Q(("bucket__in", ["main", "loan", "deposit"])),
                name="ck_payment_bucket",
            ),
        ),
    ]
