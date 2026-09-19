"""The idempotency store (Part 20 §20.6.5, Part 22 §22.1, task S0-30)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from apps.common.constants import IdempotencyStatus
from apps.common.idempotency import canonical_json, purge_expired, request_hash
from apps.platform_app.models import IdempotencyKey

pytestmark = pytest.mark.django_db


def test_key_order_does_not_change_the_hash() -> None:
    left = request_hash(method="POST", path="/api/v1/ledger-entries", body={"a": 1, "b": 2})
    right = request_hash(method="POST", path="/api/v1/ledger-entries", body={"b": 2, "a": 1})
    assert left == right


def test_method_and_path_are_folded_in() -> None:
    body = {"amount": "100.00"}
    assert request_hash(method="POST", path="/api/v1/payments", body=body) != request_hash(
        method="POST", path="/api/v1/ledger-entries", body=body
    )
    assert request_hash(method="POST", path="/x", body=body) != request_hash(
        method="PUT", path="/x", body=body
    )


def test_decimal_is_canonicalised_as_a_string() -> None:
    from decimal import Decimal

    assert canonical_json({"amount": Decimal("100.50")}) == '{"amount":"100.50"}'


def test_unique_index_makes_a_second_claim_impossible(tenant: Any, user: Any) -> None:
    from django.db import IntegrityError, transaction

    IdempotencyKey.objects.create(
        tenant=tenant,
        user=user,
        key="k1",
        scope="ledger_entry",
        request_hash="a" * 64,
        status=IdempotencyStatus.IN_PROGRESS,
        expires_at=timezone.now() + timedelta(hours=24),
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        IdempotencyKey.objects.create(
            tenant=tenant,
            user=user,
            key="k1",
            scope="ledger_entry",
            request_hash="b" * 64,
            status=IdempotencyStatus.IN_PROGRESS,
            expires_at=timezone.now() + timedelta(hours=24),
        )


def test_the_same_key_in_two_scopes_is_two_rows(tenant: Any, user: Any) -> None:
    for scope in ("ledger_entry", "payment"):
        IdempotencyKey.objects.create(
            tenant=tenant,
            user=user,
            key="shared",
            scope=scope,
            request_hash="c" * 64,
            status=IdempotencyStatus.IN_PROGRESS,
            expires_at=timezone.now() + timedelta(hours=24),
        )
    assert IdempotencyKey.objects.filter(key="shared").count() == 2


def test_the_same_key_in_two_tenants_is_two_rows(tenant: Any, other_tenant: Any, user: Any) -> None:
    """Keys are scoped per tenant (Part 22 §22.1)."""
    for this_tenant in (tenant, other_tenant):
        IdempotencyKey.objects.create(
            tenant=this_tenant,
            user=user,
            key="shared",
            scope="payment",
            request_hash="d" * 64,
            status=IdempotencyStatus.IN_PROGRESS,
            expires_at=timezone.now() + timedelta(hours=24),
        )
    assert IdempotencyKey.objects.filter(key="shared", scope="payment").count() == 2


def test_purge_deletes_only_expired_rows(tenant: Any, user: Any) -> None:
    IdempotencyKey.objects.create(
        tenant=tenant,
        user=user,
        key="old",
        scope="payment",
        request_hash="e" * 64,
        status=IdempotencyStatus.COMPLETED,
        expires_at=timezone.now() - timedelta(hours=1),
    )
    IdempotencyKey.objects.create(
        tenant=tenant,
        user=user,
        key="new",
        scope="payment",
        request_hash="f" * 64,
        status=IdempotencyStatus.COMPLETED,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    assert purge_expired() == 1
    assert list(IdempotencyKey.objects.values_list("key", flat=True)) == ["new"]
