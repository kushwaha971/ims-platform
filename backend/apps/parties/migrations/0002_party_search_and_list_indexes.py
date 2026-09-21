"""The two indexes the party list actually reads, and the one it never could.

`ix_party_name_trgm` was `GIN (name gin_trgm_ops)`. The `?q=` filter is
`icontains`, and Django compiles `icontains` to `UPPER(name::text) LIKE
UPPER(%s)`. `UPPER(name)` is a function expression, so a GIN index on the bare
column cannot match it — not "the planner prefers not to": with `enable_seqscan`,
`enable_indexscan` and `enable_indexonlyscan` all off the planner still cannot
reach it. The index served nothing and cost 11 MB per 100 k rows to maintain. It
is replaced by `ix_party_name_upper_trgm`, `GIN (UPPER(name) gin_trgm_ops)`,
which matches the SQL Django already emits, so no application code changes.

Measured on a 98 000-row tenant, `?q=73421`:

    before  31.9 ms, 2 414 buffers, 99 999 rows discarded by filter, no index
    after    0.14 ms,     8 buffers, Bitmap Index Scan on ix_party_name_upper_trgm

`ix_party_tenant_recent` is for the list with no `status` filter.
`ix_party_tenant_activity` is `(tenant, status, -last_activity_at)`, and `status`
is its middle column, so it can only serve a query that constrains `status`. The
shipping client always sends one; a client that does not gets a parallel
sequential scan and a top-N heapsort over the whole tenant. Measured on the same
tenant, page 1 with no `status`:

    before  25.6 ms, 3 401 buffers, Parallel Seq Scan + top-N heapsort of 98 000
    after    0.10 ms,    29 buffers, Index Scan using ix_party_tenant_recent

It also turns the paginator's `COUNT(*)` into an index-only scan (2 405 -> 524
buffers). It is partial on `deleted_at IS NULL`, which is the soft-delete
manager's predicate, so it costs 5.5 MB per 100 k rows rather than 9 MB; a
controlled alternating benchmark of 2 000-row `last_activity_at` updates found
its write cost below run-to-run noise (with 112 ms mean, without 143 ms mean over
4 alternating rounds).

`ix_party_tenant_name` is the same story for `?ordering=name`, which the list's
Name column header sends today (`partyListSort.ts` maps the column to it).
Nothing covered it, so page 1 was a parallel index scan of the whole tenant and
a top-N heapsort:

    before  44.6 ms, 2 432 buffers, top-N heapsort of 94 000 rows
    after    0.11 ms,    28 buffers, Index Scan using ix_party_tenant_name

8 MB per 100 k rows, and a party's name is written once and then effectively
never, so this one is read-heavy with no update cost to weigh against it.
"""

import django.contrib.postgres.indexes
import django.db.models.functions.text
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("parties", "0001_initial"),
        ("platform", "0006_invitation_email_identity"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name="party",
            name="ix_party_name_trgm",
        ),
        migrations.AddIndex(
            model_name="party",
            index=models.Index(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=["tenant", "-last_activity_at"],
                name="ix_party_tenant_recent",
            ),
        ),
        migrations.AddIndex(
            model_name="party",
            index=models.Index(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=["tenant", "name"],
                name="ix_party_tenant_name",
            ),
        ),
        migrations.AddIndex(
            model_name="party",
            index=django.contrib.postgres.indexes.GinIndex(
                django.contrib.postgres.indexes.OpClass(
                    django.db.models.functions.text.Upper("name"), name="gin_trgm_ops"
                ),
                name="ix_party_name_upper_trgm",
            ),
        ),
    ]
