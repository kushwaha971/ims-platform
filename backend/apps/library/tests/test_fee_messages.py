"""W06 — a reading room's WhatsApp messages, handled like reminders (owner, 4 Oct 2026)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any
from urllib.parse import unquote

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.ledger.models import Reminder
from apps.library.models import LibraryMembership, LibraryMembershipType
from apps.library.services import fee_messages
from apps.notifications.services.templates import DEFAULT_TEMPLATES, placeholders, render
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
D = Decimal


@pytest.fixture
def room(api_as: Any, library_on: Any) -> dict:
    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Monthly", validity_months=1, fee_amount=D("900.00")
    )

    def admit(name: str, key: str, mobile: str, collect: bool = True) -> dict:
        body: dict = {
            "membership_type_id": str(kind.id),
            "party_id": str(PartyFactory(tenant=library_on, name=name, mobile=mobile).id),
        }
        if collect:
            body["collect_fees"] = {"mode_breakup": [{"mode": "upi", "amount": "900.00"}]}
        made = owner.post(
            reverse("v1:library-members"), body, format="json", HTTP_IDEMPOTENCY_KEY=key
        )
        assert made.status_code == 201, made.json()
        return made.json()["data"]

    return {"client": owner, "tenant": library_on, "admit": admit}


def _ends_in(member: dict, tenant: Any, days: int) -> None:
    today = tenant_today(tenant)
    LibraryMembership.objects.filter(pk=member["membership_id"]).update(
        starts_on=today - dt.timedelta(days=60), valid_until=today + dt.timedelta(days=days)
    )


def test_the_schedule_lists_fees_due_in_7_3_and_1_days_and_overdue_1_3_7(room: dict) -> None:
    """T-7, T-3, T-1 and then overdue on days 1, 3 and 7 — and nobody else, so
    the desk's list each morning is exactly the people to message today."""
    plan = ((7, "a"), (3, "b"), (1, "c"), (-1, "d"), (-3, "e"), (5, "f"), (-2, "g"))
    for n, (days, key) in enumerate(plan):
        member = room["admit"](f"S{key}", key, f"98765001{n:02d}")
        _ends_in(member, room["tenant"], days)
    rows = room["client"].get(reverse("v1:library-fee-reminders")).json()["data"]
    assert sorted(r["name"] for r in rows) == ["Sa", "Sb", "Sc", "Sd", "Se"]
    kinds = {r["name"]: r["kind"] for r in rows}
    assert kinds["Sa"] == "due" and kinds["Sd"] == "overdue"
    assert all(r["amount"] == "900.00" for r in rows)


def test_sending_a_fee_reminder_records_it_like_a_reminder(room: dict) -> None:
    """The tap that opens WhatsApp writes a reminder row (module library, kind
    due, the fee as the amount) and the list then says it went today."""
    asha = room["admit"]("Asha Kulkarni", "a", "9876543210")
    _ends_in(asha, room["tenant"], 3)
    url = reverse("v1:library-member-message", args=[asha["membership_id"], "fee"])
    preview = room["client"].get(url).json()["data"]
    assert "Rs 900.00" in preview["text"] and "₹" not in preview["text"]
    assert Reminder.objects.count() == 0  # preview records nothing
    sent = room["client"].post(url, {}, format="json").json()["data"]
    assert sent["wa_url"].startswith("https://wa.me/91")
    assert "Asha" in unquote(sent["wa_url"])
    row = Reminder.objects.get()
    assert (row.module, row.kind, row.source_type, row.snapshot_balance) == (
        "library",
        "due",
        "library_fee",
        D("900.00"),
    )
    listed = room["client"].get(reverse("v1:library-fee-reminders")).json()["data"]
    assert listed[0]["sent_today"] is True


def test_an_unpaid_student_gets_the_unpaid_text_with_what_is_owed(room: dict) -> None:
    imran = room["admit"]("Imran", "a", "9876500001", collect=False)
    url = reverse("v1:library-member-message", args=[imran["membership_id"], "fee"])
    text = room["client"].get(url).json()["data"]["text"]
    assert "Rs 900.00 is pending" in text


def test_a_paid_student_whose_plan_is_not_ending_has_nothing_to_be_reminded_of(
    room: dict,
) -> None:
    asha = room["admit"]("Asha", "a", "9876500002")
    _ends_in(asha, room["tenant"], 20)
    url = reverse("v1:library-member-message", args=[asha["membership_id"], "fee"])
    assert room["client"].get(url).status_code == 409


def test_welcome_and_receipt_are_recorded_and_do_not_use_up_the_fee_reminder(
    room: dict,
) -> None:
    """The library's cap is one message per source a day. Welcome is about the
    admission and the receipt about the payment, so sending both on the day a
    student joins still leaves the fee reminder free."""
    imran = room["admit"]("Imran Khan", "a", "9876500003", collect=False)
    base = imran["membership_id"]
    welcome = room["client"].post(
        reverse("v1:library-member-message", args=[base, "welcome"]), {}, format="json"
    )
    assert welcome.status_code == 200, welcome.json()
    assert "student number" in welcome.json()["data"]["text"]
    fee = room["client"].post(
        reverse("v1:library-member-message", args=[base, "fee"]), {}, format="json"
    )
    assert fee.status_code == 200, fee.json()
    assert Reminder.objects.filter(module="library").count() == 2


def test_the_receipt_quotes_the_latest_payment(room: dict) -> None:
    asha = room["admit"]("Asha", "a", "9876500004")
    url = reverse("v1:library-member-message", args=[asha["membership_id"], "receipt"])
    text = room["client"].get(url).json()["data"]["text"]
    assert "Received Rs 900.00 from Asha" in text


def test_a_student_without_a_mobile_cannot_be_messaged(room: dict) -> None:
    pooja = room["admit"]("Pooja", "a", "")
    url = reverse("v1:library-member-message", args=[pooja["membership_id"], "welcome"])
    assert room["client"].post(url, {}, format="json").status_code == 400


def test_every_fee_template_renders_and_never_names_the_product() -> None:
    """NTF-02's strict renderer: nothing missing, nothing left over, `Rs` not ₹."""
    codes = set(fee_messages.TEMPLATES)
    bodies = {key: body for key, body in DEFAULT_TEMPLATES.items() if key[0] in codes}
    assert {key[0] for key in bodies} == codes
    assert {key[2] for key in bodies} == {"en", "hi"}
    for body in bodies.values():
        text = render(body, {name: "x" for name in placeholders(body)})
        assert "{{" not in text and "yourkhata" not in text.lower() and "₹" not in text


def test_the_student_reads_your_plan_and_never_their_own_name_in_the_possessive(
    room: dict,
) -> None:
    """Found by looking: a student messaged about their own plan read
    "Hello Rahul Sharma, Rahul's Monthly plan". Only a guardian reads it so."""
    rahul = room["admit"]("Rahul Sharma", "a", "9876500005")
    _ends_in(rahul, room["tenant"], 1)
    url = reverse("v1:library-member-message", args=[rahul["membership_id"], "fee"])
    text = room["client"].get(url).json()["data"]["text"]
    assert "your Monthly plan" in text and "Rahul's" not in text
