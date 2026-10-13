"""QA F4 / B51 — message any student, whatever they owe, one at a time or to a group.

Before: a student who owed money could be sent a fee reminder, a welcome or the last
receipt; a student who had PAID could be sent only the welcome and the receipt — no
"your plan ends on …", no message in the desk's own words, and no way to reach a group
except one student page at a time. Each test names the gap it closes.

The product still sends nothing itself (DEC-012): every message is prepared here and
opened in WhatsApp on the library's own phone, and that tap is what is recorded.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.models import Reminder
from apps.library.models import (
    LibraryCharge,
    LibraryMembership,
    LibraryMembershipType,
    LibraryShift,
)
from apps.parties.models import PartyRelation
from apps.payments.services.record import record_payment
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal
BULK = "v1:library-messages-bulk"


@pytest.fixture
def room(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("900.00")
    )

    def admit(name: str, mobile: str, paid: str | None = "900.00", **extra: Any) -> dict:
        body: dict = {
            "membership_type_id": str(kind.id),
            "party_id": str(PartyFactory(tenant=library_on, name=name, mobile=mobile).id),
            **extra,
        }
        if paid:
            body["collect_fees"] = {"mode_breakup": [{"mode": "cash", "amount": paid}]}
        made = owner.post(
            reverse("v1:library-members"), body, format="json", HTTP_IDEMPOTENCY_KEY=mobile
        )
        assert made.status_code == 201, made.json()
        return made.json()["data"]

    return {"client": owner, "tenant": library_on, "admit": admit}


def _url(member: dict, kind: str) -> str:
    return reverse("v1:library-member-message", args=[member["membership_id"], kind])


def _ends_on(member: dict, day: dt.date) -> None:
    LibraryMembership.objects.filter(pk=member["membership_id"]).update(valid_until=day)


# ── one student ─────────────────────────────────────────────────────────────


def test_a_paid_student_can_be_told_their_plan_ends_on_a_date(room: dict) -> None:
    """B51 AC1: a paid student's plan ends on 31/10 — the desk can say so."""
    asha = room["admit"]("Asha Kulkarni", "9876500001")
    _ends_on(asha, dt.date(2026, 10, 31))
    body = room["client"].get(_url(asha, "plan_end")).json()
    assert "data" in body, body
    assert "31/10/2026" in body["data"]["text"]
    assert "Monthly" in body["data"]["text"]


def test_a_paid_student_can_be_sent_the_desks_own_words_personalised(room: dict) -> None:
    """B51 AC1: a custom message, with {name}, {amount} (what is owed now) and
    {due_date} filled in per student, signed with the library's name."""
    asha = room["admit"]("Asha Kulkarni", "9876500002", paid=None)
    _ends_on(asha, dt.date(2026, 10, 31))
    text = "Hi {name}, the room is closed on Sunday. Plan till {due_date}, fee {amount}."
    data = room["client"].get(_url(asha, "custom"), {"text": text}).json()["data"]
    assert data["text"].startswith("Hi Asha, the room is closed on Sunday.")
    assert "Plan till 31/10/2026, fee Rs 900.00." in data["text"]


def test_a_custom_message_cannot_be_empty(room: dict) -> None:
    asha = room["admit"]("Asha Kulkarni", "9876500003")
    refused = room["client"].get(_url(asha, "custom"), {"text": "   "})
    assert refused.status_code == 400
    assert "text" in refused.json()["error"]["details"]


def test_a_custom_text_cannot_smuggle_in_a_template_placeholder(room: dict) -> None:
    """The desk's words are a VALUE, never a template: `{{library}}` typed into the box
    stays as typed rather than being expanded or refused by the renderer."""
    asha = room["admit"]("Asha Kulkarni", "9876500004")
    data = room["client"].get(_url(asha, "custom"), {"text": "a {{library}} b"}).json()["data"]
    assert "a {{library}} b" in data["text"]


def test_a_closed_student_can_still_be_sent_a_custom_message(room: dict) -> None:
    """ "Any status": a student who left can still be told their deposit is ready."""
    asha = room["admit"]("Asha Kulkarni", "9876500005")
    closed = room["client"].post(
        reverse("v1:library-member-close", args=[asha["membership_id"]]),
        {"reason": "Left town"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="close-asha",
    )
    assert closed.status_code == 200, closed.content
    sent = room["client"].post(_url(asha, "custom"), {"text": "Deposit ready"}, format="json")
    assert sent.status_code == 200, sent.content


def test_two_custom_messages_the_same_day_are_both_recorded(room: dict) -> None:
    """The daily cap is about NAGGING about one fee; it must not stop the desk telling a
    student two different things on one day."""
    asha = room["admit"]("Asha Kulkarni", "9876500006")
    for text in ("Closed Sunday", "Open Monday"):
        sent = room["client"].post(_url(asha, "custom"), {"text": text}, format="json")
        assert sent.status_code == 200, sent.content
    assert Reminder.objects.filter(module="library", kind="notice").count() == 2


def test_each_send_is_in_the_students_message_log(room: dict) -> None:
    """F4 AC3: what was sent, when, and what it was about — newest first."""
    asha = room["admit"]("Asha Kulkarni", "9876500007")
    _ends_on(asha, dt.date(2026, 10, 31))
    room["client"].post(_url(asha, "plan_end"), {}, format="json")
    room["client"].post(_url(asha, "custom"), {"text": "Closed Sunday"}, format="json")
    log = (
        room["client"]
        .get(reverse("v1:library-member-messages", args=[asha["membership_id"]]))
        .json()["data"]
    )
    assert [row["kind"] for row in log] == ["custom", "plan_end"]
    assert all(row["sent_at"] and row["channel"] == "whatsapp_manual" for row in log)
    assert log[0]["text"].startswith("Closed Sunday")


# ── a group ─────────────────────────────────────────────────────────────────


def test_bulk_fee_unpaid_prepares_one_message_per_student_with_their_own_amount(
    room: dict,
) -> None:
    """F4 AC2: two owe different amounts, one has paid — two messages, each with its
    own figure, and nobody who has paid."""
    room["admit"]("Asha", "9876500011", paid="300.00")
    room["admit"]("Bina", "9876500012", paid=None)
    room["admit"]("Chetan", "9876500013")
    rows = (
        room["client"]
        .post(reverse(BULK), {"kind": "fee", "audience": "unpaid"}, format="json")
        .json()["data"]
    )
    by_name = {r["name"]: r for r in rows}
    assert sorted(by_name) == ["Asha", "Bina"]
    assert "Rs 600.00" in by_name["Asha"]["text"]
    assert "Rs 900.00" in by_name["Bina"]["text"]
    assert all(r["wa_url"].startswith("https://wa.me/91") for r in rows)
    assert Reminder.objects.count() == 0  # preparing records nothing


def test_bulk_custom_to_everyone_personalises_each_text(room: dict) -> None:
    """B51 AC2: one message typed once, each student's own name in theirs."""
    room["admit"]("Asha Kulkarni", "9876500021")
    room["admit"]("Bina Rao", "9876500022", paid=None)
    rows = (
        room["client"]
        .post(
            reverse(BULK),
            {"kind": "custom", "audience": "all", "text": "Hi {name}, due {amount}"},
            format="json",
        )
        .json()["data"]
    )
    texts = sorted(r["text"].split("\n")[0] for r in rows)
    assert texts == ["Hi Asha, due Rs 0.00", "Hi Bina, due Rs 900.00"]


def test_bulk_to_a_shift_reaches_only_that_shift(room: dict) -> None:
    morning = LibraryShift.objects.create(
        tenant=room["tenant"], name="Morning", starts_at="07:00", ends_at="12:00"
    )
    room["admit"]("Asha", "9876500031", shift_id=str(morning.id))
    room["admit"]("Bina", "9876500032")
    rows = (
        room["client"]
        .post(
            reverse(BULK),
            {"kind": "custom", "audience": "shift", "shift_id": str(morning.id), "text": "Hi"},
            format="json",
        )
        .json()["data"]
    )
    assert [r["name"] for r in rows] == ["Asha"]


def test_bulk_plan_ending_lists_plans_ending_within_a_week(room: dict) -> None:
    today = tenant_today(room["tenant"])
    asha = room["admit"]("Asha", "9876500041")
    bina = room["admit"]("Bina", "9876500042")
    _ends_on(asha, today + dt.timedelta(days=5))
    _ends_on(bina, today + dt.timedelta(days=20))
    rows = (
        room["client"]
        .post(reverse(BULK), {"kind": "plan_end", "audience": "ending"}, format="json")
        .json()["data"]
    )
    assert [r["name"] for r in rows] == ["Asha"]


def test_the_fee_is_checked_again_when_the_message_is_opened(room: dict) -> None:
    """Prepared at 9, paid at the desk at 10: the 10:05 tap must not send "Rs 900 is
    pending" — the send re-reads the fee rather than trusting the prepared text."""
    bina = room["admit"]("Bina", "9876500051", paid=None)
    rows = (
        room["client"]
        .post(reverse(BULK), {"kind": "fee", "audience": "unpaid"}, format="json")
        .json()["data"]
    )
    assert [r["name"] for r in rows] == ["Bina"]

    member = LibraryMembership.objects.get(pk=bina["membership_id"])
    fee = LibraryCharge.objects.get(membership=member)
    record_payment(
        ctx=Ctx.system(room["tenant"]),
        payload={
            "direction": "in",
            "party_id": str(member.party_id),
            "mode_breakup": [{"mode": "cash", "amount": "900.00"}],
            "allocations": [
                {"document_type": "library_charge", "document_id": str(fee.id), "amount": "900.00"}
            ],
        },
    )
    refused = room["client"].post(_url(bina, "fee"), {}, format="json")
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "library_nothing_overdue"


def test_a_minors_group_message_goes_to_the_guardian(room: dict) -> None:

    ravi = room["admit"]("Ravi", "9876500061")
    parent = PartyFactory(tenant=room["tenant"], name="Meena", mobile="9876500062")
    member = LibraryMembership.objects.get(pk=ravi["membership_id"])
    PartyRelation.objects.create(
        tenant=room["tenant"],
        party=member.party,
        related_party=parent,
        kind="guardian",
        receives_messages=True,
        from_on=dt.date(2025, 1, 1),
    )
    rows = (
        room["client"]
        .post(reverse(BULK), {"kind": "custom", "audience": "all", "text": "Hi"}, format="json")
        .json()["data"]
    )
    assert rows[0]["recipient"]["name"] == "Meena" and rows[0]["recipient"]["is_guardian"]


def test_bulk_custom_needs_words_and_a_known_audience(room: dict) -> None:
    room["admit"]("Asha", "9876500071")
    empty = room["client"].post(
        reverse(BULK), {"kind": "custom", "audience": "all", "text": ""}, format="json"
    )
    assert empty.status_code == 400 and "text" in empty.json()["error"]["details"]
    odd = room["client"].post(reverse(BULK), {"kind": "custom", "audience": "x"}, format="json")
    assert odd.status_code == 400 and "audience" in odd.json()["error"]["details"]
