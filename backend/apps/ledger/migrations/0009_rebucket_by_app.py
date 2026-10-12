"""DEC-019 — move every existing ledger line into its app's bucket, then rebuild the caches.

Until today the shop's documents, the library's fees and the udhaar book's You gave / You got
all posted in `main`, and `party.balance` was Σ main + Σ loan. Each app now keeps only its own
money (the owner, 12 Oct 2026), so the rows written before the rule move once, here:

* `sales_document`, `purchase_document`, `expense` lines → `shop`;
* `library_charge`, `library_waiver` lines → `library`;
* a payment allocated to a library charge → `library` (its row and its khata line), and every
  other `main` payment → `shop` — the payments module is the Shop's, and an unallocated payment
  is a shop advance;
* a reversal carries its original's `source_type`, so it moves with it.

What stays in `main` is exactly the udhaar book: manual entries, the opening balance, a
write-off, and LED-03's corrections of them.

`bucket` is frozen by the immutability trigger (0006), deliberately: no service may move a line
after it is written. A one-time re-classification by the schema owner is the exception that
rule was written to allow, so the trigger is disabled for these UPDATEs only, inside this
migration's transaction, and re-enabled before it commits.

The caches are then recomputed from the ledger with the same LIVE_ENTRIES rule the replay uses
(`ledger.selectors.entry`): posted, not reversed, not a reversal. `manage.py recalc_balances
--check` must report nothing afterwards; the test suite asserts it for fresh data.

Irreversible on purpose: moving lines back into `main` would recreate the mixed balance the
owner asked to end.
"""

from __future__ import annotations

from django.db import migrations

TRIGGER = "ledger_entry_forbid_update_delete"

FORWARD = f"""
-- Deferred constraint checks still pending in this transaction would refuse the ALTER.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE ledger_entry DISABLE TRIGGER {TRIGGER};

UPDATE ledger_entry SET bucket = 'shop'
 WHERE bucket = 'main' AND source_type IN ('sales_document', 'purchase_document', 'expense');

UPDATE ledger_entry SET bucket = 'library'
 WHERE bucket = 'main' AND source_type IN ('library_charge', 'library_waiver');

UPDATE payments_payment p SET bucket = 'library'
 WHERE p.bucket = 'main'
   AND EXISTS (SELECT 1 FROM payments_allocation a
                WHERE a.payment_id = p.id AND a.document_type = 'library_charge');

UPDATE payments_payment SET bucket = 'shop' WHERE bucket = 'main';

UPDATE ledger_entry e SET bucket = p.bucket
  FROM payments_payment p
 WHERE e.source_type = 'payment' AND e.source_id = p.id AND e.bucket = 'main'
   AND p.bucket IN ('shop', 'library');

ALTER TABLE ledger_entry ENABLE TRIGGER {TRIGGER};

WITH live AS (
    SELECT party_id, bucket,
           SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) AS signed
      FROM ledger_entry
     WHERE status = 'posted' AND reversed_by_id IS NULL AND reverses_id IS NULL
     GROUP BY party_id, bucket
), per_party AS (
    SELECT party_id,
           COALESCE(SUM(signed) FILTER (WHERE bucket = 'main'), 0) AS main,
           COALESCE(SUM(signed) FILTER (WHERE bucket = 'shop'), 0) AS shop,
           COALESCE(SUM(signed) FILTER (WHERE bucket = 'loan'), 0) AS loan,
           COALESCE(SUM(signed) FILTER (WHERE bucket = 'library'), 0) AS library
      FROM live GROUP BY party_id
)
UPDATE parties_party p
   SET balance = x.main,
       receivable_total = GREATEST(x.main, 0),
       payable_total = GREATEST(-x.main, 0),
       shop_balance = x.shop,
       loan_balance = x.loan,
       library_balance = x.library
  FROM per_party x
 WHERE p.id = x.party_id;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("ledger", "0008_entry_app_buckets"),
        ("parties", "0011_party_app_balances"),
        ("payments", "0005_payment_app_buckets"),
    ]

    operations = [migrations.RunSQL(FORWARD, reverse_sql=migrations.RunSQL.noop)]
