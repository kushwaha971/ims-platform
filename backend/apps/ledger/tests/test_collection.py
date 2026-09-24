"""LED-05 — collection dates and the Due today / Overdue / Upcoming buckets.

What these protect: the summary counts exactly the parties the party-list chip
lists (BR-1, AC-2); a new promise is today-or-later and needs money owed
(§10, CCR-2) while an unchanged overdue date survives an unrelated edit; and a
payment that settles the khata clears the date and cancels the scheduled
automated reminders in the same transaction (BR-2, AC-3).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.ledger.models import Reminder
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_summary_buckets_count_and_sum_only_money_owed(tenant: Any, api_as: Any) -> None:
    """BR-1 / T-LED-05-1 / T-LED-05-4 — T−1, T, T+1, T+7, T+8, with and without a balance."""
    client, _ = api_as(tenant)
    today = tenant_today(tenant)
    day = dt.timedelta(days=1)
    PartyFactory(tenant=tenant, collection_date=today - day, balance=Decimal("1200.00"))
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("3000.00"))
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("2000.00"))
    PartyFactory(tenant=tenant, collection_date=today, balance=Decimal("0.00"))  # paid
    PartyFactory(tenant=tenant, collection_date=today + day, balance=Decimal("100.00"))
    PartyFactory(tenant=tenant, collection_date=today + 7 * day, balance=Decimal("50.00"))
    PartyFactory(tenant=tenant, collection_date=today + 8 * day, balance=Decimal("999.00"))

    data = client.get(reverse("v1:ledger-summary")).json()["data"]
    assert data["due_today"] == {"count": 2, "amount": "5000.00"}
    assert data["overdue"] == {"count": 1, "amount": "1200.00"}
    assert data["upcoming_7d"] == {"count": 2, "amount": "150.00"}
    assert data["as_of"] == today.isoformat()

    listed = client.get(reverse("v1:party-list") + "?collection=today").json()["meta"]["totals"][
        "count"
    ]
    assert listed == data["due_today"]["count"]


def _patch(client: Any, party: Any, value: Any) -> Any:
    return client.patch(
        reverse("v1:party-detail", args=[party.id]), {"collection_date": value}, format="json"
    )


def test_a_new_date_in_the_past_is_refused(tenant: Any, api_as: Any) -> None:
    """§10 / T-LED-05-3."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance=Decimal("100"))
    yesterday = tenant_today(tenant) - dt.timedelta(days=1)
    response = _patch(client, party, yesterday.isoformat())
    assert response.status_code == 400 and "collection_date" in response.json()["error"]["details"]
    too_far = tenant_today(tenant) + dt.timedelta(days=366)
    assert _patch(client, party, too_far.isoformat()).status_code == 400


def test_a_payable_party_cannot_be_given_a_collection_date(tenant: Any, api_as: Any) -> None:
    """FR-6 / CCR-2 / T-LED-05-3 — 409 `collection_requires_receivable`."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance=Decimal("-500.00"))
    response = _patch(client, party, tenant_today(tenant).isoformat())
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "collection_requires_receivable"


def test_an_unchanged_overdue_date_survives_an_unrelated_edit(tenant: Any, api_as: Any) -> None:
    """The form resends every field; an overdue promise must not block a notes edit."""
    client, _ = api_as(tenant)
    overdue = tenant_today(tenant) - dt.timedelta(days=3)
    party = PartyFactory(tenant=tenant, balance=Decimal("100"), collection_date=overdue)
    response = client.patch(
        reverse("v1:party-detail", args=[party.id]),
        {"collection_date": overdue.isoformat(), "notes": "rings on Sundays"},
        format="json",
    )
    assert response.status_code == 200


def test_clearing_is_always_allowed(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance=Decimal("0"), collection_date=tenant_today(tenant))
    assert _patch(client, party, None).status_code == 200


def test_settling_clears_the_date_and_cancels_scheduled_reminders(tenant: Any, api_as: Any) -> None:
    """BR-2 / AC-3 / T-LED-05-2 — one payment, one transaction: date null,
    scheduled rows cancelled, a system audit row explaining why."""
    client, _ = api_as(tenant)
    tomorrow = tenant_today(tenant) + dt.timedelta(days=1)
    party = PartyFactory(tenant=tenant, balance=Decimal("500.00"), collection_date=tomorrow)
    Reminder.objects.create(
        tenant=tenant,
        party=party,
        due_on=tomorrow,
        channel="sms",
        kind="auto_d1",
        status="scheduled",
    )
    sent = Reminder.objects.create(
        tenant=tenant, party=party, due_on=tomorrow, channel="whatsapp_manual", status="sent"
    )

    response = client.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": str(party.id),
            "direction": "credit",
            "amount": "500.00",
            "entry_date": tenant_today(tenant).isoformat(),
            "payment_mode": "cash",
        },
        format="json",
    )
    assert response.status_code == 201
    party.refresh_from_db()
    assert party.collection_date is None
    auto = Reminder.objects.get(kind="auto_d1")
    assert (auto.status, auto.note) == ("cancelled", "balance settled")
    sent.refresh_from_db()
    assert sent.status == "sent"  # history is not rewritten
    cleared = AuditLog.objects.get(action="party.collection_date_cleared")
    assert cleared.actor_type == "system" and cleared.metadata["trigger"] == "balance_settled"


def test_a_partial_payment_keeps_the_date(tenant: Any, api_as: Any) -> None:
    """EC-1 — half paid is still due, with the reduced balance."""
    client, _ = api_as(tenant)
    party = PartyFactory(
        tenant=tenant, balance=Decimal("500.00"), collection_date=tenant_today(tenant)
    )
    client.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": str(party.id),
            "direction": "credit",
            "amount": "200.00",
            "entry_date": tenant_today(tenant).isoformat(),
            "payment_mode": "upi",
        },
        format="json",
    )
    party.refresh_from_db()
    assert party.collection_date == tenant_today(tenant) and party.balance == Decimal("300.00")
