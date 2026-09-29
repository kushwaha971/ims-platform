"""`ledger_entry.bucket` — which kind of money a line is (A2, ADR-043, contracts §1.2).

Six operations, and the last is the one that is easy to forget (0004's docstring says why).

1. `bucket varchar(8) NOT NULL DEFAULT 'main'`. A database default as well as the model's, so
   the column is added in place on PostgreSQL 16 (metadata only, no table rewrite) and every
   existing row reads `main` — which is true of all of them: no module has written a loan or a
   deposit line yet.

2. `entry_type` gains `charge` and `adjustment_credit` in its `choices` (ADR-048). State only:
   `varchar(24)` already fits `adjustment_credit` (17).

3. `source_type` loses `choices` (R8). State only, no SQL: a source an engine or vertical
   registers (`dues_due`) is valid because the posting registry says so.

4. `ix_ledger_party_bucket (tenant_id, party_id, bucket) WHERE bucket <> 'main'` — small by
   construction; it holds only lending and deposit rows.

5. `ck_ledger_entry_bucket CHECK (bucket IN ('main','loan','deposit'))`. Every existing row is
   `main`, so it validates instantly.

6. The immutability trigger from 0002, re-created with `bucket` FROZEN (10-architecture §10
   rule 2). The function names the frozen columns one by one, so a column it does not mention is
   one an UPDATE may change freely: without this step `QuerySet.update(bucket='loan')` would move
   a shop invoice out of aging, in place, on the append-only table. The body is 0004's, character
   for character, plus one line; the reverse restores 0004's body exactly.
"""

from __future__ import annotations

from django.db import migrations, models

FUNCTION_HEAD = """
CREATE OR REPLACE FUNCTION forbid_update_delete() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'ledger rows are never deleted (Part 21 §21.6); reverse the entry instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.party_id IS DISTINCT FROM OLD.party_id
       OR NEW.direction IS DISTINCT FROM OLD.direction
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
       OR NEW.entry_type IS DISTINCT FROM OLD.entry_type
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_id IS DISTINCT FROM OLD.source_id
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
"""

FUNCTION_TAIL = """       OR NEW.reference IS DISTINCT FROM OLD.reference
       OR NEW.reverses_id IS DISTINCT FROM OLD.reverses_id
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.running_balance_after IS DISTINCT FROM OLD.running_balance_after
       OR NEW.created_by_id IS DISTINCT FROM OLD.created_by_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION
            'ledger_entry is immutable: only status and reversed_by_id may change'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

UPI_APP_LINE = "       OR NEW.upi_app IS DISTINCT FROM OLD.upi_app\n"
BUCKET_LINE = "       OR NEW.bucket IS DISTINCT FROM OLD.bucket\n"

#: 0004's function with `bucket` frozen beside `upi_app`.
FREEZE_BUCKET = FUNCTION_HEAD + UPI_APP_LINE + BUCKET_LINE + FUNCTION_TAIL

#: 0004's function exactly as it installed it.
RESTORE_0004 = FUNCTION_HEAD + UPI_APP_LINE + FUNCTION_TAIL

ENTRY_TYPES = [
    ("opening", "Opening balance"),
    ("manual_gave", "You gave"),
    ("manual_got", "You got"),
    ("invoice", "Invoice"),
    ("credit_note", "Credit note"),
    ("purchase_bill", "Purchase bill"),
    ("debit_note", "Debit note"),
    ("payment_in", "Payment received"),
    ("payment_out", "Payment made"),
    ("expense", "Expense"),
    ("write_off", "Write-off"),
    ("interest", "Interest"),
    ("reversal", "Reversal"),
    ("correction", "Correction"),
    ("charge", "Charge"),
    ("adjustment_credit", "Credit"),
]


class Migration(migrations.Migration):
    dependencies = [("ledger", "0005_reminder")]

    operations = [
        migrations.AddField(
            model_name="ledgerentry",
            name="bucket",
            field=models.CharField(
                choices=[("main", "Shop"), ("loan", "Loan"), ("deposit", "Deposit")],
                db_default="main",
                default="main",
                max_length=8,
            ),
        ),
        migrations.AlterField(
            model_name="ledgerentry",
            name="entry_type",
            field=models.CharField(choices=ENTRY_TYPES, max_length=24),
        ),
        migrations.AlterField(
            model_name="ledgerentry",
            name="source_type",
            field=models.CharField(default="manual", max_length=32),
        ),
        migrations.AddIndex(
            model_name="ledgerentry",
            index=models.Index(
                condition=models.Q(("bucket", "main"), _negated=True),
                fields=["tenant", "party", "bucket"],
                name="ix_ledger_party_bucket",
            ),
        ),
        migrations.AddConstraint(
            model_name="ledgerentry",
            constraint=models.CheckConstraint(
                condition=models.Q(("bucket__in", ["main", "loan", "deposit"])),
                name="ck_ledger_entry_bucket",
            ),
        ),
        # After the AddField, so a reader need not know plpgsql resolves `NEW.bucket` late.
        migrations.RunSQL(sql=FREEZE_BUCKET, reverse_sql=RESTORE_0004),
    ]
