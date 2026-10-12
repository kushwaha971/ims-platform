"""`meta.has_any` on the item list (approved designs, 12 Oct 2026): an empty
catalogue hides its search, tabs and ₹0 totals; a search that finds nothing,
or a catalogue whose only item is archived, keeps them."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import RoleCode
from apps.inventory.constants import ItemStatus

pytestmark = pytest.mark.django_db
ITEMS = "v1:item-list"


@pytest.fixture
def owner(api_as: Any, tenant: Any, main: Any, reference: Any) -> Any:
    return api_as(tenant, RoleCode.OWNER.value)[0]


def test_an_empty_catalogue_says_so(owner: Any) -> None:
    assert owner.get(reverse(ITEMS)).json()["meta"]["has_any"] is False


def test_an_archived_item_still_counts(owner: Any, make_item: Any) -> None:
    item = make_item()
    item.status = ItemStatus.ARCHIVED
    item.save(update_fields=["status"])
    body = owner.get(reverse(ITEMS)).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
