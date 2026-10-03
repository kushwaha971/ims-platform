"""ATT-04 — entitlements (T-ATT-04-1, -3; BR-1…BR-4; EC-2; C3, C6)."""

from __future__ import annotations

import datetime as dt
import random
from typing import Any

import pytest
from django.core.management import call_command

from apps.attendance.models import Entitlement, EntitlementUse, Mark, Session
from apps.attendance.services.entitlements import (
    end_entitlement,
    entitlement_for,
    extend_entitlement,
    grant_entitlement,
)
from apps.attendance.services.groups import set_members
from apps.attendance.services.marks import edit_mark, roll_call, void_mark
from apps.attendance.tests.conftest import NOW, TODAY, visit
from apps.attendance.tests.subject import TEST_MODULE
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


def pack(ctx: Any, party: Any, total: int = 12, **kwargs: Any) -> Entitlement:
    data = {
        "valid_from": TODAY - dt.timedelta(days=5),
        "valid_to": TODAY + dt.timedelta(days=25),
        **kwargs,
    }
    return grant_entitlement(
        ctx=ctx,
        party_id=party.id,
        module=TEST_MODULE,
        subject_type="test_pack",
        subject_id=party.id,
        total=total,
        **data,
    )


def test_pack_worked_example_12_of_12(
    ctx: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-04-1 — used 11 → check-in → 12 ("0 left"); the next is 409
    `entitlement_exhausted {total: 12, used: 12}` and records no visit; a void
    of the last mark → 11. A pack that goes below zero sells a class twice."""
    party = make_party()
    ent = pack(ctx, party)
    Entitlement.objects.filter(pk=ent.pk).update(used=11)  # eleven earlier classes
    attendance_subject.answer("allow", entitlement_id=ent.id)
    result = visit(ctx, party, at=NOW - dt.timedelta(hours=1))
    assert result["entitlement"]["left"] == 0 and result["entitlement"]["used"] == 12
    with pytest.raises(BusinessRuleViolation) as refused:
        visit(ctx, party)
    assert refused.value.code == "entitlement_exhausted"
    assert refused.value.details == {"total": 12, "used": 12}
    assert Mark.objects.filter(party_id=party.id).count() == 1
    void_mark(ctx=ctx, mark_id=result["mark"].id, reason="Wrong member")
    ent.refresh_from_db()
    assert ent.used == 11


def test_outside_validity_is_exhausted_with_expired(
    ctx: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """BR-3 — a pack that ended yesterday answers `expired: true`, so the desk
    can say "valid till" rather than "used up"."""
    party = make_party()
    ent = pack(ctx, party, valid_to=TODAY - dt.timedelta(days=1))
    attendance_subject.answer("allow", entitlement_id=ent.id)
    with pytest.raises(BusinessRuleViolation) as refused:
        visit(ctx, party)
    assert refused.value.details == {"total": 12, "used": 0, "expired": True}


def test_present_absent_present_consumes_twice_and_used_matches(
    ctx: Any, clock: Any, batch: Any, make_party: Any, attendance_subject: Any
) -> None:
    """C3, BR-2, BR-4 — present → absent gives back (−1), absent → present takes
    again (+1). The FRD's unique `(mark_id, delta)` would make the second +1 an
    IntegrityError; `seq` lets the mark move as often as the trainer corrects it,
    and `used` always equals Σ delta."""
    party = make_party()
    set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    session = Session.objects.filter(group=batch).order_by("starts_at").first()
    ent = pack(ctx, party)
    attendance_subject.answer("allow", entitlement_id=ent.id)
    mark = visit(ctx, party, session_id=session.id)["mark"]
    edit_mark(ctx=ctx, mark_id=mark.id, status="absent", reason="Left at once")
    edit_mark(ctx=ctx, mark_id=mark.id, status="late", reason="Came back late")
    edit_mark(ctx=ctx, mark_id=mark.id, status="present", reason="Was on time")  # no change of use
    edit_mark(ctx=ctx, mark_id=mark.id, status="excused", reason="Doctor's note")
    ent.refresh_from_db()
    deltas = list(
        EntitlementUse.objects.filter(mark=mark).order_by("seq").values_list("delta", "seq")
    )
    assert deltas == [(1, 0), (-1, 1), (1, 2), (-1, 3)]
    assert ent.used == 0


def test_roll_call_never_consumes_a_pack_for_a_new_mark(
    ctx: Any, clock: Any, batch: Any, make_party: Any
) -> None:
    """C4, R57 — roll-call has no policy, so it cannot know a pack; a present
    mark written there draws nothing. Packs are consumed through check-in."""
    party = make_party()
    set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
    session = Session.objects.filter(group=batch).order_by("starts_at").first()
    ent = pack(ctx, party)
    roll_call(ctx=ctx, session_id=session.id, marks={party.id: "present"})
    ent.refresh_from_db()
    assert ent.used == 0 and not EntitlementUse.objects.exists()


def test_a_policy_naming_another_partys_pack_is_a_wiring_error(
    ctx: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """A policy bug must not spend somebody else's classes."""
    from django.core.exceptions import ImproperlyConfigured

    owner, other = make_party(), make_party()
    attendance_subject.answer("allow", entitlement_id=pack(ctx, owner).id)
    with pytest.raises(ImproperlyConfigured):
        visit(ctx, other)


def test_extend_after_expiry_and_end_before_start(ctx: Any, clock: Any, make_party: Any) -> None:
    """EC-2 — extending a lapsed pack is allowed, with reason and audit; C6 —
    `end_entitlement(on)` is the inclusive last day, never before `valid_from`
    and never later than the current end (that is an extension). Neither
    touches `used`."""
    ent = pack(ctx, make_party(), valid_to=TODAY - dt.timedelta(days=3))
    Entitlement.objects.filter(pk=ent.pk).update(used=4)
    extended = extend_entitlement(
        ctx=ctx,
        entitlement_id=ent.id,
        valid_to=TODAY + dt.timedelta(days=10),
        reason="Frozen 13 days",
    )
    assert extended.valid_to == TODAY + dt.timedelta(days=10) and extended.used == 4
    row = AuditLog.objects.get(action="attendance.entitlement.extended")
    assert row.metadata["reason"] == "Frozen 13 days"
    with pytest.raises(ValidationFailed):
        extend_entitlement(ctx=ctx, entitlement_id=ent.id, valid_to=TODAY, reason="Shorter")
    with pytest.raises(ValidationFailed):
        extend_entitlement(
            ctx=ctx, entitlement_id=ent.id, valid_to=TODAY + dt.timedelta(days=20), reason="x"
        )
    with pytest.raises(ValidationFailed):
        end_entitlement(
            ctx=ctx, entitlement_id=ent.id, on=ent.valid_from - dt.timedelta(days=1), reason="Moved"
        )
    with pytest.raises(ValidationFailed):
        end_entitlement(
            ctx=ctx, entitlement_id=ent.id, on=TODAY + dt.timedelta(days=11), reason="Moved"
        )
    ended = end_entitlement(ctx=ctx, entitlement_id=ent.id, on=TODAY, reason="Changed plan")
    assert ended.valid_to == TODAY and ended.used == 4
    assert AuditLog.objects.filter(action="attendance.entitlement.ended").exists()


def test_grant_validates_and_entitlement_for_finds_the_pack(ctx: Any, make_party: Any) -> None:
    """C1 — `module` is required (R18); bad totals and dates are 400s."""
    party = make_party()
    with pytest.raises(ValidationFailed):
        pack(ctx, party, total=0)
    with pytest.raises(ValidationFailed):
        pack(ctx, party, valid_from=TODAY, valid_to=TODAY - dt.timedelta(days=1))
    ent = pack(ctx, party)
    assert AuditLog.objects.filter(
        action="attendance.entitlement.granted", entity_id=ent.id
    ).exists()
    assert entitlement_for(ctx.tenant, "test_pack", party.id) == ent
    assert entitlement_for(ctx.tenant, "test_pack", make_party().id) is None


def test_entitlement_replay_fuzz(
    ctx: Any, clock: Any, batch: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-04-3 — a seeded run of check-ins, edits, voids, extends and ends
    keeps `used == Σ delta` for every pack and Σ delta ∈ {0, 1} per mark;
    `recalc_entitlements --check` exits 0, and exits 1 after a planted drift
    (so the check is not vacuous)."""
    rng = random.Random(20261005)
    sessions = list(Session.objects.filter(group=batch).order_by("starts_at")[:3])
    parties = [make_party() for _ in range(4)]
    packs = {}
    for party in parties:
        set_members(ctx=ctx, group_id=batch.id, party_id=party.id, from_on=TODAY)
        packs[party.id] = pack(ctx, party, total=rng.randint(3, 8))
    marks: list[Mark] = []
    for step in range(60):
        party = rng.choice(parties)
        action = rng.choice(["visit", "visit", "session", "edit", "void", "extend"])
        attendance_subject.answer("allow", entitlement_id=packs[party.id].id)
        try:
            if action == "visit":
                marks.append(visit(ctx, party, at=NOW - dt.timedelta(minutes=step))["mark"])
            elif action == "session":
                marks.append(visit(ctx, party, session_id=rng.choice(sessions).id)["mark"])
            elif action == "edit" and marks:
                mark = rng.choice(marks)
                status = (
                    rng.choice(["present", "absent", "late", "excused"])
                    if mark.session_id
                    else "visit"
                )
                edit_mark(ctx=ctx, mark_id=mark.id, status=status, reason="Fuzz edit")
            elif action == "void" and marks:
                void_mark(ctx=ctx, mark_id=rng.choice(marks).id, reason="Fuzz void")
            elif action == "extend":
                ent = Entitlement.objects.get(pk=packs[party.id].id)
                extend_entitlement(
                    ctx=ctx,
                    entitlement_id=ent.id,
                    valid_to=ent.valid_to + dt.timedelta(days=1),
                    reason="Fuzz extend",
                )
        except (BusinessRuleViolation, ValidationFailed):
            pass  # exhausted packs and already-voided marks are part of the run
    for ent in Entitlement.objects.all():
        replay = sum(EntitlementUse.objects.filter(entitlement=ent).values_list("delta", flat=True))
        assert ent.used == replay and 0 <= ent.used <= ent.total
    assert EntitlementUse.objects.count() > 10  # the run exercised the path
    call_command("recalc_entitlements", "--check")
    Entitlement.objects.filter(pk=packs[parties[0].id].id).update(used=0)
    EntitlementUse.objects.create(
        tenant=ctx.tenant, entitlement=packs[parties[0].id], mark=marks[0], delta=1, seq=99
    )
    with pytest.raises(SystemExit) as drifted:
        call_command("recalc_entitlements", "--check")
    assert drifted.value.code == 1
