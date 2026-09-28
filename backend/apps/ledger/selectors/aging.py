"""LED-09 — how much is out there, and how old it is.

A balance says what a customer owes. Aging says how long they have owed it, and
that is the number a shopkeeper acts on: ₹1,200 that is four months old is a
different problem from ₹1,200 from last week, and only the first one gets a
phone call.

── Why this is raw SQL, in a codebase that is otherwise all ORM ─────────────
BR-7 prescribes a CTE, and it is right to. The calculation is FIFO application
of every credit against the oldest debits first (BR-2), which needs a cumulative
window per party, a per-party credit total to subtract from it, a per-row
`GREATEST(0, LEAST(...))`, a bucketing by age and a grouping back to one row per
party — five stages, each consuming the last. Django's ORM can express any one
of them and cannot compose them: `.annotate(Window(...))` cannot be aggregated
over, which is the exact shape stages three to five need.

Doing it in Python instead would mean pulling every posted entry for every party
into the process to bucket them, which is the one thing §20's budget forbids.

Every value reaching this SQL is a bound parameter. There is no f-string and no
`.format()` below the docstring, and the two places a column name varies — the
direction pair for receivable versus payable — pick from a frozen dict rather
than from anything a caller can spell.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import connection

from apps.common.constants import Direction
from apps.common.money import ZERO

#: The four buckets, their upper edges in days, and the order they are read in.
#:
#: 30/60/90 and then everything older. Not configurable — §24 has that as a
#: Phase 2 setting — and the edges are what every Indian accountant's provision
#: table uses, which is the point: an aging report a merchant's own accountant
#: cannot read is a report that gets retyped into a spreadsheet.
BUCKETS: tuple[tuple[str, int | None], ...] = (
    ("0_30", 30),
    ("31_60", 60),
    ("61_90", 90),
    ("90_plus", None),
)
BUCKET_KEYS = tuple(key for key, _ in BUCKETS)

#: Which direction is the "invoice" and which is the "payment", per type.
#:
#: BR-3, and it is a mirror rather than a second implementation: for money a
#: shop is OWED, debits are what was lent and credits are what came back; for
#: money a shop OWES, the two swap. One query, one pair of parameters.
#:
#: A frozen mapping, because these two strings are interpolated into the SQL's
#: WHERE clauses as bound parameters and the KEY is what a caller supplies.
AGING_SIDES: dict[str, tuple[str, str]] = {
    "receivable": (Direction.DEBIT, Direction.CREDIT),
    "payable": (Direction.CREDIT, Direction.DEBIT),
}

#: BR-2's FIFO, as the CTE BR-7 describes.
#:
#: `open_amt = GREATEST(0, LEAST(amount, cum - credits))` is the whole idea in
#: one line, and it is worth reading twice. `cum` is everything owed up to and
#: including this row; `credits` is everything paid. If the running total is
#: still under what was paid, this row is settled and contributes nothing. If
#: the previous row already exceeded it, this row is untouched and contributes
#: in full. In between, the difference is the part still open — which is exactly
#: "oldest first" without a loop.
_AGING_SQL = """
WITH scoped AS (
    SELECT id, party_id, direction, amount, entry_date, created_at
    FROM ledger_entry
    WHERE tenant_id = %(tenant)s
      AND entry_date <= %(as_of)s
      AND status = 'posted'
      AND reversed_by_id IS NULL
      AND reverses_id IS NULL
),
paid AS (
    SELECT party_id, SUM(amount) AS total
    FROM scoped WHERE direction = %(paid_side)s GROUP BY party_id
),
owed AS (
    SELECT party_id, amount, entry_date,
           SUM(amount) OVER (
               PARTITION BY party_id
               ORDER BY entry_date, created_at, id
               ROWS UNBOUNDED PRECEDING
           ) AS cum
    FROM scoped WHERE direction = %(owed_side)s
),
still_open AS (
    SELECT o.party_id,
           (%(as_of)s::date - o.entry_date) AS age_days,
           GREATEST(0::numeric, LEAST(o.amount, o.cum - COALESCE(p.total, 0))) AS open_amt
    FROM owed o LEFT JOIN paid p ON p.party_id = o.party_id
)
SELECT party_id,
       SUM(CASE WHEN age_days <= 30 THEN open_amt ELSE 0 END) AS b_0_30,
       SUM(CASE WHEN age_days > 30 AND age_days <= 60 THEN open_amt ELSE 0 END) AS b_31_60,
       SUM(CASE WHEN age_days > 60 AND age_days <= 90 THEN open_amt ELSE 0 END) AS b_61_90,
       SUM(CASE WHEN age_days > 90 THEN open_amt ELSE 0 END) AS b_90_plus,
       SUM(open_amt) AS total
FROM still_open
WHERE open_amt > 0
GROUP BY party_id
HAVING SUM(open_amt) > 0
"""


def aging_rows(
    *,
    tenant: Any,
    as_of: dt.date,
    kind: str = "receivable",
) -> dict[str, dict[str, Decimal]]:
    """Every party with something outstanding, bucketed. Keyed by party id.

    Returns the raw arithmetic and nothing about presentation — no names, no
    ordering, no paging. The view joins the names and the caller decides the
    order, which is what lets RPT-05 reuse this selector unchanged (§14).

    A `None` tenant yields nothing rather than everything: a selector scopes
    first (canon §0.11 rule 2), and here that is the difference between an empty
    report and another shop's debtors.
    """
    if tenant is None or kind not in AGING_SIDES:
        return {}
    owed_side, paid_side = AGING_SIDES[kind]
    with connection.cursor() as cursor:
        cursor.execute(
            _AGING_SQL,
            {
                "tenant": str(getattr(tenant, "id", tenant)),
                "as_of": as_of,
                "owed_side": owed_side,
                "paid_side": paid_side,
            },
        )
        rows = cursor.fetchall()
    return {
        str(row[0]): {
            "0_30": row[1] or ZERO,
            "31_60": row[2] or ZERO,
            "61_90": row[3] or ZERO,
            "90_plus": row[4] or ZERO,
            "total": row[5] or ZERO,
        }
        for row in rows
    }


def aging_totals(rows: dict[str, dict[str, Decimal]]) -> dict[str, Decimal]:
    """BR-5 — the totals row, summed over whatever set was handed in.

    Over the FILTERED set rather than the tenant, which is the same rule PTY-02
    settled for the party list: a merchant who has narrowed to one tag is asking
    what that tag is owed, and a total about everything is a total about a
    question they did not ask.
    """
    totals = {key: ZERO for key in (*BUCKET_KEYS, "total")}
    for row in rows.values():
        for key in totals:
            totals[key] += row[key]
    return totals


def bucket_window(bucket: str, as_of: dt.date) -> tuple[dt.date | None, dt.date]:
    """FR-4 — the date range a bucket stands for, for the drill-down.

    Tapping "90+ ₹1,200" opens the statement showing the entries that figure is
    made of, which is the whole reason a merchant taps it: the number tells them
    to make a phone call and the statement tells them what to say on it.

    The windows are half-open in the direction that matters. A bucket's youngest
    entry is `as_of − upper` and its oldest is `as_of − lower`, so "0–30 days"
    ends today and "90+" has no start — which is why the first element is
    nullable rather than a date far in the past that would read as a real bound.
    """
    edges = {"0_30": (0, 30), "31_60": (31, 60), "61_90": (61, 90), "90_plus": (91, None)}
    lower, upper = edges.get(bucket, (0, None))
    date_to = as_of - dt.timedelta(days=lower)
    date_from = None if upper is None else as_of - dt.timedelta(days=upper)
    return date_from, date_to


def ledger_summary(*, tenant: Any) -> dict[str, Decimal]:
    """BR-1 / FR-1 — the tenant's position, in two numbers.

    `Σ max(balance, 0)` and `Σ max(−balance, 0)` over ACTIVE parties. Read from
    the cached balances rather than replayed from the ledger, and that is the
    one place in this feature the cache is trusted: it is the same figure the
    party list's header shows, `manage.py recalc_balances` is what proves it,
    and a summary that disagreed with the list beneath it would be worse than
    one that is a transaction behind.

    Archived parties are excluded because PTY-04 only lets a party be archived
    at a zero balance, so they contribute nothing — but saying so in the query
    is what keeps that true if the archive rule ever softens.
    """
    from django.db.models import Case, DecimalField, F, Sum, When
    from django.db.models.functions import Coalesce

    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    if tenant is None:
        return {"receivable": ZERO, "payable": ZERO}
    money = DecimalField(max_digits=14, decimal_places=2)
    totals = Party.objects.filter(tenant=tenant, status=PartyStatus.ACTIVE).aggregate(
        receivable=Coalesce(
            Sum(
                Case(
                    When(balance__gt=0, then=F("balance")),
                    default=Decimal("0.00"),
                    output_field=money,
                )
            ),
            Decimal("0.00"),
            output_field=money,
        ),
        payable=Coalesce(
            Sum(
                Case(
                    When(balance__lt=0, then=-F("balance")),
                    default=Decimal("0.00"),
                    output_field=money,
                )
            ),
            Decimal("0.00"),
            output_field=money,
        ),
    )
    return {
        "receivable": totals["receivable"] or ZERO,
        "payable": totals["payable"] or ZERO,
    }
