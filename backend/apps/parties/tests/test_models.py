"""Party constraints (Part 21 §21.3.3)."""

from __future__ import annotations

from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_mobile_is_unique_per_tenant(tenant: Any) -> None:
    PartyFactory(tenant=tenant, mobile="+919812345678")
    with pytest.raises(IntegrityError), transaction.atomic():
        PartyFactory(tenant=tenant, mobile="+919812345678")


def test_the_same_mobile_is_allowed_in_another_tenant(tenant: Any, other_tenant: Any) -> None:
    PartyFactory(tenant=tenant, mobile="+919812345678")
    PartyFactory(tenant=other_tenant, mobile="+919812345678")
    assert Party.objects.filter(mobile="+919812345678").count() == 2


def test_a_soft_deleted_row_frees_the_mobile(tenant: Any) -> None:
    """Part 21 §21.1 rule 8: unique constraints exclude soft-deleted rows."""
    first = PartyFactory(tenant=tenant, mobile="+919812345678")
    first.deleted_at = timezone.now()
    first.save(update_fields=["deleted_at"])
    PartyFactory(tenant=tenant, mobile="+919812345678")
    assert Party.all_objects.filter(mobile="+919812345678").count() == 2


def test_objects_hides_soft_deleted_rows_and_all_objects_shows_them(tenant: Any) -> None:
    party = PartyFactory(tenant=tenant)
    party.deleted_at = timezone.now()
    party.save(update_fields=["deleted_at"])
    assert Party.objects.for_tenant(tenant).count() == 0
    assert Party.all_objects.for_tenant(tenant).count() == 1


def test_many_parties_may_have_no_mobile(tenant: Any) -> None:
    PartyFactory(tenant=tenant, mobile=None)
    PartyFactory(tenant=tenant, mobile=None)
    assert Party.objects.for_tenant(tenant).filter(mobile__isnull=True).count() == 2


def test_balance_is_a_decimal_not_a_float(tenant: Any) -> None:
    from decimal import Decimal

    party = PartyFactory(tenant=tenant, balance="1234.50")
    party.refresh_from_db()
    assert isinstance(party.balance, Decimal)
    assert party.balance == Decimal("1234.50")


def test_the_primary_key_is_a_time_ordered_uuid7(tenant: Any) -> None:
    first, second = PartyFactory(tenant=tenant), PartyFactory(tenant=tenant)
    assert first.id.version == 7
    assert first.id < second.id  # time-ordered (ADR-009)
