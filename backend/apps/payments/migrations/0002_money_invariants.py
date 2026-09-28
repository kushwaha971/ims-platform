"""The two payment invariants a plain CHECK cannot state (PAY-01 BR-2, PAY-02 BR-1).

1. Σ `mode_breakup[].amount` = `amount`. A CHECK may not hold a subquery, so the
   sum is an IMMUTABLE SQL function over the jsonb and the CHECK calls it. An
   amount that is not a number makes the cast fail, which fails the INSERT —
   the right answer for a line that says "700 rupees".
2. Σ allocations ≤ payment `amount`. It spans rows, so it is a CONSTRAINT
   TRIGGER, DEFERRABLE INITIALLY DEFERRED: evaluated at COMMIT for every
   payment an allocation row touched. The service writes the payment first
   and the allocations after (and checks the same rule itself, for the 400);
   this is what refuses a second writer that does not go through it.

Both are declared here rather than on the model because Django's migration
autodetector has no vocabulary for either; the test suite asserts each one
refuses a direct write (`tests/test_constraints.py`).
"""

from __future__ import annotations

from django.db import migrations

FUNCTION = """
CREATE OR REPLACE FUNCTION payments_mode_sum(breakup jsonb) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE(SUM((line->>'amount')::numeric), 0)
    FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(breakup) = 'array' THEN breakup ELSE '[]'::jsonb END
    ) AS line
$$;
"""

CHECK = """
ALTER TABLE payments_payment
    ADD CONSTRAINT ck_payment_modes_sum_to_amount
    CHECK (payments_mode_sum(mode_breakup) = amount);
"""

TRIGGER = """
CREATE OR REPLACE FUNCTION payments_allocation_within_amount() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target uuid;
    allocated numeric;
    total numeric;
BEGIN
    target := COALESCE(NEW.payment_id, OLD.payment_id);
    SELECT COALESCE(SUM(amount), 0) INTO allocated
        FROM payments_allocation WHERE payment_id = target;
    SELECT amount INTO total FROM payments_payment WHERE id = target;
    IF total IS NOT NULL AND allocated > total THEN
        RAISE EXCEPTION 'allocations % exceed payment % amount %', allocated, target, total
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER payments_allocation_within_amount
    AFTER INSERT OR UPDATE ON payments_allocation
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION payments_allocation_within_amount();
"""

REVERSE = """
DROP TRIGGER IF EXISTS payments_allocation_within_amount ON payments_allocation;
DROP FUNCTION IF EXISTS payments_allocation_within_amount();
ALTER TABLE payments_payment DROP CONSTRAINT IF EXISTS ck_payment_modes_sum_to_amount;
DROP FUNCTION IF EXISTS payments_mode_sum(jsonb);
"""


class Migration(migrations.Migration):
    dependencies = [("payments", "0001_initial")]

    operations = [
        migrations.RunSQL(sql=FUNCTION + CHECK + TRIGGER, reverse_sql=REVERSE),
    ]
