"""B12 — overdue reminders, hold-ready notices and the issue slip (LIB-09; T-LIB-09-1…6)."""

from __future__ import annotations

import datetime as dt
from typing import Any
from urllib.parse import unquote

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.ledger.models import Reminder
from apps.library.models import LibraryHold, LibraryLoan, LibraryMembership, LibrarySettings
from apps.library.services import reminders
from apps.library.tests.counter import _issue, _return
from apps.notifications.models import Notification
from apps.notifications.services.templates import DEFAULT_TEMPLATES, placeholders, render
from apps.parties.models import Party, PartyRelation
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def _late(desk: dict, index: int, days: int, member: str | None = None) -> str:
    """Lend copy `index` and move it `days` past due (negative: due in the future)."""
    # An overdue book would block the next issue at the counter; that rule is LIB-06's.
    LibrarySettings.objects.filter(tenant=desk["tenant"]).update(overdue_issue_rule="off")
    body = _issue(desk["client"], member or desk["member"], desk["copies"][index], f"i{index}")
    loan_id = body.json()["data"]["id"]
    today = tenant_today(desk["tenant"])
    LibraryLoan.objects.filter(pk=loan_id).update(
        issued_on=today - dt.timedelta(days=days + 14), due_on=today - dt.timedelta(days=days)
    )
    return loan_id


def _member_party(desk: dict) -> Party:
    return LibraryMembership.objects.get(pk=desk["member"]).party


def _guardian(desk: dict, *, receives: bool = True) -> Party:
    guardian = PartyFactory(tenant=desk["tenant"], name="Suresh Kulkarni")
    PartyRelation.objects.create(
        tenant=desk["tenant"],
        party=_member_party(desk),
        related_party=guardian,
        kind="guardian",
        receives_messages=receives,
        from_on=dt.date(2025, 1, 1),
    )
    return guardian


def _remind(desk: dict, channel: str = "whatsapp_manual", **body: Any) -> Any:
    return desk["client"].post(
        reverse("v1:library-overdue-remind", args=[desk["member"]]),
        {"channel": channel, **body},
        format="json",
    )


# ── candidates (FR-2; T-LIB-09-1, -5) ───────────────────────────────────────


def test_candidates_are_the_loans_exactly_1_7_14_or_30_days_late(desk: dict) -> None:
    """T-LIB-09-1 — calendar days, so a holiday never skips a reminder; due tomorrow only
    when the library asked for it."""
    one, three = _late(desk, 0, 1), _late(desk, 1, 3)
    other = _member_desk(desk)
    tomorrow = _late(desk, 2, -1, member=other)
    today = tenant_today(desk["tenant"])
    found = {str(c["source_id"]) for c in reminders.loan_candidates(desk["tenant"], today)}
    assert found == {one} and three not in found
    LibrarySettings.objects.filter(tenant=desk["tenant"]).update(remind_day_before=True)
    found = {str(c["source_id"]) for c in reminders.loan_candidates(desk["tenant"], today)}
    assert found == {one, tomorrow}
    candidate = reminders.loan_candidates(desk["tenant"], today)[0]
    assert (candidate["amount"], candidate["due_on"], candidate["template_key"]) == (
        None,
        today,
        "library_overdue",
    )


def test_candidates_are_the_same_on_a_second_run_and_empty_for_a_stranger(
    desk: dict, library_on: Any
) -> None:
    """T-LIB-09-5 — the contract: idempotent per date; a tenant with no library → empty."""
    from tests.factories.platform import TenantFactory

    _late(desk, 0, 7)
    today = tenant_today(desk["tenant"])
    first = reminders.loan_candidates(desk["tenant"], today)
    assert first == reminders.loan_candidates(desk["tenant"], today) and len(first) == 1
    assert reminders.loan_candidates(TenantFactory(), today) == []
    assert reminders.hold_candidates(TenantFactory(), today) == []


def _member_desk(desk: dict) -> str:
    kind = desk["kind"]
    return (
        desk["client"]
        .post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(kind.id),
                "party_id": str(PartyFactory(tenant=desk["tenant"]).id),
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="m-other",
        )
        .json()["data"]["membership_id"]
    )


# ── the recipient (D22; T-LIB-09-2) ─────────────────────────────────────────


def test_the_guardian_is_told_only_when_they_asked_to_receive_messages(desk: dict) -> None:
    _late(desk, 0, 4)
    quiet = _guardian(desk, receives=False)
    preview = desk["client"].post(reverse("v1:library-overdue-preview", args=[desk["member"]]))
    assert preview.json()["data"]["recipient"]["is_guardian"] is False
    PartyRelation.objects.filter(related_party=quiet).update(receives_messages=True)
    preview = desk["client"].post(reverse("v1:library-overdue-preview", args=[desk["member"]]))
    recipient = preview.json()["data"]["recipient"]
    assert (recipient["name"], recipient["is_guardian"]) == ("Suresh Kulkarni", True)
    digits = quiet.mobile.lstrip("+")
    assert digits in preview.json()["data"]["wa_url"]


# ── the text (FR-5, BR-4; T-LIB-09-3) ───────────────────────────────────────


@pytest.mark.parametrize("locale", ["en", "hi"])
def test_two_books_to_a_guardian_with_the_fine_so_far(desk: dict, locale: str) -> None:
    """T-LIB-09-3 — both titles, the fine (₹2 a day, 3 + 3 days = ₹12), signed with the
    library's name and never the product's."""
    desk["tenant"].name = "Saraswati Vidya Mandir Library"
    desk["tenant"].locale = locale
    desk["tenant"].save(update_fields=["name", "locale"])
    _late(desk, 0, 3)
    _late(desk, 1, 3)
    _guardian(desk)
    text = (
        desk["client"]
        .post(reverse("v1:library-overdue-preview", args=[desk["member"]]))
        .json()["data"]["text"]
    )
    assert text.count("Wings of Fire") == 2
    assert "Rs 12" in text
    assert text.rstrip().endswith("— Saraswati Vidya Mandir Library")
    assert "M-" in text  # the guardian is told which child
    lowered = text.lower()
    assert "yourkhata" not in lowered and "digikhaato" not in lowered


def test_a_long_list_becomes_and_n_more(desk: dict) -> None:
    """BR-4 — beyond five books the middle of the list folds; the fine line stays."""
    lines = [f"• Book {n}\n" for n in range(8)]
    folded = reminders._book_lines(lines, "en")
    assert folded.count("•") == 5 and folded.endswith("• and 4 more\n")


def test_every_library_template_renders_with_every_placeholder(desk: dict) -> None:
    """T-LIB-09-6 — NTF-02's strict renderer: nothing missing, nothing left over."""
    codes = {"library_overdue", "library_hold_ready", "library_issue_slip"}
    bodies = {key: body for key, body in DEFAULT_TEMPLATES.items() if key[0] in codes}
    assert {key[0] for key in bodies} == codes
    for body in bodies.values():
        text = render(body, {name: "x" for name in placeholders(body)})
        assert "{{" not in text and "yourkhata" not in text.lower()


# ── recording (FR-5, FR-10; T-LIB-09-4) ─────────────────────────────────────


def test_one_tap_records_a_reminder_per_loan_as_one_message(desk: dict) -> None:
    """T-LIB-09-4 — two rows, one `message_group_id`, kind notice, module library; a second
    tap the same day is refused by the per-book daily cap."""
    _late(desk, 0, 2)
    _late(desk, 1, 9)
    first = _remind(desk)
    assert first.status_code == 201, first.content
    rows = list(Reminder.objects.filter(module="library"))
    assert len(rows) == 2
    assert {row.kind for row in rows} == {"notice"}
    assert len({row.message_group_id for row in rows}) == 1 and rows[0].message_group_id
    assert {row.source_type for row in rows} == {"library_loan"}
    assert all(row.snapshot_balance is None for row in rows)
    assert "Wings of Fire" in unquote(first.json()["data"]["wa_url"])
    second = _remind(desk)
    assert second.json()["error"]["code"] == "reminder_cap_reached"
    assert Reminder.objects.filter(module="library").count() == 2


def test_a_book_returned_after_the_preview_drops_out_of_the_message(desk: dict) -> None:
    """BR-3 — the client sends the loans it showed; the server keeps only those still out."""
    gone, kept = _late(desk, 0, 2), _late(desk, 1, 2)
    _return(desk["client"], desk["copies"][0], "r1")
    response = _remind(desk, loan_ids=[gone, kept])
    assert [r["source_id"] for r in response.json()["data"]["reminders"]] == [kept]
    nothing = _remind(desk, loan_ids=[gone])
    assert nothing.json()["error"]["code"] == "library_nothing_overdue"


def test_an_accountant_may_read_the_list_but_not_record_a_reminder(desk: dict, api_as: Any) -> None:
    _late(desk, 0, 2)
    accountant, _ = api_as(desk["tenant"], role="accountant")
    assert accountant.get(reverse("v1:library-overdue")).status_code == 200
    refused = accountant.post(
        reverse("v1:library-overdue-remind", args=[desk["member"]]),
        {"channel": "whatsapp_manual"},
        format="json",
    )
    assert refused.status_code == 403


# ── the list (FR-4) ─────────────────────────────────────────────────────────


def test_the_list_groups_by_member_with_the_fine_and_the_last_reminder(desk: dict) -> None:
    _late(desk, 0, 3)
    _late(desk, 1, 10)
    _late(desk, 2, 1, member=_member_desk(desk))
    listed = desk["client"].get(reverse("v1:library-overdue")).json()
    assert listed["meta"]["totals"] == {"members": 2, "loans": 3, "fine_so_far": "28.00"}
    mine = next(r for r in listed["data"] if r["membership"]["id"] == desk["member"])
    assert [loan["days_late"] for loan in mine["loans"]] == [10, 3]
    assert (mine["fine_so_far_total"], mine["last_reminded_at"]) == ("26.00", None)
    week = desk["client"].get(reverse("v1:library-overdue"), {"days_min": 7}).json()
    assert [r["membership"]["id"] for r in week["data"]] == [desk["member"]]
    _remind(desk)
    quiet = desk["client"].get(reverse("v1:library-overdue"), {"not_reminded_days": 7}).json()
    assert desk["member"] not in [r["membership"]["id"] for r in quiet["data"]]
    bad = desk["client"].get(reverse("v1:library-overdue"), {"days_min": 5})
    assert bad.status_code == 400


# ── bulk (FR-6, BR-5) ───────────────────────────────────────────────────────


def test_bulk_prepare_writes_nothing_and_skips_a_member_without_a_mobile(desk: dict) -> None:
    other = _member_desk(desk)
    _late(desk, 0, 2)
    _late(desk, 2, 2, member=other)
    Party.objects.filter(pk=LibraryMembership.objects.get(pk=other).party_id).update(mobile=None)
    response = desk["client"].post(
        reverse("v1:library-overdue-bulk-prepare"),
        {"membership_ids": [desk["member"], other]},
        format="json",
    )
    items = {i["membership_id"]: i for i in response.json()["data"]["items"]}
    assert "skip_reason" not in items[desk["member"]] and items[desk["member"]]["wa_url"]
    assert items[other]["skip_reason"] == "no_mobile"
    assert not Reminder.objects.exists()


def test_bulk_prepare_refuses_more_than_a_hundred(desk: dict) -> None:
    import uuid

    response = desk["client"].post(
        reverse("v1:library-overdue-bulk-prepare"),
        {"membership_ids": [str(uuid.uuid4()) for _ in range(101)]},
        format="json",
    )
    assert response.json()["error"]["code"] == "too_many_ids"


# ── holds (FR-7, FR-8) ──────────────────────────────────────────────────────


def test_a_ready_hold_raises_the_bell_and_can_be_reminded_once_a_day(desk: dict) -> None:
    _issue(desk["client"], desk["member"], desk["copies"][0], "o1")
    _issue(desk["client"], desk["member"], desk["copies"][1], "o2")
    third = _member_desk(desk)
    _issue(desk["client"], third, desk["copies"][2], "o3")
    waiting = (
        desk["client"]
        .post(
            reverse("v1:library-members"),
            {
                "membership_type_id": str(desk["kind"].id),
                "party_id": str(PartyFactory(tenant=desk["tenant"]).id),
            },
            format="json",
            HTTP_IDEMPOTENCY_KEY="m-wait",
        )
        .json()["data"]["membership_id"]
    )
    desk["client"].post(
        reverse("v1:library-holds"),
        {"membership_id": waiting, "title_id": desk["title_id"]},
        format="json",
        HTTP_IDEMPOTENCY_KEY="h1",
    )
    _return(desk["client"], desk["copies"][0], "r1")
    bell = Notification.objects.get(type="library.hold_ready")
    assert (bell.title, bell.data["route"]) == (
        "1 books kept aside today",
        "/library/holds?tab=ready",
    )
    hold = LibraryHold.objects.get(membership_id=waiting)
    url = reverse("v1:library-hold-remind", args=[hold.id])
    sent = desk["client"].post(url, {"channel": "whatsapp_manual"}, format="json")
    assert sent.status_code == 201, sent.content
    assert "is kept for" in sent.json()["data"]["text"]
    again = desk["client"].post(url, {"channel": "whatsapp_manual"}, format="json")
    assert again.json()["error"]["code"] == "reminder_cap_reached"


def test_the_morning_notice_counts_the_books_that_became_overdue_today(desk: dict) -> None:
    _late(desk, 0, 1)
    _late(desk, 1, 5)
    assert reminders.notify_overdue_today(desk["tenant"], tenant_today(desk["tenant"])) == 1
    bell = Notification.objects.get(type="library.overdue_today")
    assert (bell.title, bell.data["route"]) == (
        "1 books became overdue today",
        "/library/overdue?days=1",
    )


# ── the issue slip ──────────────────────────────────────────────────────────


def test_the_issue_slip_lists_the_books_out_and_records_nothing(desk: dict) -> None:
    _issue(desk["client"], desk["member"], desk["copies"][0], "i1")
    slip = desk["client"].post(reverse("v1:library-member-slip", args=[desk["member"]]))
    assert slip.status_code == 200, slip.content
    assert "you have borrowed from" in slip.json()["data"]["text"]
    assert not Reminder.objects.exists()
