"""PTY-01 — creating and editing a party.

Every test here names the defect it prevents rather than the code it covers.
Several are deliberately unglamorous: the ones asserting that a field is NOT
writable, that a deferral is really deferred, and that a message does not say a
name, are the ones that stop a quiet regression years from now.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from unittest.mock import patch

import pytest
from django.urls import reverse

from apps.parties.constants import OpeningDirection, PartyStatus
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

LIST = "v1:party-list"
DETAIL = "v1:party-detail"

# A GSTIN whose check digit is right. 27 is Maharashtra.
VALID_GSTIN = "27AAPFU0939F1ZV"


def _create(client: Any, **fields: Any) -> Any:
    body = {"name": "Ramesh Traders", **fields}
    return client.post(reverse(LIST), body, format="json")


# ── The happy path, and what it must leave behind ───────────────────────────


def test_a_party_is_created_with_the_minimum_a_shopkeeper_types(tenant: Any, api_as: Any) -> None:
    """Name and mobile is the whole interaction. Everything else is optional."""
    client, _ = api_as(tenant)
    response = _create(client, mobile="+919812345678")

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["name"] == "Ramesh Traders"
    assert data["is_customer"] is True
    assert data["balance"] == "0.00"
    assert data["status"] == PartyStatus.ACTIVE
    # BR-7 — a party with no entries has never been active, and the list orders
    # on this. A create must not fake it.
    assert data["last_activity_at"] is None


def test_the_name_is_normalised_rather_than_stored_as_typed(tenant: Any, api_as: Any) -> None:
    """A bidi override in a name renders as a DIFFERENT name everywhere.

    U+202E reverses the text after it, so a party can be made to display as
    somebody else in the list, in a reminder and on an invoice. It costs one
    line to remove and it is invisible in any code review that only reads the
    rendered string.
    """
    client, _ = api_as(tenant)
    response = _create(client, name="Ramesh\u202e   Traders ")

    assert response.status_code == 201
    assert response.json()["data"]["name"] == "Ramesh Traders"


def test_a_null_byte_in_a_name_never_reaches_the_service(tenant: Any, api_as: Any) -> None:
    """DRF refuses it at the field, before any of our own cleaning runs.

    Worth asserting rather than assuming: the service's normaliser would strip
    it too, so if this validator ever went away the only sign would be a NUL
    quietly reaching Postgres, which rejects it in a text column with a 500
    rather than a 400.
    """
    client, _ = api_as(tenant)
    assert _create(client, name="Ramesh\u0000 Traders").status_code == 400


def test_the_two_flags_are_a_real_choice(tenant: Any, api_as: Any) -> None:
    """FR-4 — a party that is neither is a contact, and this product has none."""
    client, _ = api_as(tenant)
    response = _create(client, is_customer=False, is_supplier=False)

    assert response.status_code == 400
    assert "non_field_errors" in response.json()["error"]["details"]


def test_one_party_can_be_both(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    response = _create(client, is_customer=True, is_supplier=True)
    assert response.status_code == 201
    assert response.json()["data"]["is_supplier"] is True


# ── The opening balance: stored, and now posted ─────────────────────────────


def test_the_opening_balance_is_stored_and_posted(tenant: Any, api_as: Any) -> None:
    """PTY-01 FR-9 / LED-02 FR-2 / AC-1 — and the deferral being let in.

    This test used to be called `..._and_posts_nothing`, and its docstring said
    the only thing stopping somebody wiring PTY-01 to the ledger before LED-02
    — and double-posting every opening balance when it landed — was the
    assertion below. LED-02 is that landing, so the assertion is inverted here
    rather than deleted: the columns still hold what the merchant typed, and now
    there is exactly ONE entry behind them.

    Both halves matter. Dropping the column assertions would lose PTY-01 BR-5,
    which says the record of what was requested survives a later correction of
    what it became.
    """
    from apps.ledger.constants import EntryType
    from apps.ledger.models import LedgerEntry

    client, _ = api_as(tenant)
    response = _create(
        client,
        opening_balance_amount="2300.00",
        opening_balance_direction=OpeningDirection.DEBIT,
        opening_balance_as_of="2026-04-01",
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["opening_balance_amount"] == "2300.00"
    assert data["opening_balance_direction"] == OpeningDirection.DEBIT

    party = Party.objects.get(id=data["id"])
    assert party.balance == Decimal("2300.00")
    # BR-4 in PTY-01: the stamp is set on creation only when an entry is posted,
    # so a party carrying nothing over still sorts below one that traded today.
    assert party.last_activity_at is not None

    entries = LedgerEntry.objects.filter(party=party)
    assert entries.count() == 1
    entry = entries.get()
    assert entry.entry_type == EntryType.OPENING
    assert entry.entry_date.isoformat() == "2026-04-01"
    # BR-1 — stored in English, translated on display. A row whose note is in
    # the merchant's own locale is a row no report, export or support query can
    # find.
    assert entry.note == "Opening balance"


def test_a_party_carrying_nothing_over_gets_no_entry(tenant: Any, api_as: Any) -> None:
    """The other half, and the one a wiring mistake breaks first.

    Most parties are created with no opening balance at all. An empty section
    must produce no row — not a ₹0.00 opening, which would put a line in every
    khata saying nothing and would then have to be reversed before a real
    opening could be added (BR-2).
    """
    from apps.ledger.models import LedgerEntry

    client, _ = api_as(tenant)
    response = _create(client)

    party = Party.objects.get(id=response.json()["data"]["id"])
    assert LedgerEntry.objects.filter(party=party).count() == 0
    assert party.balance == Decimal("0.00")
    assert party.last_activity_at is None


def test_the_opening_balance_cannot_be_edited_afterwards(tenant: Any, api_as: Any) -> None:
    """Changing what a party carried over is a ledger correction, not a field edit.

    The update serializer does not merely ignore these three — it does not have
    them, so a client cannot believe it set one.
    """
    client, _ = api_as(tenant)
    created = _create(client, opening_balance_amount="2300.00", opening_balance_direction="debit")
    party_id = created.json()["data"]["id"]

    response = client.patch(
        reverse(DETAIL, args=[party_id]), {"opening_balance_amount": "9999.00"}, format="json"
    )

    assert response.status_code == 200
    assert Party.objects.get(id=party_id).opening_balance_amount == Decimal("2300.00")


# ── GSTIN: one rule refuses, the other warns ────────────────────────────────


def test_a_gstin_that_fails_its_check_digit_is_refused(tenant: Any, api_as: Any) -> None:
    """A typo saved is a typo discovered on a rejected return months later."""
    client, _ = api_as(tenant)
    response = _create(client, gstin="27AAPFU0939F1ZX")

    assert response.status_code == 400
    assert "gstin" in response.json()["error"]["details"]


def test_a_state_that_disagrees_with_the_gstin_saves_with_a_warning(
    tenant: Any, api_as: Any
) -> None:
    """FR-7 — and the distinction the FRD's own validation table blurs.

    A Maharashtra-registered supplier delivering to a Karnataka site is an
    ordinary Tuesday. Refusing it would make the product wrong about the
    merchant's business, so the record saves and the warning travels in
    `meta.warnings[]` — the same channel `update_tenant()` already uses.
    """
    client, _ = api_as(tenant)
    response = _create(client, gstin=VALID_GSTIN, state_code="29")

    assert response.status_code == 201
    warnings = response.json()["meta"]["warnings"]
    assert warnings[0]["code"] == "gstin_state_mismatch"
    assert warnings[0]["gstin_state_code"] == "27"
    assert response.json()["data"]["state_code"] == "29"


def test_a_gstin_alone_fills_in_the_state_and_the_registration(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    response = _create(client, gstin=VALID_GSTIN)

    data = response.json()["data"]
    assert data["state_code"] == "27"
    assert data["gst_registration"] == "regular"


# ── Duplicate mobile ────────────────────────────────────────────────────────


def test_a_duplicate_mobile_is_refused_and_names_nobody(tenant: Any, api_as: Any) -> None:
    """The obvious message is the one thing this error must not say.

    "This number belongs to Ramesh Traders" returns another record's data to
    someone who asked about neither — and an error message is the last place an
    object-level visibility rule would ever be consulted. The id is enough: the
    client offers "Open it", and the normal retrieve decides whether the name
    may be shown.
    """
    client, _ = api_as(tenant)
    existing = PartyFactory(tenant=tenant, name="Sunita Stores", mobile="+919812345678")

    response = _create(client, mobile="+919812345678")

    assert response.status_code == 400
    details = response.json()["error"]["details"]
    assert details["existing_party_id"] == str(existing.id)
    assert details["existing_status"] == PartyStatus.ACTIVE
    assert "Sunita" not in response.content.decode()


def test_an_archived_party_still_holds_its_number(tenant: Any, api_as: Any) -> None:
    """Deliberate: the merchant's next move is to restore it, not to make a second."""
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, mobile="+919812345678", status=PartyStatus.ARCHIVED)

    response = _create(client, mobile="+919812345678")

    assert response.status_code == 400
    assert response.json()["error"]["details"]["existing_status"] == PartyStatus.ARCHIVED


def test_the_same_mobile_is_free_in_another_tenant(
    tenant: Any, two_tenants_full: Any, api_as: Any
) -> None:
    """Two shops may both know the same person. Uniqueness is per book."""
    client, _ = api_as(tenant)
    other = two_tenants_full["a"]["tenant"]
    PartyFactory(tenant=other, mobile="+919812345678")

    assert _create(client, mobile="+919812345678").status_code == 201


def test_many_parties_may_have_no_mobile(tenant: Any, api_as: Any) -> None:
    """The partial index only fires on a non-null number, and so does the check."""
    client, _ = api_as(tenant)
    assert _create(client, name="Walk-in one").status_code == 201
    assert _create(client, name="Walk-in two").status_code == 201


# ── Editing ─────────────────────────────────────────────────────────────────


def test_an_edit_changes_what_was_sent_and_nothing_else(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, name="Old Name", mobile="+919800000001", notes="keep me")

    response = client.patch(reverse(DETAIL, args=[party.id]), {"name": "New Name"}, format="json")

    assert response.status_code == 200
    party.refresh_from_db()
    assert party.name == "New Name"
    assert party.notes == "keep me"
    assert party.mobile == "+919800000001"


def test_an_archived_party_takes_notes_and_refuses_the_rest(tenant: Any, api_as: Any) -> None:
    """409, not 400: the request is well formed and the record's state says no.

    The client's move is to restore the party, which is a different button from
    fixing a field — so the status code has to be able to say which.
    """
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, status=PartyStatus.ARCHIVED)

    ok = client.patch(reverse(DETAIL, args=[party.id]), {"notes": "why"}, format="json")
    assert ok.status_code == 200

    refused = client.patch(reverse(DETAIL, args=[party.id]), {"name": "New"}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "party_archived"


# ── The controls the security review asked for ──────────────────────────────


@pytest.mark.parametrize(
    "field,value",
    [
        ("balance", "9999.00"),
        ("receivable_total", "9999.00"),
        ("payable_total", "9999.00"),
        ("status", PartyStatus.ARCHIVED),
        ("last_activity_at", "2026-01-01T00:00:00Z"),
        ("consent_at", "2026-01-01T00:00:00Z"),
    ],
)
def test_a_server_owned_field_cannot_be_set_from_the_wire(
    tenant: Any, api_as: Any, field: str, value: Any
) -> None:
    """The whole reason the write serializer is not a `ModelSerializer`.

    A `ModelSerializer` is allow-by-default: every column added to `Party` from
    now on would become writable unless somebody remembered to list it
    read-only in the same commit. These six are the ones where forgetting costs
    money, a legal claim, or another tenant's privacy.
    """
    client, _ = api_as(tenant)
    response = _create(client, **{field: value})

    assert response.status_code == 201
    party = Party.objects.get(id=response.json()["data"]["id"])
    assert party.balance == Decimal("0.00")
    assert party.status == PartyStatus.ACTIVE
    assert party.last_activity_at is None


def test_the_tenant_in_the_body_is_ignored(tenant: Any, two_tenants_full: Any, api_as: Any) -> None:
    """Mass assignment on the one field that decides who can see the row."""
    client, _ = api_as(tenant)
    other = two_tenants_full["a"]["tenant"]

    response = _create(client, tenant=str(other.id))

    assert response.status_code == 201
    assert Party.objects.get(id=response.json()["data"]["id"]).tenant_id == tenant.id


def test_another_tenants_party_is_404_on_edit_never_403(
    tenant: Any, two_tenants_full: Any, api_as: Any
) -> None:
    """Canon §0.11 rule 2. A 403 would confirm the row exists."""
    client, _ = api_as(tenant)
    theirs = PartyFactory(tenant=two_tenants_full["a"]["tenant"])

    response = client.patch(reverse(DETAIL, args=[theirs.id]), {"name": "X"}, format="json")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    "role,expected", [("owner", 201), ("admin", 201), ("staff", 201), ("accountant", 403)]
)
def test_the_permission_matrix_for_create(
    tenant: Any, api_as: Any, role: str, expected: int
) -> None:
    """An accountant reads the book and cannot touch it — which is what an accountant is."""
    client, _ = api_as(tenant, role=role)
    assert _create(client, name=f"Party for {role}").status_code == expected


@pytest.mark.parametrize("role,expected", [("owner", 200), ("staff", 200), ("accountant", 403)])
def test_the_permission_matrix_for_edit(tenant: Any, api_as: Any, role: str, expected: int) -> None:
    client, _ = api_as(tenant, role=role)
    party = PartyFactory(tenant=tenant)
    response = client.patch(reverse(DETAIL, args=[party.id]), {"name": "Edited"}, format="json")
    assert response.status_code == expected


def test_an_address_is_bounded(tenant: Any, api_as: Any) -> None:
    """`JSONField` accepts any JSON, which on a write path is a DoS shape.

    Whatever arrives is serialised, diffed for the audit row and stored, so the
    bound is the control: a flat map of short strings, which is what an address
    is.
    """
    client, _ = api_as(tenant)
    assert _create(client, billing_address={"line1": "x" * 200}).status_code == 400
    assert _create(client, name="Bela Stores", billing_address={"evil": "x"}).status_code == 400
    assert (
        _create(
            client,
            name="Chetan Hardware",
            billing_address={"line1": "Shop 4", "city": "Pune"},
        ).status_code
        == 201
    )


def test_notes_are_bounded(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    assert _create(client, notes="x" * 501).status_code == 400


def test_a_create_writes_exactly_one_audit_row(tenant: Any, api_as: Any) -> None:
    from django.apps import apps as django_apps

    audit_log = django_apps.get_model("platform", "AuditLog")
    client, _ = api_as(tenant)
    _create(client, mobile="+919812345678")

    rows = audit_log.objects.filter(action="party.created")
    assert rows.count() == 1


def test_an_edit_audits_only_what_changed(tenant: Any, api_as: Any) -> None:
    """A full snapshot on every edit puts a party's mobile, email, GSTIN and
    address into a row each time somebody fixes a typo in the notes — PII
    accumulating for no reason at all."""
    from django.apps import apps as django_apps

    audit_log = django_apps.get_model("platform", "AuditLog")
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, name="Old", mobile="+919800000002", email="a@b.test")

    client.patch(reverse(DETAIL, args=[party.id]), {"name": "New"}, format="json")

    row = audit_log.objects.filter(action="party.updated").latest("created_at")
    assert set(row.after) == {"name"}
    assert "mobile" not in row.after
    assert "email" not in row.after


def test_an_edit_that_changes_nothing_writes_no_audit_row(tenant: Any, api_as: Any) -> None:
    from django.apps import apps as django_apps

    audit_log = django_apps.get_model("platform", "AuditLog")
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, name="Same")

    client.patch(reverse(DETAIL, args=[party.id]), {"name": "Same"}, format="json")

    assert audit_log.objects.filter(action="party.updated").count() == 0


def test_a_replayed_create_returns_the_first_answer_rather_than_a_second_party(
    tenant: Any, api_as: Any
) -> None:
    """A merchant on a 2G connection taps Save, loses the response, taps again.

    A party with no mobile has no uniqueness backstop at all, so the
    idempotency key is the only thing between a dropped response and a second
    Ramesh Traders in the book.
    """
    client, _ = api_as(tenant)
    headers = {"HTTP_IDEMPOTENCY_KEY": "the-same-tap"}

    first = client.post(reverse(LIST), {"name": "Ramesh Traders"}, format="json", **headers)
    second = client.post(reverse(LIST), {"name": "Ramesh Traders"}, format="json", **headers)

    assert first.status_code == 201
    assert second.json()["data"]["id"] == first.json()["data"]["id"]
    assert Party.objects.filter(tenant=tenant, name="Ramesh Traders").count() == 1


def test_the_integrity_error_path_answers_400_rather_than_500(tenant: Any, api_as: Any) -> None:
    """The duplicate-mobile race, which every other test in this file misses.

    Two staff entering the same walk-in customer at the same moment both pass
    the pre-check — there is nothing between the SELECT and the INSERT — and the
    partial unique index decides. That path was answering **500**.

    The cause is subtle and is the reason this needs its own test: the service
    runs inside `@transaction.atomic`, so an `IntegrityError` marks the whole
    block as needing rollback, and the `except` handler's own SELECT — the one
    that looks up who has the number, to build a useful 400 — is then refused
    by Django with `TransactionManagementError`. Not an `IntegrityError`, not
    caught, straight out as a 500.

    Simulated rather than raced, because a race is not a test: the pre-check is
    patched to answer "free" so the INSERT is reached with the number already
    taken, which is exactly the state a lost race leaves.
    """
    from apps.parties.services import crud

    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Already Here", mobile="+919812345678")

    real = crud._duplicate_mobile
    calls = {"n": 0}

    def first_call_says_free(**kwargs: Any) -> Any:
        """Only the PRE-CHECK lies. The recovery lookup runs for real.

        Stubbing both would hide the defect completely: the whole failure is
        that the recovery SELECT cannot run inside a transaction the
        `IntegrityError` has already broken, and a mocked lookup never touches
        the database.
        """
        calls["n"] += 1
        return None if calls["n"] == 1 else real(**kwargs)

    with patch.object(crud, "_duplicate_mobile", side_effect=first_call_says_free):
        response = _create(client, name="Racing Entry", mobile="+919812345678")

    assert response.status_code == 400
    details = response.json()["error"]["details"]
    assert "mobile" in details
    assert details["existing_party_id"]


def test_the_edit_path_has_the_same_savepoint(tenant: Any, api_as: Any) -> None:
    """The same race, on PATCH. Two people moving two parties onto one number.

    Written separately rather than parametrised because they are two different
    `try` blocks in two different functions, and the point of the test is that
    the fix was applied to BOTH — which is exactly the kind of thing a single
    parametrised test over one code path quietly fails to check.
    """
    from apps.parties.services import crud

    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Holds The Number", mobile="+919812345678")
    moving = PartyFactory(tenant=tenant, name="Moving", mobile="+919800000099")

    real = crud._duplicate_mobile
    calls = {"n": 0}

    def first_call_says_free(**kwargs: Any) -> Any:
        calls["n"] += 1
        return None if calls["n"] == 1 else real(**kwargs)

    with patch.object(crud, "_duplicate_mobile", side_effect=first_call_says_free):
        response = client.patch(
            reverse(DETAIL, args=[moving.id]), {"mobile": "+919812345678"}, format="json"
        )

    assert response.status_code == 400
    assert "mobile" in response.json()["error"]["details"]
