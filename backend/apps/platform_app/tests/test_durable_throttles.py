"""Security-relevant budgets are counted in PostgreSQL, not per worker (Part 27 §27.11).

DRF's throttles count in the cache, and the cache here is `LocMemCache`: one
counter per gunicorn worker, emptied by every restart. Part 27 §27.11 makes the
login, public-link and export budgets durable; Sprint 12 moved the export,
public-link, import-upload and import-commit budgets onto `platform_rate_limit`
and gave the reset-confirm route the budget it never had. `cache.clear()`
between requests is what a second worker or a restart looks like — none of
these budgets may notice it.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.platform_app.throttling import parse_rate

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("rate", "expected"),
    [
        ("10/hour", (10, 3600)),
        ("60/min", (60, 60)),
        ("600/day", (600, 86400)),
        # DRF reads only the period's first letter, so ITS "5/10min" is five a
        # minute. The durable parser honours the multiplier.
        ("5/10min", (5, 600)),
        ("3/s", (3, 1)),
    ],
)
def test_rates_parse_with_their_multiplier(rate: str, expected: tuple[int, int]) -> None:
    assert parse_rate(rate) == expected


def test_an_unparseable_rate_fails_loudly() -> None:
    with pytest.raises(ValueError):
        parse_rate("ten an hour")


def test_the_export_budget_survives_a_cleared_cache(tenant: Any, api_as: Any) -> None:
    """The eleventh statement export in an hour is refused even when every request
    lands on a "fresh worker" — before, each worker had its own ten."""
    from apps.common.constants import Direction
    from apps.ledger.constants import EntryStatus, EntryType, SourceType
    from apps.ledger.models import LedgerEntry
    from apps.platform_app.models import RateLimit
    from tests.factories.parties import PartyFactory

    party = PartyFactory(tenant=tenant, name="Aarav Traders", balance="500.00")
    LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=Decimal("500.00"),
        entry_date=dt.date.today() - dt.timedelta(days=10),
        entry_type=EntryType.MANUAL_GAVE,
        source_type=SourceType.MANUAL,
        status=EntryStatus.POSTED,
    )
    client, _ = api_as(tenant)
    url = reverse("v1:party-statement", args=[party.id])
    statuses = []
    for _ in range(11):
        cache.clear()
        statuses.append(client.get(url, {"format": "csv"}).status_code)
    assert statuses == [200] * 10 + [429]
    assert RateLimit.objects.filter(scope="drf:export").count() == 1


def test_reset_confirm_has_a_per_ip_budget(anonymous_client: Any) -> None:
    """The one unauthenticated auth route that had none. A 256-bit link is not
    guessable; the budget bounds the work one address can make the server do."""
    from apps.platform_app.services import throttle

    url = reverse("v1:auth-password-reset-confirm")
    body = {"token": "not-a-real-link", "new_password": "Almirah9876"}
    for _ in range(throttle.RESET_CONFIRMS_PER_IP):
        cache.clear()
        assert anonymous_client.post(url, body, format="json").status_code == 400
    refused = anonymous_client.post(url, body, format="json")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "rate_limited"


def test_import_upload_and_commit_are_on_durable_budgets() -> None:
    """IMP-01 §14's 20 uploads/hour and §27.11's 5 commits/hour/tenant are durable."""
    from rest_framework.test import APIRequestFactory

    from apps.imports.views.job import ImportCommitView, ImportJobListView
    from apps.platform_app.throttling import DurableRateThrottle

    upload = ImportJobListView()
    upload.request = APIRequestFactory().post("/")
    assert [type(t) for t in upload.get_throttles()] == [DurableRateThrottle]
    assert upload.get_throttles()[0].scope == "import_upload"

    commit = ImportCommitView()
    commit.request = APIRequestFactory().post("/")
    scopes = {getattr(t, "scope", None) for t in commit.get_throttles()}
    assert "import_commit" in scopes


def test_every_security_budget_named_by_part_27_has_a_rate() -> None:
    """A durable throttle with no rate silently allows everything — fail here instead."""
    from rest_framework.settings import api_settings

    rates = api_settings.DEFAULT_THROTTLE_RATES
    for scope in ("export", "public_link", "public_link_token", "import_upload", "import_commit"):
        assert parse_rate(rates[scope])[0] > 0, scope
