"""Concurrency (T-ATT-02-3, T-ATT-04-2): two real connections at once.

The party lock is what serialises two desks tapping the same member. These
tests run two check-ins on two threads, released together by a barrier, and
assert the outcome a merchant must see — one mark and one 409 — rather than
assume the lock is taken where the code says it is.
"""

from __future__ import annotations

import datetime as dt
import threading
from typing import Any

import pytest
from django.db import connection

from apps.attendance.models import Entitlement, EntitlementUse, Mark
from apps.attendance.services.entitlements import grant_entitlement
from apps.attendance.tests.conftest import NOW, TODAY, visit
from apps.attendance.tests.subject import TEST_MODULE

pytestmark = pytest.mark.django_db(transaction=True)


def _together(*calls: Any) -> list[str]:
    barrier = threading.Barrier(len(calls))
    outcomes: list[str] = [""] * len(calls)

    def run(index: int, fn: Any) -> None:
        try:
            barrier.wait()
            fn()
            outcomes[index] = "ok"
        except Exception as exc:  # noqa: BLE001 — the outcome IS the assertion
            outcomes[index] = getattr(exc, "code", type(exc).__name__)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert not any(t.is_alive() for t in threads), "a check-in hung"
    return sorted(outcomes)


def test_two_concurrent_check_ins_of_one_party_give_one_mark_and_one_409(
    ctx: Any, desk: Any, clock: Any, make_party: Any
) -> None:
    """T-ATT-02-3 — with a desk group (a group-less visit has no dedupe, R59, so
    the FRD's test as worded would pass with two marks): the second tap waits
    on the party lock, then sees the first visit and is a duplicate."""
    party = make_party()
    outcomes = _together(
        lambda: visit(ctx, party, group_id=desk.id),
        lambda: visit(ctx, party, group_id=desk.id),
    )
    assert outcomes == ["attendance_duplicate", "ok"]
    assert Mark.objects.filter(party_id=party.id).count() == 1


def test_two_check_ins_at_total_minus_one(
    ctx: Any, clock: Any, make_party: Any, attendance_subject: Any
) -> None:
    """T-ATT-04-2 — a pack with one use left and two simultaneous check-ins:
    one consumes, one is `entitlement_exhausted`; `used` never passes `total`."""
    party = make_party()
    ent = grant_entitlement(
        ctx=ctx,
        party_id=party.id,
        module=TEST_MODULE,
        subject_type="test_pack",
        subject_id=party.id,
        total=5,
        valid_from=TODAY,
        valid_to=TODAY + dt.timedelta(days=30),
    )
    Entitlement.objects.filter(pk=ent.pk).update(used=4)
    attendance_subject.answer("allow", entitlement_id=ent.id)
    outcomes = _together(
        lambda: visit(ctx, party, at=NOW - dt.timedelta(minutes=1)),
        lambda: visit(ctx, party, at=NOW - dt.timedelta(minutes=2)),
    )
    assert outcomes == ["entitlement_exhausted", "ok"]
    ent.refresh_from_db()
    assert ent.used == 5 and EntitlementUse.objects.filter(entitlement=ent).count() == 1
