"""RPT-02 — the day book: everything that happened, in order, with the drawer beside it.

A roznamcha is one list. A bill, a purchase, a receipt, a payout, an expense,
a khata line and a stock count each live in their own table here, so this
module is the one place they are put back into the single chronology a
shopkeeper tallies at closing time, with the cash and the bank position after
every row.

── One SQL statement, as §15 prescribes ──────────────────────────────────────
A CTE `UNION ALL`s one fragment per source into a common row shape, and a
window `SUM(...) OVER (ORDER BY date, at, ord, source_id)` runs the cash and
bank columns down it. The window lives INSIDE the CTE and the page's filters
and LIMIT/OFFSET OUTSIDE it — which is the whole of "running balances computed
server-side so pagination is consistent" (§5): page two starts from where page
one's last row left the drawer, because the window never saw the page boundary.
(LED-04 learned the opposite lesson the hard way: a window annotated onto a
filtered queryset restarts from zero on every page.)

Every value is a bound parameter. The only thing that varies in the SQL text
is WHICH fragments are joined, chosen from a frozen dict by source key — never
from anything a caller can spell — so the text is one of a finite, reviewed set.

── What moves the drawer (BR-1, BR-4) ───────────────────────────────────────
* A payment moves cash and bank by its `mode_breakup`: `cash` → cash;
  `upi`, `bank`, `card`, `cheque` → bank; `other` → neither (shown as In/Out,
  never in a balance). A split payment is ONE row (EC-1).
* A PAID expense moves its mode's bucket out; an unpaid one is a payable and
  moves nothing (EC-4).
* A manual khata line that says how the money moved ("You got ₹500, cash")
  moves that bucket — the same rule EXP-03's cashbook applies, so the two
  books agree on cash.
* A sale, credit note, purchase bill or stock count moves NOTHING: on credit,
  it is a khata event; paid at the counter, the payment is its own row (BR-4).

── Voids and reversals (FR-7) ────────────────────────────────────────────────
Excluded by default, from the rows and from every figure. With
`include_void=true` they are listed with a `_void` type suffix (a reversed
khata line becomes `manual_got_void`; LED-03's reversal row keeps its own
type) and flagged, and they still move nothing: `cash` and `bank` are zero on
every flagged row, so the running balance is the same whether they are shown
or not. A document void posts its ledger reversal with the DOCUMENT as source
(`sales_document`), so it is represented by the flagged document rather than
by a second ledger row.

── Credit notes (SAL-04), assumed from the FRD ──────────────────────────────
`sales_document.kind = 'credit_note'`, statuses `draft/issued/applied/void`.
A live one is a `credit_note` row with no drawer effect; its refund, when
there is one, is a `payments_payment` direction `out` and appears as its own
`payment_out` row. Nothing here imports SAL-04's code, so the day book lists
the first credit note the day the kind exists.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.db import connection

from apps.common.money import ZERO
from apps.reports.constants import BANK_MODES, CREDIT_NOTE_KIND, DAY_BOOK_TYPES, SALE_KINDS

#: The six sources and the codename a reader needs to see each (§12: "rows
#: filtered by entity read permissions"). A source the reader may not read is
#: left out of the CTE entirely — not filtered afterwards — so it cannot move
#: a balance they are shown either.
SOURCE_PERMISSIONS: dict[str, str] = {
    "sales": "sales.invoice.read",
    "purchases": "purchases.bill.read",
    "payments": "payments.payment.read",
    "expenses": "expenses.expense.read",
    "ledger": "ledger.entry.read",
    "stock": "inventory.stock.read",
}
ALL_SOURCES: frozenset[str] = frozenset(SOURCE_PERMISSIONS)

#: The common row shape every fragment produces, in order, with its SQL type.
#: The CTE names its columns from this list (`WITH rows(ord, type, …)`), so a
#: fragment's own aliases do not matter and the first fragment in the union —
#: which depends on the reader's grants — cannot rename a column by being first.
_COLUMN_TYPES: tuple[tuple[str, str], ...] = (
    ("ord", "integer"),
    ("type", "text"),
    ("void", "boolean"),
    ("source_kind", "text"),
    ("source_id", "uuid"),
    ("bdate", "date"),
    ("at", "timestamptz"),
    ("number", "text"),
    ("party_id", "uuid"),
    ("party_name", "text"),
    ("amount", "numeric"),
    ("amount_due", "numeric"),
    ("money_in", "numeric"),
    ("money_out", "numeric"),
    ("cash", "numeric"),
    ("bank", "numeric"),
    ("modes", "jsonb"),
    ("note", "text"),
    ("detail", "text"),
    ("lines", "integer"),
    ("paid", "boolean"),
    ("reference", "text"),
    ("created_by_id", "uuid"),
    ("reverses_id", "uuid"),
)
_COLUMNS = tuple(name for name, _type in _COLUMN_TYPES)

_SALES = """
SELECT CASE WHEN d.kind = %(credit_note_kind)s THEN 2 ELSE 1 END AS ord,
       (CASE WHEN d.kind = %(credit_note_kind)s THEN 'credit_note' ELSE 'sale' END)
         || (CASE WHEN d.status = 'void' THEN '_void' ELSE '' END) AS type,
       d.status = 'void' AS void,
       'sales_document'::text AS source_kind, d.id AS source_id, d.document_date AS bdate,
       COALESCE(d.issued_at, d.created_at) AS at, d.number::text AS number,
       d.party_id, COALESCE(pp.name, d.walk_in_name)::text AS party_name,
       d.grand_total AS amount, d.amount_due AS amount_due,
       NULL::numeric AS money_in, NULL::numeric AS money_out,
       0::numeric AS cash, 0::numeric AS bank, NULL::jsonb AS modes,
       ''::text AS note, NULL::text AS detail, NULL::integer AS lines, NULL::boolean AS paid,
       ''::text AS reference, d.created_by_id, NULL::uuid AS reverses_id
  FROM sales_document d
  LEFT JOIN parties_party pp ON pp.id = d.party_id
 WHERE d.tenant_id = %(tenant)s
   AND (d.kind = ANY(%(sale_kinds)s) OR d.kind = %(credit_note_kind)s)
   AND d.status <> 'draft'
   AND (%(include_void)s OR d.status <> 'void')
   AND d.document_date BETWEEN %(lo)s AND %(hi)s
"""

_PURCHASES = """
SELECT 3 AS ord,
       'purchase' || (CASE WHEN b.status = 'void' THEN '_void' ELSE '' END) AS type,
       b.status = 'void' AS void,
       'purchase_document'::text, b.id, b.document_date,
       COALESCE(b.recorded_at, b.created_at), b.number::text,
       b.party_id, pp.name::text,
       b.grand_total, b.amount_due,
       NULL::numeric, NULL::numeric, 0::numeric, 0::numeric, NULL::jsonb,
       ''::text, NULL::text, NULL::integer, NULL::boolean,
       COALESCE(b.supplier_invoice_number, '')::text, b.created_by_id, NULL::uuid
  FROM purchases_document b
  LEFT JOIN parties_party pp ON pp.id = b.party_id
 WHERE b.tenant_id = %(tenant)s
   AND b.kind = 'purchase_bill'
   AND b.status <> 'draft'
   AND (%(include_void)s OR b.status <> 'void')
   AND b.document_date BETWEEN %(lo)s AND %(hi)s
"""

#: `s.cash_share` / `s.bank_share` — one LATERAL over the breakup per payment,
#: so a split payment stays one row (EC-1) with both halves known.
_PAYMENTS = """
SELECT CASE WHEN p.direction = 'in' THEN 4 ELSE 5 END,
       'payment_' || p.direction || (CASE WHEN p.status = 'void' THEN '_void' ELSE '' END),
       p.status = 'void',
       'payment'::text, p.id, p.payment_date, p.created_at, p.number::text,
       p.party_id, pp.name::text,
       p.amount, NULL::numeric,
       CASE WHEN p.direction = 'in' THEN p.amount END,
       CASE WHEN p.direction = 'out' THEN p.amount END,
       CASE WHEN p.status = 'void' THEN 0
            WHEN p.direction = 'in' THEN s.cash_share ELSE -s.cash_share END,
       CASE WHEN p.status = 'void' THEN 0
            WHEN p.direction = 'in' THEN s.bank_share ELSE -s.bank_share END,
       p.mode_breakup,
       p.note::text, NULL::text, NULL::integer, NULL::boolean,
       p.reference::text, p.created_by_id, NULL::uuid
  FROM payments_payment p
  LEFT JOIN parties_party pp ON pp.id = p.party_id
  CROSS JOIN LATERAL (
      SELECT COALESCE(SUM((m ->> 'amount')::numeric)
                      FILTER (WHERE m ->> 'mode' = 'cash'), 0) AS cash_share,
             COALESCE(SUM((m ->> 'amount')::numeric)
                      FILTER (WHERE m ->> 'mode' = ANY(%(bank_modes)s)), 0) AS bank_share
        FROM jsonb_array_elements(p.mode_breakup) AS m
  ) s
 WHERE p.tenant_id = %(tenant)s
   AND (%(include_void)s OR p.status <> 'void')
   AND p.payment_date BETWEEN %(lo)s AND %(hi)s
"""

_EXPENSES = """
SELECT 6,
       'expense' || (CASE WHEN e.status = 'void' THEN '_void' ELSE '' END),
       e.status = 'void',
       'expense'::text, e.id, e.expense_date, e.created_at, e.number::text,
       e.party_id, pp.name::text,
       e.amount, NULL::numeric,
       NULL::numeric,
       CASE WHEN e.paid THEN e.amount END,
       CASE WHEN e.status <> 'void' AND e.paid AND e.mode = 'cash' THEN -e.amount ELSE 0 END,
       CASE WHEN e.status <> 'void' AND e.paid AND e.mode = ANY(%(bank_modes)s)
            THEN -e.amount ELSE 0 END,
       CASE WHEN e.paid AND e.mode IS NOT NULL
            THEN jsonb_build_array(jsonb_build_object('mode', e.mode, 'amount', e.amount::text))
       END,
       e.note::text, c.name::text, NULL::integer, e.paid,
       e.reference::text, e.created_by_id, NULL::uuid
  FROM expenses_expense e
  JOIN expenses_category c ON c.id = e.category_id
  LEFT JOIN parties_party pp ON pp.id = e.party_id
 WHERE e.tenant_id = %(tenant)s
   AND (%(include_void)s OR e.status <> 'void')
   AND e.expense_date BETWEEN %(lo)s AND %(hi)s
"""

#: Only the khata's OWN lines: `source_type` manual, or `ledger_entry` for
#: LED-03's reversal of one. A document's ledger line is represented by the
#: document's own row, and listing both would be BR-4's duplicate.
_LEDGER = """
SELECT 7,
       CASE WHEN l.status = 'reversed' THEN l.entry_type || '_void' ELSE l.entry_type END,
       (l.status = 'reversed' OR l.entry_type = 'reversal'),
       'ledger_entry'::text, l.id, l.entry_date, l.created_at, NULL::text,
       l.party_id, pp.name::text,
       l.amount, NULL::numeric,
       CASE WHEN l.payment_mode IS NOT NULL AND l.direction = 'credit'
                 AND l.entry_type IN ('manual_got', 'manual_gave') THEN l.amount END,
       CASE WHEN l.payment_mode IS NOT NULL AND l.direction = 'debit'
                 AND l.entry_type IN ('manual_got', 'manual_gave') THEN l.amount END,
       CASE WHEN l.status = 'posted' AND l.entry_type IN ('manual_got', 'manual_gave')
                 AND l.payment_mode = 'cash'
            THEN (CASE WHEN l.direction = 'credit' THEN l.amount ELSE -l.amount END)
            ELSE 0 END,
       CASE WHEN l.status = 'posted' AND l.entry_type IN ('manual_got', 'manual_gave')
                 AND l.payment_mode = ANY(%(bank_modes)s)
            THEN (CASE WHEN l.direction = 'credit' THEN l.amount ELSE -l.amount END)
            ELSE 0 END,
       CASE WHEN l.payment_mode IS NOT NULL
            THEN jsonb_build_array(
                     jsonb_build_object('mode', l.payment_mode, 'amount', l.amount::text))
       END,
       l.note::text, l.reason::text, NULL::integer, NULL::boolean,
       l.reference::text, l.created_by_id, l.reverses_id
  FROM ledger_entry l
  JOIN parties_party pp ON pp.id = l.party_id
 WHERE l.tenant_id = %(tenant)s
   AND l.source_type IN ('manual', 'ledger_entry')
   AND (%(include_void)s OR (l.status = 'posted' AND l.entry_type <> 'reversal'))
   AND l.entry_date BETWEEN %(lo)s AND %(hi)s
"""

_STOCK = """
SELECT 8, 'stock_adjustment', false,
       'stock_adjustment'::text, a.id, a.adjustment_date, a.created_at, a.number::text,
       NULL::uuid, NULL::text,
       NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric,
       0::numeric, 0::numeric, NULL::jsonb,
       a.note::text, a.reason::text,
       (SELECT COUNT(*)::integer FROM inventory_stock_movement mv
         WHERE mv.tenant_id = a.tenant_id AND mv.source_type = 'stock_adjustment'
           AND mv.source_id = a.id),
       NULL::boolean, ''::text, a.created_by_id, NULL::uuid
  FROM inventory_stock_adjustment a
 WHERE a.tenant_id = %(tenant)s
   AND a.status = 'posted'
   AND a.adjustment_date BETWEEN %(lo)s AND %(hi)s
"""

#: Frozen: the key is what a caller supplies, the value is reviewed SQL.
_FRAGMENTS: dict[str, str] = {
    "sales": _SALES,
    "purchases": _PURCHASES,
    "payments": _PAYMENTS,
    "expenses": _EXPENSES,
    "ledger": _LEDGER,
    "stock": _STOCK,
}
_FRAGMENT_ORDER = ("sales", "purchases", "payments", "expenses", "ledger", "stock")

#: The day book's total order (BR-3), with the source order and the id as the
#: last two keys so two rows in the same second never swap between requests.
_ORDER = "bdate, at, ord, source_id"

#: A date older than any business, for "everything before `date_from`" (BR-2).
_BEGINNING = dt.date(1900, 1, 1)

#: The page's filters (FR-4), applied OUTSIDE the window. A void row matches
#: the filter of the type it voids, so `type=sale&include_void=true` shows the
#: cancelled bills too.
_OUTER_FILTERS = """
    (%(types)s::text[] IS NULL OR regexp_replace(type, '_void$', '') = ANY(%(types)s::text[]))
AND (%(party_id)s::uuid IS NULL OR party_id = %(party_id)s::uuid)
AND (%(created_by)s::uuid IS NULL OR created_by_id = %(created_by)s::uuid)
AND (%(mode)s::text IS NULL OR (modes IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(modes) AS mm WHERE mm ->> 'mode' = %(mode)s::text)))
"""


@dataclass(frozen=True)
class DayBookQuery:
    """Everything that decides the day book's rows — validated by the view.

    `sources` and `balances` are the READER's grants, captured once: the async
    export stores them with the job (RPT-08 BR-2), so the file a staff member
    queued is the file their permissions allowed at the moment they asked.
    """

    date_from: dt.date
    date_to: dt.date
    sources: frozenset[str] = ALL_SOURCES
    balances: bool = True
    types: tuple[str, ...] | None = None
    party_id: str | None = None
    created_by: str | None = None
    mode: str | None = None
    include_void: bool = False

    def to_params(self) -> dict:
        """JSON-safe, for `reports_export.params` (the async replay)."""
        return {
            "date_from": self.date_from.isoformat(),
            "date_to": self.date_to.isoformat(),
            "sources": sorted(self.sources),
            "balances": self.balances,
            "types": list(self.types) if self.types else None,
            "party_id": self.party_id,
            "created_by": self.created_by,
            "mode": self.mode,
            "include_void": self.include_void,
        }

    @classmethod
    def from_params(cls, params: dict) -> DayBookQuery:
        return cls(
            date_from=dt.date.fromisoformat(params["date_from"]),
            date_to=dt.date.fromisoformat(params["date_to"]),
            sources=frozenset(params.get("sources") or ()) & ALL_SOURCES,
            balances=bool(params.get("balances")),
            types=tuple(params["types"]) if params.get("types") else None,
            party_id=params.get("party_id"),
            created_by=params.get("created_by"),
            mode=params.get("mode"),
            include_void=bool(params.get("include_void")),
        )


def _cte(sources: frozenset[str]) -> str:
    """`rows(…) AS (fragment UNION ALL fragment …)` over the sources granted."""
    parts = [_FRAGMENTS[key] for key in _FRAGMENT_ORDER if key in sources]
    if not parts:
        # A reader who may read none of the six sources gets an empty book,
        # not a syntax error: one typed row that the WHERE never lets through.
        parts = [
            "SELECT "
            + ", ".join(f"NULL::{sql_type}" for _name, sql_type in _COLUMN_TYPES)
            + " WHERE false"
        ]
    return f"rows({', '.join(_COLUMNS)}) AS (" + "\nUNION ALL\n".join(parts) + ")"


def _base_params(tenant: Any, *, lo: dt.date, hi: dt.date, include_void: bool) -> dict:
    return {
        "tenant": str(getattr(tenant, "id", tenant)),
        "lo": lo,
        "hi": hi,
        "include_void": include_void,
        "bank_modes": list(BANK_MODES),
        "sale_kinds": list(SALE_KINDS),
        "credit_note_kind": CREDIT_NOTE_KIND,
    }


def _filter_params(query: DayBookQuery) -> dict:
    return {
        "types": list(query.types) if query.types else None,
        "party_id": query.party_id,
        "created_by": query.created_by,
        "mode": query.mode,
    }


def _fetch(sql: str, params: dict) -> list[tuple]:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def money_position(
    *, tenant: Any, before: dt.date, sources: frozenset[str] = ALL_SOURCES
) -> dict[str, Decimal]:
    """BR-2 — `{cash, bank}`: every classified in minus out dated before `before`.

    Also the dashboard's Cash in hand (RPT-01 BR-3) with `before = today + 1`:
    one definition of the drawer, so the tile and the day book's closing cash
    can never disagree (asserted in the reconciliation suite).
    """
    sql = f"WITH {_cte(sources)} SELECT COALESCE(SUM(cash), 0), COALESCE(SUM(bank), 0) FROM rows"  # noqa: S608
    params = _base_params(
        tenant, lo=_BEGINNING, hi=before - dt.timedelta(days=1), include_void=False
    )
    cash, bank = _fetch(sql, params)[0]
    return {"cash": cash or ZERO, "bank": bank or ZERO}


@dataclass
class DayBookRow:
    """One row as the selector returns it — values, not presentation."""

    type: str
    void: bool
    source_kind: str
    source_id: str
    date: dt.date
    at: dt.datetime
    number: str | None
    party_id: str | None
    party_name: str | None
    amount: Decimal | None
    amount_due: Decimal | None
    money_in: Decimal | None
    money_out: Decimal | None
    cash: Decimal
    bank: Decimal
    modes: list[dict]
    note: str
    detail: str | None
    lines: int | None
    paid: bool | None
    reference: str
    created_by_id: str | None
    created_by_name: str | None
    reverses_id: str | None
    cash_after: Decimal | None = None
    bank_after: Decimal | None = None


@dataclass
class DayBookResult:
    opening: dict[str, Decimal]
    closing: dict[str, Decimal]
    rows: list[DayBookRow]
    total: int
    totals: dict[str, Any] = field(default_factory=dict)


def _json_list(value: Any) -> list[dict]:
    """A `jsonb` cell from a raw cursor. Django's psycopg 3 adapter hands jsonb
    back as TEXT (JSON decoding is the model field's job, and a raw query has
    no field), so it is decoded here."""
    if value is None:
        return []
    if isinstance(value, str):
        value = json.loads(value)
    return list(value)


def _row(values: tuple, opening: dict[str, Decimal] | None) -> DayBookRow:
    named = dict(zip((*_COLUMNS, "cash_run", "bank_run", "created_by_name"), values, strict=True))
    row = DayBookRow(
        type=named["type"],
        void=bool(named["void"]),
        source_kind=named["source_kind"],
        source_id=str(named["source_id"]),
        date=named["bdate"],
        at=named["at"],
        number=named["number"],
        party_id=str(named["party_id"]) if named["party_id"] else None,
        party_name=named["party_name"],
        amount=named["amount"],
        amount_due=named["amount_due"],
        money_in=named["money_in"],
        money_out=named["money_out"],
        cash=named["cash"] or ZERO,
        bank=named["bank"] or ZERO,
        modes=_json_list(named["modes"]),
        note=named["note"] or "",
        detail=named["detail"],
        lines=named["lines"],
        paid=named["paid"],
        reference=named["reference"] or "",
        created_by_id=str(named["created_by_id"]) if named["created_by_id"] else None,
        created_by_name=named["created_by_name"],
        reverses_id=str(named["reverses_id"]) if named["reverses_id"] else None,
    )
    if opening is not None:
        row.cash_after = opening["cash"] + (named["cash_run"] or ZERO)
        row.bank_after = opening["bank"] + (named["bank_run"] or ZERO)
    return row


def _rows_sql(query: DayBookQuery, *, paged: bool) -> str:
    """The window over every granted row, then the filters, then the page."""
    tail = "LIMIT %(limit)s OFFSET %(offset)s" if paged else ""
    return f"""
WITH {_cte(query.sources)},
ran AS (
    SELECT rows.*,
           SUM(cash) OVER w AS cash_run,
           SUM(bank) OVER w AS bank_run
      FROM rows
    WINDOW w AS (ORDER BY {_ORDER} ROWS UNBOUNDED PRECEDING)
),
kept AS (SELECT * FROM ran WHERE {_OUTER_FILTERS})
SELECT {", ".join(f"kept.{name}" for name in _COLUMNS)}, kept.cash_run, kept.bank_run,
       u.full_name
  FROM kept
  LEFT JOIN platform_user u ON u.id = kept.created_by_id
 ORDER BY {", ".join(f"kept.{key.strip()}" for key in _ORDER.split(","))}
 {tail}
"""


def _query_params(tenant: Any, query: DayBookQuery) -> dict:
    return {
        **_base_params(
            tenant, lo=query.date_from, hi=query.date_to, include_void=query.include_void
        ),
        **_filter_params(query),
    }


def count_rows(*, tenant: Any, query: DayBookQuery) -> int:
    """The filtered row count — the export's sync/async decision (RPT-08 BR-3)."""
    sql = (
        f"WITH {_cte(query.sources)} SELECT COUNT(*) FROM rows WHERE {_OUTER_FILTERS}"  # noqa: S608
    )
    return int(_fetch(sql, _query_params(tenant, query))[0][0])


def type_totals(*, tenant: Any, query: DayBookQuery) -> dict[str, dict[str, Any]]:
    """FR-3 — per type: count, Σ amount, Σ in, Σ out. Void rows never count."""
    sql = f"""
WITH {_cte(query.sources)}
SELECT type, COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(money_in), 0),
       COALESCE(SUM(money_out), 0)
  FROM rows
 WHERE NOT void AND {_OUTER_FILTERS}
 GROUP BY type
"""
    out = {}
    for type_code, count, amount, money_in, money_out in _fetch(sql, _query_params(tenant, query)):
        out[type_code] = {
            "count": int(count),
            "amount": amount or ZERO,
            "in": money_in or ZERO,
            "out": money_out or ZERO,
        }
    return out


def summarise(by_type: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """FR-3's footer figures, from the per-type totals."""

    def amount(code: str) -> Decimal:
        return by_type.get(code, {}).get("amount", ZERO)

    money_in = sum((slot["in"] for slot in by_type.values()), ZERO)
    money_out = sum((slot["out"] for slot in by_type.values()), ZERO)
    return {
        "count": {code: by_type[code]["count"] for code in DAY_BOOK_TYPES if code in by_type},
        "sales": amount("sale"),
        "credit_notes": amount("credit_note"),
        "purchases": amount("purchase"),
        "payments_in": amount("payment_in"),
        "payments_out": amount("payment_out"),
        "expenses": amount("expense"),
        "money_in": money_in,
        "money_out": money_out,
    }


def day_book(
    *, tenant: Any, query: DayBookQuery, page: int = 1, page_size: int = 100
) -> DayBookResult:
    """One page of the day book, with the range's opening, closing and totals.

    Five statements: the opening (everything before the range), the range's
    net (for the closing), the per-type totals over the FILTERED rows, the
    filtered count, and the page itself. Opening and closing are the drawer's
    real position and ignore the page's filters: "closing cash ₹800" is a fact
    about the drawer, not about the payment rows a filter left on screen.
    """
    opening = money_position(tenant=tenant, before=query.date_from, sources=query.sources)
    net_sql = (
        f"WITH {_cte(query.sources)} SELECT COALESCE(SUM(cash), 0), COALESCE(SUM(bank), 0) "  # noqa: S608
        "FROM rows"
    )
    net_cash, net_bank = _fetch(
        net_sql,
        _base_params(tenant, lo=query.date_from, hi=query.date_to, include_void=False),
    )[0]
    closing = {"cash": opening["cash"] + net_cash, "bank": opening["bank"] + net_bank}

    params = {
        **_query_params(tenant, query),
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }
    rows = [_row(values, opening) for values in _fetch(_rows_sql(query, paged=True), params)]
    return DayBookResult(
        opening=opening,
        closing=closing,
        rows=rows,
        total=count_rows(tenant=tenant, query=query),
        totals=type_totals(tenant=tenant, query=query),
    )


def iter_rows(*, tenant: Any, query: DayBookQuery, chunk_size: int = 1000) -> Iterator[DayBookRow]:
    """Every filtered row in order, with running balances — the export's source.

    A named server-side cursor, so a year of a busy shop streams in chunks
    rather than arriving in the process at once (RPT-08 §20: O(chunk) memory).
    """
    opening = money_position(tenant=tenant, before=query.date_from, sources=query.sources)
    sql = _rows_sql(query, paged=False)
    with connection.chunked_cursor() as cursor:
        cursor.execute(sql, _query_params(tenant, query))
        while True:
            batch = cursor.fetchmany(chunk_size)
            if not batch:
                return
            for values in batch:
                yield _row(values, opening)
