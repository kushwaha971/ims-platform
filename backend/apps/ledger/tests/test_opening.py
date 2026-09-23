"""LED-02 — the balance a merchant carries over from paper.

Day one of this product is somebody typing in what forty customers already owe
them, and until that number is in the book every statement starts from zero.
PTY-01 has been recording the figure since Sprint 3 and posting nothing; these
are the tests for the part that finally posts it.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command
from django.db import DatabaseError, transaction
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.opening import default_direction, opening_entry
from apps.parties.constants import PartyStatus
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
PARTIES = "v1:party-list"


def post_opening(client: Any, party: Any, **extra: Any) -> Any:
    return client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "entry_type": "opening",
            "direction": Direction.DEBIT,
            "amount": "2300.00",
            "entry_date": "2026-04-01",
            **extra,
        },
        format="json",
    )


# ── The entry itself ────────────────────────────────────────────────────────


def test_an_opening_is_the_first_row_of_the_khata(tenant: Any, api_as: Any) -> None:
    """AC-1 / T-LED-02-1, through the endpoint FR-3 names."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = post_opening(client, party)

    assert response.status_code == 201, response.json()
    assert response.json()["meta"]["party_balance"] == "2300.00"
    entry = LedgerEntry.objects.get(party=party)
    assert entry.entry_type == EntryType.OPENING
    assert entry.entry_date == dt.date(2026, 4, 1)
    assert entry.source_type == "manual"
    assert entry.source_id is None
    # BR-1 — English in the column, translated on the screen. A note in the
    # merchant's own locale is a row no report, export or support query finds.
    assert entry.note == "Opening balance"


def test_the_direction_decides_the_sign_and_the_merchant_never_types_one(
    tenant: Any, api_as: Any
) -> None:
    """AC-2. "I owe them ₹1,000" is a thing a shopkeeper knows; −1000 is not."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    post_opening(client, party, direction=Direction.CREDIT, amount="1000.00")

    party.refresh_from_db()
    assert party.balance == Decimal("-1000.00")
    # BR-3 of LED-01 — the two report caches follow, in the same transaction.
    assert party.payable_total == Decimal("1000.00")
    assert party.receivable_total == Decimal("0.00")


def test_an_opening_carries_no_payment_mode(tenant: Any, api_as: Any) -> None:
    """There is no method by which the money arrived, because none did today.

    An opening balance is a statement about a date, not a transfer. A `cash`
    against it would put a line in EXP-03's cashbook for money that never
    crossed the counter.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    post_opening(client, party, direction=Direction.CREDIT, payment_mode="cash")

    assert LedgerEntry.objects.get(party=party).payment_mode is None


# ── One per party ───────────────────────────────────────────────────────────


def test_a_second_opening_is_refused(tenant: Any, api_as: Any) -> None:
    """T-LED-02-2 / BR-2. The feature's own success metric is zero parties with two."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post_opening(client, party)

    response = post_opening(client, party, amount="9999.00")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "opening_balance_exists"
    assert LedgerEntry.objects.filter(party=party).count() == 1
    party.refresh_from_db()
    assert party.balance == Decimal("2300.00")


def test_the_database_refuses_a_second_one_too(tenant: Any, api_as: Any) -> None:
    """The half of BR-2 the service cannot enforce.

    `post_opening_balance()` checks under a row lock, which is correct for every
    caller that goes through it. This test goes round it deliberately, because
    that is what the batched import FR-6 describes will do, and what a psql
    session at three in the morning does. CR-040 calls the index optional
    defence-in-depth; a guarantee that depends on every future caller
    remembering to take a lock is not a guarantee.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post_opening(client, party)
    first = LedgerEntry.objects.get(party=party)

    with pytest.raises(DatabaseError), transaction.atomic():
        LedgerEntry.objects.create(
            tenant=tenant,
            party=party,
            direction=Direction.DEBIT,
            amount=Decimal("1.00"),
            entry_date=dt.date(2026, 4, 2),
            entry_type=EntryType.OPENING,
            source_type="manual",
            status=EntryStatus.POSTED,
        )

    assert LedgerEntry.objects.filter(party=party).count() == 1
    assert LedgerEntry.objects.get(party=party).id == first.id


def test_a_reversed_opening_leaves_room_for_a_replacement(tenant: Any, api_as: Any) -> None:
    """BR-5, and why the index is PARTIAL on `status='posted'`.

    A correction reverses the original and posts a replacement; both rows are
    `entry_type='opening'` and both stay for ever. A total unique index would
    make correcting an opening impossible — which is the one thing LED-03 exists
    to do. LED-03 is what creates this pair; the constraint has to permit it
    before that feature is written, or the discovery happens a sprint later with
    a migration attached.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post_opening(client, party)
    original = LedgerEntry.objects.get(party=party)
    LedgerEntry.objects.filter(pk=original.pk).update(status=EntryStatus.REVERSED)

    replacement = LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=Decimal("2800.00"),
        entry_date=dt.date(2026, 4, 1),
        entry_type=EntryType.OPENING,
        source_type="manual",
        status=EntryStatus.POSTED,
        supersedes=original,
    )

    assert replacement.pk is not None
    assert opening_entry(tenant=tenant, party_id=party.id).id == replacement.id


def test_only_a_posted_opening_counts_as_one(tenant: Any, api_as: Any) -> None:
    """BR-5's other half: a reversal alone leaves the party with no opening.

    The "Add opening balance" action comes back, which is right — the merchant
    undid the figure and now has none.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    post_opening(client, party)
    LedgerEntry.objects.filter(party=party).update(status=EntryStatus.REVERSED)

    assert opening_entry(tenant=tenant, party_id=party.id) is None


# ── The rules it shares with every other entry ──────────────────────────────


def test_an_opening_obeys_the_same_amount_rule_as_any_entry(tenant: Any, api_as: Any) -> None:
    """Prevents: an opening accepting what an ordinary entry refuses.

    Same endpoint, same body shape, one field different — and the first version
    of this service validated nothing at all, so three decimal places and a
    ₹0.00 opening both went through while `post_entry` refused them one branch
    away. One validator, two services.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    # EC-3: a zero opening is "no opening", and the merchant should be told to
    # leave the section empty rather than have a meaningless row written.
    assert post_opening(client, party, amount="0.00").status_code == 400
    assert post_opening(client, party, amount="100.005").status_code == 400
    assert post_opening(client, party, amount="-100.00").status_code == 400
    assert LedgerEntry.objects.count() == 0


def test_an_opening_cannot_be_dated_in_the_future(tenant: Any, api_as: Any) -> None:
    """EC-2. A khata records what was true, not what is going to be."""
    from django.utils import timezone

    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    tomorrow = (timezone.now().date() + dt.timedelta(days=1)).isoformat()

    response = post_opening(client, party, entry_date=tomorrow)

    assert response.status_code == 400
    assert "entry_date" in response.json()["error"]["details"]


def test_an_archived_party_takes_no_opening(tenant: Any, api_as: Any) -> None:
    """EC-4 — "may still add an opening if none exists" is about a RESTORED party.

    While it is archived the khata is closed, and this is a write.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, status=PartyStatus.ARCHIVED, balance="0.00")

    response = post_opening(client, party)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_archived"


def test_a_client_may_not_ask_for_any_other_entry_type(tenant: Any, api_as: Any) -> None:
    """CR-037 (17-02 CCR-1) — `opening` is the ONE type a client may name.

    Every other type is derived from the direction and the source. A client that
    could send `reversal` could write one with no reversal behind it, and the
    reporting that groups by type would be answering a question about rows
    nobody can trace.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    for forbidden in ("reversal", "invoice", "write_off", "manual_gave"):
        response = post_opening(client, party, entry_type=forbidden)
        assert response.status_code == 400, forbidden

    assert LedgerEntry.objects.count() == 0


# ── Posted with the party, in one transaction ───────────────────────────────


def test_creating_a_party_with_an_opening_posts_it(tenant: Any, api_as: Any) -> None:
    """FR-2 / PTY-01 FR-9 / T-PTY-01-7 — and the audit row that says where it came from."""
    from apps.platform_app.models import AuditLog

    client, _ = api_as(tenant)

    response = client.post(
        reverse(PARTIES),
        {
            "name": "Ramesh Traders",
            "is_customer": True,
            "opening_balance_amount": "2300.00",
            "opening_balance_direction": "debit",
            "opening_balance_as_of": "2026-04-01",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="party-with-opening",
    )

    assert response.status_code == 201, response.json()
    entry = LedgerEntry.objects.get()
    assert entry.entry_type == EntryType.OPENING
    entry.party.refresh_from_db()
    assert entry.party.balance == Decimal("2300.00")
    # §16 — `via` says which surface produced it. An opening posted by an import
    # is where a support query starts when a merchant says their book is wrong
    # after a migration, so it has to be distinguishable from one they typed.
    audit = AuditLog.objects.get(action="ledger.entry.created")
    assert audit.metadata["via"] == "party_create"


def test_a_party_whose_opening_fails_is_not_created_either(tenant: Any, api_as: Any) -> None:
    """One transaction, and this is what that sentence buys.

    A party saved with a balance of zero, under a form that said ₹2,300, is a
    khata that is quietly wrong from its first day — and nothing later would
    ever notice, because the party exists and looks fine.
    """
    from django.utils import timezone

    from apps.parties.models import Party

    client, _ = api_as(tenant)
    tomorrow = (timezone.now().date() + dt.timedelta(days=2)).isoformat()

    response = client.post(
        reverse(PARTIES),
        {
            "name": "Never Saved",
            "is_customer": True,
            "opening_balance_amount": "2300.00",
            "opening_balance_direction": "debit",
            "opening_balance_as_of": tomorrow,
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="party-with-bad-opening",
    )

    assert response.status_code == 400
    assert not Party.objects.filter(name="Never Saved").exists()
    assert LedgerEntry.objects.count() == 0


def test_a_party_carrying_nothing_over_gets_no_row(tenant: Any, api_as: Any) -> None:
    """Most parties. A ₹0.00 opening would be a line in every khata saying nothing."""
    client, _ = api_as(tenant)

    client.post(
        reverse(PARTIES),
        {"name": "No Opening", "is_customer": True},
        format="json",
        HTTP_IDEMPOTENCY_KEY="party-no-opening",
    )

    assert LedgerEntry.objects.count() == 0


# ── Which way the toggle starts ─────────────────────────────────────────────


def test_a_supplier_only_party_starts_on_i_owe_them(tenant: Any) -> None:
    """T-LED-02-4 / PTY-01 FR-9. A supplier is somebody this business buys from."""
    supplier = PartyFactory(tenant=tenant, is_customer=False, is_supplier=True)
    customer = PartyFactory(tenant=tenant, is_customer=True, is_supplier=False)
    # EC-5 — a party that is both starts on "they owe me", because that is what
    # a shopkeeper is carrying over in the overwhelming majority of rows.
    both = PartyFactory(tenant=tenant, is_customer=True, is_supplier=True)

    assert default_direction(supplier) == Direction.CREDIT
    assert default_direction(customer) == Direction.DEBIT
    assert default_direction(both) == Direction.DEBIT


# ── The backfill ────────────────────────────────────────────────────────────


def run_backfill(**opts: Any) -> str:
    out, err = StringIO(), StringIO()
    call_command("post_stored_openings", stdout=out, stderr=err, **opts)
    return out.getvalue() + err.getvalue()


def test_the_backfill_reports_before_it_posts(tenant: Any) -> None:
    """Report-only by default, because an opening balance is money.

    The operator running this should see what it is about to post before it
    posts it, on a column somebody typed months ago under a form that checked
    less than today's does.
    """
    party = PartyFactory(
        tenant=tenant,
        balance="0.00",
        opening_balance_amount=Decimal("2300.00"),
        opening_balance_direction="debit",
        opening_balance_as_of=dt.date(2026, 4, 1),
    )

    output = run_backfill(tenant=str(tenant.id))

    assert "would" in output
    assert LedgerEntry.objects.filter(party=party).count() == 0


def test_the_backfill_posts_what_pty01_recorded(tenant: Any) -> None:
    party = PartyFactory(
        tenant=tenant,
        balance="0.00",
        opening_balance_amount=Decimal("2300.00"),
        opening_balance_direction="debit",
        opening_balance_as_of=dt.date(2026, 4, 1),
    )

    run_backfill(tenant=str(tenant.id), apply=True)

    party.refresh_from_db()
    assert party.balance == Decimal("2300.00")
    entry = LedgerEntry.objects.get(party=party)
    assert entry.entry_type == EntryType.OPENING
    # A migration posted it, not a person, so the timeline says nothing about
    # who wrote it — which is true. FR-8's "by <name>" would be a lie about a
    # colleague.
    assert entry.created_by is None


def test_running_the_backfill_twice_posts_once(tenant: Any) -> None:
    """Idempotent by construction: BR-2 refuses the second, so the run skips it.

    A command an operator is afraid to re-run is a command that gets run once,
    half-way, on the afternoon the connection drops.
    """
    PartyFactory(
        tenant=tenant,
        balance="0.00",
        opening_balance_amount=Decimal("2300.00"),
        opening_balance_direction="debit",
        opening_balance_as_of=dt.date(2026, 4, 1),
    )

    run_backfill(tenant=str(tenant.id), apply=True)
    second = run_backfill(tenant=str(tenant.id), apply=True)

    assert LedgerEntry.objects.count() == 1
    assert "1 already had one" in second


def test_the_backfill_reports_a_row_it_cannot_post_and_carries_on(tenant: Any) -> None:
    """An archived party, or a date that fails today's rules and did not fail then.

    An operator wants the other four hundred posted and a list of the six that
    need a human — not a run that stops on the first one.
    """
    PartyFactory(
        tenant=tenant,
        status=PartyStatus.ARCHIVED,
        balance="0.00",
        opening_balance_amount=Decimal("50.00"),
        opening_balance_direction="debit",
        opening_balance_as_of=dt.date(2026, 4, 1),
    )
    good = PartyFactory(
        tenant=tenant,
        balance="0.00",
        opening_balance_amount=Decimal("100.00"),
        opening_balance_direction="debit",
        opening_balance_as_of=dt.date(2026, 4, 1),
    )

    output = run_backfill(tenant=str(tenant.id), apply=True)

    assert "1 refused" in output
    assert LedgerEntry.objects.filter(party=good).count() == 1
