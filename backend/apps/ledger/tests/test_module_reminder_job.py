"""PLT-X06 — the widened unique index, the CHECKs, and the automated job (A7).

T-PLT-X06-4 (two loans the same day are two rows; a rerun writes nothing; NULLS
NOT DISTINCT keeps today's party auto rows unique), the job's module half
(deferred into the window, re-checked at send — EC-6), and A6's relation
history now that reminders can name a recipient.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.common.context import Ctx
from apps.ledger.constants import ReminderChannel, ReminderKind, ReminderStatus
from apps.ledger.models import Reminder
from apps.ledger.services import auto_reminders
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
from apps.parties.models import PartyRelation
from apps.parties.services.relations import create_relation
from apps.platform_app.models import TenantSetting
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

DAY = dt.date(2026, 10, 12)


def _row(tenant: Any, party: Any, kind: str, source_id: Any = None, **extra: Any) -> Reminder:
    return Reminder.objects.create(
        tenant=tenant,
        party=party,
        due_on=DAY,
        channel=ReminderChannel.SMS,
        kind=kind,
        source_type=SOURCE if source_id else None,
        source_id=source_id,
        module=MODULE if source_id else "",
        **extra,
    )


# ── The database (T-PLT-X06-4) ───────────────────────────────────────────────


def test_two_sources_the_same_day_are_two_rows_and_a_rerun_conflicts(tenant: Any) -> None:
    party = PartyFactory(tenant=tenant)
    loan_a, loan_b = uuid.uuid4(), uuid.uuid4()
    _row(tenant, party, ReminderKind.DUE, loan_a, snapshot_balance="10.00")
    _row(tenant, party, ReminderKind.DUE, loan_b, snapshot_balance="10.00")
    with pytest.raises(IntegrityError), transaction.atomic():
        _row(tenant, party, ReminderKind.DUE, loan_a, snapshot_balance="10.00")


def test_todays_party_auto_rows_stay_unique_with_a_null_source(tenant: Any) -> None:
    """NULLS NOT DISTINCT — without it two NULL `source_id`s would both insert and
    the 09:00 job's double run would text a customer twice."""
    party = PartyFactory(tenant=tenant)
    _row(tenant, party, ReminderKind.AUTO_D0)
    with pytest.raises(IntegrityError), transaction.atomic():
        _row(tenant, party, ReminderKind.AUTO_D0)
    # A manual row is not covered by the index at all (R9).
    _row(tenant, party, ReminderKind.MANUAL)
    _row(tenant, party, ReminderKind.MANUAL)


def test_the_checks_refuse_half_a_source_and_a_notice_with_money(tenant: Any) -> None:
    party = PartyFactory(tenant=tenant)
    with pytest.raises(IntegrityError), transaction.atomic():
        Reminder.objects.create(
            tenant=tenant,
            party=party,
            due_on=DAY,
            channel=ReminderChannel.SMS,
            kind=ReminderKind.MANUAL,
            source_type=SOURCE,
        )
    with pytest.raises(IntegrityError), transaction.atomic():
        _row(tenant, party, ReminderKind.NOTICE, uuid.uuid4(), snapshot_balance="1.00")


# ── The automated job (§2 flow 4, EC-6, BR-10) ───────────────────────────────


@pytest.fixture
def auto_sms_on(tenant: Any) -> None:
    TenantSetting.objects.update_or_create(
        tenant=tenant, key="ledger.auto_sms", defaults={"value": {"value": "on"}}
    )


def test_the_job_writes_one_row_per_candidate_deferred_into_the_window(
    tenant: Any, test_module: Any, clock: Any, auto_sms_on: Any
) -> None:
    """09:00 run for a window that opens at 10:00 → `scheduled_for` 10:00; a rerun
    writes nothing new; a notice is a `notice` row with no amount."""
    module_on(tenant)
    TenantSetting.objects.create(
        tenant=tenant, key="reminders.test.window", value={"value": ["10:00", "18:00"]}
    )
    clock(at_ist(DAY, 9))
    party = PartyFactory(tenant=tenant, mobile="9876543210", sms_opt_in=True)
    due, notice = candidate(party, due_on=DAY), candidate(party, amount=None, due_on=DAY)
    CANDIDATES[tenant.pk] = [due, notice]

    auto_reminders.schedule_for_tenant(tenant=tenant, today=DAY)
    auto_reminders.schedule_for_tenant(tenant=tenant, today=DAY)

    rows = {row.source_id: row for row in Reminder.objects.filter(module=MODULE)}
    assert set(rows) == {due["source_id"], notice["source_id"]}
    assert rows[due["source_id"]].kind == ReminderKind.DUE
    assert rows[notice["source_id"]].kind == ReminderKind.NOTICE
    assert rows[notice["source_id"]].snapshot_balance is None
    assert all(row.scheduled_for == at_ist(DAY, 10) for row in rows.values())


def test_the_send_job_re_checks_and_cancels_what_is_no_longer_allowed(
    tenant: Any, test_module: Any, clock: Any, auto_sms_on: Any
) -> None:
    """EC-6 / EC-1 — at send time: a closed record is cancelled "no longer due";
    a send the policy refuses is cancelled with the reason, and nothing is sent."""
    module_on(tenant)
    clock(at_ist(DAY, 10))
    party = PartyFactory(tenant=tenant, mobile="9876543210", sms_opt_in=True)
    gone, late = candidate(party, due_on=DAY), candidate(party, due_on=DAY)
    CANDIDATES[tenant.pk] = [gone, late]
    auto_reminders.schedule_for_tenant(tenant=tenant, today=DAY)
    rows = {row.source_id: row for row in Reminder.objects.filter(module=MODULE)}

    CANDIDATES[tenant.pk] = [late]
    closed = auto_reminders.send_auto_reminder(
        reminder_id=rows[gone["source_id"]].pk, tenant=tenant, final_attempt=True
    )
    assert closed == {"cancelled": "source_closed"}

    clock(at_ist(DAY, 19, 30))
    refused = auto_reminders.send_auto_reminder(
        reminder_id=rows[late["source_id"]].pk, tenant=tenant, final_attempt=True
    )
    assert refused == {"cancelled": "reminder_outside_window"}
    row = Reminder.objects.get(pk=rows[late["source_id"]].pk)
    assert row.status == ReminderStatus.CANCELLED
    assert row.message_log_id is None


def test_the_send_job_delivers_to_the_recipient_with_the_sources_amount(
    tenant: Any, test_module: Any, clock: Any, auto_sms_on: Any
) -> None:
    module_on(tenant)
    clock(at_ist(DAY, 10))
    person = PartyFactory(tenant=tenant, mobile="+919876543210", sms_opt_in=True)
    guardian = PartyFactory(tenant=tenant, mobile="+919812345678", sms_opt_in=True)
    cand = candidate(person, due_on=DAY, recipient=guardian)
    CANDIDATES[tenant.pk] = [cand]
    auto_reminders.schedule_for_tenant(tenant=tenant, today=DAY)
    row = Reminder.objects.get(module=MODULE)

    outcome = auto_reminders.send_auto_reminder(
        reminder_id=row.pk, tenant=tenant, final_attempt=True
    )

    row.refresh_from_db()
    assert row.recipient_party_id == guardian.pk
    assert outcome in ({"sent": True}, {"failed": "provider_not_configured"})
    log = row.__class__._meta.apps.get_model("notifications", "MessageLog").objects.get(
        pk=row.message_log_id
    )
    assert log.to_address.endswith("45678")  # the GUARDIAN's number, not the person's
    assert log.template_code == "test_instalment_due"
    assert str(row.snapshot_balance) == "5625.00"


# ── A6's relation history ────────────────────────────────────────────────────


def test_a_guardian_link_a_reminder_used_is_ended_not_deleted(
    tenant: Any, api_as: Any, test_module: Any, clock: Any
) -> None:
    """PLT-X04 §5 through A7's counter: once a reminder went to the guardian, the
    DELETE ends the link, so "who was told, as whose guardian" survives."""
    module_on(tenant)
    clock(at_ist(DAY, 10))
    person = PartyFactory(tenant=tenant, mobile="9876543210")
    guardian = PartyFactory(tenant=tenant, mobile="9812345678")
    relation, _ = create_relation(
        ctx=Ctx.system(tenant), party=person, related_party_id=guardian.pk, kind="guardian"
    )
    client, _ = api_as(tenant)
    cand = candidate(person, recipient=guardian)
    CANDIDATES[tenant.pk] = [cand]
    created = client.post(
        reverse("v1:reminder-list"),
        {"source_type": SOURCE, "source_id": str(cand["source_id"]), "channel": "whatsapp_manual"},
        format="json",
    ).json()["data"]
    client.post(reverse("v1:reminder-send", args=[created["id"]]), {}, format="json")

    response = client.delete(
        reverse("v1:party-delete-relation", kwargs={"pk": person.pk, "rid": relation.pk})
    )

    assert response.status_code == 200
    assert PartyRelation.objects.get(pk=relation.pk).to_on is not None
