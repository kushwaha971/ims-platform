"""At most one posted opening balance per party — in the database (LED-02 BR-2).

`post_opening_balance()` takes `SELECT … FOR UPDATE` on the party and then checks
for an existing opening, which is correct for every caller that goes through it.
This index is correct for the callers that do not: a management command, the
backfill in 0004, a psql session, and the batched import LED-02 FR-6 describes,
which posts openings five hundred at a time inside a job.

CR-040 (raised as 17-02 CCR-4) proposes exactly this and calls it optional
defence-in-depth. It is not optional here for a simple reason: the feature's own
success metric is "zero parties with more than one `opening` entry", and a
guarantee that depends on every future caller remembering to take a lock is a
guarantee that will be broken by the first caller that forgets.

PARTIAL on `status='posted'`, which is BR-5 rather than an optimisation. A
correction reverses the original and posts a replacement; both rows are
`entry_type='opening'` and both stay for ever, so a total unique index would
make correcting an opening impossible. Only one of them is standing at a time.

Not `CONCURRENTLY`: §21.8 asks for that on big tables, and this one is empty —
LED-01 created it in migration 0001 and no tenant has a year of history in it
yet. Building it now takes no lock worth avoiding; building it in a year does.
"""

from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ledger", "0002_forbid_update_delete")]

    operations = [
        migrations.AddConstraint(
            model_name="ledgerentry",
            constraint=models.UniqueConstraint(
                fields=["party"],
                condition=models.Q(entry_type="opening", status="posted"),
                name="uq_ledger_one_opening_per_party",
            ),
        ),
    ]
