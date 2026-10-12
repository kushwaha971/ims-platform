"""`meta.has_any` on the party list (approved designs, 12 Oct 2026).

Customers with nobody in it hides its search and filters; Customers whose only
customer is archived, or whose search found nothing, keeps them — otherwise
the merchant could not get back to what they filtered away. Suppliers do not
count on Customers.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.parties.constants import PartyStatus
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db
LIST = "v1:party-list"


def _has_any(client: Any, **params: str) -> bool:
    return client.get(reverse(LIST), params).json()["meta"]["has_any"]


def test_an_empty_book_says_so(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    assert _has_any(client, type="customer") is False


def test_a_supplier_is_not_a_customer(tenant: Any, api_as: Any) -> None:
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Gupta Wholesale", is_customer=False, is_supplier=True)
    assert _has_any(client, type="customer") is False
    assert _has_any(client, type="supplier") is True


def test_an_archived_customer_and_an_empty_search_keep_the_filters(
    tenant: Any, api_as: Any
) -> None:
    client, _ = api_as(tenant)
    PartyFactory(tenant=tenant, name="Old Ramesh", is_customer=True, status=PartyStatus.ARCHIVED)
    body = client.get(reverse(LIST), {"type": "customer", "q": "zzz"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
