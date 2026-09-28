"""Five indexes the party list's own requests could not reach, and why each exists.

A performance pass over a 2,000-party book (`tests/performance/
test_two_thousand_party_book.py`) read `EXPLAIN` for every request the list
issues, captured from the endpoint rather than rebuilt by hand. Three request
shapes had no index that could answer them.

── Not `CONCURRENTLY`, yet ─────────────────────────────────────────────────
Part 21 §21.8 wants indexes on big tables built with `AddIndexConcurrently` in
an `atomic = False` migration. This follows the precedent of 0002, 0004 and
ledger 0003 instead: plain `CREATE INDEX`, which holds a SHARE lock on
`parties_party` (reads go on, writes wait) for as long as the build takes —
milliseconds at the sizes that exist, because the product has no live tenants.
The repository is also not ready for the other kind: no migration in it is
non-atomic, and `tests/migrations/test_reversibility.py` compiles each
migration's SQL inside a test transaction, which `AddIndexConcurrently` refuses
outright. The first index added once a hosted tenant exists should be the one
that makes that switch, test harness included.

── The two orderings (`ix_party_tenant_activity_asc`, `ix_party_tenant_collect_desc`)

`StableOrderingFilter` puts NULLs last in BOTH directions — a missing value never
outranks a present one. A B-tree walked backwards reverses its null placement
along with its order, so `ix_party_tenant_activity` (`DESC NULLS LAST`) read
backwards is `ASC NULLS FIRST`, and `ix_party_tenant_collection` (`ASC NULLS
LAST`) read backwards is `DESC NULLS FIRST`. Neither matched the query, so:

    ?ordering=last_activity_at   (the Activity header's second click)
        before  Limit -> Sort -> Seq Scan on parties_party      50k: 23.0 ms
        after   Limit -> Incremental Sort -> Index Scan using
                ix_party_tenant_activity_asc                    50k: 0.10 ms
    ?ordering=-collection_date   (API-only, CR-024)
        before  Limit -> Sort -> Seq Scan on parties_party      50k: 20.0 ms
        after   Limit -> Incremental Sort -> Index Scan using
                ix_party_tenant_collect_desc                    50k: 0.61 ms

Both mirror the columns and the partial predicate of `ix_party_tenant_activity`,
because every list query carries `tenant`, `status` and `deleted_at IS NULL`.

── The search (`ix_party_tenant_code_upper`, `ix_party_mobile_trgm`, `ix_party_tenant_gstin_upper`)

`?q=` ORs the name (`icontains`) with the display code (`istartswith`), and adds
the mobile (`endswith`) for four or more digits and the GSTIN (`iexact`) for a
fifteen-character query. Postgres answers a disjunction from indexes only as a
BitmapOr in which every arm has an index, and the display-code arm had none — so
`ix_party_name_upper_trgm` was unreachable from the one request it exists for,
and every search was a filter over every row in the tenant:

    At 50,000 parties (natural plans, GIN pending lists merged as autovacuum
    leaves them):

    ?q=zylberschatz (100 matches)
        before  count, totals: Seq Scan on parties_party,
                  Filter: (… OR upper(display_code) ~~ 'ZYLBERSCHATZ%')     29.6 ms each
                page: Index Scan using ix_party_tenant_activity + that Filter 10.2 ms
        after   Bitmap Heap Scan <- BitmapOr(ix_party_name_upper_trgm,
                                             ix_party_tenant_code_upper)     0.3 ms each
    ?q=<a GSTIN> (four arms: name, code, mobile suffix, GSTIN; one match)
        before  count, totals: Seq Scan + Filter                            35 ms each
                page: ordering-index walk + Filter                          51 ms
        after   BitmapOr of all four indexes                          0.17-0.18 ms each

None of the three search indexes is partial. The planner reads the statistics
ANALYZE keeps for an index EXPRESSION only when the index has no predicate;
built partial, each arm was estimated at the 0.5% default — 483 rows for a
GSTIN that matches one — and the page query went back to walking the ordering
index and filtering.

Size, measured on a 100,000-party book with one party in nine never having
traded, a third carrying a collection date and a quarter a GSTIN:
`ix_party_tenant_activity_asc` 5.3 MB, `ix_party_tenant_collect_desc` 0.8 MB
(mostly NULLs, which B-tree deduplication folds), `ix_party_tenant_code_upper`
4.0 MB, `ix_party_mobile_trgm` 6.6 MB, `ix_party_tenant_gstin_upper` 2.5 MB.
`last_activity_at` is rewritten on every ledger entry, so the ascending twin is
the one with a real write cost; the other four columns change rarely or never.
"""

import django.contrib.postgres.indexes
import django.db.models.functions.text
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("parties", "0007_tag_palette_tokens"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="party",
            index=models.Index(
                models.F("tenant"),
                models.F("status"),
                models.OrderBy(models.F("last_activity_at"), nulls_last=True),
                condition=models.Q(("deleted_at__isnull", True)),
                name="ix_party_tenant_activity_asc",
            ),
        ),
        migrations.AddIndex(
            model_name="party",
            index=models.Index(
                models.F("tenant"),
                models.F("status"),
                models.OrderBy(models.F("collection_date"), descending=True, nulls_last=True),
                condition=models.Q(("deleted_at__isnull", True)),
                name="ix_party_tenant_collect_desc",
            ),
        ),
        migrations.AddIndex(
            model_name="party",
            index=models.Index(
                models.F("tenant"),
                django.contrib.postgres.indexes.OpClass(
                    django.db.models.functions.text.Upper("display_code"),
                    name="text_pattern_ops",
                ),
                name="ix_party_tenant_code_upper",
            ),
        ),
        migrations.AddIndex(
            model_name="party",
            index=django.contrib.postgres.indexes.GinIndex(
                django.contrib.postgres.indexes.OpClass("mobile", name="gin_trgm_ops"),
                name="ix_party_mobile_trgm",
            ),
        ),
        migrations.AddIndex(
            model_name="party",
            index=models.Index(
                models.F("tenant"),
                django.db.models.functions.text.Upper("gstin"),
                name="ix_party_tenant_gstin_upper",
            ),
        ),
    ]
