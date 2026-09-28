"""Fixtures for the import engine suites."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _fresh_throttles() -> Any:
    """The upload and export budgets are per user per hour, held in the cache —
    which outlives a test. Cleared so one suite's uploads never 429 the next."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def reference(db: Any) -> None:
    """GST slabs, UQC units and the HSN starter list — what items validate against."""
    from apps.common.management.commands.seed_reference_data import (
        seed_hsn,
        seed_tax_rates,
        seed_units,
    )

    seed_tax_rates()
    seed_units()
    seed_hsn()


@pytest.fixture
def owner(tenant: Any, api_as: Any) -> Any:
    client, member = api_as(tenant)
    client.member = member
    return client
