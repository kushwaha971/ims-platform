"""`manage.py check_invariants` reports real drift (Sprint 12, restore runbook step 9).

It was the Sprint 0 shell — "tables do not exist yet … 0 violations", exit 0 —
long after both tables existed, so the step that is meant to stop a corrupted
restore reaching users could never fail.
"""

from __future__ import annotations

from io import StringIO
from typing import Any

import pytest
from django.core.management import call_command

from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_a_clean_book_exits_zero(tenant: Any) -> None:
    PartyFactory(tenant=tenant, name="Clean Traders")
    out = StringIO()
    call_command("check_invariants", stdout=out)
    assert "0 balance and 0 stock violation(s)" in out.getvalue()


def test_a_drifted_balance_exits_one_and_names_the_party_by_id(tenant: Any) -> None:
    from apps.parties.models import Party

    party = PartyFactory(tenant=tenant, name="Drifted Traders")
    Party.all_objects.filter(pk=party.pk).update(balance="12.34")
    out = StringIO()
    with pytest.raises(SystemExit) as exited:
        call_command("check_invariants", stdout=out)
    assert exited.value.code == 1
    assert str(party.id) in out.getvalue()
    assert "1 balance" in out.getvalue()
