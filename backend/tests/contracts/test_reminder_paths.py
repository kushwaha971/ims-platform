"""T-PLT-X06-3 — no path records a reminder its module's policy refuses (A7, BR-1).

A policy that refuses everything (a one-minute window that is never "now") is
registered for the stand-in module, and every recording path is driven: create,
send, bulk, the automated job and `record_source_reminders`. None may leave a
`sent` row, and none may write a message log. A vertical endpoint that records
reminders joins this file with its own case (the contract the verticals keep).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation
from apps.ledger.constants import ReminderKind, ReminderStatus
from apps.ledger.models import Reminder
from apps.ledger.services import auto_reminders, reminder_seam
from apps.ledger.tests.module_reminder_fixtures import (  # noqa: F401  (fixtures)
    CANDIDATES,
    MODULE,
    SOURCE,
    at_ist,
    candidate,
    clock,
    module_on,
    test_module,
)
from apps.platform_app.models import TenantSetting
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

DAY = dt.date(2026, 10, 12)


@pytest.fixture
def refusing(tenant: Any, test_module: Any, clock: Any) -> dict:
    """Lending's policy, with the clock stopped at 23:00 — outside every window."""
    module_on(tenant)
    clock(at_ist(DAY, 23))
    party = PartyFactory(tenant=tenant, mobile="+919876543210", sms_opt_in=True)
    cand = candidate(party, due_on=DAY)
    CANDIDATES[tenant.pk] = [cand]
    TenantSetting.objects.update_or_create(
        tenant=tenant, key="ledger.auto_sms", defaults={"value": {"value": "on"}}
    )
    return {"party": party, "candidate": cand}


def _nothing_sent() -> None:
    assert not Reminder.objects.filter(module=MODULE, status=ReminderStatus.SENT).exists()
    assert not Reminder.objects.filter(module=MODULE, message_log_id__isnull=False).exists()


def test_create_refuses(tenant: Any, api_as: Any, refusing: dict) -> None:
    client, _ = api_as(tenant)
    response = client.post(
        reverse("v1:reminder-list"),
        {
            "source_type": SOURCE,
            "source_id": str(refusing["candidate"]["source_id"]),
            "channel": "whatsapp_manual",
        },
        format="json",
    )
    assert response.status_code == 409
    assert Reminder.objects.filter(module=MODULE).count() == 0


def test_send_refuses_a_row_created_while_it_was_allowed(
    tenant: Any, api_as: Any, refusing: dict, clock: Any
) -> None:
    client, _ = api_as(tenant)
    clock(at_ist(DAY, 10))
    created = client.post(
        reverse("v1:reminder-list"),
        {
            "source_type": SOURCE,
            "source_id": str(refusing["candidate"]["source_id"]),
            "channel": "whatsapp_manual",
        },
        format="json",
    ).json()["data"]
    clock(at_ist(DAY, 23))
    response = client.post(reverse("v1:reminder-send", args=[created["id"]]), {}, format="json")
    assert response.status_code == 409
    _nothing_sent()


def test_bulk_refuses(tenant: Any, api_as: Any, refusing: dict) -> None:
    client, _ = api_as(tenant)
    body = client.post(
        reverse("v1:reminder-bulk"),
        {
            "channel": "whatsapp_manual",
            "sources": [
                {"source_type": SOURCE, "source_id": str(refusing["candidate"]["source_id"])}
            ],
        },
        format="json",
    ).json()["data"]
    assert body["items"] == []
    assert body["skipped"][0]["code"] == "reminder_outside_window"
    assert Reminder.objects.filter(module=MODULE).count() == 0


def test_the_automated_job_refuses(tenant: Any, refusing: dict) -> None:
    auto_reminders.schedule_for_tenant(tenant=tenant, today=DAY)
    for row in Reminder.objects.filter(module=MODULE):
        auto_reminders.send_auto_reminder(reminder_id=row.pk, tenant=tenant, final_attempt=True)
    _nothing_sent()


def test_record_source_reminders_refuses(tenant: Any, refusing: dict) -> None:
    with pytest.raises(BusinessRuleViolation):
        reminder_seam.record_source_reminders(
            ctx=Ctx.system(tenant),
            party_id=refusing["party"].pk,
            recipient_party_id=None,
            module=MODULE,
            kind=ReminderKind.DUE,
            channel="whatsapp_manual",
            sources=[
                {
                    "source_type": SOURCE,
                    "source_id": refusing["candidate"]["source_id"],
                    "amount": "1.00",
                }
            ],
            text="x",
        )
    assert Reminder.objects.filter(module=MODULE).count() == 0


def test_preview_is_always_allowed_and_says_when(tenant: Any, api_as: Any, refusing: dict) -> None:
    """BR-1 — preview records nothing, so it is never refused; it reports."""
    client, _ = api_as(tenant)
    body = client.post(
        reverse("v1:reminder-preview"),
        {"source_type": SOURCE, "source_id": str(refusing["candidate"]["source_id"])},
        format="json",
    ).json()["data"]
    assert body["allowed"] is False
    assert body["next_allowed_at"] == "2026-10-13T08:00:00+05:30"
    assert Reminder.objects.filter(module=MODULE).count() == 0
