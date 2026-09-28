"""LED-07 (D-1/D0 reminders) and LED-08 (the SMS on every entry).

What these protect: the schedule picks exactly the eligible parties (BR-1);
running it twice on one day creates nothing new (FR-7 — the unique index is
the proof); an opted-out customer is never texted (AC-2, Sprint 5 exit); with
no provider every row is `failed` with "provider not configured" so the owner
knows the customer did not get it (BR-6); the send re-checks at send time
(FR-3); and rapid entries coalesce into one SMS with the final balance
(LED-08 FR-3).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.apps import apps
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.common.jobs import REGISTRY
from apps.ledger.models import Reminder
from apps.ledger.services.auto_reminders import schedule_for_tenant, send_auto_reminder
from apps.ledger.services.entry_sms import send_entry_sms
from apps.ledger.services.reminder_settings import update_reminder_settings
from apps.notifications.models import MessageLog, Notification
from apps.notifications.tests.fakes import FAKE_PATH, FakeSmsBackend
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

CONSOLE = "apps.common.integrations.sms.console.ConsoleSmsBackend"


@pytest.fixture(autouse=True)
def _reset_fake() -> Any:
    FakeSmsBackend.reset()
    yield
    FakeSmsBackend.reset()


def _switch(tenant: Any, **values: bool) -> None:
    from apps.common.context import Ctx

    update_reminder_settings(ctx=Ctx.system(tenant), payload=values)


def _job_model() -> Any:
    return apps.get_model("platform", "Job")


def _send_all(tenant: Any) -> None:
    for reminder in Reminder.objects.filter(tenant=tenant, status="scheduled"):
        send_auto_reminder(reminder_id=reminder.id, tenant=tenant, final_attempt=True)


# ── LED-07 ──────────────────────────────────────────────────────────────────


def test_the_daily_jobs_are_registered_and_scheduled_at_nine() -> None:
    """FR-2 — `run_scheduler` materialises only registered types; 09:00 IST."""
    from apps.common.jobs import SCHEDULES

    for job_type in (
        "ledger.schedule_auto_reminders",
        "ledger.auto_reminders_for_tenant",
        "ledger.send_auto_reminder",
        "ledger.send_entry_sms",
        "platform.purge_notifications",
    ):
        assert job_type in REGISTRY
    daily = next(s for s in SCHEDULES if s.job_type == "ledger.schedule_auto_reminders")
    assert (daily.at_hour_ist, daily.minute) == (9, 0)


def test_eligibility_is_exactly_today_and_tomorrow_owed_opted_in_with_a_mobile(tenant: Any) -> None:
    """BR-1 / BR-2 / T-LED-07-1."""
    _switch(tenant, auto_sms=True)
    today = tenant_today(tenant)
    tomorrow = today + dt.timedelta(days=1)
    d0 = PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"))
    d1 = PartyFactory(tenant=tenant, collection_date=tomorrow, balance=Decimal("100"))
    PartyFactory(
        tenant=tenant, collection_date=today + dt.timedelta(days=2), balance=Decimal("100")
    )
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("0"))
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"), sms_opt_in=False)
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"), mobile=None)

    schedule_for_tenant(tenant=tenant, today=today)
    rows = {(r.party_id, r.kind) for r in Reminder.objects.filter(tenant=tenant)}
    assert rows == {(d0.id, "auto_d0"), (d1.id, "auto_d1")}


def test_a_second_run_on_the_same_day_creates_nothing(tenant: Any) -> None:
    """FR-7 / T-LED-07-2 — the double run the Sprint 5 exit criteria ask for."""
    _switch(tenant, auto_sms=True)
    today = tenant_today(tenant)
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"))
    schedule_for_tenant(tenant=tenant, today=today)
    jobs_after_first = _job_model().objects.filter(job_type="ledger.send_auto_reminder").count()
    schedule_for_tenant(tenant=tenant, today=today)
    assert Reminder.objects.count() == 1
    assert (
        _job_model().objects.filter(job_type="ledger.send_auto_reminder").count()
        == jobs_after_first
        == 1
    )


def test_setting_off_schedules_no_sms_but_still_raises_the_inbox_row(tenant: Any) -> None:
    """FR-1 default off; LED-05 §17's `reminder_due` does not depend on SMS."""
    today = tenant_today(tenant)
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"))
    schedule_for_tenant(tenant=tenant, today=today)
    assert Reminder.objects.count() == 0
    row = Notification.objects.get(type="reminder_due")
    assert row.count == 1 and row.data["route"].startswith("/ledger/reminders")


def test_with_no_provider_the_reminder_is_failed_with_a_reason(tenant: Any, settings: Any) -> None:
    """BR-6 / T-LED-07-4 / AC-3 — log `skipped`, reminder `failed`, owner told once."""
    settings.UB_SMS_BACKEND = CONSOLE
    _switch(tenant, auto_sms=True)
    today = tenant_today(tenant)
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"))
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("200"))
    schedule_for_tenant(tenant=tenant, today=today)
    _send_all(tenant)

    assert set(Reminder.objects.values_list("status", "note")) == {
        ("failed", "provider not configured")
    }
    assert set(MessageLog.objects.values_list("status", flat=True)) == {"skipped"}
    failed = Notification.objects.get(type="reminder_failed")
    assert failed.count == 2  # coalesced: one row for the day


def test_with_a_provider_d1_then_d0_go_out_and_a_third_run_adds_nothing(
    tenant: Any, settings: Any
) -> None:
    """AC-1 / T-LED-07-9 — "Rs 2,800" and "tomorrow" on the day before; "today" on the day."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    _switch(tenant, auto_sms=True)
    today = tenant_today(tenant)
    tomorrow = today + dt.timedelta(days=1)
    party = PartyFactory(
        tenant=tenant, collection_date=tomorrow, balance=Decimal("2800.00"), mobile="+919812345678"
    )

    schedule_for_tenant(tenant=tenant, today=today)
    _send_all(tenant)
    d1 = Reminder.objects.get(kind="auto_d1")
    assert (d1.status, d1.snapshot_balance) == ("sent", Decimal("2800.00"))
    assert (
        "Rs 2,800" in FakeSmsBackend.sent[0]["body"]
        and "tomorrow" in FakeSmsBackend.sent[0]["body"]
    )

    schedule_for_tenant(tenant=tenant, today=tomorrow)
    _send_all(tenant)
    assert Reminder.objects.get(kind="auto_d0").status == "sent"
    assert "today" in FakeSmsBackend.sent[1]["body"]

    schedule_for_tenant(tenant=tenant, today=tomorrow)
    _send_all(tenant)
    assert Reminder.objects.filter(party=party).count() == 2 and len(FakeSmsBackend.sent) == 2


def test_the_send_rechecks_and_cancels_a_settled_party(tenant: Any, settings: Any) -> None:
    """FR-3 / T-LED-07-3 — paid between 09:00 and the send: no SMS."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    _switch(tenant, auto_sms=True)
    today = tenant_today(tenant)
    party = PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"))
    schedule_for_tenant(tenant=tenant, today=today)
    party.balance = Decimal("0")
    party.save(update_fields=["balance"])
    _send_all(tenant)
    assert Reminder.objects.get().status == "cancelled" and FakeSmsBackend.sent == []


def test_a_missed_day_never_sends_a_late_day_before_message(tenant: Any) -> None:
    """BR-5 / T-LED-07-6 — collection date is today: only D0."""
    _switch(tenant, auto_sms=True)
    today = tenant_today(tenant)
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("100"))
    schedule_for_tenant(tenant=tenant, today=today)
    assert list(Reminder.objects.values_list("kind", flat=True)) == ["auto_d0"]


def test_only_owners_and_admins_change_the_switches(tenant: Any, api_as: Any) -> None:
    """T-LED-07-10 — `notifications.settings.manage`."""
    staff, _ = api_as(tenant, "staff")
    owner, _ = api_as(tenant)
    assert staff.get(reverse("v1:reminder-settings")).json()["data"]["auto_sms"] is False
    assert (
        staff.patch(reverse("v1:reminder-settings"), {"auto_sms": True}, format="json").status_code
        == 403
    )
    response = owner.patch(reverse("v1:reminder-settings"), {"auto_sms": True}, format="json")
    assert response.status_code == 200 and response.json()["data"]["auto_sms"] is True
    assert (
        owner.patch(reverse("v1:reminder-settings"), {"auto_sms": "yes"}, format="json").status_code
        == 400
    )


# ── LED-08 ──────────────────────────────────────────────────────────────────


def _post(client: Any, party: Any, direction: str = "debit", amount: str = "500.00") -> Any:
    payload = {
        "party_id": str(party.id),
        "direction": direction,
        "amount": amount,
        "entry_date": tenant_today(party.tenant).isoformat(),
    }
    if direction == "credit":
        payload["payment_mode"] = "cash"
    return client.post(reverse("v1:ledger-entry-list"), payload, format="json")


def _entry_jobs() -> Any:
    return _job_model().objects.filter(job_type="ledger.send_entry_sms").order_by("created_at")


def test_an_entry_queues_a_delayed_sms_only_when_everything_allows_it(
    tenant: Any, api_as: Any
) -> None:
    """FR-2 / T-LED-08-1 / T-LED-08-4 — setting on, opted in, a mobile; +60 s."""
    client, _ = api_as(tenant)
    opted_in = PartyFactory(tenant=tenant)
    opted_out = PartyFactory(tenant=tenant, sms_opt_in=False)

    _post(client, opted_in)
    assert _entry_jobs().count() == 0  # setting off by default

    _switch(tenant, party_sms_on_entry=True)
    _post(client, opted_in)
    _post(client, opted_out)
    jobs = list(_entry_jobs())
    assert [j.payload["party_id"] for j in jobs] == [str(opted_in.id)]
    assert (jobs[0].run_after - jobs[0].created_at).total_seconds() >= 59


def test_an_opening_balance_never_texts(tenant: Any, api_as: Any) -> None:
    """BR-3 / T-LED-08-2."""
    client, _ = api_as(tenant)
    _switch(tenant, party_sms_on_entry=True)
    client.post(
        reverse("v1:party-list"),
        {
            "name": "Opening Only",
            "opening_balance_amount": "900.00",
            "opening_balance_direction": "debit",
        },
        format="json",
    )
    assert _entry_jobs().count() == 0


def test_three_quick_entries_become_one_sms_with_the_final_balance(
    tenant: Any, api_as: Any, settings: Any
) -> None:
    """FR-3 / T-LED-08-3 — two jobs step aside; the newest sends MULTI with n=3."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    client, _ = api_as(tenant)
    _switch(tenant, party_sms_on_entry=True)
    party = PartyFactory(tenant=tenant, mobile="+919812345678")
    for amount in ("500.00", "200.00", "100.00"):
        _post(client, party, amount=amount)

    results = []
    for job in _entry_jobs():
        results.append(send_entry_sms(job=job, tenant=tenant, final_attempt=True))
        job.status = "succeeded"
        job.save(update_fields=["status"])
    assert results[0] == results[1] == {"skipped": "coalesced"}
    assert results[2]["template"] == "LEDGER_ENTRY_MULTI" and results[2]["coalesced"] == 3
    body = FakeSmsBackend.sent[0]["body"]
    assert "3 entries" in body and "Rs 800" in body and "(you will give)" in body


def test_the_first_sms_carries_the_opt_out_notice_and_later_ones_do_not(
    tenant: Any, api_as: Any, settings: Any
) -> None:
    """FR-7 / T-LED-08-5 — the DPDP notice, once."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    client, _ = api_as(tenant)
    _switch(tenant, party_sms_on_entry=True)
    party = PartyFactory(tenant=tenant, mobile="+919812345678")
    for amount in ("500.00", "100.00"):
        _post(client, party, amount=amount, direction="debit" if amount == "500.00" else "credit")
        job = _entry_jobs().filter(status="queued").last()
        send_entry_sms(job=job, tenant=tenant, final_attempt=True)
        job.status = "succeeded"
        job.save(update_fields=["status"])
    assert "Reply STOP" in FakeSmsBackend.sent[0]["body"]
    assert "Reply STOP" not in FakeSmsBackend.sent[1]["body"]
    assert "Received Rs 100" in FakeSmsBackend.sent[1]["body"]


def test_an_opt_out_after_queueing_is_honoured_at_send_time(
    tenant: Any, api_as: Any, settings: Any
) -> None:
    """NTF-02 BR-6 — consent is checked when the message goes, not when it was queued."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    client, _ = api_as(tenant)
    _switch(tenant, party_sms_on_entry=True)
    party = PartyFactory(tenant=tenant, mobile="+919812345678")
    _post(client, party)
    party.sms_opt_in = False
    party.save(update_fields=["sms_opt_in"])
    result = send_entry_sms(job=_entry_jobs().get(), tenant=tenant, final_attempt=True)
    assert result["status"] == "skipped" and FakeSmsBackend.sent == []
