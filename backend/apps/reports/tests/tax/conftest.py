"""Fixtures for the RPT-03/04/07 tests (the builders are in `builders.py`)."""

from __future__ import annotations

from typing import Any

import pytest
from django.core.cache import cache

from apps.reports.tests.tax.builders import TENANT_GSTIN


@pytest.fixture(autouse=True)
def _fresh_budget() -> Any:
    """The export budget is ten an hour per user, in a cache that outlives a test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def shop(tenant: Any) -> Any:
    """A regular GST tenant in Maharashtra (27), with the GST slabs seeded."""
    from apps.common.management.commands.seed_reference_data import seed_tax_rates, seed_units

    seed_tax_rates()
    seed_units()
    tenant.gst_type = "regular"
    tenant.gstin = TENANT_GSTIN
    tenant.state_code = "27"
    tenant.save()
    return tenant


@pytest.fixture
def owner(shop: Any, api_as: Any) -> Any:
    client, _ = api_as(shop)
    return client
