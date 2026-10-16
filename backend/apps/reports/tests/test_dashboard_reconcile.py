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


def _dashboard(tenant: Any) -> dict:
    return build_dashboard(tenant=tenant, today=TODAY)


def _tiles(tenant: Any) -> dict:
    return _dashboard(tenant)["tiles"]


def test_ac1_to_collect_and_to_pay(tenant: Any) -> None:
    """AC-1, as WP-06 DASH-02 restates it — each tile is its role's list: customers
    who owe ₹5,000 → To collect ₹5,000. RPT-01 BR-1 had summed every party, so a
    supplier owing US (B) was in To collect and a customer's advance (C) was "To
    pay, to all your suppliers"; those figures opened lists that could not show
    them. They travel as each tile's `advances` now. An archived party is in
    neither; DEC-019 — an Udhaar book balance (`balance`) is another app's money."""
    b.party(tenant, "A", shop_balance=Decimal("5000"), balance=Decimal("900"))
    b.party(tenant, "B", shop_balance=Decimal("2000"), is_supplier=True, is_customer=False)
    b.party(tenant, "C", shop_balance=Decimal("-1500"))
    b.party(tenant, "Udhaar only", balance=Decimal("-4000"))
    b.party(tenant, "Gone", shop_balance=Decimal("0"), status="archived")
    tiles = _tiles(tenant)
    assert tiles["to_collect"] == {"amount": "5000.00", "advances": "1500.00"}
    assert tiles["to_pay"] == {"amount": "0.00", "advances": "2000.00"}


def test_the_shop_home_carries_no_udhaar_promise_dates(tenant: Any) -> None:
    """DEC-019 — Due today and Upcoming were the Udhaar book's promise dates; they are
    that app's Reminders now. The Shop's Overdue tile is its overdue bills alone."""
    b.party(tenant, "Ramesh", balance=Decimal("1772"), collection_date=TODAY)
    ramesh = b.party(tenant, "Suresh")
    b.sale(tenant, TODAY - dt.timedelta(days=40), 1000, party=ramesh, status="overdue", due=600)
    full = project(_dashboard(tenant), granted=EVERYTHING, modules=ALL_MODULES)["tiles"]
    assert "due_today" not in full and "upcoming_7d" not in full
    assert full["overdue"] == {
        "count": 0,
        "amount": "600.00",
        "invoices": {
            "count": 1,
            "amount": "600.00",
            "oldest_bill_date": (TODAY - dt.timedelta(days=40)).isoformat(),
        },
    }


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
    assert _tiles(tenant)["overdue_invoices"] == {
        "count": 2,
        "amount": "1300.00",
        "oldest_bill_date": (TODAY - dt.timedelta(days=50)).isoformat(),
    }


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
    # DEC-019 — the Shop's own figure: what is due on bills, never the udhaar book's.
    shop = [p.shop_balance for p in active]
    assert tiles["to_collect"]["amount"] == money(sum(v for v in shop if v > 0))
    assert tiles["to_pay"]["amount"] == money(sum(-v for v in shop if v < 0))

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
    assert tiles["shop_cash_in_hand"]["amount"] == money(book.closing["cash"])
    from apps.reports.tests.test_day_book_reconcile import _naive_cash_bank

    assert tiles["shop_cash_in_hand"]["amount"] == money(
        _naive_cash_bank(tenant, upto=TODAY)["cash"]
    )


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
    ten at most. DEC-019 — a manual udhaar line (You got) is the Udhaar book's event and
    is never on the Shop's home."""
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
    assert "sale" in kinds and "sale_void" in kinds
    assert "manual_got" not in kinds
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
    ramesh = b.party(tenant, shop_balance=Decimal("900"), mobile="+919812345678")
    b.purchase(tenant, TODAY, 100, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 5}, party=ramesh)
    payload = build_dashboard(tenant=tenant, today=TODAY)

    full = project(payload, granted=EVERYTHING, modules=ALL_MODULES)
    assert set(full["tiles"]) == {
        "to_collect",
        "to_pay",
        "overdue",
        "today_sales",
        "cash_in_hand",
        "shop_cash_in_hand",
        "today_received",
        "supplier_bills",
        "low_stock",
    }
    assert full["tiles"]["overdue"]["invoices"] == {"count": 0, "amount": "0.00"}
    assert full["top_debtors"][0]["mobile"] == "+919812345678"
    assert full["top_debtors"][0]["mobile_masked"] == "+91 98••• ••678"
    assert all("permission" not in event for event in full["recent_activity"])

    staff = EVERYTHING - {"reports.financial.read", "purchases.bill.read", "ledger.reminder.write"}
    cut = project(payload, granted=staff, modules=ALL_MODULES)
    assert "cash_in_hand" not in cut["tiles"] and "shop_cash_in_hand" not in cut["tiles"]
    assert {event["type"] for event in cut["recent_activity"]} == {"payment_in"}
    assert cut["top_debtors"][0]["mobile"] is None

    no_stock = project(
        payload, granted=EVERYTHING - {"inventory.stock.read"}, modules=ALL_MODULES - {"inventory"}
    )
    assert "low_stock" not in no_stock["tiles"] and no_stock["low_stock_items"] == []

    no_expenses = project(payload, granted=EVERYTHING, modules=ALL_MODULES - {"expenses"})
    assert "cash_in_hand" not in no_expenses["tiles"]
    assert "shop_cash_in_hand" not in no_expenses["tiles"]

    no_sales = project(payload, granted=EVERYTHING - {"sales.invoice.read"}, modules=ALL_MODULES)
    assert "today_sales" not in no_sales["tiles"]
    # DEC-019 — the Shop's Overdue IS its overdue bills, so without bills there is none.
    assert "overdue" not in no_sales["tiles"]


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
    tile = build_dashboard(tenant=tenant, today=TODAY)["tiles"]["shop_cash_in_hand"]["amount"]
    closing = str(book.closing["cash"].quantize(Decimal("0.01")))
    assert cashbook["range"]["closing"]["cash"] == closing == tile
    assert "payment" in cashbook["sources"]


# ── WP-06 layout A: the Today row, and the Suppliers panel ──────────────────


def test_money_received_today_is_the_shops_receipts_of_the_day(tenant: Any) -> None:
    """WP-06 (owner's layout A, 16 Oct 2026) — the Today row's "Money received":
    the Shop's receipts dated today. Sales is not cash (spec order 2), so a bill
    issued today and not paid adds nothing; a void receipt, yesterday's, a
    payment OUT and another app's receipt (`bucket`) add nothing either."""
    from apps.common.constants import LedgerBucket

    ramesh = b.party(tenant)
    b.sale(tenant, TODAY, 900, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 500, "upi": 200}, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 50}, party=ramesh, status="void")
    b.payment(tenant, TODAY - dt.timedelta(days=1), {"cash": 75}, party=ramesh)
    b.payment(tenant, TODAY, {"cash": 30}, party=b.party(tenant, "Gupta"), direction="out")
    lent = b.payment(tenant, TODAY, {"cash": 400}, party=ramesh)
    lent.bucket = LedgerBucket.LOAN
    lent.save(update_fields=["bucket"])
    assert _tiles(tenant)["today_received"] == {"amount": "700.00", "count": 1}


def test_the_suppliers_panel_is_who_you_owe_most_and_the_bills_falling_due(tenant: Any) -> None:
    """WP-06 DASH-02 / spec order 3 — suppliers get a panel of their own: the five
    you owe most (the top of `/suppliers?balance=i_owe`), and the purchase bills
    that are overdue or fall due within seven days. Suppliers used to appear only
    as the To pay figure, with nothing to say whom or when."""
    gupta = b.party(
        tenant, "Gupta", shop_balance=Decimal("-3150"), is_supplier=True, is_customer=False
    )
    agro = b.party(
        tenant, "Agro", shop_balance=Decimal("-450"), is_supplier=True, is_customer=False
    )
    b.party(tenant, "Paid ahead", shop_balance=Decimal("300"), is_supplier=True, is_customer=False)
    b.party(tenant, "Customer advance", shop_balance=Decimal("-700"))
    late = b.purchase(tenant, TODAY - dt.timedelta(days=30), 1000, party=gupta, status="overdue")
    late.due_on = TODAY - dt.timedelta(days=12)
    late.save(update_fields=["due_on"])
    soon = b.purchase(tenant, TODAY - dt.timedelta(days=10), 2150, party=gupta)
    soon.due_on = TODAY + dt.timedelta(days=3)
    soon.save(update_fields=["due_on"])
    later = b.purchase(tenant, TODAY, 450, party=agro)
    later.due_on = TODAY + dt.timedelta(days=20)
    later.save(update_fields=["due_on"])
    paid = b.purchase(tenant, TODAY - dt.timedelta(days=5), 99, party=agro, status="paid")
    paid.due_on = TODAY + dt.timedelta(days=1)
    paid.amount_due = Decimal("0")
    paid.save(update_fields=["due_on", "amount_due"])

    payload = _dashboard(tenant)
    assert [(row["name"], row["balance"]) for row in payload["top_creditors"]] == [
        ("Gupta", "3150.00"),
        ("Agro", "450.00"),
    ]
    assert payload["tiles"]["supplier_bills"] == {
        "overdue": {
            "count": 1,
            "amount": "1000.00",
            "oldest_days_late": 12,
            "oldest_bill_date": (TODAY - dt.timedelta(days=30)).isoformat(),
        },
        "due_week": {"count": 1, "amount": "2150.00"},
    }


def test_overdue_bills_say_how_old_the_oldest_is(tenant: Any) -> None:
    """WP-06 — Needs attention shows count, amount AND age (spec order 4); the
    oldest overdue bill's days past its due date is that age."""
    ramesh = b.party(tenant)
    old = b.sale(
        tenant, TODAY - dt.timedelta(days=60), 1800, party=ramesh, status="overdue", due=1800
    )
    old.due_on = TODAY - dt.timedelta(days=25)
    old.save(update_fields=["due_on"])
    new = b.sale(tenant, TODAY - dt.timedelta(days=9), 420, party=ramesh, status="overdue", due=220)
    new.due_on = TODAY - dt.timedelta(days=2)
    new.save(update_fields=["due_on"])
    bills = _tiles(tenant)["overdue_invoices"]
    assert bills == {
        "count": 2,
        "amount": "2020.00",
        "oldest_days_late": 25,
        # The list opens from the earliest of their bill dates, not this year's.
        "oldest_bill_date": (TODAY - dt.timedelta(days=60)).isoformat(),
    }


def test_the_new_panels_follow_the_readers_permissions(tenant: Any) -> None:
    """WP-06 — each new figure travels only with the permission that reads its
    list: money received with payments, the supplier bills with purchase bills,
    the creditors with parties. Omitted, not zeroed (§10)."""
    b.party(tenant, "Gupta", shop_balance=Decimal("-300"), is_supplier=True, is_customer=False)
    payload = _dashboard(tenant)
    full = project(payload, granted=EVERYTHING, modules=ALL_MODULES)
    assert {"today_received", "supplier_bills"} <= set(full["tiles"])
    assert [row["name"] for row in full["top_creditors"]] == ["Gupta"]
    bare = project(
        payload,
        granted=frozenset({"reports.basic.read", "sales.invoice.read"}),
        modules=ALL_MODULES,
    )
    assert "today_received" not in bare["tiles"] and "supplier_bills" not in bare["tiles"]
    assert bare["top_creditors"] == []


def test_a_bill_past_its_due_date_is_overdue_today_not_after_tonights_job(tenant: Any) -> None:
    """WP-06 Finding 2 — Overdue read the stored status, which the nightly job
    sets at 00:15. A bill entered today with a due date already past, or one that
    fell due yesterday before the job ran, was missing from the figure until the
    next morning. Overdue is decided when it is read: a stored `overdue`, or an
    open bill whose due date is before today."""
    ramesh = b.party(tenant)
    gupta = b.party(tenant, "Gupta", is_supplier=True, is_customer=False)
    unmarked = b.sale(tenant, TODAY - dt.timedelta(days=30), 900, party=ramesh, due=400)
    unmarked.due_on = TODAY - dt.timedelta(days=5)
    unmarked.save(update_fields=["due_on"])
    due_today = b.sale(tenant, TODAY, 300, party=ramesh, due=300)
    due_today.due_on = TODAY
    due_today.save(update_fields=["due_on"])
    bought = b.purchase(tenant, TODAY - dt.timedelta(days=20), 650, party=gupta)
    bought.due_on = TODAY - dt.timedelta(days=1)
    bought.save(update_fields=["due_on"])

    tiles = _tiles(tenant)
    assert tiles["overdue_invoices"] == {
        "count": 1,
        "amount": "400.00",
        "oldest_days_late": 5,
        "oldest_bill_date": (TODAY - dt.timedelta(days=30)).isoformat(),
    }
    assert tiles["supplier_bills"]["overdue"] == {
        "count": 1,
        "amount": "650.00",
        "oldest_days_late": 1,
        "oldest_bill_date": (TODAY - dt.timedelta(days=20)).isoformat(),
    }


def test_cash_in_hand_is_the_shops_drawer_alone(tenant: Any) -> None:
    """WP-06 Finding 4 / DEC-019 — Cash in hand added cash across every book: a
    "You got ₹300, cash" in the Udhaar book and a lending collection moved the
    Shop's drawer, which is another app's figure on the Shop's home. Only the
    Shop's own money counts: its payments, its expenses, and its own khata lines.
    The day book and the cashbook, which the tile must equal, read the same."""
    from apps.common.constants import LedgerBucket
    from apps.expenses.selectors.cashbook import build_cashbook

    ramesh = b.party(tenant)
    b.payment(tenant, TODAY, {"cash": 500}, party=ramesh)
    b.expense(tenant, TODAY, 150)
    b.khata(tenant, TODAY, 40, party=ramesh, mode="cash", bucket=LedgerBucket.SHOP)
    b.khata(tenant, TODAY, 300, party=ramesh, mode="cash")  # the Udhaar book's
    b.payment(tenant, TODAY, {"cash": 1000}, party=ramesh, bucket=LedgerBucket.LOAN)
    b.payment(tenant, TODAY, {"cash": 250}, party=ramesh, bucket=LedgerBucket.LIBRARY)

    tiles = _tiles(tenant)
    assert tiles["shop_cash_in_hand"]["amount"] == "390.00"
    # The older key keeps sending every book's cash, as the golden file pins it.
    assert tiles["cash_in_hand"]["amount"] == "1940.00"
    book = day_book(
        tenant=tenant, query=DayBookQuery(date_from=TODAY, date_to=TODAY), page=1, page_size=20
    )
    assert book.closing["cash"] == Decimal("390.00")
    assert len(book.rows) == 3
    cashbook = build_cashbook(tenant=tenant, date_from=TODAY, date_to=TODAY)
    assert cashbook["range"]["closing"]["cash"] == "390.00"
