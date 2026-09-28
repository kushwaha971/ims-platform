"""`ledger_entry.upi_app` — "PhonePe kiya", recorded.

A "You got" by UPI can say which app the money came through, because that is
the word both sides of the counter use and the history a merchant opens when a
customer says "but I paid you". The field is small; the rules around it are the
ones every optional, mode-dependent column on an append-only table needs:

* it is dropped SILENTLY when it does not apply, like the mode on a debit;
* the database refuses it without `payment_mode='upi'`, for every writer;
* the immutability trigger freezes it — which 0002 did NOT do on its own;
* a correction can change only the app, and that counts as a change.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.db import DatabaseError, IntegrityError, transaction
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.constants import Direction, PaymentMode, UpiApp
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
DETAIL = "v1:ledger-entry-detail"
STATEMENT = "v1:party-statement"


def got(client: Any, party: Any, **extra: Any) -> Any:
    """POST a ₹500 "You got" by UPI; `extra` overrides any field."""
    body = {
        "party_id": str(party.id),
        "direction": Direction.CREDIT,
        "amount": "500.00",
        "entry_date": "2026-04-01",
        "payment_mode": PaymentMode.UPI,
        **extra,
    }
    return client.post(reverse(ENTRIES), body, format="json")


def entry_url(entry: Any, suffix: str) -> str:
    return f"{reverse(DETAIL, args=[entry.id])}/{suffix}"


@pytest.fixture
def phonepe(tenant: Any, api_as: Any) -> dict:
    """A party with one ₹500 "You got" by PhonePe, posted through the real route."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    response = got(client, party, upi_app=UpiApp.PHONEPE)
    assert response.status_code == 201, response.json()
    entry = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    return {"client": client, "party": party, "entry": entry}


# ── Posting ─────────────────────────────────────────────────────────────────


def test_a_upi_receipt_records_and_returns_its_app(phonepe: dict) -> None:
    """The feature itself: the app goes in, is stored, and comes back on the row.

    Checked on the stored row, the 201 body AND the timeline, because a field
    that saves and is then missing from the read serializer is a field the
    merchant typed into and can never see again — which reads as "it didn't
    save" and gets re-entered as a second receipt.
    """
    entry = phonepe["entry"]
    assert entry.payment_mode == PaymentMode.UPI
    assert entry.upi_app == UpiApp.PHONEPE

    timeline = phonepe["client"].get(reverse(ENTRIES), {"party": str(phonepe["party"].id)})
    assert timeline.status_code == 200, timeline.json()
    assert timeline.json()["data"][0]["upi_app"] == "phonepe"
    assert timeline.json()["data"][0]["payment_mode"] == "upi"


def test_a_upi_receipt_without_an_app_is_still_accepted(tenant: Any, api_as: Any) -> None:
    """ "UPI, not sure which" is a true answer, and the key is present as null.

    Making the app required would refuse the receipt a merchant is recording
    while the customer is still at the counter, over a detail neither of them
    remembers. A null in the body (rather than a missing key) is what lets the
    client tell "not recorded" from "old server".
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = got(client, party)

    assert response.status_code == 201, response.json()
    assert "upi_app" in response.json()["data"]
    assert response.json()["data"]["upi_app"] is None


def test_an_app_with_cash_is_dropped_rather_than_refused(tenant: Any, api_as: Any) -> None:
    """The merchant picked PhonePe, then switched the mode to Cash, and saved.

    The client keeps the pick in form state so switching back does not lose it,
    and the picker is no longer on screen — so a refusal would be a form
    declining to submit for a reason it cannot show. It is EC-9's argument about
    the mode on a debit, one field further down. Stored null, not "phonepe":
    a cash receipt that claims an app is a row the cashbook cannot reconcile.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = got(client, party, payment_mode=PaymentMode.CASH, upi_app=UpiApp.PHONEPE)

    assert response.status_code == 201, response.json()
    assert response.json()["data"]["upi_app"] is None
    assert LedgerEntry.objects.get(party=party).upi_app is None


def test_an_app_on_a_debit_is_dropped_with_the_mode(tenant: Any, api_as: Any) -> None:
    """A "You gave" has no mode, so it can have no app — dropped, not refused.

    The service nulls the mode on a debit first; an app check that looked at the
    REQUESTED mode instead of the final one would keep "upi"'s app on a row
    whose mode is null, and the CHECK constraint would turn the save into a 500.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = got(client, party, direction=Direction.DEBIT, upi_app=UpiApp.GPAY)

    assert response.status_code == 201, response.json()
    entry = LedgerEntry.objects.get(party=party)
    assert entry.payment_mode is None
    assert entry.upi_app is None


def test_an_unknown_app_is_refused_naming_the_field(tenant: Any, api_as: Any) -> None:
    """A value outside the list is a client bug, and the error says which field.

    Refused rather than dropped — unlike the cash case, the merchant IS looking
    at the picker — and named, so the message lands under the right control
    instead of in a snackbar nobody can act on. Nothing is written.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = got(client, party, upi_app="venmo")

    assert response.status_code == 400
    assert "upi_app" in response.json()["error"]["details"]
    assert not LedgerEntry.objects.filter(party=party).exists()


def test_the_create_audit_row_carries_the_app(phonepe: dict) -> None:
    """§16 — the audit `after` is the full row, and a column missing from it is
    a column an auditor cannot reconstruct from the log."""
    log = AuditLog.objects.get(action=AuditAction.LEDGER_ENTRY_CREATED)
    assert log.after["upi_app"] == "phonepe"


# ── The database ────────────────────────────────────────────────────────────


def test_the_database_refuses_an_app_without_upi(tenant: Any) -> None:
    """`ck_ledger_entry_upi_app_needs_upi` — for writers that skip the service.

    The service's silent drop is only safe because this exists: an import job,
    a management command or a psql session writing "cash, PhonePe" would
    otherwise put a row in the book that every cashbook reader disagrees about.
    """
    party = PartyFactory(tenant=tenant, balance="0.00")

    with (
        pytest.raises(IntegrityError, match="ck_ledger_entry_upi_app_needs_upi"),
        transaction.atomic(),
    ):
        LedgerEntry.objects.create(
            tenant=tenant,
            party=party,
            direction=Direction.CREDIT,
            amount=Decimal("500.00"),
            entry_date=dt.date(2026, 4, 1),
            entry_type=EntryType.MANUAL_GOT,
            source_type=SourceType.MANUAL,
            payment_mode=PaymentMode.CASH,
            upi_app=UpiApp.PHONEPE,
            status=EntryStatus.POSTED,
        )


def test_the_database_refuses_to_change_a_posted_upi_app(phonepe: dict) -> None:
    """The trigger freezes the new column — and without migration 0004 it did not.

    0002's function lists the frozen columns one by one, and its docstring says
    that makes a new column frozen by default. It is the other way round: a
    column the comparison does not mention is a column an UPDATE may change
    freely. So "PhonePe" could be rewritten to "Google Pay" on a posted row, by
    `QuerySet.update()` or raw SQL, with no reversal and no trace — an edit in
    place on the table whose whole point is that there are none.
    """
    entry = phonepe["entry"]

    with pytest.raises(DatabaseError, match="immutable"), transaction.atomic():
        LedgerEntry.objects.filter(pk=entry.pk).update(upi_app=UpiApp.GPAY)
    with pytest.raises(DatabaseError, match="immutable"), transaction.atomic():
        LedgerEntry.objects.filter(pk=entry.pk).update(upi_app=None)

    entry.refresh_from_db()
    assert entry.upi_app == UpiApp.PHONEPE


# ── Corrections ─────────────────────────────────────────────────────────────


def test_a_upi_receipt_with_an_app_can_be_reversed(phonepe: dict) -> None:
    """The reversal row carries NO app, and must not try to.

    A reversal runs the other way: undoing a "You got" writes a DEBIT, and a
    debit may carry neither a mode nor (therefore) an app. Copying the app onto
    it — the obvious thing to do — would hit both CHECK constraints and make
    every PhonePe receipt impossible to reverse. The app is not lost: the
    original keeps it, and the reversal points at the original.
    """
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "reverse"), {"reason": "Customer paid twice"}, format="json"
    )

    assert response.status_code == 200, response.json()
    reversal = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert reversal.direction == Direction.DEBIT
    assert reversal.payment_mode is None
    assert reversal.upi_app is None
    assert reversal.reverses_id == phonepe["entry"].id

    original = LedgerEntry.objects.get(pk=phonepe["entry"].id)
    assert original.status == EntryStatus.REVERSED
    assert original.upi_app == UpiApp.PHONEPE


def test_correcting_only_the_app_is_a_real_correction(phonepe: dict) -> None:
    """PhonePe → Google Pay moves no money and is still a correction.

    The "nothing changed" guard compares a list of fields; one that did not list
    the app would refuse this as a no-op, leaving the merchant unable to fix the
    one detail they will later check a dispute against. The replacement carries
    the new app, and the audit row names it as the thing that changed.
    """
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"payment_mode": "upi", "upi_app": "gpay", "reason": "It was Google Pay"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    assert response.json()["data"]["upi_app"] == "gpay"
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.upi_app == UpiApp.GPAY
    assert replacement.amount == Decimal("500.00")
    assert replacement.supersedes_id == phonepe["entry"].id
    assert response.json()["meta"]["party_balance"] == "-500.00"

    log = AuditLog.objects.get(action=AuditAction.LEDGER_ENTRY_CORRECTED)
    assert log.metadata["changed_fields"] == ["upi_app"]
    assert log.before["upi_app"] == "phonepe"
    assert log.after["upi_app"] == "gpay"


def test_a_correction_that_does_not_mention_the_app_keeps_it(phonepe: dict) -> None:
    """Omitted means "as it was" — including by a client that predates the field.

    The correction drawer sends the fields it knows. A client built before
    `upi_app` existed sends `{amount, payment_mode}` and nothing about the app;
    treating the missing key as null would erase "PhonePe" from the standing
    row as a side effect of fixing a typo in the amount.
    """
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"amount": "550.00", "payment_mode": "upi", "reason": "Typed 500 for 550"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    assert LedgerEntry.objects.get(pk=response.json()["data"]["id"]).upi_app == UpiApp.PHONEPE


def test_correcting_upi_to_cash_drops_the_app(phonepe: dict) -> None:
    """The kept app must still obey the mode: corrected to cash, it goes.

    The fallback to the original's app runs BEFORE the "only with UPI" rule, so
    a merchant who corrects the mode alone does not get a cash row claiming
    PhonePe — which the CHECK constraint would turn into a 500.
    """
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"payment_mode": "cash", "reason": "Actually paid in cash"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.payment_mode == PaymentMode.CASH
    assert replacement.upi_app is None


def test_a_correction_refuses_an_unknown_app(phonepe: dict) -> None:
    """The correction route bounds the field the same way the create route does."""
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"payment_mode": "upi", "upi_app": "venmo", "reason": "Wrong app"},
        format="json",
    )

    assert response.status_code == 400
    assert "upi_app" in response.json()["error"]["details"]
    assert LedgerEntry.objects.filter(party=phonepe["party"]).count() == 1


# ── The statement ───────────────────────────────────────────────────────────


def test_the_statement_does_not_carry_the_app(phonepe: dict) -> None:
    """A statement row deliberately omits `payment_mode`; the app goes with it.

    `StatementRowSerializer` drops the mode because the statement is the shape
    a customer is shown, and the CSV has no mode column for the same reason.
    Adding the app to either would be a detail of the merchant's cashbook on a
    page somebody else reads — and a new column in a CSV whose header an
    accountant's formulas are written against.
    """
    client, party = phonepe["client"], phonepe["party"]

    body = client.get(reverse(STATEMENT, args=[party.id])).json()["data"]
    assert body["rows"], body
    assert all("upi_app" not in row and "payment_mode" not in row for row in body["rows"])

    response = client.get(reverse(STATEMENT, args=[party.id]), {"format": "csv"})
    content = b"".join(response.streaming_content).decode()
    header = content.splitlines()[0]
    assert "upi" not in header.lower()
    assert "phonepe" not in content.lower()


# ── FB-2: an omitted payment mode is the original's ─────────────────────────


def test_correcting_only_the_app_keeps_the_mode(phonepe: dict) -> None:
    """FB-2 — `{upi_app, reason}` alone is a valid correction.

    `EntryCorrectSerializer` says every omitted field means "as it was", yet
    `correct_entry` passed `payload.get("payment_mode")` — `None` when omitted —
    so a credit lost its mode and the request was refused 400 "Choose how you
    received the money" for a field the merchant never touched. Before the fix
    this answered 400.
    """
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"upi_app": "gpay", "reason": "It was Google Pay"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.payment_mode == PaymentMode.UPI
    assert replacement.upi_app == UpiApp.GPAY
    log = AuditLog.objects.get(action=AuditAction.LEDGER_ENTRY_CORRECTED)
    assert log.metadata["changed_fields"] == ["upi_app"]


def test_correcting_only_the_amount_of_a_upi_receipt_keeps_mode_and_app(phonepe: dict) -> None:
    """FB-2 — `{amount, reason}` on a PhonePe receipt keeps UPI and PhonePe.

    The same defect from the amount side: fixing a typo in the figure was
    refused because the omitted mode was read as "none". Before the fix: 400.
    """
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"amount": "550.00", "reason": "Typed 500 for 550"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.amount == Decimal("550.00")
    assert replacement.payment_mode == PaymentMode.UPI
    assert replacement.upi_app == UpiApp.PHONEPE


def test_an_explicit_null_mode_on_a_credit_is_still_refused(phonepe: dict) -> None:
    """The other half of FB-2's rule: `payment_mode: null` is a CLEAR, not an
    omission, and a "You got" must still say how the money arrived."""
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"payment_mode": None, "amount": "550.00", "reason": "Typed 500 for 550"},
        format="json",
    )

    assert response.status_code == 400
    assert "payment_mode" in response.json()["error"]["details"]


def test_correcting_a_upi_credit_into_a_debit_drops_the_kept_mode(phonepe: dict) -> None:
    """Defaulting the mode must not put one on a debit, which
    `ck_ledger_entry_debit_has_no_mode` would turn into a 500."""
    response = phonepe["client"].post(
        entry_url(phonepe["entry"], "correct"),
        {"direction": Direction.DEBIT, "reason": "It was a sale, not a receipt"},
        format="json",
    )

    assert response.status_code == 200, response.json()
    replacement = LedgerEntry.objects.get(pk=response.json()["data"]["id"])
    assert replacement.direction == Direction.DEBIT
    assert replacement.payment_mode is None
    assert replacement.upi_app is None
