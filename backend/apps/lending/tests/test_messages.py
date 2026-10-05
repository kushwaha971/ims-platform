"""LEN-12 — a lender's WhatsApp messages, handled like reminders (L03).

The guardrail is the feature: a borrower is messaged politely, at a decent
hour, at most once a day about a loan, and only while the loan is running. A
receipt is a notice about a payment, so the one-a-day cap on the LOAN never
stops it — but the hour still does.
"""

from __future__ import annotations

import datetime as dt
import re
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from django.urls import reverse

from apps.common.dates import tenant_timezone, tenant_today
from apps.common.exceptions import BusinessRuleViolation
from apps.ledger.models import Reminder
from apps.ledger.services import reminder_seam
from apps.ledger.tests.module_reminder_fixtures import clock  # noqa: F401  (fixture)
from apps.lending.models import LendingLoan
from apps.lending.services import messages

pytestmark = pytest.mark.django_db
EVERY_DAY = 127
PRODUCT_NAMES = ("yourkhata", "digikhaato", "udhaarbook")


# ── The texts (T-LEN-12-5) ──────────────────────────────────────────────────


def _bodies() -> list[tuple[str, str, str, str]]:
    return [
        (code, channel, locale, body)
        for code, channels in messages.TEMPLATES.items()
        for channel, locales in channels.items()
        for locale, body in locales.items()
    ]


def test_every_text_is_in_both_languages_and_on_both_channels() -> None:
    for code, channels in messages.TEMPLATES.items():
        assert set(channels) == {"whatsapp", "sms"}, code
        for channel, locales in channels.items():
            assert set(locales) == {"en", "hi"}, (code, channel)


@pytest.mark.parametrize(("code", "channel", "locale", "body"), _bodies())
def test_no_text_carries_a_word_that_threatens(
    code: str, channel: str, locale: str, body: str
) -> None:
    """BR-4: a forbidden word is refused whole-word and case-blind in English and
    as a substring in Devanagari (whose marks defeat `\\b`), in either language's
    text — an English word in a Hindi message is still the word."""
    lowered = body.lower()
    for word in messages.FORBIDDEN_WORDS:
        if word.isascii():
            assert not re.search(rf"\b{re.escape(word)}\b", lowered), (code, locale, word)
        else:
            assert word not in body, (code, locale, word)


@pytest.mark.parametrize(("code", "channel", "locale", "body"), _bodies())
def test_every_text_is_signed_by_the_lender_and_never_the_product(
    code: str, channel: str, locale: str, body: str
) -> None:
    """NTF-02: `Rs`, never `₹`; the business name, never the product's."""
    assert "{{business}}" in body
    assert "₹" not in body and "Rs {{amount}}" in body
    assert not any(name in body.lower() for name in PRODUCT_NAMES)


def test_the_policy_is_the_frds() -> None:
    policy = reminder_seam.registered_policy("lending")
    assert policy is not None
    assert policy["window"] == (dt.time(8), dt.time(19))
    assert policy["daily_cap_per_source"] == 1 and policy["fixed_templates"] is True


# ── The window, tenant-local (T-LEN-12-1) ───────────────────────────────────


@pytest.mark.parametrize("zone", ["Asia/Kolkata", "Asia/Dubai"])
def test_the_window_is_eight_to_seven_in_the_lenders_own_time(tenant: Any, zone: str) -> None:
    from tests.factories.parties import PartyFactory

    tenant.timezone = zone
    tenant.save(update_fields=["timezone"])
    party = PartyFactory(tenant=tenant)
    day = dt.date(2026, 10, 12)

    def at(h: int, m: int = 0, s: int = 0) -> dt.datetime:
        return dt.datetime.combine(day, dt.time(h, m, s), tzinfo=ZoneInfo(zone))

    def refused(moment: dt.datetime) -> str | None:
        try:
            reminder_seam.check_reminder_allowed(
                tenant=tenant, module="lending", party_id=party.pk, source_id=party.pk, at=moment
            )
        except BusinessRuleViolation as error:
            return error.code
        return None

    assert refused(at(7, 59, 59)) == "reminder_outside_window"
    assert refused(at(8)) is None
    assert refused(at(18, 59, 59)) is None
    assert refused(at(19)) == "reminder_outside_window"
    assert refused(at(23, 30)) == "reminder_outside_window"


# ── A loan's messages through the API ───────────────────────────────────────


@pytest.fixture
def book(api_as: Any, lending_on: Any, clock: Any) -> dict:  # noqa: F811
    """Geeta's daily loan, three days missed and today due; the clock at 10:00."""
    owner, _ = api_as(lending_on, role="owner")
    today = tenant_today(lending_on)
    clock(dt.datetime.combine(today, dt.time(10, 0), tzinfo=tenant_timezone(lending_on)))
    made = owner.post(
        reverse("v1:lending-loans"),
        {
            "plan_type": "fixed_daily",
            "principal": "4500.00",
            "frequency": "daily",
            "instalment_count": 10,
            "per_instalment_amount": "500.00",
            "collection_weekdays": EVERY_DAY,
            "disbursed_on": (today - dt.timedelta(days=4)).isoformat(),
            "first_due_on": (today - dt.timedelta(days=3)).isoformat(),
            "party": {"name": "Geeta Devi", "mobile": "9820011223"},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="loan",
    )
    assert made.status_code == 201, made.json()
    return {
        "client": owner,
        "tenant": lending_on,
        "loan": made.json()["data"],
        "today": today,
        "clock": clock,
    }


def _msg(loan: dict, kind: str = "reminder") -> str:
    return reverse("v1:lending-loan-message", args=[loan["id"], kind])


def _send(book: dict, kind: str = "reminder", **body: Any) -> Any:
    return book["client"].post(
        _msg(book["loan"], kind), {"channel": "whatsapp_manual", **body}, format="json"
    )


def test_an_overdue_loan_is_reminded_of_what_is_late_and_today(book: dict) -> None:
    got = book["client"].get(_msg(book["loan"]))
    assert got.status_code == 200, got.json()
    data = got.json()["data"]
    since = (book["today"] - dt.timedelta(days=3)).strftime("%d/%m/%Y")
    assert data["bucket"] == "overdue" and data["allowed"] is True
    assert "Rs 2,000" in data["text"] and f"since {since}" in data["text"]
    assert data["text"].startswith("Namaste Geeta Devi.")
    assert data["wa_url"].startswith("https://wa.me/91") and data["last_today"] is None
    assert Reminder.objects.count() == 0, "a preview records nothing"


def test_one_reminder_per_loan_per_day_whoever_and_however(book: dict, api_as: Any) -> None:
    """T-LEN-12-3: the second, by staff on another channel, is refused, and the
    sheet then says when it was sent rather than offering it again."""
    first = _send(book)
    assert first.status_code == 201, first.json()
    assert first.json()["data"]["deep_link"].startswith("https://wa.me/")
    staff, _ = api_as(book["tenant"], role="staff")
    again = staff.post(_msg(book["loan"]), {"channel": "call"}, format="json")
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "reminder_cap_reached"
    sheet = book["client"].get(_msg(book["loan"])).json()["data"]
    assert sheet["allowed"] is False and sheet["refusal"]["code"] == "reminder_cap_reached"
    assert sheet["last_today"]["channel"] == "whatsapp_manual"
    row = Reminder.objects.get()
    assert (row.module, row.source_type, row.kind) == ("lending", "lending_loan", "due")
    assert row.snapshot_balance == Decimal("2000.00")


def test_no_message_before_eight_or_after_seven(book: dict) -> None:
    """EC-1: the sheet warns, and the tap is refused by the same rule."""
    zone = tenant_timezone(book["tenant"])
    book["clock"](dt.datetime.combine(book["today"], dt.time(7, 40), tzinfo=zone))
    sheet = book["client"].get(_msg(book["loan"])).json()["data"]
    assert sheet["allowed"] is False
    assert sheet["refusal"]["code"] == "reminder_outside_window"
    assert sheet["refusal"]["window_start"] == "08:00"
    refused = _send(book)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "reminder_outside_window"
    assert Reminder.objects.count() == 0


def test_a_receipt_is_not_stopped_by_the_morning_reminder(book: dict) -> None:
    assert _send(book).status_code == 201
    paid = book["client"].post(
        reverse("v1:lending-collections", args=[book["loan"]["id"]]),
        {"amount": "1000.00", "mode": "cash"},
        format="json",
        HTTP_IDEMPOTENCY_KEY="c1",
    )
    assert paid.status_code == 201, paid.json()
    sheet = book["client"].get(_msg(book["loan"], "receipt")).json()["data"]
    assert sheet["allowed"] is True and sheet["bucket"] is None
    assert "received Rs 1,000" in sheet["text"] and "Still to pay: Rs 4,000." in sheet["text"]
    got = _send(book, "receipt")
    assert got.status_code == 201, got.json()
    receipt = Reminder.objects.get(source_type="lending_message")
    assert receipt.kind == "notice" and receipt.snapshot_balance is None
    activity = book["client"].get(reverse("v1:lending-collections", args=[book["loan"]["id"]]))
    kinds = [m["kind"] for m in activity.json()["meta"]["messages"]]
    assert sorted(kinds) == ["receipt", "reminder"]


def test_the_list_and_todays_round_show_who_was_told(book: dict) -> None:
    rows = book["client"].get(reverse("v1:lending-reminders")).json()["data"]
    assert [(r["number"], r["bucket"], r["amount"]) for r in rows] == [
        (book["loan"]["number"], "overdue", "2000.00")
    ]
    assert rows[0]["sent_today"] is None
    assert _send(book).status_code == 201
    rows = book["client"].get(reverse("v1:lending-reminders")).json()["data"]
    assert rows[0]["sent_today"]["channel"] == "whatsapp_manual"
    stop = book["client"].get(reverse("v1:lending-today")).json()["data"][0]
    assert stop["reminded_today"] is True


def test_the_first_instalment_tomorrow_is_named(
    api_as: Any, lending_on: Any, clock: Any
) -> None:  # noqa: F811
    owner, _ = api_as(lending_on, role="owner")
    today = tenant_today(lending_on)
    clock(dt.datetime.combine(today, dt.time(11, 0), tzinfo=tenant_timezone(lending_on)))
    loan = owner.post(
        reverse("v1:lending-loans"),
        {
            "plan_type": "fixed_daily",
            "principal": "1000.00",
            "frequency": "daily",
            "instalment_count": 10,
            "per_instalment_amount": "120.00",
            "collection_weekdays": EVERY_DAY,
            "disbursed_on": today.isoformat(),
            "first_due_on": (today + dt.timedelta(days=1)).isoformat(),
            "party": {"name": "Kavita Singh", "mobile": "9820011224"},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="k",
    ).json()["data"]
    sheet = owner.get(_msg(loan)).json()["data"]
    tomorrow = (today + dt.timedelta(days=1)).strftime("%d/%m/%Y")
    assert sheet["bucket"] == "due_tomorrow"
    assert f"instalment 1 of loan {loan['number']}, Rs 120, is due tomorrow, {tomorrow}" in (
        sheet["text"]
    )


def test_nothing_due_is_said_not_sent(
    api_as: Any, lending_on: Any, clock: Any
) -> None:  # noqa: F811
    owner, _ = api_as(lending_on, role="owner")
    today = tenant_today(lending_on)
    clock(dt.datetime.combine(today, dt.time(11, 0), tzinfo=tenant_timezone(lending_on)))
    loan = owner.post(
        reverse("v1:lending-loans"),
        {
            "plan_type": "flat",
            "principal": "1000.00",
            "rate": "2",
            "frequency": "monthly",
            "instalment_count": 2,
            "disbursed_on": today.isoformat(),
            "first_due_on": (today + dt.timedelta(days=30)).isoformat(),
            "party": {"name": "Ramesh Yadav", "mobile": "9820011225"},
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY="r",
    )
    assert loan.status_code == 201, loan.json()
    got = owner.get(_msg(loan.json()["data"]))
    assert got.status_code == 409 and got.json()["error"]["code"] == "lending_nothing_due"


def test_a_loan_that_is_not_running_is_never_reminded(book: dict) -> None:
    """T-LEN-12-7: suppression is in the list and in the send path both."""
    LendingLoan.objects.filter(pk=book["loan"]["id"]).update(status="written_off")
    assert book["client"].get(reverse("v1:lending-reminders")).json()["data"] == []
    refused = _send(book)
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "loan_not_active"


def test_no_mobile_is_said_before_anything_is_recorded(book: dict) -> None:
    from apps.parties.models import Party

    Party.objects.filter(pk=book["loan"]["borrower"]["party_id"]).update(mobile=None)
    refused = _send(book)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "reminder_not_sendable"
    assert Reminder.objects.count() == 0


def test_the_body_carries_no_text_and_no_number(book: dict) -> None:
    """FR-5/FR-6: a typed text or number in the body is ignored — the server
    renders the fixed text for the borrower's own mobile."""
    got = _send(book, text="Pay now or else", mobile="9999999999")
    assert got.status_code == 201
    assert "9999999999" not in got.json()["data"]["deep_link"]
    assert "or+else" not in got.json()["data"]["deep_link"]


def test_an_accountant_cannot_send(book: dict, api_as: Any) -> None:
    accountant, _ = api_as(book["tenant"], role="accountant")
    assert accountant.get(_msg(book["loan"])).status_code == 403


@pytest.mark.parametrize(("code", "channel", "locale", "body"), _bodies())
def test_every_placeholder_is_one_the_message_fills(
    code: str, channel: str, locale: str, body: str
) -> None:
    """A placeholder nobody fills would reach a borrower as `{{seq}}` — in the
    Hindi text only, where nobody reading the English tests would see it."""
    filled = {"recipient_name", "business", "loan_number", "amount", "date"}
    filled |= {"seq"} if code == messages.TEMPLATE_DUE_TOMORROW else set()
    filled |= {"receipt_number", "left_line"} if code == messages.TEMPLATE_RECEIPT else set()
    assert set(re.findall(r"{{(\w+)}}", body)) <= filled, (code, channel, locale)


def test_the_sheet_turns_itself_off_a_minute_before_seven(book: dict) -> None:
    """L03 follow-up: the link opens WhatsApp on the tap, before the record. A
    sheet that said "go" at 18:59:30 opened WhatsApp at 19:00:05 while the
    server refused to record it. So the preview looks a minute ahead and says
    when its answer changes; the record keeps the true rule."""
    zone = tenant_timezone(book["tenant"])
    at = lambda h, m, s=0: dt.datetime.combine(
        book["today"], dt.time(h, m, s), tzinfo=zone
    )  # noqa: E731
    book["clock"](at(18, 58))
    sheet = book["client"].get(_msg(book["loan"])).json()["data"]
    assert sheet["allowed"] is True and sheet["changes_in_seconds"] == 60
    book["clock"](at(18, 59, 30))
    sheet = book["client"].get(_msg(book["loan"])).json()["data"]
    assert sheet["allowed"] is False
    assert sheet["refusal"]["code"] == "reminder_outside_window"
    tomorrow = (book["today"] + dt.timedelta(days=1)).isoformat()
    assert sheet["refusal"]["next_allowed_at"].startswith(f"{tomorrow}T08:00:00")
    assert sheet["changes_in_seconds"] == 13 * 3600 + 30
    assert _send(book).status_code == 201, "the rule itself is still 08:00 to 19:00"


def test_the_sheet_turns_itself_on_at_eight(book: dict) -> None:
    zone = tenant_timezone(book["tenant"])
    book["clock"](dt.datetime.combine(book["today"], dt.time(7, 59, 30), tzinfo=zone))
    sheet = book["client"].get(_msg(book["loan"])).json()["data"]
    assert sheet["allowed"] is False and sheet["changes_in_seconds"] == 30
