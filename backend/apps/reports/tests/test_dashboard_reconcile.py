"""RPT-01 — every dashboard tile, proved against a naive second computation.

TSK-RPT-01-05: "each tile equals a naive second computation on the fixture".
The FRD's acceptance criteria are checked with their own numbers first; then a
fuzzed book checks each tile against plain Python over the source rows, which
shares no code with the aggregates in `selectors/dashboard.py`.
"""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest

from apps.reports.selectors.dashboard import build_dashboard, project
from apps.reports.selectors.day_book import DayBookQuery, day_book
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 9, 18)
EVERYTHING = frozenset(
    {
        "reports.basic.read",
        "reports.financial.read",
        "parties.party.read",
        "sales.invoice.read",
        "inventory.stock.read",
        "ledger.entry.read",
        "ledger.reminder.write",
        "payments.payment.read",
        "expenses.expense.read",
        "purchases.bill.read",
    }
)
ALL_MODULES = frozenset({"payments", "expenses", "inventory", "sales", "parties", "ledger"})


def _tiles(tenant: Any) -> dict:
    return build_dashboard(tenant=tenant, today=TODAY)["tiles"]


def test_ac1_to_collect_and_to_pay(tenant: Any) -> None:
    """AC-1 — balances +5,000, +2,000, −1,500 → To collect ₹7,000, To pay ₹1,500.
    A supplier who owes US counts in To collect (BR-1); an archived party never."""
    b.party(tenant, "A", balance=Decimal("5000"))
    b.party(tenant, "B", balance=Decimal("2000"), is_supplier=True, is_customer=False)
    b.party(tenant, "C", balance=Decimal("-1500"))
    b.party(tenant, "Gone", balance=Decimal("0"), status="archived")
    tiles = _tiles(tenant)
    assert tiles["to_collect"] == {"amount": "7000.00"}
    assert tiles["to_pay"] == {"amount": "1500.00"}


def test_ac2_due_today_and_overdue_from_collection_dates(tenant: Any) -> None:
    """AC-2 — Ramesh due today ₹1,772, Suresh yesterday ₹500; EC-2: a past date on
    a settled party is not overdue."""
    b.party(tenant, "Ramesh", balance=Decimal("1772"), collection_date=TODAY)
    b.party(tenant, "Suresh", balance=Decimal("500"), collection_date=TODAY - dt.timedelta(days=1))
    b.party(tenant, "Settled", balance=Decimal("0"), collection_date=TODAY - dt.timedelta(days=3))
    b.party(tenant, "Soon", balance=Decimal("300"), collection_date=TODAY + dt.timedelta(days=3))
    tiles = _tiles(tenant)
    assert tiles["due_today"] == {"count": 1, "amount": "1772.00"}
    assert tiles["overdue"] == {"count": 1, "amount": "500.00"}
    assert tiles["upcoming_7d"] == {"count": 1, "amount": "300.00"}


def test_ac3_todays_sales_net_credit_notes_and_cash_in_hand(tenant: Any) -> None:
    """AC-3 — bills ₹1,772 + ₹898 and a credit note ₹465.81 → ₹2,204.19 (2 bills);
    cash payments in ₹1,000 and a cash expense ₹200 → Cash in hand ₹800. Drafts,
    voids and estimates are not sales (BR-2)."""
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, "1772.00", party=ramesh)
    b.sale(tenant, TODAY, "898.00", kind="bill_of_supply", party=ramesh)
    b.sale(tenant, TODAY, "5000.00", party=ramesh, status="void")
    b.sale(tenant, TODAY, "5000.00", party=ramesh, status="draft")
    b.sale(tenant, TODAY, "5000.00", party=ramesh, kind="estimate")
    b.credit_note(tenant, TODAY, "465.81", party=ramesh)
    b.credit_note(tenant, TODAY, "99.00", party=ramesh, status="void")
    b.sale(tenant, TODAY - dt.timedelta(days=1), "300.00", party=ramesh)
    b.payment(tenant, TODAY, {"cash": 1000}, party=ramesh)
    b.expense(tenant, TODAY, 200, mode="cash")
    tiles = _tiles(tenant)
    assert tiles["today_sales"] == {"amount": "2204.19", "count": 2, "yesterday_amount": "300.00"}
    assert tiles["cash_in_hand"] == {"amount": "800.00"}


def test_ec3_a_returns_day_is_negative_sales(tenant: Any) -> None:
    """EC-3 — a credit note bigger than the day's sales is reported as −₹x."""
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, 100, party=ramesh)
    b.credit_note(tenant, TODAY, 250, party=ramesh)
    assert _tiles(tenant)["today_sales"]["amount"] == "-150.00"


def test_overdue_bills_are_the_secondary_line(tenant: Any) -> None:
    """BR-6 — the invoice-level overdue count and Σ amount_due."""
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY - dt.timedelta(days=40), 1000, party=ramesh, status="overdue", due=600)
    b.sale(tenant, TODAY - dt.timedelta(days=50), 700, party=ramesh, status="overdue")
    b.sale(tenant, TODAY - dt.timedelta(days=50), 400, party=ramesh, status="void")
    assert _tiles(tenant)["overdue_invoices"] == {"count": 2, "amount": "1300.00"}


def test_ac4_low_stock_counts_out_of_stock_separately(tenant: Any) -> None:
    """AC-4 — three at or below their reorder point, one of them out → 3, "1 out"."""
    b.stocked_item(tenant, "Rice", on_hand=5, reorder_point=10)
    b.stocked_item(tenant, "Oil", on_hand=10, reorder_point=10)
    b.stocked_item(tenant, "Dal", on_hand=0, reorder_point=4)
    b.stocked_item(tenant, "Salt", on_hand=50, reorder_point=10)
    payload = build_dashboard(tenant=tenant, today=TODAY)
    assert payload["tiles"]["low_stock"] == {"count": 3, "out_count": 1}
    assert [item["name"] for item in payload["low_stock_items"]][0] == "Dal"  # out first


def test_every_tile_equals_a_naive_recount_of_a_fuzzed_book(tenant: Any) -> None:
    """TSK-RPT-01-05 — each tile against a Python pass over the rows."""
    from apps.parties.models import Party
    from apps.sales.models import SalesDocument

    rng = random.Random(41)
    parties = []
    for n in range(12):
        balance = Decimal(rng.randrange(-300000, 600000)) / 100
        offset = rng.choice([None, -5, -1, 0, 0, 2, 6, 9])
        parties.append(
            b.party(
                tenant,
                f"P{n}",
                balance=balance,
                collection_date=None if offset is None else TODAY + dt.timedelta(days=offset),
            )
        )
    for _ in range(40):
        on = TODAY - dt.timedelta(days=rng.randrange(3))
        who = rng.choice(parties)
        amount = Decimal(rng.randrange(100, 300000)) / 100
        pick = rng.randrange(5)
        if pick == 0:
            b.sale(
                tenant,
                on,
                amount,
                party=who,
                status=rng.choice(["issued", "paid", "overdue", "void", "draft"]),
            )
        elif pick == 1:
            b.credit_note(tenant, on, amount, party=who, status=rng.choice(["issued", "void"]))
        elif pick == 2:
            b.payment(
                tenant,
                on,
                {rng.choice(["cash", "upi"]): amount},
                party=who,
                direction=rng.choice(["in", "out"]),
                status=rng.choice(["recorded", "void"]),
            )
        elif pick == 3:
            b.expense(
                tenant,
                on,
                amount,
                mode=rng.choice(["cash", "bank"]),
                status=rng.choice(["recorded", "void"]),
            )
        else:
            b.khata(tenant, on, amount, party=who, mode=rng.choice([None, "cash"]))

    tiles = _tiles(tenant)
    active = list(Party.objects.filter(tenant=tenant, status="active"))
    money = lambda value: str(Decimal(value).quantize(Decimal("0.01")))  # noqa: E731
    assert tiles["to_collect"]["amount"] == money(sum(p.balance for p in active if p.balance > 0))
    assert tiles["to_pay"]["amount"] == money(sum(-p.balance for p in active if p.balance < 0))
    owing = [p for p in active if p.balance > 0 and p.collection_date]
    today_owing = [p for p in owing if p.collection_date == TODAY]
    late = [p for p in owing if p.collection_date < TODAY]
    assert tiles["due_today"] == {
        "count": len(today_owing),
        "amount": money(sum(p.balance for p in today_owing)),
    }
    assert tiles["overdue"] == {"count": len(late), "amount": money(sum(p.balance for p in late))}

    docs = list(SalesDocument.objects.filter(tenant=tenant, document_date=TODAY))
    sold = [d for d in docs if d.kind == "invoice" and d.status not in ("draft", "void")]
    returned = [d for d in docs if d.kind == "credit_note" and d.status in ("issued", "applied")]
    assert tiles["today_sales"]["amount"] == money(
        sum(d.grand_total for d in sold) - sum(d.grand_total for d in returned)
    )
    assert tiles["today_sales"]["count"] == len(sold)

    # Cash in hand is the day book's closing cash for today, and a Python replay.
    book = day_book(
        tenant=tenant,
        query=DayBookQuery(date_from=TODAY - dt.timedelta(days=5), date_to=TODAY),
        page=1,
        page_size=10,
    )
    assert tiles["cash_in_hand"]["amount"] == money(book.closing["cash"])
    from apps.reports.tests.test_day_book_reconcile import _naive_cash_bank

    assert tiles["cash_in_hand"]["amount"] == money(_naive_cash_bank(tenant, upto=TODAY)["cash"])


def test_today_is_the_shops_date_not_the_servers(tenant: Any) -> None:
    """T-RPT01-2 / EC-1 — 20:00 UTC on the 17th is 01:30 IST on the 18th: a bill
    dated the 18th is today's sale for a shop in Asia/Kolkata."""
    from apps.common.dates import tenant_today

    utc_evening = dt.datetime(2026, 9, 17, 20, 0, tzinfo=dt.UTC)
    today = tenant_today(tenant, now=utc_evening)
    assert today == dt.date(2026, 9, 18)
    b.sale(tenant, dt.date(2026, 9, 18), 500, party=b.party(tenant))
    assert build_dashboard(tenant=tenant, today=today)["tiles"]["today_sales"]["amount"] == "500.00"


def test_recent_activity_is_one_row_per_event_newest_first(tenant: Any) -> None:
    """FR-3 — an invoice and its ledger line are ONE event; a void is its own event;
    a manual khata line is an event; ten at most."""
    ramesh = b.party(tenant)
    doc = b.sale(tenant, TODAY, 700, party=ramesh)
    b.khata(
        tenant,
        TODAY,
        700,
        party=ramesh,
        got=False,
        entry_type="invoice",
        source_type="sales_document",
    )
    b.khata(tenant, TODAY, 50, party=ramesh, mode="cash")
    b.sale(tenant, TODAY, 90, party=ramesh, status="void")
    feed = build_dashboard(tenant=tenant, today=TODAY)["recent_activity"]
    kinds = [event["type"] for event in feed]
    assert kinds.count("invoice") == 0
    assert "sale" in kinds and "sale_void" in kinds and "manual_got" in kinds
    assert any(event["source"]["id"] == str(doc.id) for event in feed)
    stamps = [event["at"] for event in feed]
    assert stamps == sorted(stamps, reverse=True)

    for n in range(15):
        b.expense(tenant, TODAY, 10 + n)
    trimmed = project(
        build_dashboard(tenant=tenant, today=TODAY), granted=EVERYTHING, modules=ALL_MODULES
    )["recent_activity"]
    assert len(trimmed) == 10


def test_project_omits_what_a_reader_may_not_see(tenant: Any) -> None:
    """§12 / FR-6 / §10 — omitted, never zeroed: no financial read → no Cash in hand;
    no stock read (inventory off) → no Low stock; an activity row needs its own
    codename; the unmasked mobile rides only with the Remind permission."""
    ramesh = b.party(tenant, balance=Decimal("900"), mobile="+919812345678")
    b.purchase(tenant, TODAY, 100, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 5}, party=ramesh)
    payload = build_dashboard(tenant=tenant, today=TODAY)

    full = project(payload, granted=EVERYTHING, modules=ALL_MODULES)
    assert set(full["tiles"]) == {
        "to_collect",
        "to_pay",
        "due_today",
        "overdue",
        "upcoming_7d",
        "today_sales",
        "cash_in_hand",
        "low_stock",
    }
    assert full["tiles"]["overdue"]["invoices"] == {"count": 0, "amount": "0.00"}
    assert full["top_debtors"][0]["mobile"] == "+919812345678"
    assert full["top_debtors"][0]["mobile_masked"] == "+91 98••• ••678"
    assert all("permission" not in event for event in full["recent_activity"])

    staff = EVERYTHING - {"reports.financial.read", "purchases.bill.read", "ledger.reminder.write"}
    cut = project(payload, granted=staff, modules=ALL_MODULES)
    assert "cash_in_hand" not in cut["tiles"]
    assert {event["type"] for event in cut["recent_activity"]} == {"payment_in"}
    assert cut["top_debtors"][0]["mobile"] is None

    no_stock = project(
        payload, granted=EVERYTHING - {"inventory.stock.read"}, modules=ALL_MODULES - {"inventory"}
    )
    assert "low_stock" not in no_stock["tiles"] and no_stock["low_stock_items"] == []

    no_expenses = project(payload, granted=EVERYTHING, modules=ALL_MODULES - {"expenses"})
    assert "cash_in_hand" not in no_expenses["tiles"]

    no_sales = project(payload, granted=EVERYTHING - {"sales.invoice.read"}, modules=ALL_MODULES)
    assert "today_sales" not in no_sales["tiles"]
    assert "invoices" not in no_sales["tiles"]["overdue"]


def test_first_use_flags(tenant: Any) -> None:
    """FR-9 — what the checklist still asks for."""
    assert build_dashboard(tenant=tenant, today=TODAY)["first_use"] == {
        "has_party": False,
        "has_item": False,
        "has_document": False,
        "has_upi": False,
    }
    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, 10, party=ramesh, status="draft")
    flags = build_dashboard(tenant=tenant, today=TODAY)["first_use"]
    assert flags["has_party"] and not flags["has_document"]


def test_an_other_tenants_figures_never_reach_this_dashboard(
    tenant: Any, other_tenant: Any
) -> None:
    """Canon §0.11 rule 2."""
    theirs = b.party(other_tenant, balance=Decimal("100000"))
    b.sale(other_tenant, TODAY, 1000, party=theirs)
    b.payment(other_tenant, TODAY, {"cash": 1000}, party=theirs)
    b.stocked_item(other_tenant, "Theirs", on_hand=0, reorder_point=5)
    payload = build_dashboard(tenant=tenant, today=TODAY)
    assert payload["tiles"]["to_collect"]["amount"] == "0.00"
    assert payload["tiles"]["today_sales"]["amount"] == "0.00"
    assert payload["tiles"]["cash_in_hand"]["amount"] == "0.00"
    assert payload["tiles"]["low_stock"] == {"count": 0, "out_count": 0}
    assert payload["recent_activity"] == [] and payload["top_debtors"] == []


def test_the_cashbook_the_day_book_and_the_tile_agree_on_the_drawer(tenant: Any) -> None:
    """EXP-03 now walks the payments source the reports app registers: before
    it, a recorded payment moved the day book's and the dashboard's cash and
    left the cashbook's untouched — three screens, two answers."""
    from apps.expenses.selectors.cashbook import build_cashbook
    from apps.reports.tests.test_day_book_reconcile import _fuzzed_book

    start = _fuzzed_book(tenant, 23)["start"]
    cashbook = build_cashbook(tenant=tenant, date_from=start, date_to=TODAY)
    book = day_book(
        tenant=tenant, query=DayBookQuery(date_from=start, date_to=TODAY), page=1, page_size=5
    )
    tile = build_dashboard(tenant=tenant, today=TODAY)["tiles"]["cash_in_hand"]["amount"]
    closing = str(book.closing["cash"].quantize(Decimal("0.01")))
    assert cashbook["range"]["closing"]["cash"] == closing == tile
    assert "payment" in cashbook["sources"]
