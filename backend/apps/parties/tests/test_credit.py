"""PTY-06 — credit limits.

One column that has been on the party since the initial migration, and a rule
about what it means. The rule is small enough to state in a sentence — do not
let a party's exposure cross the limit the merchant set — and almost everything
here is about the cases where a sentence is not enough: a party in credit, a
limit of zero, an amount that lands exactly on the limit, and a tenant that has
switched the whole thing off.

What is NOT here is the enforcement. FR-5's four guarded operations are ledger
and sales writes, and neither app has a table yet, so `check_credit` is
complete and nothing refuses anything. The pre-flight endpoint is what makes the
rule observable today, and it refuses nothing by design.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.parties.services.credit import (
    CREDIT_MODE_SETTING_KEY,
    check_credit,
    credit_exposure,
    credit_mode,
    limit_status,
    usage_pct,
)
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

PARTIES = "v1:party-list"
CHECK = "v1:party-credit-check"


def set_mode(tenant: Any, mode: str) -> None:
    from apps.platform_app.models import TenantSetting

    TenantSetting.objects.update_or_create(
        tenant=tenant, key=CREDIT_MODE_SETTING_KEY, defaults={"value": {"mode": mode}}
    )


def check_url(party: Any) -> str:
    return reverse(CHECK, args=[party.id])


# ── Exposure, and the floor that is the whole rule ──────────────────────────


def test_exposure_is_what_the_party_owes(tenant: Any) -> None:
    """`balance` is passed as a Decimal, not a string, in every test that calls
    the service directly: `PartyFactory(balance="2500.00")` leaves the string on
    the in-memory instance until it is reloaded, and the service deliberately
    does not coerce — a `str` reaching this arithmetic is a real type error
    somewhere and should say so rather than be quietly parsed."""
    party = PartyFactory(tenant=tenant, balance=Decimal("2500.00"))

    assert credit_exposure(party) == Decimal("2500.00")


def test_a_party_who_paid_an_advance_has_no_exposure(tenant: Any) -> None:
    """BR-3, and it is the rule rather than defensiveness.

    An advance is the CUSTOMER's money sitting with the merchant. Counting it as
    negative exposure would hand them headroom beyond their limit — a customer
    ₹2,000 in credit against a ₹50,000 cap would be able to take ₹52,000, and
    the product would be lending them their own deposit back and calling it
    capacity.
    """
    party = PartyFactory(tenant=tenant, balance=Decimal("-2000.00"))

    assert credit_exposure(party) == Decimal("0.00")


def test_available_is_never_more_than_the_whole_limit(tenant: Any, api_as: Any) -> None:
    """EC-2, on the wire: ₹50,000 available, not ₹52,000."""
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("50000.00"), balance="-2000.00")
    client, _member = api_as(tenant)

    credit = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["credit"]

    assert credit["available"] == "50000.00"


# ── The percentage, which is only ever for a bar ────────────────────────────


@pytest.mark.parametrize(
    "exposure,limit,expected",
    [
        ("0.00", "5000.00", 0),
        ("2500.00", "5000.00", 50),
        ("5000.00", "5000.00", 100),
        # Half-up, so a hair over a half-percent rounds away from the merchant's
        # favour rather than towards it. 2525/5000 = 50.5%.
        ("2525.00", "5000.00", 51),
        ("2524.00", "5000.00", 50),
    ],
)
def test_the_usage_percentage(exposure: str, limit: str, expected: int) -> None:
    assert usage_pct(Decimal(exposure), Decimal(limit)) == expected


def test_a_party_with_no_limit_has_no_percentage(tenant: Any) -> None:
    """`None`, not zero. A party with no limit is not at 0% of it — they are
    outside the question, and a bar drawn at zero would say otherwise."""
    assert usage_pct(Decimal("2500.00"), None) is None


def test_a_limit_of_zero_is_a_real_limit(tenant: Any) -> None:
    """BR-1 / EC-1 — ₹0 means "no udhaar at all", and is never NULL.

    Dividing by it is not a thing to do, so anything owed against it reports the
    display clamp; the caption beside the bar then says it in rupees, which is
    the sentence a merchant can act on: "₹4,200 over the ₹0 limit".
    """
    assert usage_pct(Decimal("4200.00"), Decimal("0.00")) == 999
    assert usage_pct(Decimal("0.00"), Decimal("0.00")) == 0


def test_the_percentage_is_clamped_for_display_and_the_rupees_are_not(
    tenant: Any, api_as: Any
) -> None:
    """BR-11. A bar past ten times its own width says nothing more than one past
    three times it — but `over_by` is a fact and is never clamped."""
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance="50000.00")
    client, _member = api_as(tenant)

    credit = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["credit"]

    assert credit["usage_pct"] == 999
    assert credit["over_by"] == "49900.00"


# ── The three words the bar, the filter and the block all use ───────────────


@pytest.mark.parametrize(
    "balance,limit,expected",
    [
        ("0.00", "5000.00", "ok"),
        ("3999.99", "5000.00", "ok"),
        # Four fifths exactly is already "near": the band is inclusive at both
        # ends so that nothing falls between two states.
        ("4000.00", "5000.00", "near"),
        ("5000.00", "5000.00", "near"),
        ("5000.01", "5000.00", "over"),
        ("-500.00", "5000.00", "ok"),
    ],
)
def test_the_limit_status(balance: str, limit: str, expected: str) -> None:
    assert limit_status(max(Decimal(balance), Decimal("0.00")), Decimal(limit)) == expected


# ── The check itself ────────────────────────────────────────────────────────


def test_an_amount_that_lands_exactly_on_the_limit_is_allowed(tenant: Any) -> None:
    """EC-12, and the reason the comparison is strictly greater than.

    `>=` would make a ₹5,000 limit mean ₹4,999.99, which is not what anybody
    typing a round number means — and the merchant would have no way to spend
    the last rupee of a limit they set themselves.
    """
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"), balance=Decimal("3000.00"))

    result = check_credit(party=party, amount=Decimal("2000.00"), mode="block")

    assert result["status"] == "ok"
    assert result["over_by"] == Decimal("0.00")


def test_one_paisa_past_the_limit_is_over_it(tenant: Any) -> None:
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"), balance=Decimal("3000.00"))

    result = check_credit(party=party, amount=Decimal("2000.01"), mode="block")

    assert result["status"] == "block"
    assert result["over_by"] == Decimal("0.01")


def test_warn_mode_says_warn_and_block_mode_says_block(tenant: Any) -> None:
    """The same arithmetic, two different answers — which is the whole of FR-2.

    The service describes; it never decides. The write path that calls it turns
    `block` into a refusal, and does so inside its own transaction after locking
    the row (BR-2), because only there is the balance current.
    """
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("1000.00"), balance=Decimal("900.00"))

    warn = check_credit(party=party, amount=Decimal("500.00"), mode="warn")
    block = check_credit(party=party, amount=Decimal("500.00"), mode="block")

    assert warn["status"] == "warn"
    assert block["status"] == "block"
    assert warn["over_by"] == block["over_by"] == Decimal("400.00")


def test_mode_off_never_reports_anything(tenant: Any) -> None:
    """EC-10 / §9's "Disabled" — the limit is retained in the data for when the
    setting is turned back on, and nothing is checked while it is off."""
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance=Decimal("9000.00"))

    result = check_credit(party=party, amount=Decimal("5000.00"), mode="off")

    assert result["status"] == "ok"


def test_a_party_with_no_limit_is_never_over_it(tenant: Any) -> None:
    """BR-1 — NULL means no limit, and no limit means nothing to cross."""
    party = PartyFactory(tenant=tenant, credit_limit=None, balance=Decimal("900000.00"))

    result = check_credit(party=party, amount=Decimal("500000.00"), mode="block")

    assert result["status"] == "ok"
    assert result["limit"] is None
    assert result["available_before"] is None


# ── The mode setting ────────────────────────────────────────────────────────


def test_the_mode_defaults_to_warn(tenant: Any) -> None:
    """A rule nobody chose should never cost somebody a sale."""
    from apps.platform_app.models import TenantSetting

    TenantSetting.objects.filter(tenant=tenant, key=CREDIT_MODE_SETTING_KEY).delete()

    assert credit_mode(tenant) == "warn"


def test_an_unrecognised_mode_falls_back_rather_than_raising(tenant: Any) -> None:
    """The setting is a JSON blob that a migration, an import or a support
    script could put anything into. A book that stops taking bills because
    somebody typed "Warn" is a worse outcome than a book that warns."""
    set_mode(tenant, "Block")

    assert credit_mode(tenant) == "warn"


def test_the_mode_is_read_per_tenant(tenant: Any, other_tenant: Any) -> None:
    set_mode(tenant, "block")
    set_mode(other_tenant, "off")

    assert credit_mode(tenant) == "block"
    assert credit_mode(other_tenant) == "off"


# ── The pre-flight endpoint ─────────────────────────────────────────────────


def test_the_preflight_answers_before_the_merchant_has_finished_typing(
    tenant: Any, api_as: Any
) -> None:
    """FR-8. It answers a question and refuses nothing — a 200 even when the
    answer is `block`, because the thing that refuses is the write."""
    set_mode(tenant, "block")
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"), balance="4800.00")
    client, _member = api_as(tenant)

    response = client.get(check_url(party), {"amount": "500.00"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "block"
    assert data["limit"] == "5000.00"
    assert data["exposure_before"] == "4800.00"
    assert data["exposure_after"] == "5300.00"
    assert data["available_before"] == "200.00"
    assert data["over_by"] == "300.00"
    assert data["mode"] == "block"


def test_the_preflight_writes_nothing(tenant: Any, api_as: Any) -> None:
    """A GET, and the balance is untouched afterwards. Stated as a test because
    "cheap and idempotent, safe to call on every keystroke" is a promise the
    client is told it can rely on (FR-8, debounced 300 ms)."""
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"), balance="4800.00")
    client, _member = api_as(tenant)

    client.get(check_url(party), {"amount": "5000.00"})
    party.refresh_from_db()

    assert party.balance == Decimal("4800.00")


def test_the_preflight_refuses_an_amount_that_is_not_one(tenant: Any, api_as: Any) -> None:
    """The question is "does ADDING this cross the limit". Zero is not that
    question, and an operation that reduces exposure is never checked at all
    (BR-6)."""
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"))
    client, _member = api_as(tenant)

    assert client.get(check_url(party), {"amount": "0"}).status_code == 400
    assert client.get(check_url(party), {"amount": "-100.00"}).status_code == 400
    assert client.get(check_url(party), {"amount": "abc"}).status_code == 400
    assert client.get(check_url(party)).status_code == 400


def test_another_tenants_party_is_not_found(tenant: Any, other_tenant: Any, api_as: Any) -> None:
    """Canon §0.11 rule 2 — 404, never 403. A 403 would confirm the id exists."""
    theirs = PartyFactory(tenant=other_tenant, credit_limit=Decimal("5000.00"))
    client, _member = api_as(tenant)

    assert client.get(check_url(theirs), {"amount": "100.00"}).status_code == 404


@pytest.mark.parametrize(
    "role,expected",
    [("owner", True), ("admin", True), ("staff", False), ("accountant", False)],
)
def test_who_may_override_a_block(tenant: Any, api_as: Any, role: str, expected: bool) -> None:
    """BR-8 — a check on the ROLE, not on a codename, and the one place in this
    product where that is true.

    `permissions_override` exists so a tenant can hand a staff member any
    codename they like, and handing the counter `parties.party.write` is the
    ordinary thing to do because staff add customers. It must not thereby hand
    them the ability to lend past the limit the owner set.

    The flag is what the client draws "Override" or "Ask owner" from; a client
    that worked it out from codenames would be re-implementing a governance rule
    in TypeScript and drawing a button the server is going to refuse.
    """
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance="90.00")
    client, _member = api_as(tenant, role=role)

    response = client.get(check_url(party), {"amount": "50.00"})

    assert response.status_code == 200
    assert response.json()["data"]["can_override"] is expected


def test_an_accountant_may_still_ask(tenant: Any, api_as: Any) -> None:
    """§12 — seeing a limit and its usage is the party READ right, and that
    includes the accountant: limits appear in exports and in the aging report."""
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"))
    client, _member = api_as(tenant, role="accountant")

    assert client.get(check_url(party), {"amount": "100.00"}).status_code == 200


# ── The over-limit list ─────────────────────────────────────────────────────


def test_the_over_limit_filter_finds_exactly_who_is_over(tenant: Any, api_as: Any) -> None:
    """FR-12, and EC-12 again: a balance landing exactly on the limit is not
    over it."""
    over = PartyFactory(
        tenant=tenant, name="Over", credit_limit=Decimal("1000.00"), balance="1000.01"
    )
    PartyFactory(tenant=tenant, name="Exactly", credit_limit=Decimal("1000.00"), balance="1000.00")
    PartyFactory(tenant=tenant, name="Under", credit_limit=Decimal("1000.00"), balance="10.00")
    client, _member = api_as(tenant)

    body = client.get(reverse(PARTIES), {"credit": "over"}).json()

    assert [row["name"] for row in body["data"]] == [over.name]


def test_the_near_limit_filter_is_the_last_fifth(tenant: Any, api_as: Any) -> None:
    PartyFactory(tenant=tenant, name="Near", credit_limit=Decimal("1000.00"), balance="800.00")
    PartyFactory(
        tenant=tenant, name="Nearly near", credit_limit=Decimal("1000.00"), balance="799.99"
    )
    PartyFactory(tenant=tenant, name="Over", credit_limit=Decimal("1000.00"), balance="1200.00")
    client, _member = api_as(tenant)

    body = client.get(reverse(PARTIES), {"credit": "near"}).json()

    assert [row["name"] for row in body["data"]] == ["Near"]


def test_parties_with_no_limit_are_not_in_ANY_credit_band(tenant: Any, api_as: Any) -> None:
    """Including `ok`, which is the branch that would otherwise be useless.

    A book of three hundred parties where four have limits would answer "within
    limit" with two hundred and ninety-six people nobody has ever set a limit
    for — true, and no help at all. The filter is about the control, so it only
    returns parties the control applies to.
    """
    PartyFactory(tenant=tenant, name="No limit", credit_limit=None, balance="90000.00")
    PartyFactory(tenant=tenant, name="Within", credit_limit=Decimal("1000.00"), balance="10.00")
    client, _member = api_as(tenant)

    for band in ("over", "near", "ok"):
        names = [
            row["name"] for row in client.get(reverse(PARTIES), {"credit": band}).json()["data"]
        ]
        assert "No limit" not in names, band
    assert [
        row["name"] for row in client.get(reverse(PARTIES), {"credit": "ok"}).json()["data"]
    ] == ["Within"]


def test_the_credit_filter_ands_against_the_other_filters(tenant: Any, api_as: Any) -> None:
    PartyFactory(
        tenant=tenant,
        name="Over supplier",
        credit_limit=Decimal("100.00"),
        balance="500.00",
        is_customer=False,
        is_supplier=True,
    )
    PartyFactory(
        tenant=tenant, name="Over customer", credit_limit=Decimal("100.00"), balance="500.00"
    )
    client, _member = api_as(tenant)

    body = client.get(reverse(PARTIES), {"credit": "over", "type": "supplier"}).json()

    assert [row["name"] for row in body["data"]] == ["Over supplier"]


# ── Setting a limit ─────────────────────────────────────────────────────────


def test_a_limit_of_zero_is_saved_as_zero_and_not_as_no_limit(tenant: Any, api_as: Any) -> None:
    """BR-1 — the two are never conflated. ₹0 makes the party cash-only, which
    is a legitimate configuration (EC-1)."""
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    client.patch(
        reverse("v1:party-detail", args=[party.id]), {"credit_limit": "0.00"}, format="json"
    )
    party.refresh_from_db()

    assert party.credit_limit == Decimal("0.00")


def test_a_limit_above_the_column_is_refused_as_a_field_error(tenant: Any, api_as: Any) -> None:
    """§10's ceiling. Past ₹99,99,99,999.99 a figure is a typo rather than a
    decision, and it is refused here so the merchant gets an error on the field
    rather than a 500 from the database."""
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant)

    response = client.patch(
        reverse("v1:party-detail", args=[party.id]),
        {"credit_limit": "100000000.00"},
        format="json",
    )

    assert response.status_code == 400
    assert "credit_limit" in response.json()["error"]["details"]


def test_lowering_a_limit_below_what_is_already_owed_is_allowed(tenant: Any, api_as: Any) -> None:
    """FR-13 / BR-10 — a limit is a decision about the FUTURE.

    Refusing it would trap a merchant who has decided to stop lending to
    somebody exactly when they most want to, and it reverses nothing already
    posted. The screen says so with an inline notice rather than an error.
    """
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="47500.00", credit_limit=Decimal("50000.00"))

    response = client.patch(
        reverse("v1:party-detail", args=[party.id]),
        {"credit_limit": "10000.00"},
        format="json",
    )

    assert response.status_code == 200
    party.refresh_from_db()
    assert party.credit_limit == Decimal("10000.00")
    assert party.balance == Decimal("47500.00")


def test_clearing_a_limit_turns_the_checks_off_for_that_party(tenant: Any, api_as: Any) -> None:
    """FR-14."""
    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("50.00"), balance="40.00")

    client.patch(reverse("v1:party-detail", args=[party.id]), {"credit_limit": None}, format="json")
    party.refresh_from_db()

    assert party.credit_limit is None
    assert check_credit(party=party, amount=Decimal("99999.00"), mode="block")["status"] == "ok"


# ── The audit row an auditor actually filters on ────────────────────────────


def test_changing_a_limit_writes_its_own_audit_row(tenant: Any, api_as: Any) -> None:
    """§16 — IN ADDITION to `party.updated`, and the reason is the question it
    answers: "when did this customer's cap move, and what did they owe at the
    time". Finding that in the stream of every party edit means reading every
    typo fix in the notes."""
    from django.apps import apps as django_apps

    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="47500.00", credit_limit=Decimal("50000.00"))

    client.patch(
        reverse("v1:party-detail", args=[party.id]),
        {"credit_limit": "10000.00"},
        format="json",
    )

    row = (
        django_apps.get_model("platform", "AuditLog")
        .objects.filter(action="credit.limit.set", entity_id=party.id)
        .first()
    )
    assert row is not None
    assert row.before["credit_limit"] == "50000.00"
    assert row.after["credit_limit"] == "10000.00"
    # Not recoverable later, because the balance moves — which is what makes a
    # limit lowered below what somebody already owed provably deliberate.
    assert row.metadata["balance_at_change"] == "47500.00"


def test_editing_something_else_writes_no_credit_audit_row(tenant: Any, api_as: Any) -> None:
    """The row is a signal, and a signal that fires on every edit is noise."""
    from django.apps import apps as django_apps

    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("50000.00"))

    client.patch(
        reverse("v1:party-detail", args=[party.id]), {"notes": "Pays on Fridays"}, format="json"
    )

    assert not (
        django_apps.get_model("platform", "AuditLog")
        .objects.filter(action="credit.limit.set", entity_id=party.id)
        .exists()
    )


def test_changing_the_payment_days_also_writes_one(tenant: Any, api_as: Any) -> None:
    """FR-15 — the days have no effect on the check, and they are the other half
    of the same decision: a cap of ₹50,000 over seven days and the same cap over
    ninety are different amounts of trust."""
    from django.apps import apps as django_apps

    client, _member = api_as(tenant)
    party = PartyFactory(tenant=tenant, credit_days=7)

    client.patch(reverse("v1:party-detail", args=[party.id]), {"credit_days": 30}, format="json")

    row = (
        django_apps.get_model("platform", "AuditLog")
        .objects.filter(action="credit.limit.set", entity_id=party.id)
        .first()
    )
    assert row is not None
    assert row.after["credit_days"] == 30


# ── The mode reaches the client, because the bar depends on it ──────────────


def test_the_detail_block_carries_the_tenants_mode(tenant: Any, api_as: Any) -> None:
    """FR-10 — the bar is hidden when checks are off, and the client should not
    need a second request to find that out."""
    set_mode(tenant, "off")
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"), balance="1000.00")
    client, _member = api_as(tenant)

    credit = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["credit"]

    assert credit["mode"] == "off"
    # The limit is still sent, and still editable: it is data rather than
    # behaviour (§9, "Disabled"), and turning the setting back on must not have
    # lost anything.
    assert credit["limit"] == "5000.00"


def test_the_over_limit_count_rides_in_the_list_totals(tenant: Any, api_as: Any) -> None:
    """FR-12's chip count, in the aggregate that was already running.

    §15 rules out a separate count on every list load, because `balance >
    credit_limit` compares two columns and no index helps. Riding along in a
    scan that is already happening costs the comparison and nothing else.
    """
    PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance=Decimal("500.00"))
    PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance=Decimal("900.00"))
    PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance=Decimal("10.00"))
    PartyFactory(tenant=tenant, credit_limit=None, balance=Decimal("90000.00"))
    client, _member = api_as(tenant)

    meta = client.get(reverse(PARTIES)).json()["meta"]

    assert meta["totals"]["over_limit"] == 2
    assert meta["totals"]["count"] == 4


def test_the_over_limit_count_follows_the_filters(tenant: Any, api_as: Any) -> None:
    """It counts the FILTERED set, which is what the chip then says.

    On the default unfiltered list that is the whole book — the case the number
    is for. On a narrowed one it answers the narrower question the merchant just
    asked, rather than a number about a set they are not looking at.
    """
    PartyFactory(
        tenant=tenant,
        credit_limit=Decimal("100.00"),
        balance=Decimal("500.00"),
        is_customer=False,
        is_supplier=True,
    )
    PartyFactory(tenant=tenant, credit_limit=Decimal("100.00"), balance=Decimal("500.00"))
    client, _member = api_as(tenant)

    whole = client.get(reverse(PARTIES)).json()["meta"]["totals"]["over_limit"]
    customers = client.get(reverse(PARTIES), {"type": "customer"}).json()["meta"]["totals"]

    assert whole == 2
    assert customers["over_limit"] == 1


def test_the_list_does_not_pay_an_extra_query_for_the_count(tenant: Any, api_as: Any) -> None:
    """The reason it is in the aggregate rather than in a request of its own.

    A separate `COUNT(*)` over an unindexed two-column comparison, on every
    list load, is exactly what §15 says not to do. This asserts the SHAPE — the
    number of queries the list runs is unchanged by the count existing — rather
    than an absolute figure, which `tests/performance/test_query_budgets.py`
    owns.
    """
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    PartyFactory.create_batch(3, tenant=tenant, credit_limit=Decimal("100.00"))
    client, _member = api_as(tenant)
    client.get(reverse(PARTIES))  # warm the auth and module-gate reads

    with CaptureQueriesContext(connection) as captured:
        client.get(reverse(PARTIES))

    over_limit_scans = [
        q for q in captured.captured_queries if "credit_limit" in q["sql"] and "COUNT" in q["sql"]
    ]
    # One aggregate query mentions it, and it is the same one that computes the
    # receivable and payable totals.
    assert len(over_limit_scans) == 1, [q["sql"] for q in over_limit_scans]
