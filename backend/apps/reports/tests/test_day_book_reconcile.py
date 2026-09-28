"""RPT-02 — the day book, proved against a second, naive computation.

Part 32 §32.13.2's risk line is the reason this file exists: "report arithmetic
that disagrees with the ledger is the most damaging class of defect in the
product, because it destroys trust silently." So the figures here are not
checked against numbers typed into the test — beyond the FRD's own worked
examples — but against the SAME figure computed a different way: straight ORM
filters and Python sums over each source table, which share no code with the
selector's `UNION ALL` and window.
"""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest

from apps.reports.selectors.day_book import (
    ALL_SOURCES,
    DayBookQuery,
    count_rows,
    day_book,
    iter_rows,
    money_position,
    summarise,
    type_totals,
)
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 9, 18)
BANK = ("upi", "bank", "card", "cheque")


def _book(tenant: Any, **query: Any) -> Any:
    q = DayBookQuery(**{"date_from": TODAY, "date_to": TODAY, **query})
    return day_book(tenant=tenant, query=q, page=1, page_size=200)


def test_ac1_a_split_payment_and_a_cash_expense_close_the_drawer_at_800(tenant: Any) -> None:
    """AC-1 — sale ₹1,772 paid ₹1,000 cash + ₹772 UPI, expense ₹200 cash →
    closing cash ₹800, bank ₹772; the sale moves nothing, the payment is ONE
    row (EC-1) and BR-4 lists the sale and the payment separately."""
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, "1772.00", party=ramesh, due=0)
    b.payment(tenant, TODAY, {"cash": 1000, "upi": 772}, party=ramesh)
    b.expense(tenant, TODAY, 200, mode="cash")

    book = _book(tenant)
    types = [row.type for row in book.rows]
    assert types == ["sale", "payment_in", "expense"]
    sale_row, pay_row, exp_row = book.rows
    assert (sale_row.cash, sale_row.bank) == (0, 0)
    assert pay_row.money_in == Decimal("1772.00")
    assert (pay_row.cash, pay_row.bank) == (Decimal("1000.00"), Decimal("772.00"))
    assert exp_row.money_out == Decimal("200.00")
    assert book.closing == {"cash": Decimal("800.00"), "bank": Decimal("772.00")}
    assert (exp_row.cash_after, exp_row.bank_after) == (Decimal("800.00"), Decimal("772.00"))


def test_other_mode_is_shown_as_money_but_moves_no_balance(tenant: Any) -> None:
    """BR-1 — `other` is unclassified: In ₹300, cash and bank untouched."""
    b.payment(tenant, TODAY, {"other": 300}, party=b.party(tenant))
    (row,) = _book(tenant).rows
    assert row.money_in == Decimal("300.00")
    assert (row.cash_after, row.bank_after) == (0, 0)


def test_the_opening_is_everything_before_the_range_and_excludes_voids(tenant: Any) -> None:
    """BR-2 / T-RPT02-2 — a void before the range is not money that came in."""
    ramesh = b.party(tenant)
    b.payment(tenant, TODAY - dt.timedelta(days=5), {"cash": 500}, party=ramesh)
    b.payment(tenant, TODAY - dt.timedelta(days=3), {"cash": 9999}, party=ramesh, status="void")
    b.expense(tenant, TODAY - dt.timedelta(days=2), 120, mode="upi")
    book = _book(tenant)
    assert book.opening == {"cash": Decimal("500.00"), "bank": Decimal("-120.00")}
    assert book.rows == []
    assert book.closing == book.opening


def test_voids_and_reversals_are_listed_only_on_request_and_never_move_the_drawer(
    tenant: Any,
) -> None:
    """FR-7 — `include_void=true` lists them with a `_void` suffix and flags them;
    the running cash is identical with and without them, and totals skip them."""
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, 400, party=ramesh, status="void")
    b.payment(tenant, TODAY, {"cash": 250}, party=ramesh, status="void")
    b.expense(tenant, TODAY, 90, status="void")
    typo = b.khata(tenant, TODAY, 500, party=ramesh, mode="cash", note="typo")
    b.reverse(typo)
    b.payment(tenant, TODAY, {"cash": 100}, party=ramesh)

    hidden = _book(tenant)
    assert [row.type for row in hidden.rows] == ["payment_in"]
    shown = _book(tenant, include_void=True)
    types = sorted(row.type for row in shown.rows)
    assert types == sorted(
        [
            "sale_void",
            "payment_in_void",
            "expense_void",
            "manual_got_void",
            "reversal",
            "payment_in",
        ]
    )
    assert all(row.void for row in shown.rows if row.type != "payment_in")
    assert shown.closing == hidden.closing == {"cash": Decimal("100.00"), "bank": 0}
    assert shown.rows[-1].cash_after == Decimal("100.00")
    totals = summarise(shown.totals)
    assert totals["payments_in"] == Decimal("100.00")
    assert totals["sales"] == 0 and totals["expenses"] == 0


def test_credit_notes_are_listed_and_their_refund_is_the_payment_row(tenant: Any) -> None:
    """SAL-04 (assumed from the FRD) — a live credit note is a `credit_note` row with
    no drawer effect; a voided one is `credit_note_void`; the cash refund is a
    `payment_out`, which is the row that moves the drawer."""
    ramesh = b.party(tenant)
    b.credit_note(tenant, TODAY, "465.81", party=ramesh)
    b.credit_note(tenant, TODAY, "100.00", party=ramesh, status="void")
    b.payment(tenant, TODAY, {"cash": "465.81"}, party=ramesh, direction="out")
    book = _book(tenant, include_void=True)
    assert sorted(row.type for row in book.rows) == [
        "credit_note",
        "credit_note_void",
        "payment_out",
    ]
    assert book.closing["cash"] == Decimal("-465.81")
    assert summarise(book.totals)["credit_notes"] == Decimal("465.81")


def test_drafts_estimates_and_document_ledger_lines_are_never_rows(tenant: Any) -> None:
    """BR-4 — an invoice is one `sale` row, not also its `invoice` ledger line; a
    draft and an estimate (SAL-01) are not events in the book."""
    ramesh = b.party(tenant)
    doc = b.sale(tenant, TODAY, 700, party=ramesh)
    b.sale(tenant, TODAY, 50, party=ramesh, status="draft")
    b.sale(tenant, TODAY, 60, party=ramesh, kind="estimate", status="issued")
    b.khata(
        tenant,
        TODAY,
        700,
        party=ramesh,
        got=False,
        entry_type="invoice",
        source_type="sales_document",
    )
    assert [(row.type, row.source_id) for row in _book(tenant).rows] == [("sale", str(doc.id))]


def test_a_backdated_line_sits_on_its_business_date(tenant: Any) -> None:
    """EC-2 — entered today for last week, it is on last week's page."""
    ramesh = b.party(tenant)
    last_week = TODAY - dt.timedelta(days=7)
    b.khata(tenant, last_week, 300, party=ramesh, mode="upi")
    assert _book(tenant).rows == []
    (row,) = _book(tenant, date_from=last_week, date_to=last_week).rows
    assert row.date == last_week and row.bank == Decimal("300.00")


def test_a_reader_without_a_source_gets_a_book_without_it(tenant: Any) -> None:
    """T-RPT02-4 (selector half) — a source left out of the grants is not in the CTE."""
    ramesh = b.party(tenant)
    b.purchase(tenant, TODAY, 5000, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 10}, party=ramesh)
    without = ALL_SOURCES - {"purchases"}
    assert [row.type for row in _book(tenant, sources=without).rows] == ["payment_in"]
    assert [row.type for row in _book(tenant).rows] == ["purchase", "payment_in"]
    assert _book(tenant, sources=frozenset()).rows == []


def test_other_tenants_rows_never_appear(tenant: Any, other_tenant: Any) -> None:
    """Canon §0.11 rule 2 — the tenant is in every fragment's own WHERE."""
    b.payment(other_tenant, TODAY, {"cash": 777}, party=b.party(other_tenant))
    b.sale(other_tenant, TODAY, 777, party=b.party(other_tenant))
    book = _book(tenant)
    assert book.rows == [] and book.closing == {"cash": 0, "bank": 0}


# ── The fuzzed book: every figure computed twice ─────────────────────────────


def _fuzzed_book(tenant: Any, seed: int) -> dict:
    """Sixty events over forty days, every source and every awkward case."""
    rng = random.Random(seed)
    parties = [b.party(tenant, name=f"P{n}") for n in range(4)]
    start = TODAY - dt.timedelta(days=39)
    for _ in range(60):
        on = start + dt.timedelta(days=rng.randrange(40))
        who = rng.choice(parties)
        pick = rng.randrange(9)
        amount = Decimal(rng.randrange(100, 500000)) / 100
        if pick == 0:
            b.sale(tenant, on, amount, party=who, status=rng.choice(["issued", "paid", "void"]))
        elif pick == 1:
            b.credit_note(tenant, on, amount, party=who, status=rng.choice(["issued", "void"]))
        elif pick == 2:
            b.purchase(tenant, on, amount, party=who, status=rng.choice(["recorded", "void"]))
        elif pick in (3, 4):
            modes = rng.sample(
                ["cash", "upi", "bank", "card", "cheque", "other"], rng.randint(1, 3)
            )
            split = {mode: Decimal(rng.randrange(100, 200000)) / 100 for mode in modes}
            b.payment(
                tenant,
                on,
                split,
                party=who,
                direction=rng.choice(["in", "out"]),
                status=rng.choice(["recorded", "recorded", "void"]),
            )
        elif pick == 5:
            paid = rng.random() < 0.7
            b.expense(
                tenant,
                on,
                amount,
                paid=paid,
                party=None if paid else who,
                mode=rng.choice(["cash", "upi", "other"]),
                status=rng.choice(["recorded", "recorded", "void"]),
            )
        elif pick in (6, 7):
            entry = b.khata(
                tenant,
                on,
                amount,
                party=who,
                got=rng.random() < 0.6,
                mode=rng.choice([None, "cash", "upi", "other"]),
            )
            if rng.random() < 0.2:
                b.reverse(entry)
        else:
            b.adjustment(tenant, on)
    return {"start": start}


def _naive_cash_bank(tenant: Any, *, upto: dt.date) -> dict[str, Decimal]:
    """The drawer, summed row by row in Python straight off each table."""
    from apps.expenses.models import Expense
    from apps.ledger.models import LedgerEntry
    from apps.payments.models import Payment

    cash = bank = Decimal("0")
    for p in Payment.objects.filter(tenant=tenant, status="recorded", payment_date__lte=upto):
        sign = 1 if p.direction == "in" else -1
        for part in p.mode_breakup:
            if part["mode"] == "cash":
                cash += sign * Decimal(part["amount"])
            elif part["mode"] in BANK:
                bank += sign * Decimal(part["amount"])
    for e in Expense.objects.filter(
        tenant=tenant, status="recorded", paid=True, expense_date__lte=upto
    ):
        if e.mode == "cash":
            cash -= e.amount
        elif e.mode in BANK:
            bank -= e.amount
    for entry in LedgerEntry.objects.filter(
        tenant=tenant,
        status="posted",
        entry_type__in=("manual_got", "manual_gave"),
        payment_mode__isnull=False,
        entry_date__lte=upto,
    ):
        sign = 1 if entry.direction == "credit" else -1
        if entry.payment_mode == "cash":
            cash += sign * entry.amount
        elif entry.payment_mode in BANK:
            bank += sign * entry.amount
    return {"cash": cash, "bank": bank}


def _naive_counts(tenant: Any, lo: dt.date, hi: dt.date) -> dict[str, int]:
    from apps.expenses.models import Expense
    from apps.inventory.models import StockAdjustment
    from apps.ledger.models import LedgerEntry
    from apps.payments.models import Payment
    from apps.purchases.models import PurchaseDocument
    from apps.sales.models import SalesDocument

    live = {"document_date__gte": lo, "document_date__lte": hi}
    return {
        "sale": SalesDocument.objects.filter(tenant=tenant, kind="invoice", **live)
        .exclude(status__in=("draft", "void"))
        .count(),
        "credit_note": SalesDocument.objects.filter(tenant=tenant, kind="credit_note", **live)
        .exclude(status__in=("draft", "void"))
        .count(),
        "purchase": PurchaseDocument.objects.filter(tenant=tenant, **live)
        .exclude(status__in=("draft", "void"))
        .count(),
        "payment_in": Payment.objects.filter(
            tenant=tenant,
            direction="in",
            status="recorded",
            payment_date__gte=lo,
            payment_date__lte=hi,
        ).count(),
        "payment_out": Payment.objects.filter(
            tenant=tenant,
            direction="out",
            status="recorded",
            payment_date__gte=lo,
            payment_date__lte=hi,
        ).count(),
        "expense": Expense.objects.filter(
            tenant=tenant, status="recorded", expense_date__gte=lo, expense_date__lte=hi
        ).count(),
        "khata": LedgerEntry.objects.filter(
            tenant=tenant,
            status="posted",
            source_type="manual",
            entry_date__gte=lo,
            entry_date__lte=hi,
        ).count(),
        "stock_adjustment": StockAdjustment.objects.filter(
            tenant=tenant, adjustment_date__gte=lo, adjustment_date__lte=hi
        ).count(),
    }


@pytest.mark.parametrize("seed", [3, 11, 29])
def test_a_fuzzed_book_reconciles_row_by_row_and_figure_by_figure(tenant: Any, seed: int) -> None:
    """T-RPT02-1 / TSK-RPT-02-03 — for random ranges over a fuzzed book:

    * the opening and the closing equal a Python replay of every source table;
    * the row count per type equals a plain `COUNT` per table;
    * Σ In and Σ Out equal the naive sums of the money rows;
    * the last row's running cash equals the closing (the window agrees with
      the aggregate that computed the closing independently).
    """
    from apps.expenses.models import Expense
    from apps.payments.models import Payment

    start = _fuzzed_book(tenant, seed)["start"]
    rng = random.Random(seed * 7)
    for _ in range(4):
        lo = start + dt.timedelta(days=rng.randrange(40))
        hi = min(lo + dt.timedelta(days=rng.randrange(20)), TODAY)
        book = _book(tenant, date_from=lo, date_to=hi)

        assert book.opening == _naive_cash_bank(tenant, upto=lo - dt.timedelta(days=1))
        assert book.closing == _naive_cash_bank(tenant, upto=hi)

        naive = _naive_counts(tenant, lo, hi)
        got = {code: slot["count"] for code, slot in book.totals.items()}
        khata = sum(
            n
            for code, n in got.items()
            if code in ("manual_got", "manual_gave", "opening", "write_off")
        )
        assert khata == naive.pop("khata")
        for code, expected in naive.items():
            assert got.get(code, 0) == expected, code
        assert book.total == len(book.rows) == sum(got.values())

        payments = Payment.objects.filter(
            tenant=tenant, status="recorded", payment_date__gte=lo, payment_date__lte=hi
        )
        paid_out = Expense.objects.filter(
            tenant=tenant, status="recorded", paid=True, expense_date__gte=lo, expense_date__lte=hi
        )
        totals = summarise(book.totals)
        assert totals["payments_in"] == sum(
            (p.amount for p in payments if p.direction == "in"), Decimal("0")
        )
        assert totals["payments_out"] == sum(
            (p.amount for p in payments if p.direction == "out"), Decimal("0")
        )
        assert totals["expenses"] == sum(
            (
                e.amount
                for e in Expense.objects.filter(
                    tenant=tenant, status="recorded", expense_date__gte=lo, expense_date__lte=hi
                )
            ),
            Decimal("0"),
        )
        from apps.ledger.models import LedgerEntry

        moved = LedgerEntry.objects.filter(
            tenant=tenant,
            status="posted",
            entry_type__in=("manual_got", "manual_gave"),
            payment_mode__isnull=False,
            entry_date__gte=lo,
            entry_date__lte=hi,
        )
        manual_in = sum((e.amount for e in moved if e.direction == "credit"), Decimal("0"))
        manual_out = sum((e.amount for e in moved if e.direction == "debit"), Decimal("0"))
        assert totals["money_in"] == totals["payments_in"] + manual_in
        assert totals["money_out"] == (
            totals["payments_out"] + sum((e.amount for e in paid_out), Decimal("0")) + manual_out
        )
        if book.rows:
            assert (book.rows[-1].cash_after, book.rows[-1].bank_after) == (
                book.closing["cash"],
                book.closing["bank"],
            )


def test_pages_join_into_the_single_page_with_the_same_running_balances(tenant: Any) -> None:
    """T-RPT02-3 — the window runs before the page, so page two continues page one's
    drawer. Pages of seven, concatenated, equal one page of everything; and the
    exporter's streamed rows equal both."""
    start = _fuzzed_book(tenant, 5)["start"]
    query = DayBookQuery(date_from=start, date_to=TODAY, include_void=True)
    whole = day_book(tenant=tenant, query=query, page=1, page_size=200)
    paged = []
    page = 1
    while True:
        chunk = day_book(tenant=tenant, query=query, page=page, page_size=7).rows
        if not chunk:
            break
        paged.extend(chunk)
        page += 1
    key = [(r.source_id, r.type, r.cash_after, r.bank_after) for r in whole.rows]
    assert [(r.source_id, r.type, r.cash_after, r.bank_after) for r in paged] == key
    streamed = list(iter_rows(tenant=tenant, query=query, chunk_size=5))
    assert [(r.source_id, r.type, r.cash_after, r.bank_after) for r in streamed] == key
    assert count_rows(tenant=tenant, query=query) == len(key)


def test_a_type_filter_hides_rows_but_not_the_drawer(tenant: Any) -> None:
    """FR-4 / AC-2 — filtering to payments shows payment rows only; opening and
    closing stay the drawer's real position, and each row's running cash is
    still the book's, not a sum of the rows left on screen."""
    ramesh = b.party(tenant)
    b.expense(tenant, TODAY, 50, mode="cash")
    b.payment(tenant, TODAY, {"cash": 500}, party=ramesh)
    b.payment(tenant, TODAY, {"upi": 70}, party=ramesh, direction="out")
    b.sale(tenant, TODAY, 999, party=ramesh)
    book = _book(tenant, types=("payment_in", "payment_out"))
    assert [row.type for row in book.rows] == ["payment_in", "payment_out"]
    assert book.rows[0].cash_after == Decimal("450.00")  # after the ₹50 expense
    assert book.closing == {"cash": Decimal("450.00"), "bank": Decimal("-70.00")}
    assert set(
        type_totals(
            tenant=tenant,
            query=DayBookQuery(date_from=TODAY, date_to=TODAY, types=("payment_in", "payment_out")),
        )
    ) == {"payment_in", "payment_out"}


def test_money_position_is_one_definition_for_the_book_and_the_dashboard(tenant: Any) -> None:
    """BR-2 = RPT-01 BR-3: `money_position(before=tomorrow)` is the closing of today."""
    start = _fuzzed_book(tenant, 17)["start"]
    closing = _book(tenant, date_from=start).closing
    assert money_position(tenant=tenant, before=TODAY + dt.timedelta(days=1)) == closing


def test_a_split_receipts_cash_share_shows_no_upi_reference_uat_d6(tenant: Any) -> None:
    """UAT D6 — the cashbook's CASH row of a split receipt read "UTR 5566", the UPI
    share's reference, because every share fell back to the payment-level reference.
    Each share now shows its own; a single-mode payment still falls back."""
    from apps.reports.selectors.cash_sources import PaymentCashSource

    split = b.payment(tenant, TODAY, {"cash": 1000, "upi": 772})
    split.mode_breakup = [
        {"mode": "cash", "amount": "1000.00"},
        {"mode": "upi", "amount": "772.00", "reference": "5566"},
    ]
    split.reference = "5566"
    split.save(update_fields=["mode_breakup", "reference"])
    single = b.payment(tenant, TODAY, {"upi": 300})
    single.reference = "7788"
    single.save(update_fields=["reference"])

    rows = list(PaymentCashSource().rows(tenant=tenant, date_from=TODAY, date_to=TODAY))
    by_id = {row.source_id: row.reference for row in rows}
    assert by_id[f"{split.id}:0"] == ""
    assert by_id[f"{split.id}:1"] == "5566"
    assert by_id[f"{single.id}:0"] == "7788"
