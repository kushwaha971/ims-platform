"""`forbid_update_delete` on `inventory_stock_movement` — the guarantee, not the convention.

Part 21 §21.1 rule 2 mandates the trigger for the two append-only tables, and
Part 32 §32.9.6 makes "`UPDATE inventory_stock_movement` raises from the trigger"
an exit criterion. `ImmutableModel` refuses `.save()` / `.delete()`; this refuses
`QuerySet.update()`, `QuerySet.delete()` and a psql session too.

── Why NO column is permitted to change ─────────────────────────────────────
Part 21 §21.3.6 permits updating `avg_cost_after` / `on_hand_after` from a
recompute job, because it orders the log by movement date and must re-derive
every later row when a backdated movement lands in the middle.
CR-2026-09-24-INV-A orders the log by ARRIVAL (`sequence_no`) instead, so a row's
running pair is final the moment it is written: there is nothing any job ever
needs to revise, and the trigger can be total. `updated_at` included — nothing
writes it after the INSERT.

── Why its own function name ────────────────────────────────────────────────
`ledger` migration 0002 created a function called `forbid_update_delete()` that
names ledger columns. `CREATE OR REPLACE` of that name here would silently swap
the ledger's trigger body for this one. Each table owns its function.
"""

from __future__ import annotations

from django.db import migrations

FORBID = """
CREATE OR REPLACE FUNCTION inventory_stock_movement_forbid_update_delete() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'stock movements are never deleted (Part 21 §21.6); post an opposite movement instead'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RAISE EXCEPTION
        'inventory_stock_movement is immutable: post a new movement instead'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_stock_movement_forbid_update_delete
    BEFORE UPDATE OR DELETE ON inventory_stock_movement
    FOR EACH ROW EXECUTE FUNCTION inventory_stock_movement_forbid_update_delete();
"""

DROP = """
DROP TRIGGER IF EXISTS inventory_stock_movement_forbid_update_delete ON inventory_stock_movement;
DROP FUNCTION IF EXISTS inventory_stock_movement_forbid_update_delete();
"""


class Migration(migrations.Migration):
    dependencies = [("inventory", "0003_items_stock_movements")]

    operations = [migrations.RunSQL(sql=FORBID, reverse_sql=DROP)]
