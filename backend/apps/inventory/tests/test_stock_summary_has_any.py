"""`meta.has_any` on `/stock/summary` (approved designs, 12 Oct 2026).

A business with no tracked item sees one empty state and none of the
summary's controls; a business whose items are all at zero, or whose search
finds nothing, keeps them — "Hide zero stock" off is how a sold-out item is
found, and the flag must not be computed over the filtered set or it would
take that switch away exactly when it is needed.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import RoleCode

pytestmark = pytest.mark.django_db
URL = "v1:stock-summary"


@pytest.fixture
def owner(api_as: Any, tenant: Any, main: Any, reference: Any) -> Any:
    return api_as(tenant, RoleCode.OWNER.value)[0]


def test_a_business_with_no_tracked_item_has_an_empty_book(owner: Any) -> None:
    """Without the flag the screen cannot tell this apart from a filter that found nothing."""
    body = owner.get(reverse(URL)).json()
    assert body["data"] == [] and body["meta"]["has_any"] is False


def test_a_service_is_not_stock(owner: Any, make_item: Any) -> None:
    """The summary never lists an untracked service, so it must not keep the controls up."""
    make_item("Consulting", item_type="service", track_stock=False)
    assert owner.get(reverse(URL)).json()["meta"]["has_any"] is False


def test_items_all_at_zero_still_have_a_book(owner: Any, make_item: Any) -> None:
    """Hide-zero empties the page; the switch that undoes it must stay on screen."""
    make_item("Empty shelf")
    body = owner.get(reverse(URL)).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True


def test_a_search_that_finds_nothing_keeps_the_book(owner: Any, make_item: Any) -> None:
    """The flag ignores `q`; computing it over the filtered set would hide the search box."""
    make_item("Rice", opening=("3", "1"))
    body = owner.get(reverse(URL), {"q": "zzz"}).json()
    assert body["data"] == [] and body["meta"]["has_any"] is True
