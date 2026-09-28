"""LED-09 — how old the money is, which is the number a shopkeeper acts on.

A balance says what a customer owes. Aging says how long they have owed it, and
only the second one gets a phone call: ₹1,200 that is four months old is a
different problem from ₹1,200 from last week.

The arithmetic is FIFO — every payment settles the oldest debt first — and the
reason that matters is EC-1. A customer who owes ₹1,000 from a hundred days ago
and pays ₹900 today has ₹100 left, and it is a hundred days old, not today's.
Bucketing by "what is left, dated when the shortfall happened" would put it in
0–30 and tell the merchant everything is fine.
"""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal
from typing import Any

import pytest

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.aging import (
    BUCKET_KEYS,
    aging_rows,
    aging_totals,
    bucket_window,
    ledger_summary,
)
from apps.parties.constants import PartyStatus
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

TODAY = dt.date(2026, 9, 23)


def entry(party: Any, days_ago: int, direction: str, amount: str, **extra: Any) -> LedgerEntry:
    fields: dict[str, Any] = {
        "entry_type": (
            EntryType.MANUAL_GAVE if direction == Direction.DEBIT else EntryType.MANUAL_GOT
        ),
        "source_type": SourceType.MANUAL,
        "status": EntryStatus.POSTED,
        **extra,
    }
    return LedgerEntry.objects.create(
        tenant=party.tenant,
        party=party,
        direction=direction,
        amount=Decimal(amount),
        entry_date=TODAY - dt.timedelta(days=days_ago),
        **fields,
    )


def buckets(tenant: Any, party: Any, kind: str = "receivable", as_of: dt.date = TODAY) -> dict:
    return aging_rows(tenant=tenant, as_of=as_of, kind=kind).get(str(party.id), {})


# ── FIFO ────────────────────────────────────────────────────────────────────


def test_a_payment_settles_the_oldest_debt_first(tenant: Any) -> None:
    """EC-1 / AC-2 / T-LED-09-1, and the reason the whole selector is a CTE.

    ₹1,000 lent a hundred days ago, ₹900 paid today. What is left is ₹100 and it
    is a HUNDRED DAYS OLD. An implementation that bucketed the remainder by
    today's date would report the shop as fully current and the merchant would
    never make the call.
    """
    party = PartyFactory(tenant=tenant, balance="100.00")
    entry(party, 100, Direction.DEBIT, "1000.00")
    entry(party, 0, Direction.CREDIT, "900.00", payment_mode="cash")

    row = buckets(tenant, party)

    assert row["90_plus"] == Decimal("100.00")
    assert row["0_30"] == Decimal("0.00")
    assert row["total"] == Decimal("100.00")


def test_a_payment_that_covers_the_oldest_leaves_the_next_one_standing(tenant: Any) -> None:
    """FIFO across two debts, which is where an off-by-one in the window shows.

    ₹500 at 100 days and ₹800 at 10 days, ₹600 paid. The first is settled and
    ₹100 of the second is too, so ₹700 remains and all of it is ten days old.
    """
    party = PartyFactory(tenant=tenant, balance="700.00")
    entry(party, 100, Direction.DEBIT, "500.00")
    entry(party, 10, Direction.DEBIT, "800.00")
    entry(party, 0, Direction.CREDIT, "600.00", payment_mode="cash")

    row = buckets(tenant, party)

    assert row["90_plus"] == Decimal("0.00")
    assert row["0_30"] == Decimal("700.00")


def test_the_bucket_edges_are_where_the_spec_puts_them(tenant: Any) -> None:
    """30, 60 and 90 days, inclusive at the top of each band.

    Written as four debts one day either side of every edge, because an aging
    report that is a day out at 90 moves money between the bucket a merchant
    ignores and the bucket they act on.
    """
    party = PartyFactory(tenant=tenant, balance="400.00")
    for days, amount in ((30, "100.00"), (31, "100.00"), (90, "100.00"), (91, "100.00")):
        entry(party, days, Direction.DEBIT, amount)

    row = buckets(tenant, party)

    assert row["0_30"] == Decimal("100.00")
    assert row["31_60"] == Decimal("100.00")
    assert row["61_90"] == Decimal("100.00")
    assert row["90_plus"] == Decimal("100.00")


def test_the_buckets_always_sum_to_the_balance(tenant: Any) -> None:
    """T-LED-09-2, fuzzed. The invariant the whole report rests on.

    An aging report whose buckets do not add up to what the party owes is a
    report an accountant cannot use for a provision, and the failure is
    invisible on any single row — it needs a book with enough shape to get the
    FIFO walk wrong.
    """
    random.seed(20260923)
    for index in range(25):
        party = PartyFactory(tenant=tenant, balance="0.00")
        expected = Decimal("0.00")
        for _ in range(random.randint(1, 8)):
            direction = random.choice([Direction.DEBIT, Direction.CREDIT])
            amount = Decimal(f"{random.randint(1, 900)}.{random.randint(0, 99):02d}")
            entry(
                party,
                random.randint(0, 200),
                direction,
                str(amount),
                **({"payment_mode": "cash"} if direction == Direction.CREDIT else {}),
            )
            expected += amount if direction == Direction.DEBIT else -amount

        row = buckets(tenant, party)
        if expected > 0:
            assert row.get("total") == expected, f"party {index}: {row} vs {expected}"
        else:
            # Nothing outstanding is nothing to age, and the party is simply
            # absent rather than present with four zeros.
            assert row.get("total", Decimal("0.00")) == Decimal("0.00"), index


def test_a_settled_party_is_absent_rather_than_a_row_of_zeros(tenant: Any) -> None:
    """A book with a hundred settled customers is a report with no rows in it,
    not a hundred rows saying nothing. §9's empty state says so in words."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 40, Direction.DEBIT, "500.00")
    entry(party, 10, Direction.CREDIT, "500.00", payment_mode="cash")

    assert str(party.id) not in aging_rows(tenant=tenant, as_of=TODAY)


# ── The mirror, and the date ────────────────────────────────────────────────


def test_payable_aging_swaps_the_roles(tenant: Any) -> None:
    """BR-3 / T-LED-09-3. What a shop OWES a supplier ages the same way.

    Credits are the bills and debits are the payments, which is the same walk
    with the two directions exchanged — one query and one pair of parameters,
    rather than a second implementation to keep in step.
    """
    supplier = PartyFactory(tenant=tenant, balance="-100.00")
    entry(supplier, 100, Direction.CREDIT, "1000.00", payment_mode="cash")
    entry(supplier, 0, Direction.DEBIT, "900.00")

    receivable = buckets(tenant, supplier, kind="receivable")
    payable = buckets(tenant, supplier, kind="payable")

    assert receivable == {}
    assert payable["90_plus"] == Decimal("100.00")


def test_an_as_of_date_ignores_everything_after_it(tenant: Any) -> None:
    """T-LED-09-4 / AC-3 — an accountant preparing a provision at year end.

    The entries after the as-of date have not happened yet as far as this report
    is concerned, and a payment made in April must not settle a March debt in a
    March report.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 100, Direction.DEBIT, "1000.00")
    entry(party, 5, Direction.CREDIT, "1000.00", payment_mode="cash")

    assert buckets(tenant, party) == {}
    # At an as-of ten days back the payment has not happened, so the whole
    # ₹1,000 is open — and it is NINETY days old at that date rather than a
    # hundred, which is the arithmetic this test got wrong first: an age is
    # measured from `as_of`, not from today.
    old = buckets(tenant, party, as_of=TODAY - dt.timedelta(days=10))
    assert old["61_90"] == Decimal("1000.00")
    assert old["90_plus"] == Decimal("0.00")


def test_a_party_can_be_owed_today_and_owing_at_an_earlier_date(tenant: Any) -> None:
    """EC-3, which is why the sign is computed from the period and never read
    off `parties_party.balance`."""
    party = PartyFactory(tenant=tenant, balance="500.00")
    entry(party, 60, Direction.CREDIT, "1000.00", payment_mode="cash")
    entry(party, 10, Direction.DEBIT, "1500.00")

    assert buckets(tenant, party, kind="receivable")["0_30"] == Decimal("500.00")
    # Thirty days back the debit has not happened and the shop owes ₹1,000 —
    # which is thirty days old AT THAT DATE, not sixty. The age moves with the
    # as-of, which is the whole reason an accountant asks for one.
    at_thirty = buckets(tenant, party, kind="payable", as_of=TODAY - dt.timedelta(days=30))
    assert at_thirty["0_30"] == Decimal("1000.00")


def test_an_opening_balance_ages_from_its_own_date(tenant: Any) -> None:
    """BR-4. A book migrated from paper carries debts that are already old, and
    a report that dated them from the migration would say a three-year-old
    debt was current on the day it was typed in."""
    party = PartyFactory(tenant=tenant, balance="2300.00")
    entry(party, 200, Direction.DEBIT, "2300.00", entry_type=EntryType.OPENING)

    assert buckets(tenant, party)["90_plus"] == Decimal("2300.00")


def test_a_reversed_pair_is_out_of_the_reckoning_entirely(tenant: Any) -> None:
    """LED-03's rows, through the same `LIVE_ENTRIES` predicate everything else
    uses. An aging report that counted a reversal as a payment would settle the
    oldest debt with money that never arrived."""
    party = PartyFactory(tenant=tenant, balance="500.00")
    entry(party, 120, Direction.DEBIT, "500.00")
    undone = entry(party, 10, Direction.DEBIT, "700.00")
    reversal = LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.CREDIT,
        amount=Decimal("700.00"),
        entry_date=undone.entry_date,
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        reverses=undone,
        status=EntryStatus.POSTED,
    )
    undone.status = EntryStatus.REVERSED
    undone.reversed_by = reversal
    undone.save(update_fields=["status", "reversed_by"])

    row = buckets(tenant, party)

    assert row["90_plus"] == Decimal("500.00")
    assert row["total"] == Decimal("500.00")


# ── Totals, windows and the summary ─────────────────────────────────────────


def test_the_totals_are_over_whatever_set_was_handed_in(tenant: Any) -> None:
    """BR-5. A merchant who has narrowed to one tag is asking what that tag is
    owed; a total about everything answers a question they did not ask."""
    for amount, days in (("100.00", 10), ("200.00", 100)):
        party = PartyFactory(tenant=tenant, balance=amount)
        entry(party, days, Direction.DEBIT, amount)

    rows = aging_rows(tenant=tenant, as_of=TODAY)
    totals = aging_totals(rows)

    assert totals["total"] == Decimal("300.00")
    assert totals["0_30"] == Decimal("100.00")
    assert totals["90_plus"] == Decimal("200.00")
    assert set(totals) == {*BUCKET_KEYS, "total"}


def test_a_bucket_names_the_dates_it_is_made_of(tenant: Any) -> None:
    """FR-4's drill-down. Tapping "90+ ₹1,200" opens the statement showing the
    entries that figure is made of, because the number says to make a call and
    the statement says what to say on it."""
    assert bucket_window("0_30", TODAY) == (TODAY - dt.timedelta(days=30), TODAY)
    assert bucket_window("31_60", TODAY) == (
        TODAY - dt.timedelta(days=60),
        TODAY - dt.timedelta(days=31),
    )
    # The oldest bucket has no start, and `None` says so rather than a date far
    # enough back to read as a real bound.
    assert bucket_window("90_plus", TODAY) == (None, TODAY - dt.timedelta(days=91))


def test_the_summary_is_two_numbers_over_active_parties(tenant: Any) -> None:
    """AC-1 / BR-1."""
    PartyFactory(tenant=tenant, balance="2800.00")
    PartyFactory(tenant=tenant, balance="1200.00")
    PartyFactory(tenant=tenant, balance="-500.00")
    PartyFactory(tenant=tenant, balance="900.00", status=PartyStatus.ARCHIVED)

    summary = ledger_summary(tenant=tenant)

    assert summary == {"receivable": Decimal("4000.00"), "payable": Decimal("500.00")}


def test_another_tenants_book_is_not_in_the_report(two_tenants_full: dict) -> None:
    """Canon §0.11 rule 2, and it is the first assertion worth making about any
    raw SQL: the tenant is a bound parameter on the first CTE, so a party from
    another shop cannot reach the walk at all."""
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    entry(a["party"], 100, Direction.DEBIT, "500.00")

    assert aging_rows(tenant=b["tenant"], as_of=TODAY) == {}
    assert aging_rows(tenant=None, as_of=TODAY) == {}
    assert ledger_summary(tenant=None) == {
        "receivable": Decimal("0.00"),
        "payable": Decimal("0.00"),
    }


# ── Through the endpoint ────────────────────────────────────────────────────

import csv as _csv  # noqa: E402
from io import StringIO  # noqa: E402

from django.urls import reverse  # noqa: E402

AGING = "v1:ledger-aging"
SUMMARY = "v1:ledger-summary"


def read_csv(response: Any) -> list[list[str]]:
    return list(_csv.reader(StringIO(b"".join(response.streaming_content).decode())))


@pytest.fixture
def book(tenant: Any) -> dict:
    """Three debtors of different ages, and a supplier the shop owes."""
    old = PartyFactory(tenant=tenant, name="Aarav Traders", balance="100.00")
    entry(old, 100, Direction.DEBIT, "1000.00")
    entry(old, 0, Direction.CREDIT, "900.00", payment_mode="cash")

    recent = PartyFactory(tenant=tenant, name="Bhavna Stores", balance="500.00")
    entry(recent, 5, Direction.DEBIT, "500.00")

    middling = PartyFactory(tenant=tenant, name="Chetan Mart", balance="700.00")
    entry(middling, 45, Direction.DEBIT, "700.00")

    supplier = PartyFactory(tenant=tenant, name="Divya Agency", balance="-400.00")
    entry(supplier, 70, Direction.CREDIT, "400.00", payment_mode="cash")

    return {"old": old, "recent": recent, "middling": middling, "supplier": supplier}


def test_the_report_leads_with_the_oldest_money(book: dict, tenant: Any, api_as: Any) -> None:
    """§8's default sort, and it is the order a merchant works in.

    A collection round starts with the customer who has owed the longest, not
    the one who owes the most — so the row that needs a phone call is the row at
    the top, without anybody choosing a sort.
    """
    client, _ = api_as(tenant)

    body = client.get(reverse(AGING), {"as_of": TODAY.isoformat()}).json()

    assert [row["party"]["name"] for row in body["data"]] == [
        "Aarav Traders",
        "Chetan Mart",
        "Bhavna Stores",
    ]
    assert body["data"][0]["90_plus"] == "100.00"
    assert body["meta"]["totals"]["total"] == "1300.00"


def test_the_totals_reconcile_with_the_summary(book: dict, tenant: Any, api_as: Any) -> None:
    """BR-5 / T-LED-09-5, and it is the report's own honesty check.

    The summary reads cached balances and the aging replays every entry through
    a FIFO walk. At today's date, with no filter, they have to agree — and if
    they ever stop, one of the two is lying about what the shop is owed.
    """
    client, _ = api_as(tenant)

    aging = client.get(reverse(AGING), {"as_of": TODAY.isoformat()}).json()
    summary = client.get(reverse(SUMMARY)).json()

    assert aging["meta"]["totals"]["total"] == summary["data"]["receivable"]
    assert summary["data"]["payable"] == "400.00"


def test_the_payable_tab_is_the_supplier_side(book: dict, tenant: Any, api_as: Any) -> None:
    """BR-3. What the shop owes, aged the same way with the roles swapped."""
    client, _ = api_as(tenant)

    body = client.get(reverse(AGING), {"type": "payable", "as_of": TODAY.isoformat()}).json()

    assert [row["party"]["name"] for row in body["data"]] == ["Divya Agency"]
    assert body["data"][0]["61_90"] == "400.00"


def test_a_future_as_of_date_is_refused(book: dict, tenant: Any, api_as: Any) -> None:
    """§10. An aging report dated next month is a report about entries nobody
    has made, and it would read as though every customer had gone quiet."""
    client, _ = api_as(tenant)
    ahead = (dt.date.today() + dt.timedelta(days=2)).isoformat()

    assert client.get(reverse(AGING), {"as_of": ahead}).status_code == 400
    assert client.get(reverse(AGING), {"as_of": "not-a-date"}).status_code == 400
    assert client.get(reverse(AGING), {"type": "sideways"}).status_code == 400
    assert client.get(reverse(AGING), {"ordering": "party_id"}).status_code == 400


def test_a_tag_narrows_both_the_rows_and_the_totals(book: dict, tenant: Any, api_as: Any) -> None:
    """EC-6 / BR-5. A merchant who has narrowed to one route is asking what that
    route is owed, and a total about the whole book answers a different
    question — the same rule PTY-02 settled for the party list."""
    from apps.parties.models import Tag

    client, _ = api_as(tenant)
    tag = Tag.objects.create(tenant=tenant, name="Route 2", color="viz-1")
    book["old"].tags.add(tag)

    body = client.get(reverse(AGING), {"as_of": TODAY.isoformat(), "tag": "route 2"}).json()

    assert [row["party"]["name"] for row in body["data"]] == ["Aarav Traders"]
    assert body["meta"]["totals"]["total"] == "100.00"


def test_a_settled_book_reports_nothing_rather_than_zeros(tenant: Any, api_as: Any) -> None:
    """§9's empty state is a sentence — "everyone is settled" — and it can only
    be shown if the report is actually empty rather than a page of zeros."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 40, Direction.DEBIT, "500.00")
    entry(party, 10, Direction.CREDIT, "500.00", payment_mode="cash")

    body = client.get(reverse(AGING), {"as_of": TODAY.isoformat()}).json()

    assert body["data"] == []
    assert body["meta"]["totals"]["total"] == "0.00"


def test_the_export_carries_the_four_buckets_and_is_gated(
    book: dict, tenant: Any, api_as: Any
) -> None:
    """§12 / AC-3. The accountant exports; staff do not.

    The gate is in the handler because the export is a query parameter on a URL
    everybody may read — one address, two capabilities, which a permission map
    keyed on the verb cannot tell apart.
    """
    owner, _ = api_as(tenant)
    staff, _ = api_as(tenant, role="staff")
    url = reverse(AGING)

    assert staff.get(url, {"as_of": TODAY.isoformat()}).status_code == 200
    assert staff.get(url, {"as_of": TODAY.isoformat(), "format": "csv"}).status_code == 403

    rows = read_csv(owner.get(url, {"as_of": TODAY.isoformat(), "format": "csv"}))
    assert rows[0] == ["party", "0_30", "31_60", "61_90", "90_plus", "total"]
    assert [row[0] for row in rows[1:]] == ["Aarav Traders", "Chetan Mart", "Bhavna Stores"]
    assert sum(Decimal(row[-1]) for row in rows[1:]) == Decimal("1300.00")


def test_a_party_named_like_a_formula_is_neutralised(tenant: Any, api_as: Any) -> None:
    """§19. A customer chooses their own trade name, and a spreadsheet reads
    `=Sharma` as code rather than as a shop."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, name="=Sharma & Co", balance="500.00")
    entry(party, 10, Direction.DEBIT, "500.00")

    rows = read_csv(client.get(reverse(AGING), {"as_of": TODAY.isoformat(), "format": "csv"}))

    assert rows[1][0] == "'=Sharma & Co"


def test_another_tenants_debtors_are_not_in_the_report(book: dict, two_tenants_full: dict) -> None:
    """Canon §0.11 rule 2, through the endpoint as well as the selector — the
    first assertion worth making about anything built on raw SQL."""
    entry(two_tenants_full["a"]["party"], 100, Direction.DEBIT, "9999.00")

    body = two_tenants_full["b"]["client"].get(reverse(AGING)).json()

    assert body["data"] == []


def test_an_export_leaves_an_audit_row(book: dict, tenant: Any, api_as: Any) -> None:
    """§16 — `ledger.aging.exported`, with what was asked for and how much left.

    Viewing is not audited (volume); taking the book away in a file is. The
    question an owner arrives with is "who downloaded my debtors list, and
    which one", so the row carries the parameters and the row count rather
    than only the fact that something happened.
    """
    from apps.common.audit import AuditAction
    from apps.platform_app.models import AuditLog

    client, membership = api_as(tenant)

    response = client.get(reverse(AGING), {"as_of": TODAY.isoformat(), "format": "csv"})
    read_csv(response)

    log = AuditLog.objects.get(action=AuditAction.LEDGER_AGING_EXPORTED)
    assert log.tenant_id == tenant.id
    assert log.actor_id == membership.user_id
    assert log.metadata["row_count"] == 3
    assert log.metadata["params"] == {"type": "receivable", "as_of": TODAY.isoformat(), "tag": None}


def test_a_refused_export_leaves_no_audit_row(book: dict, tenant: Any, api_as: Any) -> None:
    """An audit row says something LEFT. A 403 is the opposite of that."""
    from apps.common.audit import AuditAction
    from apps.platform_app.models import AuditLog

    staff, _ = api_as(tenant, role="staff")

    staff.get(reverse(AGING), {"format": "csv"})

    assert not AuditLog.objects.filter(action=AuditAction.LEDGER_AGING_EXPORTED).exists()


def test_exporting_is_on_the_export_budget_and_reading_is_not(
    book: dict, tenant: Any, api_as: Any
) -> None:
    """The LED-04 lesson, applied before anybody finds it again.

    Reading the report is a screen an owner opens every morning; the export
    streams the whole book. Only the second is on `UB_RATE_LIMIT_EXPORT`
    (10/hour), and it is charged in the handler because the export is a query
    parameter on the same URL.
    """
    client, _ = api_as(tenant)
    url = reverse(AGING)

    assert {client.get(url).status_code for _ in range(12)} == {200}

    statuses = [client.get(url, {"format": "csv"}).status_code for _ in range(11)]
    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


@pytest.mark.parametrize("params", [{"page": "two"}, {"page_size": "lots"}, {"page": "0"}])
def test_a_page_that_is_not_a_number_is_refused_not_a_crash(
    params: dict, book: dict, tenant: Any, api_as: Any
) -> None:
    """`?page=two` is a typo in an address bar, and a typo is a 400.

    The first version called `int()` on the parameter and answered a 500 —
    which the merchant sees as the report being broken, and the error log sees
    as an incident.
    """
    client, _ = api_as(tenant)

    response = client.get(reverse(AGING), params)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_parties_that_tie_on_every_figure_keep_one_order(tenant: Any, api_as: Any) -> None:
    """A tie broken by nothing is a list that reshuffles on every refresh.

    Two customers who owe the same amount from the same day are common — a
    wedding order split across two brothers — and a merchant working down the
    list must not see them swap places between one visit and the next.
    """
    client, _ = api_as(tenant)
    for name in ("Kiran Stores", "Kiran Stores", "Kiran Stores"):
        party = PartyFactory(tenant=tenant, name=name, balance="500.00")
        entry(party, 10, Direction.DEBIT, "500.00")

    orders = {
        tuple(
            row["party"]["id"]
            for row in client.get(reverse(AGING), {"ordering": ordering}).json()["data"]
        )
        for ordering in ("-90_plus", "-90_plus", "-90_plus")
    }
    names = {
        tuple(
            row["party"]["id"]
            for row in client.get(reverse(AGING), {"ordering": "name"}).json()["data"]
        )
        for _ in range(3)
    }

    assert len(orders) == 1
    assert len(names) == 1


def test_several_tags_mean_any_of_them_as_on_the_party_list(
    book: dict, tenant: Any, api_as: Any
) -> None:
    """PTY-05 BR-4 — `?tag=Camp Area,Route 2` is both routes, not the parties in both.

    The aging screen reuses the party list's tag picker, which writes a comma
    list into the URL. The first version of this endpoint matched the whole
    string as ONE name, so picking a second route emptied the report — a
    filter that looks applied and silently matches nothing.
    """
    from apps.parties.models import Tag

    client, _ = api_as(tenant)
    camp = Tag.objects.create(tenant=tenant, name="Camp Area", color="viz-1")
    route = Tag.objects.create(tenant=tenant, name="Route 2", color="viz-2")
    book["old"].tags.add(camp)
    book["middling"].tags.add(route)
    book["recent"].tags.add(camp, route)

    body = client.get(
        reverse(AGING), {"as_of": TODAY.isoformat(), "tag": "camp area, Route  2"}
    ).json()

    assert sorted(row["party"]["name"] for row in body["data"]) == [
        "Aarav Traders",
        "Bhavna Stores",
        "Chetan Mart",
    ]
    # Bhavna carries both tags and is counted once.
    assert body["meta"]["totals"]["total"] == "1300.00"


@pytest.mark.parametrize("ordering", ["90_plus", "-90_plus", "total", "-total", "name", "-name"])
def test_every_sortable_column_sorts_both_ways(
    ordering: str, book: dict, tenant: Any, api_as: Any
) -> None:
    """The screen's sortable headers toggle ascending and descending.

    A header that sorts one way and answers 400 the second time it is tapped is
    a control that works once, which is worse than no control.
    """
    client, _ = api_as(tenant)

    response = client.get(reverse(AGING), {"as_of": TODAY.isoformat(), "ordering": ordering})

    assert response.status_code == 200
    names = [row["party"]["name"] for row in response.json()["data"]]
    if ordering == "90_plus":
        assert names[-1] == "Aarav Traders"


def test_the_aging_tag_filter_never_reaches_another_tenants_same_named_tag(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """I-4 — the aging report's `?tag=` is the party list's predicate, called
    on a filterset built WITHOUT a request, so the tenant comes only from the
    party row. Two tenants with a "Camp Area" tag each: the caller's report,
    rows and totals, holds only their own debtor."""
    from apps.parties.models import PartyTag, Tag

    client, _ = api_as(tenant)
    mine = PartyFactory(tenant=tenant, name="My Camp Debtor", balance="300.00")
    entry(mine, 10, Direction.DEBIT, "300.00")
    theirs = PartyFactory(tenant=other_tenant, name="Their Camp Debtor", balance="900.00")
    entry(theirs, 10, Direction.DEBIT, "900.00")
    for party in (mine, theirs):
        tag = Tag.objects.create(tenant=party.tenant, name="Camp Area")
        PartyTag.objects.create(party=party, tag=tag)

    body = client.get(reverse(AGING), {"tag": "Camp Area"}).json()

    assert [row["party"]["name"] for row in body["data"]] == ["My Camp Debtor"]
    assert body["meta"]["totals"]["total"] == "300.00"
    assert body["meta"]["total"] == 1
