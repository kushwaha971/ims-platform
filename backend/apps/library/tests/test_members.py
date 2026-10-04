"""B07 — memberships, fees, deposits, party role, archive guard (LIB-04; T-LIB-04-1…7)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.ledger.models import LedgerEntry
from apps.library.models import LibraryMembership, LibraryMembershipType
from apps.library.services import members
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal
MEMBERS = "v1:library-members"


def _type(tenant: Any, **over: Any) -> LibraryMembershipType:
    data = {
        "name": f"Student {LibraryMembershipType.objects.count()}",
        "validity_months": 6,
        "admission_fee": D("50.00"),
        "fee_amount": D("150.00"),
        "deposit_amount": D("500.00"),
    }
    data.update(over)
    return LibraryMembershipType.objects.create(tenant=tenant, **data)


def _cash(amount: str) -> dict:
    return {"mode_breakup": [{"mode": "cash", "amount": amount}]}


def _enrol(client: Any, tenant: Any, party: Any = None, key: str = "k", **body: Any) -> Any:
    kind = body.pop("kind", None) or _type(tenant)
    payload = {"membership_type_id": str(kind.id), **body}
    if party is not None:
        payload["party_id"] = str(party.id)
    elif "party" not in payload:
        payload["party"] = {"name": "Asha Kulkarni", "mobile": "9876543210"}
    return client.post(reverse(MEMBERS), payload, format="json", HTTP_IDEMPOTENCY_KEY=key)


def _url(name: str, membership_id: Any) -> str:
    return reverse(f"v1:library-member-{name}", args=[membership_id])


# ── BR-1, BR-2 ──────────────────────────────────────────────────────────────

TODAY = dt.date(2026, 10, 10)


@pytest.mark.parametrize(
    "status, suspended_until, valid_until, expected",
    [
        ("active", None, None, "active"),
        ("active", None, TODAY, "active"),
        ("active", None, TODAY - dt.timedelta(days=1), "expired"),
        ("suspended", None, None, "suspended"),
        ("suspended", TODAY, None, "suspended"),
        ("suspended", TODAY - dt.timedelta(days=1), None, "active"),
        ("suspended", TODAY - dt.timedelta(days=1), TODAY - dt.timedelta(days=1), "expired"),
        ("closed", None, TODAY + dt.timedelta(days=9), "closed"),
    ],
)
def test_effective_status(
    status: str, suspended_until: Any, valid_until: Any, expected: str
) -> None:
    """T-LIB-04-1 — no job flips a status, so a missed job never leaves a member wrongly
    active: a suspension past its date lifts itself, a lapsed membership expires itself."""
    m = LibraryMembership(status=status, suspended_until=suspended_until, valid_until=valid_until)
    assert members.effective_status(m, TODAY) == expected


def test_validity_is_months_minus_a_day_clamped_to_month_end() -> None:
    """BR-2 — 1 Oct for 6 months ends 31 Mar; 31 Aug for 6 months ends 27 Feb, not 2 Mar."""
    assert members.valid_until_for(dt.date(2026, 10, 1), 6) == dt.date(2027, 3, 31)
    assert members.valid_until_for(dt.date(2026, 8, 31), 6) == dt.date(2027, 2, 27)
    assert members.valid_until_for(dt.date(2026, 8, 31), None) is None


# ── enrol (FR-2…FR-4; T-LIB-04-2) ───────────────────────────────────────────


def test_enrol_with_both_blocks_records_two_payments_and_keeps_the_deposit_off_the_balance(
    api_as: Any, library_on: Any
) -> None:
    client, _ = api_as(library_on, role="staff")
    response = _enrol(
        client,
        library_on,
        collect_fees=_cash("200.00"),
        collect_deposit=_cash("500.00"),
        group_label="9-B",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["data"]["member_number"] == "M-0001"
    assert len(body["meta"]["payments"]) == 2
    assert [c["kind"] for c in body["meta"]["charges"]] == ["admission_fee", "membership_fee"]
    assert all(c["status"] == "paid" for c in body["meta"]["charges"])
    party = Party.objects.get(name="Asha Kulkarni")
    assert (party.balance, party.deposit_held) == (D("0.00"), D("500.00"))
    charges = LedgerEntry.objects.filter(party=party, entry_type="charge")
    assert sorted(charges.values_list("amount", flat=True)) == [D("50.00"), D("150.00")]
    assert set(charges.values_list("bucket", flat=True)) == {"main"}
    assert body["data"]["blocks"] == []


def test_enrol_without_collecting_leaves_fees_owed_and_blocks_on_the_deposit(
    api_as: Any, library_on: Any
) -> None:
    """D31 — a type that requires its deposit blocks borrowing until it is held."""
    client, _ = api_as(library_on, role="staff")
    body = _enrol(client, library_on).json()
    assert body["data"]["dues_amount"] == "200.00"
    assert [b["code"] for b in body["data"]["blocks"]] == ["deposit_not_received"]


def test_a_party_has_one_membership_and_a_closed_one_rejoins_on_the_same_row(
    api_as: Any, library_on: Any
) -> None:
    """BR-7, C10, EC-5 — the second enrol is 409 naming the first; a closed member re-joins
    with the number they had."""
    owner, _ = api_as(library_on, role="owner")
    party = PartyFactory(tenant=library_on)
    kind = _type(library_on, deposit_amount=D("0"))
    first = _enrol(owner, library_on, party, kind=kind).json()["data"]
    again = _enrol(owner, library_on, party, key="k2", kind=kind)
    assert again.status_code == 409
    assert again.json()["error"]["details"]["membership_id"] == first["membership_id"]
    owner.post(_url("close", first["membership_id"]), {"reason": "Left town"}, format="json")
    rejoined = owner.post(
        _url("rejoin", first["membership_id"]),
        {"membership_type_id": str(kind.id)},
        format="json",
        HTTP_IDEMPOTENCY_KEY="k3",
    )
    assert rejoined.status_code == 200, rejoined.content
    data = rejoined.json()["data"]
    assert (data["member_number"], data["effective_status"]) == (first["member_number"], "active")
    assert LibraryMembership.objects.filter(party=party).count() == 1


def test_a_typed_member_number_raises_the_counter_and_cannot_be_a_copy(
    api_as: Any, library_on: Any
) -> None:
    """G25, BR-8 — a school admission number typed as M-0042 moves the counter past it; a
    number that is already a copy's would make the counter's scan guess."""
    from apps.library.models import LibraryCopy, LibraryTitle

    owner, _ = api_as(library_on, role="owner")
    kind = _type(library_on, deposit_amount=D("0"))
    typed = _enrol(
        owner, library_on, PartyFactory(tenant=library_on), kind=kind, member_number="M-0042"
    )
    assert typed.status_code == 201, typed.content
    nxt = _enrol(owner, library_on, PartyFactory(tenant=library_on), key="k2", kind=kind)
    assert nxt.json()["data"]["member_number"] == "M-0043"
    title = LibraryTitle.objects.create(tenant=library_on, title="Godaan")
    LibraryCopy.objects.create(
        tenant=library_on, title=title, accession_number="1024", accession_sort="1024"
    )
    clash = _enrol(
        owner,
        library_on,
        PartyFactory(tenant=library_on),
        key="k3",
        kind=kind,
        member_number="1024",
    )
    assert clash.json()["error"]["code"] == "library_code_ambiguous"


def test_a_new_copy_cannot_take_a_member_number(api_as: Any, library_on: Any) -> None:
    """BR-8 the other way round: the catalogue refuses a number a member already wears."""
    owner, _ = api_as(library_on, role="owner")
    kind = _type(library_on, deposit_amount=D("0"))
    _enrol(owner, library_on, PartyFactory(tenant=library_on), kind=kind, member_number="2048")
    created = owner.post(
        reverse("v1:library-titles"),
        {"title": "Nirmala", "copies": {"count": 1, "numbers": ["2048"]}},
        format="json",
        HTTP_IDEMPOTENCY_KEY="t1",
    )
    assert created.json()["error"]["code"] == "library_code_ambiguous"


# ── renew (FR-5, BR-3; T-LIB-04-3) ──────────────────────────────────────────


@pytest.mark.parametrize(
    "renewed_on, starts, ends",
    [
        (dt.date(2027, 3, 20), dt.date(2027, 4, 1), dt.date(2027, 9, 30)),
        (dt.date(2027, 4, 10), dt.date(2027, 4, 10), dt.date(2027, 10, 9)),
    ],
)
def test_renewal_starts_after_the_old_end_or_today(
    api_as: Any, library_on: Any, monkeypatch: Any, renewed_on: Any, starts: Any, ends: Any
) -> None:
    owner, _ = api_as(library_on, role="owner")
    body = _enrol(owner, library_on, starts_on=tenant_today(library_on).isoformat()).json()["data"]
    LibraryMembership.objects.filter(pk=body["membership_id"]).update(
        starts_on=dt.date(2026, 10, 1), valid_until=dt.date(2027, 3, 31)
    )
    monkeypatch.setattr(members, "tenant_today", lambda _t, **_k: renewed_on)
    renewed = owner.post(
        _url("renew", body["membership_id"]), {}, format="json", HTTP_IDEMPOTENCY_KEY="r"
    )
    assert renewed.status_code == 200, renewed.content
    assert renewed.json()["data"]["valid_until"] == ends.isoformat()
    period = LibraryMembership.objects.get(pk=body["membership_id"]).periods.get(kind="renew")
    assert period.starts_on == starts and period.fee_charge.kind == "renewal_fee"


# ── close (FR-8, BR-6; T-LIB-04-4, -5) ──────────────────────────────────────


def test_close_applies_the_deposit_to_dues_then_refunds_the_rest(
    api_as: Any, library_on: Any
) -> None:
    from apps.library.tests.factories import charge

    owner, _ = api_as(library_on, role="owner")
    body = _enrol(
        owner, library_on, collect_fees=_cash("200.00"), collect_deposit=_cash("500.00")
    ).json()["data"]
    membership = LibraryMembership.objects.get(pk=body["membership_id"])
    charge(library_on, membership, "40.00")
    closed = owner.post(
        _url("close", membership.id),
        {
            "apply_to_dues": True,
            "refund": {"amount": "460.00", "mode_breakup": [{"mode": "cash", "amount": "460.00"}]},
            "reason": "Passed out, class 12",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="c",
    )
    assert closed.status_code == 200, closed.content
    meta = closed.json()["meta"]
    assert (meta["applied"], meta["refunded"], meta["still_owed"]) == ("40.00", "460.00", "0.00")
    party = Party.objects.get(pk=membership.party_id)
    assert (party.balance, party.deposit_held) == (D("0.00"), D("0.00"))
    assert closed.json()["data"]["effective_status"] == "closed"


def test_a_refund_is_a_role_not_a_grant(api_as: Any, library_on: Any) -> None:
    """T-LIB-04-5, D28 — staff with `library.member.close` granted still cannot hand money
    back; closing without a refund succeeds."""
    owner, _ = api_as(library_on, role="owner")
    body = _enrol(owner, library_on, collect_deposit=_cash("500.00")).json()["data"]
    staff, who = api_as(library_on, role="staff")
    who.permissions_override = {"allow": ["library.member.close"], "deny": []}
    who.save(update_fields=["permissions_override"])
    refused = staff.post(
        _url("close", body["membership_id"]),
        {
            "refund": {"amount": "500.00", "mode_breakup": [{"mode": "cash", "amount": "500.00"}]},
            "reason": "Moved",
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert refused.status_code == 403
    plain = staff.post(
        _url("close", body["membership_id"]),
        {"reason": "Moved"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c2",
    )
    assert plain.status_code == 200, plain.content


# ── parties: role, archive guard; the scan (FR-11, EC-8, BR-8) ──────────────


def test_an_open_membership_blocks_archiving_and_shows_in_the_role_filter(
    api_as: Any, library_on: Any
) -> None:
    """T-LIB-04-7."""
    from apps.parties.services.archive import archive_block

    owner, _ = api_as(library_on, role="owner")
    party = PartyFactory(tenant=library_on)
    kind = _type(library_on, deposit_amount=D("0"), admission_fee=D("0"), fee_amount=D("0"))
    body = _enrol(owner, library_on, party, kind=kind).json()["data"]
    assert archive_block(library_on, party)["module"] == "library"
    listed = owner.get(reverse("v1:party-list"), {"role": "library_member"}).json()["data"]
    assert [row["id"] for row in listed] == [str(party.id)]
    owner.post(_url("close", body["membership_id"]), {"reason": "Left town"}, format="json")
    assert archive_block(library_on, party) is None


def test_the_scan_finds_a_member_by_number(api_as: Any, library_on: Any) -> None:
    owner, _ = api_as(library_on, role="owner")
    body = _enrol(owner, library_on).json()["data"]
    found = owner.get(reverse("v1:library-lookup"), {"code": body["member_number"].lower()}).json()
    assert found["data"]["kind"] == "member"
    assert found["data"]["member"]["membership_id"] == body["membership_id"]


def test_the_list_filters_by_effective_status(api_as: Any, library_on: Any) -> None:
    owner, _ = api_as(library_on, role="owner")
    current = _enrol(owner, library_on).json()["data"]
    lapsed = _enrol(owner, library_on, PartyFactory(tenant=library_on), key="k2").json()["data"]
    LibraryMembership.objects.filter(pk=lapsed["membership_id"]).update(
        starts_on=dt.date(2025, 1, 1), valid_until=dt.date(2025, 6, 30)
    )
    expired = owner.get(reverse(MEMBERS), {"status": "expired"}).json()
    assert [r["membership_id"] for r in expired["data"]] == [lapsed["membership_id"]]
    active = owner.get(reverse(MEMBERS), {"status": "active"}).json()
    assert [r["membership_id"] for r in active["data"]] == [current["membership_id"]]
    assert active["meta"]["totals"]["members"] == 1
