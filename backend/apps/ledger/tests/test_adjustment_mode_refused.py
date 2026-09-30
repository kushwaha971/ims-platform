"""R24 — LED-01's entry validation refuses `adjustment` (A4b, contracts §1.4).

A "You got ₹500 by adjustment" would be a khata line saying money arrived that
never did; the cashbook reads manual entries by mode, so it would also be the
one way an adjustment could leak into the drawer's figure.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.models import LedgerEntry
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_a_manual_you_got_by_adjustment_is_refused(tenant: Any, api_as: Any) -> None:
    from django.utils import timezone

    owner, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant)
    response = owner.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": str(party.id),
            "direction": Direction.CREDIT,
            "amount": "500.00",
            "entry_date": timezone.now().date().isoformat(),
            "payment_mode": "adjustment",
        },
        format="json",
    )
    assert response.status_code == 400, response.json()
    assert "payment_mode" in response.json()["error"]["details"]
    assert not LedgerEntry.objects.filter(party=party).exists()


def test_the_entry_service_refuses_it_too(tenant: Any) -> None:
    """The serializer is one door; the service is the other (LED-01's own
    validator runs for every caller, the opening balance and imports included)."""
    from apps.common.context import Ctx
    from apps.common.exceptions import ValidationFailed
    from apps.ledger.services.entries import post_entry

    party = PartyFactory(tenant=tenant)
    with pytest.raises(ValidationFailed) as refused:
        post_entry(
            ctx=Ctx.system(tenant),
            payload={
                "party_id": str(party.id),
                "direction": Direction.CREDIT,
                "amount": "500.00",
                "payment_mode": "adjustment",
            },
        )
    assert "payment_mode" in refused.value.details
