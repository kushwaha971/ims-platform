"""PLT-X06 — the reminder policy seam (A7, contracts §1.6, ADR-054).

T-PLT-X06-1 (window edges, next time across midnight), -2 (caps, and which
statuses count), -7 (tenant narrowing), plus the registries and the grouped
recorder (R10). The stand-in module is lending's policy: 08:00–19:00 IST, one per
record per day, fixed text.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.ledger.constants import ReminderKind, ReminderStatus
from apps.ledger.models import Reminder
from apps.ledger.services import reminder_seam as seam
from apps.ledger.tests.module_reminder_fixtures import (  # noqa: F401  (fixtures)
    MODULE,
    SOURCE,
    at_ist,
    clock,
    module_on,
    test_module,
)
from apps.platform_app.models import TenantSetting
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

DAY = dt.date(2026, 10, 12)


def _check(tenant: Any, party: Any, source_id: Any, at: dt.datetime) -> None:
    seam.check_reminder_allowed(
        tenant=tenant, module=MODULE, party_id=party.pk, source_id=source_id, at=at
    )


def _sent(tenant: Any, party: Any, source_id: Any, at: dt.datetime, **extra: Any) -> Reminder:
    return Reminder.objects.create(
        tenant=tenant,
        party=party,
        due_on=DAY,
        channel="whatsapp_manual",
        kind=ReminderKind.MANUAL,
        status=extra.pop("status", ReminderStatus.SENT),
        module=MODULE,
        source_type=SOURCE,
        source_id=source_id,
        sent_at=at if extra.pop("sent", True) else None,
        scheduled_for=at,
        **extra,
    )


# ── Window (T-PLT-X06-1, BR-2) ───────────────────────────────────────────────


@pytest.mark.parametrize(
    ("hour", "minute", "second", "allowed"),
    [(7, 59, 59, False), (8, 0, 0, True), (18, 59, 59, True), (19, 0, 0, False)],
)
def test_window_edges_are_tenant_local_and_half_open(
    tenant: Any, test_module: Any, hour: int, minute: int, second: int, allowed: bool
) -> None:
    """[08:00, 19:00) in Asia/Kolkata: 07:59:59 and 19:00:00 refused, both edges
    inside allowed."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    moment = at_ist(DAY, hour, minute, second)
    if allowed:
        _check(tenant, party, uuid.uuid4(), moment)
        return
    with pytest.raises(BusinessRuleViolation) as refused:
        _check(tenant, party, uuid.uuid4(), moment)
    assert refused.value.code == "reminder_outside_window"
    assert refused.value.details["window_start"] == "08:00"
    assert refused.value.details["window_end"] == "19:00"


def test_next_allowed_is_today_before_the_window_and_tomorrow_after_it(
    tenant: Any, test_module: Any
) -> None:
    """BR-2 across midnight: 06:00 → today 08:00; 19:00 and 23:30 → tomorrow 08:00;
    00:30 the next day → that day's 08:00."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    source = uuid.uuid4()

    def nxt(moment: dt.datetime) -> dt.datetime:
        return seam.next_allowed_at(
            tenant=tenant, module=MODULE, party_id=party.pk, source_id=source, after=moment
        )

    assert nxt(at_ist(DAY, 6)) == at_ist(DAY, 8)
    assert nxt(at_ist(DAY, 19)) == at_ist(DAY + dt.timedelta(days=1), 8)
    assert nxt(at_ist(DAY, 23, 30)) == at_ist(DAY + dt.timedelta(days=1), 8)
    assert nxt(at_ist(DAY + dt.timedelta(days=1), 0, 30)) == at_ist(DAY + dt.timedelta(days=1), 8)
    assert nxt(at_ist(DAY, 10)) == at_ist(DAY, 10)


def test_a_refusal_names_the_next_time_in_the_tenants_zone(tenant: Any, test_module: Any) -> None:
    """§6 — `next_allowed_at: "2026-10-13T08:00:00+05:30"`."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    with pytest.raises(BusinessRuleViolation) as refused:
        _check(tenant, party, uuid.uuid4(), at_ist(DAY, 19, 30))
    assert refused.value.details["next_allowed_at"] == "2026-10-13T08:00:00+05:30"


# ── Caps (T-PLT-X06-2, BR-3) ─────────────────────────────────────────────────


def test_the_cap_is_per_source_and_counts_sent_and_scheduled_only(
    tenant: Any, test_module: Any
) -> None:
    """Worked example: one send at 18:10 → the second at 18:40 is refused until
    tomorrow 08:00; a second loan due the same day is its own source; a FAILED
    or cancelled row does not use the cap."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    loan_a, loan_b, loan_c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    _sent(tenant, party, loan_a, at_ist(DAY, 18, 10))

    with pytest.raises(BusinessRuleViolation) as refused:
        _check(tenant, party, loan_a, at_ist(DAY, 18, 40))
    assert refused.value.code == "reminder_cap_reached"
    assert refused.value.details == {"cap": 1, "next_allowed_at": "2026-10-13T08:00:00+05:30"}

    _check(tenant, party, loan_b, at_ist(DAY, 18, 40))  # another loan: its own cap

    _sent(tenant, party, loan_c, at_ist(DAY, 9), status=ReminderStatus.FAILED)
    _sent(tenant, party, loan_c, at_ist(DAY, 9, 5), status=ReminderStatus.CANCELLED)
    _check(tenant, party, loan_c, at_ist(DAY, 18, 40))

    _sent(tenant, party, loan_c, at_ist(DAY, 10), status=ReminderStatus.SCHEDULED, sent=False)
    with pytest.raises(BusinessRuleViolation):
        _check(tenant, party, loan_c, at_ist(DAY, 18, 40))


def test_yesterdays_reminder_does_not_use_todays_cap(tenant: Any, test_module: Any) -> None:
    """The day is the TENANT's: 23:30 IST yesterday is not today."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    loan = uuid.uuid4()
    _sent(tenant, party, loan, at_ist(DAY - dt.timedelta(days=1), 18, 30))
    _check(tenant, party, loan, at_ist(DAY, 8))


def test_a_row_being_sent_does_not_refuse_itself(tenant: Any, test_module: Any) -> None:
    """A `scheduled` row counts (BR-3), so the send of THAT row excludes it."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    loan = uuid.uuid4()
    row = _sent(tenant, party, loan, at_ist(DAY, 10), status=ReminderStatus.SCHEDULED, sent=False)
    seam.check_reminder_allowed(
        tenant=tenant,
        module=MODULE,
        party_id=party.pk,
        source_id=loan,
        at=at_ist(DAY, 10, 1),
        exclude_id=row.pk,
    )


def test_a_per_party_cap_counts_every_source_of_the_module(tenant: Any, test_module: Any) -> None:
    module_on(tenant)
    seam._POLICIES[MODULE] = {**seam._POLICIES[MODULE], "daily_cap_per_party": 2}
    party = PartyFactory(tenant=tenant)
    _sent(tenant, party, uuid.uuid4(), at_ist(DAY, 9))
    _sent(tenant, party, uuid.uuid4(), at_ist(DAY, 10))
    with pytest.raises(BusinessRuleViolation) as refused:
        _check(tenant, party, uuid.uuid4(), at_ist(DAY, 11))
    assert refused.value.details["cap"] == 2


def test_no_policy_is_todays_behaviour_and_costs_no_query(
    tenant: Any, test_module: Any, django_assert_num_queries: Any
) -> None:
    """BR-4 — party reminders (`module=''`) and a module with no policy."""
    party = PartyFactory(tenant=tenant)
    with django_assert_num_queries(0):
        seam.check_reminder_allowed(
            tenant=tenant, module="", party_id=party.pk, source_id=None, at=at_ist(DAY, 23)
        )
        seam.check_reminder_allowed(
            tenant=tenant, module="gym", party_id=party.pk, source_id=None, at=at_ist(DAY, 23)
        )


# ── Tenant narrowing (T-PLT-X06-7, BR-5) ─────────────────────────────────────


def test_a_tenant_narrows_the_window_and_the_check_follows(tenant: Any, test_module: Any) -> None:
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    TenantSetting.objects.create(
        tenant=tenant, key=seam.window_setting_key(MODULE), value={"value": ["09:00", "18:00"]}
    )
    assert seam.effective_policy(tenant, MODULE)["window"] == (dt.time(9), dt.time(18))
    with pytest.raises(BusinessRuleViolation):
        _check(tenant, party, uuid.uuid4(), at_ist(DAY, 8, 30))
    _check(tenant, party, uuid.uuid4(), at_ist(DAY, 9))


@pytest.mark.parametrize(
    ("value", "message"),
    [
        (["07:00", "19:00"], "Can only be narrower than 08:00–19:00."),
        (["09:00", "20:00"], "Can only be narrower than 08:00–19:00."),
        (["10:00", "10:30"], "Keep at least one hour."),
        (["12:00", "11:00"], "The start must be before the end."),
        ("all day", "Give a start and an end time, like 09:00 and 18:00."),
    ],
)
def test_widening_or_a_window_under_an_hour_is_refused(
    test_module: Any, value: Any, message: str
) -> None:
    with pytest.raises(ValidationFailed) as refused:
        seam.validate_window(MODULE, value)
    assert refused.value.details == {"reminders.test.window": [message]}


def test_a_stored_wider_window_never_widens_the_policy(tenant: Any, test_module: Any) -> None:
    """A hand-edited row is ignored rather than trusted."""
    module_on(tenant)
    TenantSetting.objects.create(
        tenant=tenant, key=seam.window_setting_key(MODULE), value={"value": ["06:00", "23:00"]}
    )
    assert seam.effective_policy(tenant, MODULE)["window"] == (dt.time(8), dt.time(19))


# ── Registries (ADR-042) ─────────────────────────────────────────────────────


def test_registries_are_idempotent_and_refuse_a_conflict(test_module: Any) -> None:
    seam.register_reminder_policy(MODULE, dict(seam._POLICIES[MODULE]))  # type: ignore[arg-type]
    with pytest.raises(ImproperlyConfigured):
        seam.register_reminder_policy(MODULE, {"window": None})
    with pytest.raises(ImproperlyConfigured):
        seam.register_reminder_policy("x", {"window": (dt.time(19), dt.time(8))})
    with pytest.raises(ImproperlyConfigured):
        seam.register_reminder_source(SOURCE, module="other", candidates=lambda t, d: [])


def test_a_switched_off_modules_sources_disappear(tenant: Any, test_module: Any) -> None:
    """EC-4 — no candidates, no module; its history rows stay."""
    assert seam.reminder_modules(tenant) == []
    module_on(tenant)
    assert seam.reminder_modules(tenant) == [MODULE]


# ── The grouped recorder (R10) ───────────────────────────────────────────────


def test_one_message_about_several_records_is_one_row_each_sharing_a_group(
    tenant: Any, test_module: Any
) -> None:
    """Three overdue books: three rows, one `message_group_id`, `notice` when no
    amount; a refusal of any one records none."""
    module_on(tenant)
    party = PartyFactory(tenant=tenant)
    guardian = PartyFactory(tenant=tenant)
    ctx = Ctx.system(tenant)
    books = [uuid.uuid4() for _ in range(3)]
    rows = seam.record_source_reminders(
        ctx=ctx,
        party_id=party.pk,
        recipient_party_id=guardian.pk,
        module=MODULE,
        kind=ReminderKind.DUE,
        channel="whatsapp_manual",
        sources=[
            {"source_type": SOURCE, "source_id": book, "subject_label": f"Book {i}", "amount": None}
            for i, book in enumerate(books)
        ],
        text="3 books are overdue.",
        at=at_ist(DAY, 10),
    )
    assert len(rows) == 3
    assert len({row.message_group_id for row in rows}) == 1
    assert rows[0].message_group_id is not None
    assert {row.kind for row in rows} == {ReminderKind.NOTICE}
    assert {row.recipient_party_id for row in rows} == {guardian.pk}
    assert all(row.snapshot_balance is None for row in rows)

    before = Reminder.objects.count()
    with pytest.raises(BusinessRuleViolation):
        seam.record_source_reminders(
            ctx=ctx,
            party_id=party.pk,
            recipient_party_id=None,
            module=MODULE,
            kind=ReminderKind.DUE,
            channel="whatsapp_manual",
            sources=[
                {"source_type": SOURCE, "source_id": uuid.uuid4(), "amount": "10.00"},
                {"source_type": SOURCE, "source_id": books[0], "amount": None},  # capped
            ],
            text="x",
            at=at_ist(DAY, 11),
        )
    assert Reminder.objects.count() == before
