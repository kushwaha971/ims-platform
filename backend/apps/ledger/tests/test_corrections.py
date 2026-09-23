"""LED-03 — the feature that makes an append-only ledger usable by a human.

Canon §0.11 rule 1 says a posted line is never edited and never deleted. That is
the right rule and it is enforced twice, in the model and in a database trigger.
It is also, on its own, a product that cannot be used: shopkeepers type 5000 for
500, write an entry against the wrong customer, and record the same ₹500 twice
when a customer pays at the counter and the till is busy.

So the mistake stays, and two new rows say what it should have been. These tests
are about that shape holding under every condition the FRD names, and about the
balance — the number the merchant reads out loud — being right afterwards.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.parties.constants import PartyStatus
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
DETAIL = "v1:ledger-entry-detail"


def entry_url(entry: Any, suffix: str) -> str:
    return f"{reverse(DETAIL, args=[entry.id])}/{suffix}"


def post_entry(client: Any, party: Any, **extra: Any) -> Any:
    body = {
        "party_id": str(party.id),
        "direction": Direction.DEBIT,
        "amount": "500.00",
        "entry_date": "2026-04-01",
        "note": "Cement bags",
        **extra,
    }
    return client.post(reverse(ENTRIES), body, format="json")


@pytest.fixture
def khata(tenant: Any, api_as: Any) -> dict:
    """A party with one ₹500 "You gave" on it, posted through the real route.

    Built by POSTING rather than by a factory, because half of what these tests
    assert is that the balance arithmetic composes — and a factory-made entry
    would leave `parties_party.balance` at whatever the factory said, which is
    the one number a correction has to get right.
    """
    client, member = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    response = post_entry(client, party)
    assert response.status_code == 201, response.json()
    entry = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    party.refresh_from_db()
    return {"client": client, "member": member, "party": party, "entry": entry}


# ── Reversing ───────────────────────────────────────────────────────────────


def test_reversing_writes_an_opposite_row_and_strikes_the_original(khata: dict) -> None:
    """AC-1 / T-LED-03-1 — the whole shape of the feature in one assertion block.

    ₹500 given, reversed: the balance returns to zero, the original is struck
    through rather than gone, and the new row says which entry it undoes and
    why. If any one of these four drifts the feature is broken in a way a
    merchant would notice at the counter.
    """
    response = khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Duplicate entry"}, format="json"
    )

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["meta"]["party_balance"] == "0.00"

    original = LedgerEntry.objects.get(pk=khata["entry"].id)
    reversal = LedgerEntry.objects.get(pk=body["data"]["id"])
    assert original.status == EntryStatus.REVERSED
    assert original.reversed_by_id == reversal.id
    assert reversal.direction == Direction.CREDIT
    assert reversal.amount == Decimal("500.00")
    assert reversal.entry_type == EntryType.REVERSAL
    assert reversal.source_type == SourceType.LEDGER_ENTRY
    assert reversal.reverses_id == original.id
    assert reversal.source_id == original.id
    assert reversal.reason == "Duplicate entry"

    khata["party"].refresh_from_db()
    assert khata["party"].balance == Decimal("0.00")


def test_a_reversal_carries_the_originals_date_not_todays(khata: dict) -> None:
    """BR-7, and the reason it is not "today".

    A reversal dated today against an entry dated the 1st leaves the 1st's day
    book overstated for ever — the money has been moved out of the period it was
    in and into a period it never touched. Dating it with the original makes the
    pair net to zero on the day the mistake was made.
    """
    khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Wrong party"}, format="json"
    )

    reversal = LedgerEntry.objects.get(entry_type=EntryType.REVERSAL)
    assert reversal.entry_date == dt.date(2026, 4, 1)


def test_reversing_twice_is_refused(khata: dict) -> None:
    """EC-2 / T-LED-03-5. A second reversal would move the balance again.

    The guard is a status check under a row lock, so the answer is the same
    whether the second attempt arrives a minute later or in a parallel request.
    """
    khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Duplicate"}, format="json"
    )
    second = khata["client"].post(
        entry_url(khata["entry"], "reverse"),
        {"reason": "Duplicate again"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="a-different-key",
    )

    assert second.status_code == 409
    assert second.json()["error"]["code"] == "entry_already_reversed"
    assert LedgerEntry.objects.filter(entry_type=EntryType.REVERSAL).count() == 1


def test_a_reason_is_required_and_bounded(khata: dict) -> None:
    """§10 — the reason is the feature. Without one, the row says what and never why."""
    blank = khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": ""}, format="json"
    )
    assert blank.status_code == 400

    missing = khata["client"].post(entry_url(khata["entry"], "reverse"), {}, format="json")
    assert missing.status_code == 400

    too_long = khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "x" * 161}, format="json"
    )
    assert too_long.status_code == 400
    assert not LedgerEntry.objects.filter(entry_type=EntryType.REVERSAL).exists()


def test_a_document_backed_entry_says_to_void_the_document(tenant: Any, api_as: Any) -> None:
    """FR-6 / T-LED-03-6.

    Reversing the ledger line of an invoice without touching the invoice leaves
    the document saying one thing and the khata another — and, once INV exists,
    the stock behind it a third. The refusal names the operation that undoes all
    of them together, and carries the ids the client will deep-link from.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    entry = LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=Decimal("900.00"),
        entry_date=dt.date(2026, 4, 2),
        entry_type=EntryType.INVOICE,
        source_type=SourceType.SALES_DOCUMENT,
        source_id=party.id,
    )

    response = client.post(entry_url(entry, "reverse"), {"reason": "Wrong invoice"}, format="json")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "use_document_void"
    assert error["details"]["source_type"] == SourceType.SALES_DOCUMENT


def test_reversing_writes_an_audit_row_with_both_sides(khata: dict) -> None:
    """§16. "Who changed this number and what did they say the reason was"."""
    khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Paid in cash instead"}, format="json"
    )

    log = AuditLog.objects.get(action=AuditAction.LEDGER_ENTRY_REVERSED)
    assert log.entity_id == khata["entry"].id
    assert log.before["status"] == EntryStatus.POSTED
    assert log.after["status"] == EntryStatus.REVERSED
    assert log.metadata["reason"] == "Paid in cash instead"
    assert log.metadata["balance_after"] == "0.00"


# ── Correcting ──────────────────────────────────────────────────────────────


def test_correcting_an_amount_writes_three_rows_and_lands_on_the_new_figure(
    khata: dict,
) -> None:
    """AC-2 / T-LED-03-2. ₹500 → ₹550 leaves ₹550, by way of a reversal.

    Three rows for one typo looks expensive until you ask the other question:
    what did this khata say last Tuesday? An edit in place cannot answer it.
    """
    response = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.00", "reason": "Typed 500 instead of 550"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    assert response.json()["meta"]["party_balance"] == "550.00"

    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.amount == Decimal("550.00")
    assert replacement.supersedes_id == khata["entry"].id
    assert replacement.status == EntryStatus.POSTED
    assert replacement.reason == "Typed 500 instead of 550"

    assert LedgerEntry.objects.filter(party=khata["party"]).count() == 3
    khata["party"].refresh_from_db()
    assert khata["party"].balance == Decimal("550.00")
    # The cache and the ledger agree — which is the only claim that matters, and
    # the one a correction is most likely to break, because it moves a balance
    # by the DIFFERENCE between two rows rather than by one row's amount.
    assert computed_balance(tenant=khata["party"].tenant, party_id=khata["party"].id) == Decimal(
        "550.00"
    )


def test_correcting_the_direction_changes_the_entry_type_too(khata: dict) -> None:
    """EC-1 / BR-3. A "You got" that should have been a "You gave" is a different KIND of line.

    The replacement is a `manual_gave`, not a `manual_got` with the sign flipped
    — the type is what every report groups by, and a row filed under the wrong
    one is invisible to the report that should have counted it.
    """
    response = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {
            "direction": Direction.CREDIT,
            "payment_mode": "cash",
            "reason": "This was a payment, not a sale",
        },
        format="json",
    )

    assert response.status_code == 200, response.json()
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.direction == Direction.CREDIT
    assert replacement.entry_type == EntryType.MANUAL_GOT
    assert replacement.payment_mode == "cash"
    # −500 removed, −500 added: 500 given becomes 500 received, a 1000 swing.
    assert response.json()["meta"]["party_balance"] == "-500.00"


def test_correcting_an_opening_stays_an_opening(tenant: Any, api_as: Any) -> None:
    """BR-9 / T-LED-03-4, and the acceptance criterion LED-02 could not carry.

    LED-02's unique index is partial on `status='posted'` for exactly this: the
    original becomes `reversed` first, so the index is free when the replacement
    opening is written. A total unique index would make this operation
    impossible, and the merchant most likely to mistype an opening balance is
    the one typing forty of them off a paper book on their first afternoon.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    created = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "entry_type": "opening",
            "direction": Direction.DEBIT,
            "amount": "2300.00",
            "entry_date": "2026-04-01",
        },
        format="json",
    )
    opening = LedgerEntry.objects.get(pk=created.json()["data"]["id"])

    response = client.post(
        entry_url(opening, "correct"),
        {"amount": "3200.00", "reason": "Read the paper book wrong"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.entry_type == EntryType.OPENING
    assert replacement.supersedes_id == opening.id
    # The invariant the index exists for: exactly one opening is STANDING.
    assert (
        LedgerEntry.objects.filter(
            party=party, entry_type=EntryType.OPENING, status=EntryStatus.POSTED
        ).count()
        == 1
    )
    party.refresh_from_db()
    assert party.balance == Decimal("3200.00")


def test_a_correction_can_itself_be_corrected(khata: dict) -> None:
    """EC-3 / T-LED-03-9. The chain grows; it does not fork.

    A merchant who fixes 500 to 550 and then realises it was 5500 must not be
    told the entry has already been corrected. What is refused is correcting the
    row that has ALREADY been undone, which is a different row.
    """
    first = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.00", "reason": "Typo"},
        format="json",
    )
    replacement = LedgerEntry.objects.get(pk=first.json()["data"]["id"])

    second = khata["client"].post(
        entry_url(replacement, "correct"),
        {"amount": "5500.00", "reason": "Missed a zero"},
        format="json",
    )

    assert second.status_code == 200, second.json()
    assert second.json()["meta"]["party_balance"] == "5500.00"
    assert computed_balance(tenant=khata["party"].tenant, party_id=khata["party"].id) == Decimal(
        "5500.00"
    )


def test_correcting_nothing_is_refused(khata: dict) -> None:
    """§10's cross-field rule, and it is a kindness rather than a technicality.

    A correction that changes nothing writes two rows, moves no money, and
    leaves the merchant staring at a struck-through entry with an identical one
    beneath it. The message says what they probably meant instead.
    """
    response = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "500.00", "reason": "No change at all"},
        format="json",
    )

    assert response.status_code == 400
    assert LedgerEntry.objects.filter(party=khata["party"]).count() == 1


def test_a_correction_validates_like_any_other_entry(khata: dict) -> None:
    """The lesson LED-02 had to be taught once already.

    An opening balance once accepted three decimal places and a date in the year
    202600, because its service did not call the validator the ordinary write
    path used. Two copies of a rule are two copies that will disagree, so the
    correction path calls the same `validate_entry_payload`.
    """
    future = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"entry_date": "2099-01-01", "reason": "Wrong date"},
        format="json",
    )
    assert future.status_code == 400

    fractional = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.555", "reason": "Wrong amount"},
        format="json",
    )
    assert fractional.status_code == 400
    assert LedgerEntry.objects.filter(party=khata["party"]).count() == 1


def test_correcting_writes_an_audit_row_naming_what_changed(khata: dict) -> None:
    """§16 — `after` is the REPLACEMENT, because "what is this entry now" is the question."""
    khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.00", "note": "Cement bags, 11", "reason": "Recount"},
        format="json",
    )

    log = AuditLog.objects.get(action=AuditAction.LEDGER_ENTRY_CORRECTED)
    assert log.before["amount"] == "500.00"
    assert log.after["amount"] == "550.00"
    assert log.metadata["changed_fields"] == ["amount", "note"]


# ── The timeline, the chain, and who may do this ────────────────────────────


def test_the_timeline_hides_the_pair_until_asked(khata: dict) -> None:
    """BR-5 / FR-7 / T-LED-03-3.

    One typo must not turn one line into three on the screen a merchant reads at
    the counter. The history is one parameter away, never gone.
    """
    khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.00", "reason": "Typo"},
        format="json",
    )

    clean = khata["client"].get(reverse(ENTRIES), {"party": str(khata["party"].id)})
    assert [row["amount"] for row in clean.json()["data"]] == ["550.00"]

    full = khata["client"].get(
        reverse(ENTRIES), {"party": str(khata["party"].id), "include_reversed": "true"}
    )
    assert len(full.json()["data"]) == 3
    statuses = {row["status"] for row in full.json()["data"]}
    assert statuses == {EntryStatus.POSTED, EntryStatus.REVERSED}


def test_the_summary_counts_only_the_standing_rows(khata: dict) -> None:
    """The header's three figures come from the same `LIVE_ENTRIES` the balance does.

    A khata that says "You gave ₹1,050" over a ₹550 balance is a merchant
    querying their own book, and both halves of a reversal pair have to leave
    the total or neither can.
    """
    khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.00", "reason": "Typo"},
        format="json",
    )

    summary = (
        khata["client"]
        .get(reverse(ENTRIES), {"party": str(khata["party"].id)})
        .json()["meta"]["summary"]
    )
    assert summary["total_debit"] == "550.00"
    assert summary["entry_count"] == 1


def test_the_detail_carries_the_whole_chain_oldest_first(khata: dict) -> None:
    """FR-8. Three rows, in the order they happened, from any one of them."""
    corrected = khata["client"].post(
        entry_url(khata["entry"], "correct"),
        {"amount": "550.00", "reason": "Typo"},
        format="json",
    )
    replacement_id = corrected.json()["data"]["id"]

    for entry_id in (str(khata["entry"].id), replacement_id):
        history = khata["client"].get(reverse(DETAIL, args=[entry_id])).json()["data"]["history"]
        assert [row["entry_type"] for row in history] == [
            EntryType.MANUAL_GAVE,
            EntryType.REVERSAL,
            EntryType.MANUAL_GAVE,
        ]
        assert [row["amount"] for row in history] == ["500.00", "500.00", "550.00"]


def test_staff_may_post_but_may_not_correct(tenant: Any, api_as: Any) -> None:
    """BR-8 / T-LED-03-7.

    The counter records what happens at the counter. Going back and changing a
    number a customer has already been shown is the owner's decision, and it is
    the one thing in the ledger a shopkeeper would not delegate.
    """
    staff, _ = api_as(tenant, role="staff")
    party = PartyFactory(tenant=tenant, balance="0.00")
    created = post_entry(staff, party)
    assert created.status_code == 201
    entry = LedgerEntry.objects.get(pk=created.json()["data"]["id"])

    refused = staff.post(entry_url(entry, "reverse"), {"reason": "Mistake"}, format="json")

    assert refused.status_code == 403
    entry.refresh_from_db()
    assert entry.status == EntryStatus.POSTED


def test_another_tenants_entry_is_not_found_rather_than_forbidden(
    two_tenants_full: dict,
) -> None:
    """Canon §0.11 rule 2. A 403 confirms the id exists; a 404 says nothing.

    The check has to be here rather than left to the generic scoping, because
    the correction service loads the entry with its own `select_for_update`
    query rather than through the viewset's queryset — which is exactly the kind
    of second door tenant leaks come through.
    """
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    created = post_entry(a["client"], a["party"])
    assert created.status_code == 201, created.json()
    entry = LedgerEntry.objects.get(pk=created.json()["data"]["id"])

    response = b["client"].post(
        entry_url(entry, "reverse"), {"reason": "Not mine to touch"}, format="json"
    )

    assert response.status_code == 404
    entry.refresh_from_db()
    assert entry.status == EntryStatus.POSTED


def test_an_archived_party_cannot_be_corrected(khata: dict) -> None:
    """A khata nobody may post to is a khata nobody may rewrite.

    PTY-04 only lets a party be archived at a zero balance — so a correction
    here would move a balance the archive decision was made against, silently,
    on a party that no longer appears in any list.
    """
    khata["party"].status = PartyStatus.ARCHIVED
    khata["party"].save(update_fields=["status"])

    response = khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Too late"}, format="json"
    )

    assert response.status_code == 409
    khata["entry"].refresh_from_db()
    assert khata["entry"].status == EntryStatus.POSTED


def test_a_retried_reverse_returns_the_first_answer(khata: dict) -> None:
    """Canon rule 5, and the reason this route is idempotent at all.

    Without the key, a lost response on a 2G connection becomes a second
    reversal — and the second one moves the balance again, by the same amount,
    in the same direction. The 409 guard would catch it, but it would tell the
    merchant they had already done something they never saw succeed.
    """
    headers = {"HTTP_IDEMPOTENCY_KEY": "ledger-reverse-retry-1"}
    first = khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Duplicate"}, format="json", **headers
    )
    second = khata["client"].post(
        entry_url(khata["entry"], "reverse"), {"reason": "Duplicate"}, format="json", **headers
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert LedgerEntry.objects.filter(entry_type=EntryType.REVERSAL).count() == 1
