"""`forbid_update_delete` on `ledger_entry` — the guarantee, not the convention.

Part 21 §21.1 rule 2 and §21.3.4 both require this trigger, and canon §0.11
rule 1 is the rule it enforces: a ledger line is immutable, and a correction is
a new row. `apps.common.models.ImmutableModel` already refuses `.save()` and
`.delete()`, and its own docstring is honest that this is not enough —
`QuerySet.update()`, `QuerySet.delete()` and every raw statement bypass the
model layer entirely. Its last line names `CR-LOG` as carrying the trigger "to
land with the tables that need it". This is that table, so this is that landing.

── What it permits ──────────────────────────────────────────────────────────
`status` and `reversed_by_id`, and nothing else. Those two columns are the whole
of what a correction (LED-03) writes on the line it corrects: the original is
marked `reversed` and pointed at the row that undid it. Every other column is
the evidence.

The comparison is column by column rather than `OLD IS DISTINCT FROM NEW` with
the two permitted fields patched out, because the patched-row trick needs a
row-typed local and breaks the moment a column is added. Listing the frozen
columns means a new column is frozen by DEFAULT — the failure mode of
forgetting to update this function is "the new column cannot be changed", which
is the right way round for a table whose point is that nothing changes.

`updated_at` is deliberately in the permitted set: `Model.save(update_fields=…)`
with `auto_now` touches it alongside `status`, so freezing it would make the one
operation the product needs impossible. It carries no evidence — see the model's
docstring on why it is never read.

── Why DELETE is unconditional ──────────────────────────────────────────────
There is no delete this product ever performs on this table, including tenant
deletion: Part 21 §21.5 makes `tenant → everything` RESTRICT and PLT-10's
deletion job exports first and then drops rows in dependency order with the
trigger dropped explicitly. A job that needs to remove these rows disables the
trigger and says so in its own code, where a reader can see it.

Reversible: the reverse drops the trigger and the function, which is what a
migration rollback means. It does not restore the ability to do anything
harmful, because nothing in the application was doing it.
"""

from __future__ import annotations

from django.db import migrations

FORBID_UPDATE_DELETE = """
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
       OR NEW.reference IS DISTINCT FROM OLD.reference
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

CREATE TRIGGER ledger_entry_forbid_update_delete
    BEFORE UPDATE OR DELETE ON ledger_entry
    FOR EACH ROW EXECUTE FUNCTION forbid_update_delete();
"""

DROP = """
DROP TRIGGER IF EXISTS ledger_entry_forbid_update_delete ON ledger_entry;
DROP FUNCTION IF EXISTS forbid_update_delete();
"""


class Migration(migrations.Migration):
    dependencies = [("ledger", "0001_initial")]

    operations = [migrations.RunSQL(sql=FORBID_UPDATE_DELETE, reverse_sql=DROP)]
