"""The check-in policy contract (FRD 00 ATT-02 T-ATT-02-6, contracts §2.3).

`check_in` is the hottest desk path (p95 under 150 ms server time), and the one
query in it the engine does not control is the vertical's policy. So every
registered policy must answer in ONE query for a member with a year of
history — a policy that walks the member's visits, or asks per membership, is
a desk that slows down as the gym succeeds.

The vertical policies join this suite by being registered from their app's
`ready()`; until gym lands (Wave C) the only policy is the planted one below,
which reads a year of marks in a single aggregate, so the suite is not vacuous.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.attendance import registry
from apps.attendance.models import Mark
from apps.attendance.tests.subject import attendance_subject  # noqa: F401  (fixture)
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

PLANTED = "contract_planted"


def _planted_policy(tenant: Any, party_id: Any, context_id: Any, on: dt.date) -> dict:
    visits = Mark.objects.filter(
        tenant=tenant, party_id=party_id, voided_at__isnull=True, on_date__lte=on
    ).count()
    return {"decision": "allow" if visits < 1000 else "warn", "reason": f"{visits} visits"}


def test_every_registered_policy_answers_in_one_query(
    tenant: Any, attendance_subject: Any  # noqa: F811
) -> None:
    """T-ATT-02-6 — with 365 days of visits on file, each policy asks once."""
    registry.register_checkin_policy(PLANTED, module="test", policy=_planted_policy)
    party = PartyFactory(tenant=tenant)
    today = dt.date(2026, 10, 5)
    Mark.objects.bulk_create(
        [
            Mark(
                tenant=tenant,
                module="test",
                party=party,
                on_date=today - dt.timedelta(days=d),
                status="visit",
                check_in_at=dt.datetime.combine(
                    today - dt.timedelta(days=d), dt.time(6), tzinfo=dt.timezone.utc
                ),
                method="desk",
            )
            for d in range(365)
        ]
    )
    policies = registry.registered_policies()
    assert PLANTED in policies
    for context_type, entry in policies.items():
        with CaptureQueriesContext(connection) as queries:
            answer = registry.normalise(entry.policy(tenant, party.id, None, today))
        assert answer["decision"] in ("allow", "warn", "block")
        assert len(queries.captured_queries) <= 1, (context_type, queries.captured_queries)
