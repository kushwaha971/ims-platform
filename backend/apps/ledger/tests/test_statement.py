"""LED-04 — the running balance, and the things that make it true.

A statement is the artefact a merchant puts in front of a customer who
disagrees, so the number that matters is not the closing balance — that one is
checkable against the khata page — but every intermediate figure, which nothing
else in the product computes and nothing else can check.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.statement import (
    STATEMENT_ORDERING,
    carried_forward,
    has_entries_before_opening,
    opening_balance,
    statement_rows,
    statement_totals,
)
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def entry(party: Any, day: int, direction: str, amount: str, **extra: Any) -> LedgerEntry:
    """One posted row on 2026-04-<day>. Dates are the axis these tests turn on."""
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
        entry_date=dt.date(2026, 4, day),
        **fields,
    )


def running(rows: Any, carried: Decimal) -> list[str]:
    """What the client is sent: the carried figure plus each row's own delta."""
    return [str(carried + row.running_delta) for row in rows]


@pytest.fixture
def book(tenant: Any) -> Any:
    """AC-1's party: ₹2,300 opening, ₹500 given, ₹300 received."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 1, Direction.DEBIT, "2300.00", entry_type=EntryType.OPENING)
    entry(party, 18, Direction.DEBIT, "500.00")
    entry(party, 18, Direction.CREDIT, "300.00", payment_mode="cash")
    return party


# ── The running balance ─────────────────────────────────────────────────────


def test_the_running_balance_accumulates_down_the_page(book: Any) -> None:
    """AC-1 / T-LED-04-1, including two rows on the same date.

    Same-day rows are the case the ordering exists for: `entry_date` alone does
    not order them, so the tie is broken by `created_at` — the order they were
    written down in, which is the order they happened in at the counter.
    """
    rows = list(statement_rows(tenant=book.tenant, party_id=book.id))

    assert [str(row.amount) for row in rows] == ["2300.00", "500.00", "300.00"]
    assert running(rows, Decimal("0.00")) == ["2300.00", "2800.00", "2500.00"]


def test_page_two_does_not_restart_the_running_balance(book: Any) -> None:
    """The defect this selector is shaped around, and it is silent.

    `.annotate(Window(...)).filter(keyset)` is the obvious implementation, and
    Django 5 does not wrap it in a subquery — the keyset goes into the WHERE, so
    the window is computed over the rows that survive it and the page's first
    row restarts from zero. Page ONE is correct, which is the page every unit
    test and every screenshot looks at.

    Measured on this fixture before the fix: paging from the second row returned
    500 and 200 where the true running balances are 2,800 and 2,500.
    """
    first_page = list(statement_rows(tenant=book.tenant, party_id=book.id))[:1]
    cursor = {f"{field}__gt": getattr(first_page[-1], field) for field in STATEMENT_ORDERING}

    carried = carried_forward(tenant=book.tenant, party_id=book.id, date_from=None, position=cursor)
    rest = list(
        statement_rows(tenant=book.tenant, party_id=book.id).filter(
            entry_date__gte=dt.date(2026, 4, 18)
        )
    )

    assert carried == Decimal("2300.00")
    assert running(rest, carried) == ["2800.00", "2500.00"]
    # And the trap itself, asserted rather than described: the window's own
    # figures on this page START FROM ZERO. Anything that hands them to a client
    # as running balances ships a statement whose second page opens at ₹500.
    assert [str(row.running_delta) for row in rest] == ["500.00", "200.00"]


def test_a_credit_only_book_runs_negative(tenant: Any) -> None:
    """A party in advance. The balance carries no sign on screen; the arithmetic does.

    §23.2.6 rule 3 says the LABEL carries the direction — "You will give" —
    which is a presentation rule and is why the number underneath it has to be
    signed all the way through the selector. A running balance clamped at zero
    would show a customer who has overpaid as settled.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 2, Direction.CREDIT, "2000.00", payment_mode="upi")
    entry(party, 3, Direction.DEBIT, "500.00")

    rows = list(statement_rows(tenant=tenant, party_id=party.id))

    assert running(rows, Decimal("0.00")) == ["-2000.00", "-1500.00"]


# ── The period ──────────────────────────────────────────────────────────────


def test_the_opening_is_everything_before_the_period(book: Any) -> None:
    """AC-2 / T-LED-04-2. Narrowing to September shows April's ₹2,300 as the opening."""
    opening = opening_balance(tenant=book.tenant, party_id=book.id, date_from=dt.date(2026, 4, 18))
    rows = list(
        statement_rows(tenant=book.tenant, party_id=book.id, date_from=dt.date(2026, 4, 18))
    )

    assert opening == Decimal("2300.00")
    assert len(rows) == 2
    assert running(rows, opening) == ["2800.00", "2500.00"]


def test_an_unbounded_statement_opens_at_zero(book: Any) -> None:
    """BR-2 and BR-3 together.

    With no `date_from` there is nothing before the period, so the opening is
    zero and the closing is the party's whole-life balance — which is the one
    figure a merchant can check against the khata page without arithmetic.
    """
    opening = opening_balance(tenant=book.tenant, party_id=book.id, date_from=None)
    rows = list(statement_rows(tenant=book.tenant, party_id=book.id))

    assert opening == Decimal("0.00")
    assert opening + rows[-1].running_delta == Decimal("2500.00")


def test_the_totals_are_over_the_period_not_the_page(book: Any) -> None:
    """BR-5. A merchant reading "You gave in all" under a partial table is
    reading a figure about the table; the figure they want is about the period."""
    totals = statement_totals(tenant=book.tenant, party_id=book.id)

    assert totals == {
        "debit": Decimal("2800.00"),
        "credit": Decimal("300.00"),
        "written_off": {"debit": Decimal("0.00"), "credit": Decimal("0.00")},
    }


def test_a_period_with_nothing_in_it_still_carries_its_opening(book: Any) -> None:
    """The month a customer did not come in. The statement is not empty of meaning:
    it says what they owed throughout it."""
    opening = opening_balance(tenant=book.tenant, party_id=book.id, date_from=dt.date(2026, 5, 1))
    rows = list(statement_rows(tenant=book.tenant, party_id=book.id, date_from=dt.date(2026, 5, 1)))

    assert opening == Decimal("2500.00")
    assert rows == []


# ── Corrections ─────────────────────────────────────────────────────────────


def test_showing_corrections_adds_rows_and_changes_no_figure(book: Any) -> None:
    """AC-4 / T-LED-04-3, and it is canon §0.2's arithmetic restated.

    Both halves of a reversal pair come back so an accountant can audit what was
    changed, and the closing balance is IDENTICAL because the pair nets to zero.
    If these two numbers ever differ, the balance rule is broken somewhere and
    every figure in the product is suspect.
    """
    gave = entry(book, 20, Direction.DEBIT, "700.00")
    reversal = LedgerEntry.objects.create(
        tenant=book.tenant,
        party=book,
        direction=Direction.CREDIT,
        amount=Decimal("700.00"),
        entry_date=gave.entry_date,
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        source_id=gave.id,
        reverses=gave,
        reason="Duplicate",
        status=EntryStatus.POSTED,
    )
    gave.status = EntryStatus.REVERSED
    gave.reversed_by = reversal
    gave.save(update_fields=["status", "reversed_by"])

    clean = list(statement_rows(tenant=book.tenant, party_id=book.id))
    full = list(statement_rows(tenant=book.tenant, party_id=book.id, include_corrections=True))

    assert len(clean) == 3
    assert len(full) == 5
    assert clean[-1].running_delta == full[-1].running_delta == Decimal("2500.00")


def test_the_opening_uses_the_same_predicate_as_the_rows(book: Any) -> None:
    """BR-2's "implemented consistently to avoid off-by-one on same-day reversals".

    The pair nets to zero, so the two predicates give the same opening — which
    is exactly why this is easy to get wrong and hard to notice. An opening
    computed over a different set from the rows beneath it disagrees with the
    first row's running balance by one entry, on one day, for one party.
    """
    gave = entry(book, 10, Direction.DEBIT, "900.00")
    reversal = LedgerEntry.objects.create(
        tenant=book.tenant,
        party=book,
        direction=Direction.CREDIT,
        amount=Decimal("900.00"),
        entry_date=gave.entry_date,
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        reverses=gave,
        status=EntryStatus.POSTED,
    )
    gave.status = EntryStatus.REVERSED
    gave.reversed_by = reversal
    gave.save(update_fields=["status", "reversed_by"])

    for corrections in (False, True):
        opening = opening_balance(
            tenant=book.tenant,
            party_id=book.id,
            date_from=dt.date(2026, 4, 18),
            include_corrections=corrections,
        )
        rows = list(
            statement_rows(
                tenant=book.tenant,
                party_id=book.id,
                date_from=dt.date(2026, 4, 18),
                include_corrections=corrections,
            )
        )
        assert opening == Decimal("2300.00"), corrections
        assert opening + rows[0].running_delta == Decimal("2800.00"), corrections


# ── The warning nothing else can give ───────────────────────────────────────


def test_an_entry_before_the_opening_date_is_flagged(book: Any) -> None:
    """FR-11 / LED-02 BR-3.

    A merchant who types an opening dated 1 April and then backdates an entry to
    March has a statement whose first figure is not the whole story — and no
    arithmetic can tell them, because both numbers are right.
    """
    assert has_entries_before_opening(tenant=book.tenant, party_id=book.id) is False

    entry(book, 1, Direction.DEBIT, "100.00")  # same day, not before
    assert has_entries_before_opening(tenant=book.tenant, party_id=book.id) is False

    LedgerEntry.objects.create(
        tenant=book.tenant,
        party=book,
        direction=Direction.DEBIT,
        amount=Decimal("100.00"),
        entry_date=dt.date(2026, 3, 30),
        entry_type=EntryType.MANUAL_GAVE,
        source_type=SourceType.MANUAL,
        status=EntryStatus.POSTED,
    )
    assert has_entries_before_opening(tenant=book.tenant, party_id=book.id) is True


def test_a_party_with_no_opening_has_nothing_to_be_before(tenant: Any) -> None:
    """A party who has never had an opening balance cannot have entries before one."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 5, Direction.DEBIT, "100.00")

    assert has_entries_before_opening(tenant=tenant, party_id=party.id) is False


def test_another_tenants_party_yields_nothing_rather_than_everything(
    two_tenants_full: dict,
) -> None:
    """Canon §0.11 rule 2, at the selector rather than at the view.

    A selector scopes FIRST, so a mistake upstream costs an empty statement
    rather than somebody else's customer's history.
    """
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    entry(a["party"], 4, Direction.DEBIT, "500.00")

    assert list(statement_rows(tenant=b["tenant"], party_id=a["party"].id)) == []
    assert opening_balance(
        tenant=None, party_id=a["party"].id, date_from=dt.date(2026, 4, 30)
    ) == Decimal("0.00")


# ── Through the endpoint ────────────────────────────────────────────────────

import csv as _csv  # noqa: E402
import random  # noqa: E402
from io import StringIO  # noqa: E402

from django.urls import reverse  # noqa: E402

STATEMENT = "v1:party-statement"
ENTRIES = "v1:ledger-entry-list"


def post(client: Any, party: Any, **extra: Any) -> Any:
    return client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.DEBIT,
            "amount": "500.00",
            "entry_date": "2026-04-18",
            **extra,
        },
        format="json",
    )


def test_the_statement_reads_like_a_passbook(book: Any, api_as: Any) -> None:
    """AC-1 through the route the page will call."""
    client, _ = api_as(book.tenant)

    body = client.get(reverse(STATEMENT, args=[book.id])).json()["data"]

    assert body["opening_balance"] == "0.00"
    assert [row["running_balance"] for row in body["rows"]] == [
        "2300.00",
        "2800.00",
        "2500.00",
    ]
    assert body["closing_balance"] == "2500.00"
    assert body["totals"] == {
        "debit": "2800.00",
        "credit": "300.00",
        "written_off": {"debit": "0.00", "credit": "0.00"},
    }


def test_a_narrowed_period_carries_its_opening(book: Any, api_as: Any) -> None:
    """AC-2. The figure a customer disputing September needs is what they owed in August."""
    client, _ = api_as(book.tenant)

    body = client.get(
        reverse(STATEMENT, args=[book.id]),
        {"date_from": "2026-04-18", "date_to": "2026-04-30"},
    ).json()["data"]

    assert body["opening_balance"] == "2300.00"
    assert len(body["rows"]) == 2
    assert body["rows"][0]["running_balance"] == "2800.00"
    assert body["closing_balance"] == "2500.00"


def test_the_closing_of_an_unbounded_statement_is_the_party_balance(
    tenant: Any, api_as: Any
) -> None:
    """BR-3 / T-LED-04-4, over a random book posted through the real write path.

    The single most valuable assertion in this feature. Two independent
    calculations — `post_entry` moving a cached column one entry at a time, and
    a window function replaying every row — have to arrive at the same number,
    and a fuzzed sequence is what stops the test from agreeing with the code by
    sharing its assumptions about ordering.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    random.seed(20260923)
    for _ in range(25):
        direction = random.choice([Direction.DEBIT, Direction.CREDIT])
        post(
            client,
            party,
            direction=direction,
            amount=f"{random.randint(1, 4000)}.{random.randint(0, 99):02d}",
            entry_date=f"2026-04-{random.randint(1, 28):02d}",
            **({"payment_mode": "cash"} if direction == Direction.CREDIT else {}),
        )

    party.refresh_from_db()
    body = client.get(reverse(STATEMENT, args=[party.id])).json()["data"]

    assert body["closing_balance"] == str(party.balance)


def test_the_second_page_continues_the_running_balance(tenant: Any, api_as: Any) -> None:
    """The page-two defect, end to end.

    Asserted through the cursor rather than against the selector, because the
    thing that breaks is the seam: the paginator filters, the window runs after
    the filter, and the view has to add back what the merchant scrolled past.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    for day in range(1, 7):
        post(client, party, amount="100.00", entry_date=f"2026-04-{day:02d}")

    first = client.get(reverse(STATEMENT, args=[party.id]), {"limit": 3}).json()
    assert [row["running_balance"] for row in first["data"]["rows"]] == [
        "100.00",
        "200.00",
        "300.00",
    ]

    second = client.get(
        reverse(STATEMENT, args=[party.id]),
        {"limit": 3, "cursor": first["meta"]["next_cursor"]},
    ).json()
    assert [row["running_balance"] for row in second["data"]["rows"]] == [
        "400.00",
        "500.00",
        "600.00",
    ]


def test_an_inverted_or_enormous_range_is_refused(book: Any, api_as: Any) -> None:
    """§10. Both are client bugs rather than merchant mistakes, and both would
    otherwise be answered by a very slow query."""
    client, _ = api_as(book.tenant)
    url = reverse(STATEMENT, args=[book.id])

    assert client.get(url, {"date_from": "2026-05-01", "date_to": "2026-04-01"}).status_code == 400
    assert client.get(url, {"date_from": "2000-01-01", "date_to": "2026-04-01"}).status_code == 400
    assert client.get(url, {"date_from": "not-a-date"}).status_code == 400


def test_the_customers_mobile_is_masked(book: Any, api_as: Any) -> None:
    """BR-6. A statement link ends up in a WhatsApp group."""
    client, _ = api_as(book.tenant)
    book.mobile = "9876543210"
    book.save(update_fields=["mobile"])

    party = client.get(reverse(STATEMENT, args=[book.id])).json()["data"]["party"]

    assert party["mobile_masked"] == "98••• ••210"
    assert "9876543210" not in str(party)


def test_another_tenants_party_is_not_found(book: Any, two_tenants_full: dict) -> None:
    """Canon §0.11 rule 2 — 404, never 403."""
    response = two_tenants_full["b"]["client"].get(reverse(STATEMENT, args=[book.id]))

    assert response.status_code == 404


# ── The CSV ─────────────────────────────────────────────────────────────────


def read_csv(response: Any) -> list[list[str]]:
    content = b"".join(response.streaming_content).decode()
    return list(_csv.reader(StringIO(content)))


def test_the_csv_carries_the_running_balance_and_its_label(book: Any, api_as: Any) -> None:
    """BR-8. An accountant sorts this by a column name, so the header is a contract."""
    client, _ = api_as(book.tenant)

    rows = read_csv(client.get(reverse(STATEMENT, args=[book.id]), {"format": "csv"}))

    assert rows[0] == [
        "date",
        "particulars",
        "document_number",
        "you_gave",
        "you_got",
        "balance",
        "balance_label",
        "note",
        "entry_type",
        "status",
    ]
    assert rows[1][0] == "01/04/2026"
    assert [row[5] for row in rows[1:]] == ["2300.00", "2800.00", "2500.00"]
    assert rows[-1][6] == "You will get"


def test_the_csv_is_named_for_the_tenants_today_not_the_servers(
    book: Any, api_as: Any, monkeypatch: Any
) -> None:
    """NEW-3: the filename stamp was `dt.date.today()` — the SERVER's UTC date.

    Frozen at 20:00 UTC, which is 01:30 IST the next day: the merchant's
    statement period ends today, the aging export beside it is named for today,
    and the statement file was named for yesterday. Both stamps now come from
    `tenant_today`, so the two files a merchant downloads at 01:30 agree.
    """
    import types

    import apps.common.dates as dates_module

    server_today = dt.date.today()  # Django runs the process in TIME_ZONE = UTC
    frozen = dt.datetime.combine(server_today, dt.time(20, 0), tzinfo=dt.UTC)
    monkeypatch.setattr(dates_module, "timezone", types.SimpleNamespace(now=lambda: frozen))
    india_today = server_today + dt.timedelta(days=1)

    client, _ = api_as(book.tenant)
    statement = client.get(reverse(STATEMENT, args=[book.id]), {"format": "csv"})
    aging = client.get(reverse("v1:ledger-aging"), {"format": "csv"})

    assert statement.status_code == aging.status_code == 200
    assert statement["Content-Disposition"] == (
        f'attachment; filename="statement-{book.id}-{india_today.isoformat()}.csv"'
    )
    assert aging["Content-Disposition"] == (
        f'attachment; filename="aging-receivable-{india_today.isoformat()}.csv"'
    )


def test_a_note_that_looks_like_a_formula_is_neutralised(book: Any, api_as: Any) -> None:
    """§19 / T-LED-04-6.

    A CSV is not code, and a spreadsheet that decides otherwise about a note a
    shopkeeper typed is a spreadsheet that can be made to run one. `-500
    returned` is the case that makes this not paranoia: it is a note somebody
    would actually write, and Excel reads it as a formula.
    """
    client, _ = api_as(book.tenant)
    entry(book, 25, Direction.DEBIT, "10.00", note="=SUM(A1:A9)")
    entry(book, 26, Direction.DEBIT, "10.00", note="-500 returned")

    rows = read_csv(client.get(reverse(STATEMENT, args=[book.id]), {"format": "csv"}))
    particulars = [row[1] for row in rows[1:]]

    assert "'=SUM(A1:A9)" in particulars
    assert "'-500 returned" in particulars


def test_staff_may_read_a_statement_and_may_not_export_it(tenant: Any, api_as: Any) -> None:
    """§12 / T-LED-04-11.

    Reading a customer's history at the counter and walking out with the whole
    book in a file are not the same act, and the permission map says so. The
    check has to be in the handler rather than in the permission class because
    it depends on a QUERY PARAMETER — one URL, two capabilities.
    """
    staff, _ = api_as(tenant, role="staff")
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 3, Direction.DEBIT, "500.00")
    url = reverse(STATEMENT, args=[party.id])

    assert staff.get(url).status_code == 200
    assert staff.get(url, {"format": "csv"}).status_code == 403


def test_the_accountant_may_export(tenant: Any, api_as: Any) -> None:
    """The other half of the same table: reading and exporting is their job."""
    accountant, _ = api_as(tenant, role="accountant")
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry(party, 3, Direction.DEBIT, "500.00")

    response = accountant.get(reverse(STATEMENT, args=[party.id]), {"format": "csv"})

    assert response.status_code == 200


def test_reading_a_statement_is_not_on_the_export_budget(book: Any, api_as: Any) -> None:
    """The defect the first end-to-end run found, in one assertion.

    The view was declared with `throttle_scope = "export"`, which is
    `UB_RATE_LIMIT_EXPORT=10/hour`. A statement is a screen a merchant opens at
    a counter while a customer is standing there arguing about a bill; ten an
    hour is a product that stops working during the argument. The EXPORT is the
    expensive act, and it is a query parameter on this same URL — so its budget
    is applied in the handler, where the parameter can be seen.

    Twelve reads, which is two past the export ceiling and nowhere near the
    600/min user one.
    """
    client, _ = api_as(book.tenant)
    url = reverse(STATEMENT, args=[book.id])

    statuses = {client.get(url).status_code for _ in range(12)}

    assert statuses == {200}


def test_an_export_leaves_an_audit_row(book: Any, api_as: Any) -> None:
    """§16 — `ledger.statement.exported`, which LED-04 shipped without.

    Found while building LED-09's export, which the same section asks to be
    audited. A statement file is a customer's whole account with the shop,
    leaving the product; "who took Ramesh's statement, and for which months" is
    the question the row answers, so it carries the period and the row count.
    """
    from apps.common.audit import AuditAction
    from apps.platform_app.models import AuditLog

    client, membership = api_as(book.tenant)

    read_csv(
        client.get(
            reverse(STATEMENT, args=[book.id]),
            {"format": "csv", "date_from": "2026-04-01", "date_to": "2026-09-23"},
        )
    )

    log = AuditLog.objects.get(action=AuditAction.LEDGER_STATEMENT_EXPORTED)
    assert log.actor_id == membership.user_id
    assert log.entity_type == "parties_party"
    assert str(log.entity_id) == str(book.id)
    assert log.metadata["row_count"] == 3
    assert log.metadata["params"]["date_from"] == "2026-04-01"
    assert log.metadata["params"]["date_to"] == "2026-09-23"
