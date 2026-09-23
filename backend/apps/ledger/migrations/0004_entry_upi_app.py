"""`ledger_entry.upi_app` — which UPI app a "You got" came through.

Three operations, and the third is the one that is easy to forget.

1. The column: nullable, no default, so adding it rewrites nothing and every
   existing row reads "UPI, app not recorded" — which is true of all of them.

2. `ck_ledger_entry_upi_app_needs_upi`: an app only with `payment_mode='upi'`.
   Every existing row has a null app, so the constraint validates instantly.

3. The immutability trigger from 0002, re-created with the new column FROZEN.
   0002 lists the frozen columns one by one on purpose, so that a new column is
   frozen by default — but "by default" there means "the comparison does not
   mention it", and a column the comparison does not mention is a column an
   UPDATE can change freely. The docstring in 0002 says the failure mode of
   forgetting this function is "the new column cannot be changed"; that is only
   true of the `OLD IS DISTINCT FROM NEW` design it rejected. With the explicit
   list, forgetting it leaves the new column MUTABLE on an append-only table,
   silently. So every column added to `ledger_entry` needs a migration like this
   one, and `test_the_database_refuses_to_change_a_posted_upi_app` is what
   notices when one does not.

The function body is 0002's, character for character, plus one line. Same name,
`CREATE OR REPLACE`, so the existing trigger picks it up without being dropped.
The reverse restores 0002's body exactly, so a rollback leaves the database as
0003 left it.
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

#: 0002's function with `upi_app` frozen alongside `payment_mode`.
FREEZE_UPI_APP = (
    FUNCTION_HEAD + "       OR NEW.upi_app IS DISTINCT FROM OLD.upi_app\n" + FUNCTION_TAIL
)

#: 0002's function exactly as it installed it.
RESTORE_0002 = FUNCTION_HEAD + FUNCTION_TAIL


class Migration(migrations.Migration):
    dependencies = [("ledger", "0003_one_opening_per_party")]

    operations = [
        migrations.AddField(
            model_name="ledgerentry",
            name="upi_app",
            field=models.CharField(
                blank=True,
                choices=[
                    ("phonepe", "PhonePe"),
                    ("gpay", "Google Pay"),
                    ("paytm", "Paytm"),
                    ("bhim", "BHIM"),
                    ("amazonpay", "Amazon Pay"),
                    ("cred", "CRED"),
                    ("whatsapp", "WhatsApp Pay"),
                    ("navi", "Navi"),
                    ("supermoney", "super.money"),
                    ("bank_app", "Bank's own app"),
                    ("other", "Other UPI app"),
                ],
                max_length=16,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name="ledgerentry",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("upi_app__isnull", True), ("payment_mode", "upi"), _connector="OR"
                ),
                name="ck_ledger_entry_upi_app_needs_upi",
            ),
        ),
        # After the AddField: the function body names `NEW.upi_app`, and
        # plpgsql resolves it at the first UPDATE, not at CREATE time — but a
        # reader should not need to know that to see the order is safe.
        migrations.RunSQL(sql=FREEZE_UPI_APP, reverse_sql=RESTORE_0002),
    ]
