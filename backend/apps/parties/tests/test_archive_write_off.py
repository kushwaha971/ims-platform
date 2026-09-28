"""PTY-04 FR-3 — archiving a party who still owes, by writing the balance off.

The write-off is the one escape from the balance guard, and it crosses the app
boundary the import matrix exists to hold: the endpoint is `parties`', the entry
is the `ledger`'s. So these tests are about three things at once — the money
(one entry, the right direction, the balance exactly zero, the cache agreeing
with a replay), the gates (who may forgive a debt, and whether the ledger is on
at all), and the seam (a deployment with no ledger answers a 4xx, not a 500).

Balances are built by POSTING entries through the real ledger route rather than
by setting the column, wherever the test asserts anything about the cache: a
factory-made balance has no entries behind it, and `recalc_balances` would call
it drift.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.constants import Direction
from apps.common.dates import tenant_today
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import computed_balance
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"


def archive_url(party: Any) -> str:
    return reverse("v1:party-archive", args=[party.id])


def restore_url(party: Any) -> str:
    return reverse("v1:party-restore", args=[party.id])


def give(client: Any, party: Any, amount: str, entry_date: str = "2026-04-01") -> None:
    """A "You gave" through the real route — the party owes more."""
    response = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.DEBIT,
            "amount": amount,
            "entry_date": entry_date,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()


def got(client: Any, party: Any, amount: str, entry_date: str = "2026-04-01") -> None:
    """A "You got" through the real route — the party owes less."""
    response = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.CREDIT,
            "amount": amount,
            "entry_date": entry_date,
            "payment_mode": "cash",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()


@pytest.fixture
def owing(tenant: Any, api_as: Any) -> dict:
    """A party who owes ₹2,300, built from two real entries, and an owner client."""
    client, member = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00", name="Ramesh Traders")
    give(client, party, "2800.00", "2026-04-01")
    got(client, party, "500.00", "2026-05-01")
    party.refresh_from_db()
    assert party.balance == Decimal("2300.00")
    return {"client": client, "member": member, "party": party}


def write_off_body(**write_off: Any) -> dict:
    return {"reason": "No longer trading", "write_off": {"reason": "Cannot recover", **write_off}}


# ── The money ───────────────────────────────────────────────────────────────


def test_a_receivable_is_written_off_with_one_credit_and_the_party_archived(owing: dict) -> None:
    """AC-3 / T-PTY-04-5 — the whole feature in one assertion block.

    ₹2,300 owed and written off: exactly one `write_off` entry, a CREDIT for
    ₹2,300 (a credit is what retires a receivable), the merchant's reason as both
    note and reason, the balance and both caches at zero, the party archived and
    the entry id in `meta` so the client can put the row on the timeline. If any
    one of these drifts, the receivable total the merchant reads is wrong.
    """
    party = owing["party"]

    response = owing["client"].post(
        archive_url(party), write_off_body(entry_date="2026-09-18"), format="json"
    )

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["data"]["status"] == "archived"
    entry_id = body["meta"]["write_off_entry_id"]

    entry = LedgerEntry.objects.get(pk=entry_id)
    assert entry.entry_type == EntryType.WRITE_OFF
    assert entry.source_type == SourceType.MANUAL
    assert entry.direction == Direction.CREDIT
    assert entry.amount == Decimal("2300.00")
    assert entry.entry_date == dt.date(2026, 9, 18)
    assert entry.note == "Cannot recover"
    assert entry.reason == "Cannot recover"
    assert entry.status == EntryStatus.POSTED
    assert entry.payment_mode is None
    assert LedgerEntry.objects.filter(party=party, entry_type=EntryType.WRITE_OFF).count() == 1

    party.refresh_from_db()
    assert party.status == PartyStatus.ARCHIVED
    assert party.balance == Decimal("0.00")
    assert party.receivable_total == Decimal("0.00")
    assert party.payable_total == Decimal("0.00")


def test_a_payable_is_written_off_with_a_debit(tenant: Any, api_as: Any) -> None:
    """The direction is OPPOSITE to the balance's sign, not always a credit.

    A supplier the merchant owes ₹900 is retired by a DEBIT. A credit here would
    double the payable to ₹1,800, and the guard would then refuse the archive —
    or worse, a guard that checked only the sign would let it through.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    got(client, party, "900.00")

    response = client.post(archive_url(party), write_off_body(), format="json")

    assert response.status_code == 200, response.json()
    entry = LedgerEntry.objects.get(pk=response.json()["meta"]["write_off_entry_id"])
    assert entry.direction == Direction.DEBIT
    assert entry.amount == Decimal("900.00")
    party.refresh_from_db()
    assert party.balance == Decimal("0.00")
    assert party.payable_total == Decimal("0.00")
    assert party.status == PartyStatus.ARCHIVED


def test_the_entry_date_defaults_to_the_tenants_today(owing: dict) -> None:
    """Optional, and "today" is the TENANT's today — LED-01 EC-8's lesson.

    The server's date is UTC; for five and a half hours after midnight IST the
    two disagree, and a default taken from the server would date a write-off
    made at 00:30 yesterday.
    """
    response = owing["client"].post(archive_url(owing["party"]), write_off_body(), format="json")

    assert response.status_code == 200, response.json()
    entry = LedgerEntry.objects.get(pk=response.json()["meta"]["write_off_entry_id"])
    assert entry.entry_date == tenant_today(owing["party"].tenant)


def test_the_cache_agrees_with_a_full_replay_after_a_write_off(owing: dict) -> None:
    """The write-off moves the balance through the ledger's own machinery.

    `computed_balance` is what `recalc_balances` compares the cache against — the
    sum of every row, by a different route from the increment that maintains the
    column. A write-off that set `balance = 0` directly instead of posting through
    `apply_entry` would pass every other test in this file and show here as ₹2,300
    of drift on the nightly report.
    """
    party = owing["party"]

    owing["client"].post(archive_url(party), write_off_body(), format="json")

    party.refresh_from_db()
    assert party.balance == computed_balance(tenant=party.tenant, party_id=party.id)
    assert party.balance == Decimal("0.00")


def test_the_locked_balance_is_written_off_not_the_one_read_earlier(owing: dict) -> None:
    """The amount forgiven is the balance under `FOR UPDATE`, never a stale read.

    The service is handed a `Party` the view loaded before the lock. Here that
    instance says ₹2,300 while the row, after another device posted ₹500, says
    ₹2,800. Writing off the in-memory figure would archive a party with ₹500
    still on the khata — a residue nobody can see, because archived parties
    leave the list.
    """
    from apps.common.context import Ctx
    from apps.parties.services.archive import archive_party

    party = owing["party"]
    stale = Party.objects.get(pk=party.pk)
    give(owing["client"], party, "500.00", "2026-06-01")

    archived, entry_id = archive_party(
        ctx=Ctx(tenant=party.tenant, actor=owing["member"].user),
        party=stale,
        write_off={"reason": "Cannot recover"},
    )

    assert LedgerEntry.objects.get(pk=entry_id).amount == Decimal("2800.00")
    archived.refresh_from_db()
    assert archived.balance == Decimal("0.00")
    assert archived.status == PartyStatus.ARCHIVED


# ── Refusals, and that a refusal writes nothing ─────────────────────────────


def assert_nothing_written(party: Any, balance: str) -> None:
    party.refresh_from_db()
    assert party.status == PartyStatus.ACTIVE
    assert party.balance == Decimal(balance)
    assert not LedgerEntry.objects.filter(party=party, entry_type=EntryType.WRITE_OFF).exists()


def test_a_reason_too_short_is_refused_under_write_off_reason(owing: dict) -> None:
    """FRD §10 — `details.write_off.reason`, 3–160 characters.

    The key matters as much as the status: the dialog has two reason fields (why
    archive, why forgive), and an error keyed `reason` would light up the wrong
    one.
    """
    party = owing["party"]

    response = owing["client"].post(
        archive_url(party), {"write_off": {"reason": "no"}}, format="json"
    )

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert "reason" in error["details"]["write_off"]
    assert_nothing_written(party, "2300.00")


def test_a_missing_write_off_reason_is_refused(owing: dict) -> None:
    """Required: a forgiven debt with no reason is a click-through, not a decision."""
    party = owing["party"]

    response = owing["client"].post(archive_url(party), {"write_off": {}}, format="json")

    assert response.status_code == 400
    assert "reason" in response.json()["error"]["details"]["write_off"]
    assert_nothing_written(party, "2300.00")


def test_a_future_entry_date_is_refused(owing: dict) -> None:
    """The ledger's own date rule, not a second copy of it.

    LED-02's opening balance first shipped with its own validation and accepted
    a date in the year 202600 while an ordinary entry refused it. A write-off is
    a third write path; this proves it goes through the shared validator.
    """
    party = owing["party"]
    tomorrow = tenant_today(party.tenant) + dt.timedelta(days=1)

    response = owing["client"].post(
        archive_url(party), write_off_body(entry_date=tomorrow.isoformat()), format="json"
    )

    assert response.status_code == 400
    assert "entry_date" in response.json()["error"]["details"]["write_off"]
    assert_nothing_written(party, "2300.00")


def test_a_date_before_the_khatas_first_entry_is_refused(owing: dict) -> None:
    """FRD §10 — ≥ the party's earliest entry date.

    Backdating inside the khata is legal (EC-13); dating a write-off before the
    first thing that ever happened with this person would put the forgiveness
    above the debt in their statement.
    """
    party = owing["party"]

    response = owing["client"].post(
        archive_url(party), write_off_body(entry_date="2026-03-31"), format="json"
    )

    assert response.status_code == 400
    assert "entry_date" in response.json()["error"]["details"]["write_off"]
    assert_nothing_written(party, "2300.00")


def test_a_confirmed_amount_that_differs_is_refused_with_the_current_balance(
    owing: dict,
) -> None:
    """The merchant ticked "I understand ₹2,300 is written off"; the balance is now ₹2,800.

    Writing off ₹2,800 would forgive ₹500 they never agreed to. 409
    `balance_changed` carries the current figure so the dialog redraws with it
    and asks again, and nothing — no entry, no archive — is written.
    """
    party = owing["party"]
    give(owing["client"], party, "500.00", "2026-06-01")

    response = owing["client"].post(
        archive_url(party), write_off_body(amount="2300.00"), format="json"
    )

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "balance_changed"
    assert error["details"]["balance"] == "2800.00"
    assert error["details"]["amount"] == "2800.00"
    assert error["details"]["balance_label"] == "receivable"
    assert error["details"]["confirmed_amount"] == "2300.00"
    assert_nothing_written(party, "2800.00")


def test_a_confirmed_amount_that_matches_is_accepted(owing: dict) -> None:
    """The pin is a check, not an input: a matching amount changes nothing."""
    response = owing["client"].post(
        archive_url(owing["party"]), write_off_body(amount="2300.00"), format="json"
    )

    assert response.status_code == 200, response.json()
    entry = LedgerEntry.objects.get(pk=response.json()["meta"]["write_off_entry_id"])
    assert entry.amount == Decimal("2300.00")


def test_a_write_off_for_a_party_who_owes_nothing_is_refused(tenant: Any, api_as: Any) -> None:
    """400 `nothing_to_write_off`, chosen over quietly archiving.

    A client that sends a write-off for a zero balance has lost track of the
    figure it is showing the merchant. Archiving anyway would succeed and hide
    exactly the bug that will next write off the wrong amount; the plain archive
    (no `write_off`) is one field away.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = client.post(archive_url(party), write_off_body(), format="json")

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "nothing_to_write_off"
    party.refresh_from_db()
    assert party.status == PartyStatus.ACTIVE
    assert not LedgerEntry.objects.filter(party=party).exists()


def test_an_archived_party_cannot_be_written_off(tenant: Any, api_as: Any) -> None:
    """The state check comes first: an archived khata is closed to every write."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00", status="archived")

    response = client.post(archive_url(party), write_off_body(), format="json")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "party_already_archived"


# ── Who may forgive a debt ──────────────────────────────────────────────────


@pytest.mark.parametrize("role", ["staff", "accountant"])
def test_staff_and_accountants_cannot_write_off(owing: dict, api_as: Any, role: str) -> None:
    """§12 — archive-with-write-off is owner and admin only, as archive is."""
    client, _ = api_as(owing["party"].tenant, role=role)

    response = client.post(archive_url(owing["party"]), write_off_body(), format="json")

    assert response.status_code == 403
    assert_nothing_written(owing["party"], "2300.00")


def test_an_admin_may_write_off(owing: dict, api_as: Any) -> None:
    client, _ = api_as(owing["party"].tenant, role="admin")

    response = client.post(archive_url(owing["party"]), write_off_body(), format="json")

    assert response.status_code == 200, response.json()


def test_archive_rights_without_ledger_write_cannot_write_off(owing: dict, api_as: Any) -> None:
    """T-PTY-04-12 — the write-off needs `ledger.entry.write` ON TOP OF archive rights.

    An admin with a `deny` override on `ledger.entry.write` may still file a
    settled party away, and may not forgive a debt, because forgiving one posts
    a ledger entry and they have been told not to post any. A check that looked
    only at the route's `parties.party.delete` would let them through.
    """
    tenant = owing["party"].tenant
    client, member = api_as(tenant, role="admin")
    member.permissions_override = {"deny": ["ledger.entry.write"]}
    member.save(update_fields=["permissions_override"])

    response = client.post(archive_url(owing["party"]), write_off_body(), format="json")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"
    assert_nothing_written(owing["party"], "2300.00")

    settled = PartyFactory(tenant=tenant, balance="0.00")
    assert client.post(archive_url(settled), {}, format="json").status_code == 200


def test_a_tenant_with_the_ledger_switched_off_cannot_write_off(owing: dict) -> None:
    """`module_disabled`, not `permission_denied` — Part 20 §20.5.5's order.

    `permissions_for` strips every `ledger.*` codename from a tenant whose ledger
    is off, so a codename check alone would tell the OWNER to go and ask for
    rights. The entitlement answer is the true one.
    """
    party = owing["party"]
    tenant = party.tenant
    tenant.enabled_modules = [m for m in (tenant.enabled_modules or []) if m != "ledger"]
    tenant.save(update_fields=["enabled_modules"])

    response = owing["client"].post(archive_url(party), write_off_body(), format="json")

    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] == "module_disabled"
    assert error["details"]["module"] == "ledger"
    assert_nothing_written(party, "2300.00")


def test_a_deployment_without_a_ledger_answers_4xx_not_500(owing: dict, monkeypatch: Any) -> None:
    """The port with nothing plugged in is a clear refusal, never `None()`.

    `parties` reaches the ledger only through the handler `LedgerConfig.ready()`
    registers. Unregistered — a build without the ledger — the endpoint must say
    so as `module_disabled` rather than crash calling a missing function.
    """
    from apps.parties.services import write_off as port

    monkeypatch.setattr(port, "_handler", None)

    response = owing["client"].post(archive_url(owing["party"]), write_off_body(), format="json")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "module_disabled"
    assert_nothing_written(owing["party"], "2300.00")


def test_the_ledger_registers_the_write_off_handler_at_startup() -> None:
    """The adapter is in the slot, and it is the ledger's.

    Every test above would still pass through the registry if some other module
    had registered a handler; this pins which one the product runs.
    """
    from apps.ledger.services.write_off import write_off_party_balance
    from apps.parties.services.write_off import get_write_off_handler

    assert get_write_off_handler() is write_off_party_balance


def test_a_second_different_handler_is_refused() -> None:
    """Two apps each believing they own the write-off is a start-up error."""
    from django.core.exceptions import ImproperlyConfigured

    from apps.parties.services.write_off import register_write_off_handler

    with pytest.raises(ImproperlyConfigured):
        register_write_off_handler(lambda **kwargs: {})


# ── After the write-off ─────────────────────────────────────────────────────


def test_restore_does_not_reverse_the_write_off(owing: dict) -> None:
    """FR-4 — the write-off was a real financial event, not part of the archive.

    Restoring puts the party back on the list at a zero balance with the entry
    still standing. Un-writing the money on restore would resurrect a debt the
    merchant decided to forgive, silently, as a side effect of a different act.
    """
    party = owing["party"]
    entry_id = (
        owing["client"]
        .post(archive_url(party), write_off_body(), format="json")
        .json()["meta"]["write_off_entry_id"]
    )

    response = owing["client"].post(restore_url(party), {}, format="json")

    assert response.status_code == 200
    party.refresh_from_db()
    assert party.status == PartyStatus.ACTIVE
    assert party.balance == Decimal("0.00")
    assert LedgerEntry.objects.get(pk=entry_id).status == EntryStatus.POSTED


def test_a_write_off_is_reversible_through_led03_once_the_party_is_restored(
    owing: dict,
) -> None:
    """BR-4 — "reversible only through LED-03", and LED-03 refuses an archived khata.

    The FRD imagines reversing the write-off while the party stays archived,
    leaving an archived party with a balance. LED-03's `_locked_open_party`
    refuses any correction on an archived party, deliberately, so a balance
    never moves on somebody who appears in no list. The two meet here: reverse
    is refused until restore, and after restore it brings the ₹2,300 back, and
    the cache still agrees with a replay.
    """
    party = owing["party"]
    entry_id = (
        owing["client"]
        .post(archive_url(party), write_off_body(), format="json")
        .json()["meta"]["write_off_entry_id"]
    )
    reverse_url = f"{reverse('v1:ledger-entry-detail', args=[entry_id])}/reverse"

    refused = owing["client"].post(reverse_url, {"reason": "Paid after all"}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "party_archived"

    owing["client"].post(restore_url(party), {}, format="json")
    reversed_ = owing["client"].post(reverse_url, {"reason": "Paid after all"}, format="json")

    assert reversed_.status_code == 200, reversed_.json()
    party.refresh_from_db()
    assert party.balance == Decimal("2300.00")
    assert party.status == PartyStatus.ACTIVE
    assert party.balance == computed_balance(tenant=party.tenant, party_id=party.id)


def test_a_replayed_write_off_posts_nothing_twice(owing: dict) -> None:
    """Canon rule 5, where it costs money rather than confidence.

    The response to a write-off is lost on a 2G connection and the client retries
    with the same key. The replay returns the original 200 and the original
    entry id; the ledger holds one write-off, not two — a second would push the
    balance to −₹2,300 on a party nobody can see.
    """
    party = owing["party"]
    headers = {"HTTP_IDEMPOTENCY_KEY": "write-off-once"}

    first = owing["client"].post(archive_url(party), write_off_body(), format="json", **headers)
    second = owing["client"].post(archive_url(party), write_off_body(), format="json", **headers)

    assert first.status_code == 200, first.json()
    assert second.status_code == 200
    assert second.json()["meta"]["write_off_entry_id"] == first.json()["meta"]["write_off_entry_id"]
    assert LedgerEntry.objects.filter(party=party, entry_type=EntryType.WRITE_OFF).count() == 1
    party.refresh_from_db()
    assert party.balance == Decimal("0.00")


def test_a_retry_without_a_key_is_refused_and_posts_nothing(owing: dict) -> None:
    """No key, second attempt: 409 `party_already_archived`, and still one entry."""
    party = owing["party"]

    owing["client"].post(archive_url(party), write_off_body(), format="json")
    second = owing["client"].post(archive_url(party), write_off_body(), format="json")

    assert second.status_code == 409
    assert LedgerEntry.objects.filter(party=party, entry_type=EntryType.WRITE_OFF).count() == 1


def test_bulk_archive_refuses_a_write_off(owing: dict) -> None:
    """BR-10 — never in bulk, and said out loud rather than silently dropped.

    DRF ignores an unknown key, so a client that sent `write_off` to the bulk
    endpoint would get the owing party back in `skipped` and believe the server
    had declined on the merits. Refusing the body names the actual rule.
    """
    party = owing["party"]

    response = owing["client"].post(
        reverse("v1:party-bulk-archive"),
        {"ids": [str(party.id)], "write_off": {"reason": "Cannot recover"}},
        format="json",
    )

    assert response.status_code == 400
    assert "write_off" in response.json()["error"]["details"]
    assert_nothing_written(party, "2300.00")


def test_both_audit_rows_are_written_and_point_at_each_other(owing: dict) -> None:
    """FR-7(c) / FRD §16 — the archive row names the entry; the entry row names the archive.

    `party.archived` carries `write_off_entry_id` and the balance BEFORE the
    write-off (₹2,300 forgiven, not "archived at 0.00"); `ledger.entry.created`
    carries the full row and `via='party_archive', write_off=true`, so an auditor
    listing entry creates can tell a forgiven debt from a typed one.
    """
    party = owing["party"]

    response = owing["client"].post(archive_url(party), write_off_body(), format="json")
    entry_id = response.json()["meta"]["write_off_entry_id"]

    archived = AuditLog.objects.get(action=AuditAction.PARTY_ARCHIVED, entity_id=party.id)
    assert archived.metadata["write_off_entry_id"] == entry_id
    assert archived.metadata["reason"] == "No longer trading"
    assert archived.before["balance"] == "2300.00"
    assert archived.after["balance"] == "0.00"

    created = AuditLog.objects.get(action=AuditAction.LEDGER_ENTRY_CREATED, entity_id=entry_id)
    assert created.metadata["via"] == "party_archive"
    assert created.metadata["write_off"] is True
    assert created.after["entry_type"] == EntryType.WRITE_OFF
    assert created.after["amount"] == "2300.00"
    assert created.after["reason"] == "Cannot recover"


def test_a_plain_archive_carries_no_write_off_meta(tenant: Any, api_as: Any) -> None:
    """A key that is present only when true, so the client never reads a null id."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    body = client.post(archive_url(party), {}, format="json").json()

    assert "write_off_entry_id" not in (body.get("meta") or {})
    row = AuditLog.objects.get(action=AuditAction.PARTY_ARCHIVED, entity_id=party.id)
    assert "write_off_entry_id" not in row.metadata


# ── I-4: another tenant's party ─────────────────────────────────────────────


@pytest.mark.parametrize("with_write_off", [False, True])
def test_another_tenant_cannot_archive_or_write_off_a_party(
    with_write_off: bool, owing: dict, other_tenant: Any, api_as: Any
) -> None:
    """I-4 — tenant B posting to tenant A's `/parties/{id}/archive`, with and
    without a write-off, is 404 and writes nothing: no entry, no audit row, the
    balance and status exactly as they were.

    A 403 would confirm the id exists (canon §0.11 rule 2); a write-off that
    ran before the lookup would forgive another shop's debt.
    """
    party = owing["party"]
    intruder, _ = api_as(other_tenant)
    entries_before = LedgerEntry.objects.filter(party=party).count()
    audit_before = AuditLog.objects.count()
    body = write_off_body(amount="2300.00") if with_write_off else {"reason": "Mine now"}

    response = intruder.post(archive_url(party), body, format="json")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    party.refresh_from_db()
    assert party.status == PartyStatus.ACTIVE
    assert party.balance == Decimal("2300.00")
    assert LedgerEntry.objects.filter(party=party).count() == entries_before
    assert AuditLog.objects.count() == audit_before
