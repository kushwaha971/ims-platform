"""The durable throttle counter (Part 27 §27.4.1).

Part 27 makes the storage a normative detail, not an implementation choice:
"throttle state that must be correct lives in PostgreSQL (`platform_rate_limit`
counter rows with a `window_start`), not in `LocMemCache`". These tests assert
the storage as well as the behaviour, because the behaviour is identical for a
counter that is bypassed by a second gunicorn worker.
"""

from __future__ import annotations

import datetime as dt

import pytest
from django.utils import timezone

from apps.platform_app.services import throttle

pytestmark = pytest.mark.django_db

SCOPE = "test_scope"


def test_consume_allows_up_to_the_limit_and_then_refuses() -> None:
    for index in range(3):
        decision = throttle.consume(
            scope=SCOPE, identifier="+919876543210", limit=3, window_seconds=600
        )
        assert decision.allowed is True, index
        assert decision.count == index + 1

    refused = throttle.consume(scope=SCOPE, identifier="+919876543210", limit=3, window_seconds=600)
    assert refused.allowed is False
    assert 0 < refused.retry_after <= 600


def test_the_window_rolls_over() -> None:
    from apps.platform_app.models import RateLimit

    throttle.consume(scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600)
    assert not throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600
    ).allowed

    RateLimit.objects.filter(scope=SCOPE).update(
        window_start=timezone.now() - dt.timedelta(seconds=601)
    )
    assert throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600
    ).allowed


def test_two_identifiers_do_not_share_a_counter() -> None:
    throttle.consume(scope=SCOPE, identifier="a", limit=1, window_seconds=600)
    assert throttle.consume(scope=SCOPE, identifier="b", limit=1, window_seconds=600).allowed


def test_the_state_lives_in_postgresql_not_in_the_cache() -> None:
    """Part 27 §27.4.1: a per-process counter is bypassed across workers."""
    from django.core.cache import cache

    from apps.platform_app.models import RateLimit

    cache.clear()
    throttle.consume(scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600)
    assert RateLimit.objects.filter(scope=SCOPE).count() == 1
    # Clearing the process cache changes nothing: the row is the counter.
    cache.clear()
    assert not throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600
    ).allowed


def test_record_failure_locks_out_once_the_threshold_is_met() -> None:
    for index in range(2):
        decision = throttle.record_failure(
            scope=SCOPE,
            identifier="+919876543210",
            threshold=3,
            window_seconds=600,
            lockout_seconds=900,
        )
        assert decision.allowed is True, index

    locked = throttle.record_failure(
        scope=SCOPE,
        identifier="+919876543210",
        threshold=3,
        window_seconds=600,
        lockout_seconds=900,
    )
    assert locked.allowed is False
    assert 800 < locked.retry_after <= 900
    assert not throttle.check_lock(scope=SCOPE, identifier="+919876543210").allowed


def test_a_lockout_survives_the_window_it_was_set_in() -> None:
    """A lockout that expired with its window would be no lockout at all."""
    from apps.platform_app.models import RateLimit

    for _ in range(3):
        throttle.record_failure(
            scope=SCOPE,
            identifier="+919876543210",
            threshold=3,
            window_seconds=1,
            lockout_seconds=900,
        )
    RateLimit.objects.filter(scope=SCOPE).update(
        window_start=timezone.now() - dt.timedelta(seconds=600)
    )
    assert not throttle.check_lock(scope=SCOPE, identifier="+919876543210").allowed


def test_consume_refuses_while_the_identifier_is_locked_out() -> None:
    for _ in range(3):
        throttle.record_failure(
            scope=SCOPE,
            identifier="+919876543210",
            threshold=3,
            window_seconds=600,
            lockout_seconds=900,
        )
    refused = throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=100, window_seconds=600
    )
    assert refused.allowed is False


def test_the_minimum_gap_is_enforced_separately_from_the_window() -> None:
    """PLT-01 FR-7's 30-second resend gap, which is not the 10-minute window."""
    assert throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=5, window_seconds=600, min_gap_seconds=30
    ).allowed
    gapped = throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=5, window_seconds=600, min_gap_seconds=30
    )
    assert gapped.allowed is False
    assert gapped.retry_after <= 30


def test_clear_forgets_the_counter() -> None:
    throttle.consume(scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600)
    throttle.clear(scope=SCOPE, identifier="+919876543210")
    assert throttle.consume(
        scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600
    ).allowed


def test_check_lock_consumes_nothing() -> None:
    from apps.platform_app.models import RateLimit

    assert throttle.check_lock(scope=SCOPE, identifier="+919876543210").allowed
    assert not RateLimit.objects.filter(scope=SCOPE).exists()


def test_the_stored_key_is_a_sha256_of_the_identifier() -> None:
    """Part 27 §27.7.3: never the raw mobile number."""
    import hashlib

    from apps.platform_app.models import RateLimit

    throttle.consume(scope=SCOPE, identifier="+919876543210", limit=1, window_seconds=600)
    row = RateLimit.objects.get(scope=SCOPE)
    assert row.key == hashlib.sha256(b"+919876543210").hexdigest()


@pytest.mark.concurrency
@pytest.mark.django_db(transaction=True)
def test_two_workers_cannot_both_take_the_last_slot() -> None:
    """The row is locked `FOR UPDATE`, so `count` cannot be lost to a race.

    `transaction=True` because the point of the test is two *committed*
    connections contending; inside pytest-django's usual wrapping transaction
    the second connection would never see the first one's row at all.
    """
    import threading

    from django.db import connection

    from apps.platform_app.models import RateLimit

    RateLimit.objects.all().delete()
    throttle.consume(scope=SCOPE, identifier="+919876543210", limit=2, window_seconds=600)

    results: list[bool] = []
    lock = threading.Lock()
    barrier = threading.Barrier(2)

    def worker() -> None:
        barrier.wait()
        allowed = throttle.consume(
            scope=SCOPE, identifier="+919876543210", limit=2, window_seconds=600
        ).allowed
        with lock:
            results.append(allowed)
        connection.close()

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(results) == [False, True]
    assert RateLimit.objects.get(scope=SCOPE).count == 2
