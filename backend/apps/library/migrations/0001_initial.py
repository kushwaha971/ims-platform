"""B01 — the library app's first migration: no tables, only its place in the graph.

It depends on the fixed Wave B core heads (plan §1.4 rule 2, §3) so that every
later library migration builds on a core that already has the ledger buckets,
party relations, held deposits and closed days it needs. `sales 0005` is left
out on purpose (G2): library has no FK to sales and may not import it.
"""

from __future__ import annotations

from django.db import migrations


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("ledger", "0007_reminder_source"),
        ("parties", "0010_party_relation"),
        ("payments", "0004_held_deposit"),
        ("platform", "0013_closed_day"),
    ]

    operations: list = []
