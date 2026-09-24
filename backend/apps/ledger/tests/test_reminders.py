"""LED-06 — manual reminders: WhatsApp, the merchant's own SMS app, a call.

What these protect: the text is composed by the SERVER from the balance under
the lock and snapshotted on the row (BR-1, EC-4); nobody is chased for money
they do not owe (FR-8); a row says `sent` only after the merchant's tap calls
`/send`; bulk never marks anything sent on the merchant's behalf; the
accountant reads history but cannot remind (§12); and another tenant's
reminder is 404.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any
from urllib.parse import unquote

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.ledger.models import Reminder
from apps.notifications.models import MessageLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def owes(tenant: Any) -> Any:
    return PartyFactory(
        tenant=tenant, name="Ramesh Traders", mobile="+919812345678", balance=Decimal("2800.00")
    )


def _create(client: Any, party: Any, channel: str = "whatsapp_manual", **extra: Any) -> Any:
    return client.post(
        reverse("v1:reminder-list"),
        {"party_id": str(party.id), "channel": channel, **extra},
        format="json",
    )


def test_whatsapp_send_marks_sent_snapshots_and_logs_wa_me(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    """T-LED-06-4 / AC-1 — `sent`, `snapshot_balance=2800.00`, one wa_me log row."""
    tenant.upi_vpa = "sharma@okaxis"
    tenant.save(update_fields=["upi_vpa"])
    client, _ = api_as(tenant)
    created = _create(client, owes)
    assert created.status_code == 201 and created.json()["data"]["status"] == "scheduled"

    sent = client.post(reverse("v1:reminder-send", args=[created.json()["data"]["id"]]))
    assert sent.status_code == 200
    body = sent.json()["data"]
    decoded = unquote(body["wa_url"])
    assert body["wa_url"].startswith("https://wa.me/919812345678?text=")
    assert "Rs 2,800" in decoded and tenant.name in decoded and "am=2800.00" in decoded

    reminder = Reminder.objects.get()
    assert (reminder.status, reminder.snapshot_balance) == ("sent", Decimal("2800.00"))
    log = MessageLog.objects.get(pk=reminder.message_log_id)
    assert (log.channel, log.provider, log.status, log.cost) == (
        "whatsapp",
        "wa_me",
        "sent",
        Decimal("0"),
    )
    assert log.to_address == "919812345678"


def test_a_second_send_is_refused(tenant: Any, api_as: Any, owes: Any) -> None:
    """CCR-2 `reminder_not_sendable` — one tap, one row, one log line."""
    client, _ = api_as(tenant)
    rid = _create(client, owes).json()["data"]["id"]
    client.post(reverse("v1:reminder-send", args=[rid]))
    again = client.post(reverse("v1:reminder-send", args=[rid]))
    assert again.status_code == 409 and again.json()["error"]["code"] == "reminder_not_sendable"
    assert MessageLog.objects.count() == 1


def test_the_preview_writes_nothing(tenant: Any, api_as: Any, owes: Any) -> None:
    """The sheet's text comes from the server, and opening a sheet is not a nudge."""
    client, _ = api_as(tenant)
    response = client.post(
        reverse("v1:reminder-preview"), {"party_id": str(owes.id), "note": "Kal tak"}, format="json"
    )
    data = response.json()["data"]
    assert (
        response.status_code == 200 and "Kal tak" in data["text"] and data["balance"] == "2800.00"
    )
    assert data["sms_url"].startswith("sms:+919812345678?&body=")
    assert Reminder.objects.count() == 0 and MessageLog.objects.count() == 0


@pytest.mark.parametrize("balance", ["0.00", "-120.00"])
def test_nothing_due_is_refused(tenant: Any, api_as: Any, balance: str) -> None:
    """FR-8 / T-LED-06-3 — settled, or money the MERCHANT owes: nothing to ask for."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance=Decimal(balance))
    response = _create(client, party)
    assert response.status_code == 409 and response.json()["error"]["code"] == "nothing_due"


def test_no_mobile_is_a_field_error(tenant: Any, api_as: Any) -> None:
    """§10 — `details.party_id: ["Party has no mobile"]`."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, mobile=None, balance=Decimal("10"))
    response = _create(client, party)
    assert response.status_code == 400
    assert response.json()["error"]["details"]["party_id"] == ["Party has no mobile"]


def test_a_note_must_be_one_line(tenant: Any, api_as: Any, owes: Any) -> None:
    client, _ = api_as(tenant)
    assert _create(client, owes, note="line one\nline two").status_code == 400
    assert _create(client, owes, note="x" * 121).status_code == 400


def test_reminded_recently_comes_back_as_a_warning(tenant: Any, api_as: Any, owes: Any) -> None:
    """FR-10 / T-LED-06-6 — within 24 h the merchant is told, not blocked."""
    client, _ = api_as(tenant)
    first = _create(client, owes).json()["data"]["id"]
    client.post(reverse("v1:reminder-send", args=[first]))
    preview = client.post(reverse("v1:reminder-preview"), {"party_id": str(owes.id)}, format="json")
    assert preview.json()["data"]["warnings"][0]["code"] == "reminded_recently"

    Reminder.objects.filter(pk=first).update(sent_at=timezone.now() - dt.timedelta(hours=25))
    preview = client.post(reverse("v1:reminder-preview"), {"party_id": str(owes.id)}, format="json")
    assert preview.json()["data"]["warnings"] == []


def test_call_opens_the_dialler_and_logs_no_message(tenant: Any, api_as: Any, owes: Any) -> None:
    """FR-4 / AC-4 — staff may call; the reminder is `sent`, there is no message row."""
    client, _ = api_as(tenant, "staff")
    rid = _create(client, owes, channel="call").json()["data"]["id"]
    response = client.post(reverse("v1:reminder-send", args=[rid]))
    assert response.json()["data"]["tel_url"] == "tel:+919812345678"
    assert Reminder.objects.get().status == "sent" and MessageLog.objects.count() == 0


def test_the_sms_app_link_is_logged_as_the_merchants_own_text(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    """`sms_manual` (CR-LOG) — a `sms:` link from their phone, not a provider send."""
    client, _ = api_as(tenant)
    rid = _create(client, owes, channel="sms_manual").json()["data"]["id"]
    body = client.post(reverse("v1:reminder-send", args=[rid])).json()["data"]
    assert body["sms_url"].startswith("sms:+919812345678")
    log = MessageLog.objects.get()
    assert (log.channel, log.provider, log.template_code) == (
        "sms",
        "sms_link",
        "REMINDER_MANUAL_SMS",
    )


def test_provider_sms_without_a_provider_is_refused_outside_dev(
    tenant: Any, api_as: Any, owes: Any, settings: Any
) -> None:
    """FR-3 / T-LED-06-5 — `channel_not_configured` in production mode."""
    settings.UB_SMS_BACKEND = "apps.common.integrations.sms.console.ConsoleSmsBackend"
    client, _ = api_as(tenant)
    rid = _create(client, owes, channel="sms").json()["data"]["id"]
    response = client.post(reverse("v1:reminder-send", args=[rid]))
    assert (
        response.status_code == 409 and response.json()["error"]["code"] == "channel_not_configured"
    )


def test_bulk_marks_nothing_sent_and_reports_who_it_skipped(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    """FR-7 / BR-5 / T-LED-06-7 — a scheduled row and a link per eligible party;
    settled and no-mobile parties come back under `skipped` with the reason."""
    client, _ = api_as(tenant)
    settled = PartyFactory(tenant=tenant, balance=Decimal("0"))
    no_mobile = PartyFactory(tenant=tenant, mobile=None, balance=Decimal("50"))
    response = client.post(
        reverse("v1:reminder-bulk"),
        {
            "party_ids": [str(owes.id), str(settled.id), str(no_mobile.id)],
            "channel": "whatsapp_manual",
        },
        format="json",
    )
    data = response.json()["data"]
    assert response.status_code == 200
    assert [item["party_id"] for item in data["items"]] == [str(owes.id)]
    assert {s["party_id"]: s["reason"] for s in data["skipped"]} == {
        str(settled.id): "nothing_due",
        str(no_mobile.id): "no_mobile",
    }
    assert Reminder.objects.get().status == "scheduled"  # the tap sends, not the list

    client.post(reverse("v1:reminder-send", args=[data["items"][0]["reminder_id"]]))
    assert Reminder.objects.get().status == "sent"


def test_bulk_is_capped_at_one_hundred(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    import uuid

    ids = [str(uuid.uuid4()) for _ in range(101)]
    response = client.post(
        reverse("v1:reminder-bulk"), {"party_ids": ids, "channel": "whatsapp_manual"}, format="json"
    )
    assert response.status_code == 400


def test_the_history_strip_counts_sent_reminders(tenant: Any, api_as: Any, owes: Any) -> None:
    """FR-6 / AC-3 — "Reminded 2 times · last just now (WhatsApp)"."""
    client, _ = api_as(tenant)
    for _ in range(2):
        rid = _create(client, owes).json()["data"]["id"]
        client.post(reverse("v1:reminder-send", args=[rid]))
    _create(client, owes)  # scheduled, never tapped: not a reminder the customer got
    body = client.get(reverse("v1:reminder-list") + f"?party_id={owes.id}&page_size=5").json()
    assert body["meta"]["totals"]["sent"] == 2
    assert body["meta"]["totals"]["last_channel"] == "whatsapp_manual"
    assert len(body["data"]) == 3


def test_mark_done_and_dismissed(tenant: Any, api_as: Any, owes: Any) -> None:
    """FR-9 — an outcome on the row; unknown statuses are refused."""
    client, _ = api_as(tenant)
    rid = _create(client, owes).json()["data"]["id"]
    assert (
        client.patch(
            reverse("v1:reminder-detail", args=[rid]), {"status": "sent"}, format="json"
        ).status_code
        == 400
    )
    done = client.patch(
        reverse("v1:reminder-detail", args=[rid]), {"status": "done"}, format="json"
    )
    assert done.status_code == 200 and done.json()["data"]["status"] == "done"


def test_the_accountant_reads_history_but_cannot_remind(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    """§12 / T-LED-06-11 — `ledger.reminder.write` is not an accountant's."""
    accountant, _ = api_as(tenant, "accountant")
    owner, _ = api_as(tenant)
    rid = _create(owner, owes).json()["data"]["id"]
    assert accountant.get(reverse("v1:reminder-list")).status_code == 200
    assert _create(accountant, owes).status_code == 403
    assert (
        accountant.patch(
            reverse("v1:reminder-detail", args=[rid]), {"status": "done"}, format="json"
        ).status_code
        == 403
    )


def test_another_tenants_reminder_is_not_found(tenant: Any, other_tenant: Any, api_as: Any) -> None:
    """Canon §0.11 rule 2."""
    theirs_client, _ = api_as(other_tenant)
    theirs = PartyFactory(tenant=other_tenant, balance=Decimal("10"))
    rid = _create(theirs_client, theirs).json()["data"]["id"]
    mine, _ = api_as(tenant)
    assert mine.post(reverse("v1:reminder-send", args=[rid])).status_code == 404
    assert (
        mine.patch(
            reverse("v1:reminder-detail", args=[rid]), {"status": "done"}, format="json"
        ).status_code
        == 404
    )
    assert _create(mine, theirs).status_code == 404
