"""LED-01 — recording "You gave" and "You got".

The first write in this product that moves money. Everything else in the ledger
is downstream of it, and `parties_party.balance` — the number on every list row
and every khata header — is a cache of the rows it writes.

The tests are grouped by what they protect rather than by what they call: the
arithmetic, the immutability, the lock, the credit rule, and the wire.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.db import DatabaseError, connection, transaction
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.parties.constants import PartyStatus
from apps.parties.services.credit import CREDIT_MODE_SETTING_KEY
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
ENTRY = "v1:ledger-entry-detail"
PARTY_ENTRIES = "v1:party-ledger-entry"


def set_mode(tenant: Any, mode: str) -> None:
    from apps.platform_app.models import TenantSetting

    TenantSetting.objects.update_or_create(
        tenant=tenant, key=CREDIT_MODE_SETTING_KEY, defaults={"value": {"mode": mode}}
    )


def today() -> str:
    from django.utils import timezone

    return timezone.now().date().isoformat()


def body(party: Any, **extra: Any) -> dict:
    return {
        "party_id": str(party.id),
        "direction": Direction.DEBIT,
        "amount": "500.00",
        "entry_date": today(),
        **extra,
    }


def post(client: Any, party: Any, **extra: Any) -> Any:
    return client.post(reverse(ENTRIES), body(party, **extra), format="json")


# ── The arithmetic ──────────────────────────────────────────────────────────


def test_you_gave_increases_what_the_party_owes(tenant: Any, api_as: Any) -> None:
    """AC-1. The whole product in one assertion.

    ₹2,300 owed, ₹500 given, ₹2,800 owed. Everything else in this file is about
    the ways that can go wrong.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="2300.00")

    response = post(client, party)

    assert response.status_code == 201, response.json()
    assert response.json()["meta"]["party_balance"] == "2800.00"
    party.refresh_from_db()
    assert party.balance == Decimal("2800.00")

    entry = LedgerEntry.objects.get(party=party)
    assert entry.entry_type == EntryType.MANUAL_GAVE
    assert entry.source_type == SourceType.MANUAL
    assert entry.status == EntryStatus.POSTED


def test_you_got_reduces_it(tenant: Any, api_as: Any) -> None:
    """AC-2, including the half of it that is about what is NOT written.

    A manual "You got" is a ledger event, not a payment against a document
    (BR-7). It stores the mode on the entry and creates no `payments_payment`
    row — there is no invoice for it to be allocated against, and inventing one
    would put a payment in the cashbook that reconciles to nothing.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="2800.00")

    response = client.post(
        reverse(ENTRIES),
        body(
            party,
            direction=Direction.CREDIT,
            amount="300.00",
            payment_mode="upi",
            reference="UTR123",
        ),
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["meta"]["party_balance"] == "2500.00"
    entry = LedgerEntry.objects.get(party=party)
    assert entry.entry_type == EntryType.MANUAL_GOT
    assert entry.payment_mode == "upi"
    assert entry.reference == "UTR123"


def test_the_two_receivable_caches_follow_the_balance(tenant: Any, api_as: Any) -> None:
    """BR-3. Both totals move in the same transaction as the balance.

    They are summed across parties by the reports, so a party whose balance
    moved and whose totals did not is a tenant-wide figure that is quietly
    wrong — the kind of error that is only ever noticed as "the dashboard
    disagrees with the list".
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    post(client, party, amount="700.00")
    party.refresh_from_db()
    assert (party.receivable_total, party.payable_total) == (Decimal("700.00"), Decimal("0.00"))

    client.post(
        reverse(ENTRIES),
        body(party, direction=Direction.CREDIT, amount="1000.00", payment_mode="cash"),
        format="json",
    )
    party.refresh_from_db()
    assert party.balance == Decimal("-300.00")
    # A party in credit: the business owes them, so nothing is receivable.
    assert (party.receivable_total, party.payable_total) == (Decimal("0.00"), Decimal("300.00"))


def test_the_cache_equals_a_full_replay_of_the_ledger(tenant: Any, api_as: Any) -> None:
    """T-LED-01-11 in miniature: zero drift between the cache and its source.

    The balance column is a cache and `recalc_balances` is its replay. The only
    honest way to know a cache is right is to compute the thing it caches, which
    is what `computed_balance` does — a second implementation of the same rule,
    by aggregate rather than by increment, so a bug in one shows as a difference.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    for index in range(12):
        amount = f"{(index + 1) * 37}.50"
        if index % 3 == 0:
            client.post(
                reverse(ENTRIES),
                body(party, direction=Direction.CREDIT, amount=amount, payment_mode="cash"),
                format="json",
            )
        else:
            post(client, party, amount=amount)

    party.refresh_from_db()
    assert party.balance == computed_balance(tenant=tenant, party_id=party.id)


def test_the_last_activity_stamp_is_now_even_for_a_backdated_entry(
    tenant: Any, api_as: Any
) -> None:
    """BR-4, and the distinction it turns on.

    `last_activity_at` answers "when did anything last happen on this khata",
    and writing down an entry from last week IS something happening. Setting it
    from `entry_date` would push the party the merchant just touched to the
    bottom of a list ordered by recency — the one party they are most likely to
    want next.
    """
    from django.utils import timezone

    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, last_activity_at=None)
    before = timezone.now()

    post(client, party, entry_date=(timezone.now().date() - dt.timedelta(days=7)).isoformat())

    party.refresh_from_db()
    assert party.last_activity_at is not None
    assert party.last_activity_at >= before


# ── Immutability ────────────────────────────────────────────────────────────


def test_the_database_refuses_to_change_a_posted_amount(tenant: Any, api_as: Any) -> None:
    """T-LED-01-7. The trigger, not the model class.

    `ImmutableModel` stops `.save()`, and its own docstring says that is not the
    guarantee: `QuerySet.update()` never calls it. This test goes round the
    model deliberately, because that is the path an "emergency fix" takes at
    three in the morning, and canon §0.11 rule 1 has to hold there too.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party)
    entry = LedgerEntry.objects.get(party=party)

    with pytest.raises(DatabaseError, match="immutable"), transaction.atomic():
        LedgerEntry.objects.filter(pk=entry.pk).update(amount=Decimal("1.00"))

    entry.refresh_from_db()
    assert entry.amount == Decimal("500.00")


def test_the_database_refuses_to_delete_a_posted_entry(tenant: Any, api_as: Any) -> None:
    """Part 21 §21.6: ledger rows are never deleted. Reversal is the only undo."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party)

    with pytest.raises(DatabaseError, match="never deleted"), transaction.atomic():
        LedgerEntry.objects.all().delete()

    assert LedgerEntry.objects.count() == 1


def test_the_two_columns_a_correction_needs_may_still_be_written(tenant: Any, api_as: Any) -> None:
    """The other half of the trigger, and the half a blanket refusal would break.

    LED-03 marks an original `reversed` and points it at the row that undid it.
    A trigger that froze every column would make the correction path impossible
    and would be discovered a sprint later, by which time the obvious fix is to
    drop the trigger.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party)
    entry = LedgerEntry.objects.get(party=party)

    LedgerEntry.objects.filter(pk=entry.pk).update(status=EntryStatus.REVERSED)

    entry.refresh_from_db()
    assert entry.status == EntryStatus.REVERSED


def test_the_route_offers_no_verb_that_edits(tenant: Any, api_as: Any) -> None:
    """405, not 403. The verb does not exist rather than being refused.

    A 403 tells a caller to go and ask somebody for the right to do this. There
    is no such right and there never will be, so the honest answer is that the
    route does not do that.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party)
    entry = LedgerEntry.objects.get(party=party)
    url = reverse(ENTRY, args=[entry.id])

    assert client.patch(url, {"amount": "1.00"}, format="json").status_code == 405
    assert client.delete(url).status_code == 405


# ── Validation ──────────────────────────────────────────────────────────────


def test_a_credit_must_say_how_the_money_arrived(tenant: Any, api_as: Any) -> None:
    """T-LED-01-2. "I got ₹500" with no mode is a cashbook line nobody can reconcile."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    response = client.post(reverse(ENTRIES), body(party, direction=Direction.CREDIT), format="json")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "payment_mode" in response.json()["error"]["details"]


def test_a_debit_that_carries_a_mode_has_it_dropped_rather_than_refused(
    tenant: Any, api_as: Any
) -> None:
    """EC-9, and the reason the asymmetry with the rule above is deliberate.

    A merchant types a UTR, switches direction to "You gave", and saves. The
    client keeps the reference in form state so switching back does not lose
    it, and the field is not on screen — so refusing the request would be a form
    declining to submit for a reason it cannot show. The server drops both
    silently, and the CHECK constraint is what makes that silence safe.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    response = post(client, party, payment_mode="upi", reference="UTR999")

    assert response.status_code == 201, response.json()
    entry = LedgerEntry.objects.get(party=party)
    assert entry.payment_mode is None
    assert entry.reference == ""


def test_a_future_date_is_refused(tenant: Any, api_as: Any) -> None:
    """T-LED-01-3. A khata records what happened, not what is going to.

    "Tomorrow" is the TENANT's tomorrow. This used the server's UTC date plus
    one, which between 18:30 and 00:00 UTC is TODAY in IST — so the test posted
    a legal date, got 201, and failed every evening (EC-8 from the test side).
    """
    from apps.common.dates import tenant_today

    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)
    tomorrow = (tenant_today(tenant) + dt.timedelta(days=1)).isoformat()

    response = post(client, party, entry_date=tomorrow)

    assert response.status_code == 400
    assert "entry_date" in response.json()["error"]["details"]


def test_todays_date_in_the_tenants_timezone_is_accepted_when_utc_disagrees(
    tenant: Any, api_as: Any, monkeypatch: Any
) -> None:
    """T-LED-01-3's second half, and EC-8 — the bug that only happens at night.

    Between midnight and 5.30 a.m. IST the tenant's date is one day ahead of
    UTC's. A merchant closing up at half past midnight and writing today's date
    would have it read as tomorrow and refused, on a server whose clock is
    correct. The comparison is against `tenant_today`, so the frozen instant
    below — 20:00 UTC, which is 01:30 IST the next day — accepts the IST date.
    """
    import apps.common.dates as dates_module
    import apps.ledger.services.entries as service

    frozen = dt.datetime(2026, 9, 17, 20, 0, tzinfo=dt.UTC)
    monkeypatch.setattr(service, "tenant_today", lambda t: dates_module.tenant_today(t, now=frozen))

    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    # 18 September is tomorrow in UTC and today in Asia/Kolkata.
    response = post(client, party, entry_date="2026-09-18")

    assert response.status_code == 201, response.json()


def test_three_decimal_places_are_refused_rather_than_rounded(tenant: Any, api_as: Any) -> None:
    """EC-4. The client rounds on blur and SHOWS what it did.

    A server that quietly quantised would change an amount somebody typed
    without telling them, and the paisa would turn up later as a difference
    between what the merchant meant and what the statement says.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    response = post(client, party, amount="500.005")

    assert response.status_code == 400
    assert "amount" in response.json()["error"]["details"]


def test_zero_and_negative_amounts_are_refused(tenant: Any, api_as: Any) -> None:
    """The amount column carries no sign, because direction is a column.

    A negative amount would be a second way to say "the other direction", and
    two ways to say one thing is two ways that eventually disagree — the
    database CHECK says so too.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    assert post(client, party, amount="0").status_code == 400
    assert post(client, party, amount="-100.00").status_code == 400


def test_every_broken_field_is_reported_at_once(tenant: Any, api_as: Any) -> None:
    """A form that reveals its objections one at a time is submitted four times."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)
    from django.utils import timezone

    response = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.CREDIT,
            "amount": "0",
            "entry_date": (timezone.now().date() + dt.timedelta(days=2)).isoformat(),
        },
        format="json",
    )

    details = response.json()["error"]["details"]
    assert {"amount", "entry_date", "payment_mode"} <= set(details)


def test_a_bidi_override_in_a_note_is_stripped(tenant: Any, api_as: Any) -> None:
    """The note reaches an SMS and a shared statement.

    U+202E reverses everything after it when rendered, so a note can be made to
    display as a different sentence on a screen a customer reads about their own
    debt. It costs one line to remove and is the cheapest spoof there is.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    post(client, party, note="Sugar\u202e 10 kg")

    assert LedgerEntry.objects.get(party=party).note == "Sugar 10 kg"


# ── The party, and the lock ─────────────────────────────────────────────────


def test_an_archived_party_takes_no_new_entries(tenant: Any, api_as: Any) -> None:
    """T-LED-01-6 / BR-9. The khata is history; the answer is to restore them."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, status=PartyStatus.ARCHIVED, balance="0.00")

    response = post(client, party)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_archived"
    assert LedgerEntry.objects.count() == 0


def test_another_tenants_party_is_not_found_rather_than_forbidden(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """Canon §0.11 rule 2. A 403 would confirm the row exists."""
    client, _ = api_as(tenant)
    theirs = PartyFactory(tenant=other_tenant)

    response = post(client, theirs)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert LedgerEntry.objects.count() == 0


def test_the_party_row_is_locked_before_the_balance_is_read(tenant: Any, api_as: Any) -> None:
    """EC-7. Two staff posting to one party must not lose an entry's worth of money.

    Asserted on the SQL rather than by racing two threads, because a race that
    passes is not evidence of anything — a test that runs the two transactions
    in sequence proves nothing about a lock, and one that genuinely interleaves
    them is a flake waiting for a slow CI box. What makes the interleaving safe
    is that the party is read `FOR UPDATE`; that is a fact about the statement,
    and it is checkable.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    captured: list[str] = []

    def record(execute: Any, sql: Any, params: Any, many: Any, context: Any) -> Any:
        captured.append(sql)
        return execute(sql, params, many, context)

    with connection.execute_wrapper(record):
        post(client, party)

    party_selects = [s for s in captured if "parties_party" in s and "SELECT" in s.upper()]
    assert any("FOR UPDATE" in s.upper() for s in party_selects), party_selects


# ── The credit limit, now that there is a write to guard ────────────────────


def test_warn_mode_posts_the_entry_and_says_what_it_means(tenant: Any, api_as: Any) -> None:
    """AC-5's first half, and the reason a warning is not an error.

    The merchant has already handed over the goods. Refusing the record does not
    un-hand them; it just means the book does not say so.
    """
    set_mode(tenant, "warn")
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="49800.00", credit_limit="50000.00")

    response = post(client, party)

    assert response.status_code == 201, response.json()
    warnings = response.json()["meta"]["warnings"]
    assert warnings[0]["code"] == "credit_limit_exceeded"
    assert warnings[0]["balance_after"] == "50300.00"
    assert warnings[0]["over_by"] == "300.00"


def test_block_mode_refuses_and_writes_nothing(tenant: Any, api_as: Any) -> None:
    """AC-5. No row, no balance move, and the figures the drawer's banner needs."""
    set_mode(tenant, "block")
    client, _ = api_as(tenant, "staff")
    party = PartyFactory(tenant=tenant, balance="49800.00", credit_limit="50000.00")

    response = post(client, party)

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "credit_limit_exceeded"
    assert error["details"]["limit"] == "50000.00"
    assert error["details"]["balance_after"] == "50300.00"
    assert LedgerEntry.objects.count() == 0
    party.refresh_from_db()
    assert party.balance == Decimal("49800.00")


def test_staff_cannot_override_a_block(tenant: Any, api_as: Any) -> None:
    """T-LED-01-4 / BR-8 — a check on the ROLE, not on a codename.

    A tenant that grants `parties.party.write` to the counter — the ordinary
    thing to do, because staff add customers — must not thereby hand them the
    ability to lend past the cap the owner set.
    """
    set_mode(tenant, "block")
    client, _ = api_as(tenant, "staff")
    party = PartyFactory(tenant=tenant, balance="49800.00", credit_limit="50000.00")

    response = post(client, party, override=True)

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "override_not_allowed"
    assert LedgerEntry.objects.count() == 0


def test_an_owner_may_override_and_it_is_audited_twice(tenant: Any, api_as: Any) -> None:
    """AC-5's second half. Two audit rows, and the second one is the point.

    "Who has ever lent past a limit" is a question about a rare deliberate act.
    Answering it by filtering every entry create on a metadata key makes the
    rare event as hard to find as the common one.
    """
    from apps.platform_app.models import AuditLog

    set_mode(tenant, "block")
    client, _ = api_as(tenant, "owner")
    party = PartyFactory(tenant=tenant, balance="49800.00", credit_limit="50000.00")

    response = post(client, party, override=True)

    assert response.status_code == 201, response.json()
    assert AuditLog.objects.filter(action="ledger.entry.created").count() == 1
    assert AuditLog.objects.filter(action="ledger.credit_limit.overridden").count() == 1


def test_money_coming_back_is_never_blocked(tenant: Any, api_as: Any) -> None:
    """FR-6. A party over their limit can still pay you.

    A rule that refused a credit because the party is over their limit would be
    refusing the one action that fixes it.
    """
    set_mode(tenant, "block")
    client, _ = api_as(tenant, "staff")
    party = PartyFactory(tenant=tenant, balance="60000.00", credit_limit="50000.00")

    response = client.post(
        reverse(ENTRIES),
        body(party, direction=Direction.CREDIT, amount="5000.00", payment_mode="cash"),
        format="json",
    )

    assert response.status_code == 201, response.json()


def test_an_amount_landing_exactly_on_the_limit_is_allowed(tenant: Any, api_as: Any) -> None:
    """EC-12. `>=` would make a ₹50,000 limit mean ₹49,999.99."""
    set_mode(tenant, "block")
    client, _ = api_as(tenant, "staff")
    party = PartyFactory(tenant=tenant, balance="49500.00", credit_limit="50000.00")

    assert post(client, party).status_code == 201


# ── Permissions ─────────────────────────────────────────────────────────────


def test_an_accountant_reads_the_book_and_cannot_post_to_it(tenant: Any, api_as: Any) -> None:
    """T-LED-01-12. Which is what an accountant is."""
    client, _ = api_as(tenant, "accountant")
    party = PartyFactory(tenant=tenant)

    assert post(client, party).status_code == 403
    assert client.get(f"{reverse(ENTRIES)}?party={party.id}").status_code == 200


# ── Idempotency ─────────────────────────────────────────────────────────────


def test_a_replayed_save_does_not_post_the_entry_twice(tenant: Any, api_as: Any) -> None:
    """T-LED-01-5 / EC-1, and the most damaging double-submit in the product.

    A merchant on a 2G connection taps Save, the response is lost, they tap Save
    again. Without the key that is two entries against one customer and a
    balance wrong by the amount of the sale — and the number it corrupts is the
    one they read out at the counter.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    headers = {"HTTP_IDEMPOTENCY_KEY": "save-tap-1"}

    first = client.post(reverse(ENTRIES), body(party), format="json", **headers)
    second = client.post(reverse(ENTRIES), body(party), format="json", **headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert second["Idempotent-Replayed"] == "true"
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert LedgerEntry.objects.count() == 1
    party.refresh_from_db()
    assert party.balance == Decimal("500.00")


def test_the_same_key_with_a_different_amount_is_a_conflict(tenant: Any, api_as: Any) -> None:
    """BR-8. A key identifies one intent; a changed body is a different one."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    headers = {"HTTP_IDEMPOTENCY_KEY": "save-tap-2"}

    client.post(reverse(ENTRIES), body(party), format="json", **headers)
    second = client.post(reverse(ENTRIES), body(party, amount="900.00"), format="json", **headers)

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "idempotency_conflict"


# ── The timeline ────────────────────────────────────────────────────────────


def test_the_timeline_is_this_partys_entries_newest_first(tenant: Any, api_as: Any) -> None:
    """BR-5 — ordered by the BUSINESS date, which is what a merchant reads by."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    for offset in (2, 0, 1):
        post(
            client,
            party,
            amount=f"{100 + offset}.00",
            entry_date=(dt.date.today() - dt.timedelta(days=offset)).isoformat(),
        )

    rows = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["data"]

    assert [row["amount"] for row in rows] == ["100.00", "101.00", "102.00"]


def test_the_timeline_does_not_leak_another_partys_entries(tenant: Any, api_as: Any) -> None:
    """The one thing a per-party read must never do."""
    client, _ = api_as(tenant)
    mine = PartyFactory(tenant=tenant, balance="0.00")
    theirs = PartyFactory(tenant=tenant, balance="0.00")
    post(client, mine, amount="111.00")
    post(client, theirs, amount="222.00")

    rows = client.get(f"{reverse(ENTRIES)}?party={mine.id}").json()["data"]

    assert [row["amount"] for row in rows] == ["111.00"]


def test_a_list_without_a_party_is_empty_rather_than_the_whole_tenant(
    tenant: Any, api_as: Any
) -> None:
    """Fail-closed, in the same direction as the tenant scoping above it.

    A route that would page a tenant's entire history is a route somebody will
    eventually point at a tenant's entire history.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party)

    assert client.get(reverse(ENTRIES)).json()["data"] == []


def test_paging_a_busy_saturday_returns_every_entry_exactly_once(tenant: Any, api_as: Any) -> None:
    """The keyset bug `common/pagination.py` carried, seen from the feature.

    Twelve entries on one date, three to a page. Under an AND-of-terms cursor
    the second page skipped the rest of the date and the merchant simply did not
    see them — the rows were in the database and the balance was right.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    for index in range(12):
        post(client, party, amount=f"{index + 1}.00")

    seen: list[str] = []
    url = f"{reverse(ENTRIES)}?party={party.id}&limit=3"
    for _ in range(8):
        payload = client.get(url).json()
        seen.extend(row["id"] for row in payload["data"])
        if not payload["meta"]["has_more"]:
            break
        url = f"{reverse(ENTRIES)}?party={party.id}&limit=3&cursor={payload['meta']['next_cursor']}"

    assert len(seen) == 12
    assert len(set(seen)) == 12


def test_the_timeline_costs_one_query_whatever_the_author_count(
    tenant: Any, api_as: Any, django_assert_max_num_queries: Any
) -> None:
    """FR-8 puts "by Sunita" on every row, which is an N+1 waiting to be written.

    `select_related` is in the selector; this is what keeps it there.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    for index in range(10):
        post(client, party, amount=f"{index + 1}.00")

    with django_assert_max_num_queries(8):
        client.get(f"{reverse(ENTRIES)}?party={party.id}")


def test_the_party_scoped_route_is_the_same_write(tenant: Any, api_as: Any) -> None:
    """FRD §14's convenience route. The party comes from the path, not the body.

    Accepting it in both would create a request that can disagree with itself.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="100.00")

    response = client.post(
        reverse(PARTY_ENTRIES, args=[party.id]),
        {"direction": Direction.DEBIT, "amount": "50.00", "entry_date": today()},
        format="json",
    )

    assert response.status_code == 201, response.json()
    assert response.json()["meta"]["party_balance"] == "150.00"


def test_the_first_page_carries_the_khata_headers_ledger_figures(tenant: Any, api_as: Any) -> None:
    """PTY-03 §14's summary, on the endpoint that owns the table.

    `GET /parties/{id}` cannot answer these — `parties` may not import `ledger`
    (Part 20 §20.1.4) — and a third endpoint would be a third round trip for a
    page that already makes this one.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party, amount="1000.00")
    client.post(
        reverse(ENTRIES),
        body(party, direction=Direction.CREDIT, amount="250.00", payment_mode="cash"),
        format="json",
    )

    meta = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]

    assert meta["summary"] == {
        "total_debit": "1000.00",
        "total_credit": "250.00",
        "written_off": {"debit": "0.00", "credit": "0.00"},
        "entry_count": 2,
    }


def test_the_summary_is_not_recomputed_on_every_page_of_the_cursor(
    tenant: Any, api_as: Any
) -> None:
    """First page only, and the reason is the reason the cursor exists.

    The three figures do not change as a merchant scrolls, and re-aggregating a
    party's whole history on every page would put back the linear cost
    §20.14.3 chose a cursor to avoid.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    for index in range(4):
        post(client, party, amount=f"{index + 1}.00")

    first = client.get(f"{reverse(ENTRIES)}?party={party.id}&limit=2").json()
    second = client.get(
        f"{reverse(ENTRIES)}?party={party.id}&limit=2&cursor={first['meta']['next_cursor']}"
    ).json()

    assert "summary" in first["meta"]
    assert "summary" not in second["meta"]


def test_the_summary_counts_the_same_rows_the_balance_does(tenant: Any, api_as: Any) -> None:
    """One predicate, two readers. The header and the balance cannot disagree.

    `total_debit − total_credit` is the balance, by construction: both are sums
    over `LIVE_ENTRIES`. A header that summed a different set would show a
    merchant two numbers about the same rows that do not reconcile, which is the
    single thing a khata must never do.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post(client, party, amount="1500.00")
    client.post(
        reverse(ENTRIES),
        body(party, direction=Direction.CREDIT, amount="400.00", payment_mode="upi"),
        format="json",
    )

    summary = client.get(f"{reverse(ENTRIES)}?party={party.id}").json()["meta"]["summary"]
    party.refresh_from_db()

    assert Decimal(summary["total_debit"]) - Decimal(summary["total_credit"]) == party.balance


def test_reading_a_khata_does_not_spend_the_write_budget(tenant: Any, api_as: Any) -> None:
    """The timeline is read on the user budget; only posting spends `ledger_write`.

    One class-level `throttle_scope = "ledger_write"` applied to every verb, so
    opening khatas spent the WRITE ceiling — the defect the party list had, found
    there by the 2,000-party performance pass and here by looking for its twin.
    One read past the write ceiling must still be served.
    """
    from apps.common.throttling import ScopedUserRateThrottle

    party = PartyFactory(tenant=tenant)
    client, _ = api_as(tenant)
    url = reverse(ENTRIES) + f"?party_id={party.id}"
    reads = ScopedUserRateThrottle("ledger_write").num_requests + 1

    statuses = [client.get(url).status_code for _ in range(reads)]

    assert set(statuses) == {200}
