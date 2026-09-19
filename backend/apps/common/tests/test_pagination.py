"""Pagination meta shapes (Part 22 §22.1, task S0-28)."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIRequestFactory

from apps.common.pagination import CursorPagination, decode_cursor, encode_cursor

pytestmark = pytest.mark.django_db


def test_page_meta_has_exactly_the_four_canon_keys(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    meta = client.get(reverse("v1:party-list")).json()["meta"]
    assert set(meta) == {"page", "page_size", "total", "total_pages"}


def test_cursor_meta_has_exactly_the_two_canon_keys(tenant: Any) -> None:
    from tests.factories.parties import PartyFactory

    PartyFactory.create_batch(5, tenant=tenant)
    from apps.parties.models import Party

    paginator = CursorPagination()
    request = APIRequestFactory().get("/x?limit=2")
    from rest_framework.request import Request

    rows = paginator.paginate_queryset(Party.objects.for_tenant(tenant), Request(request))
    assert len(rows) == 2
    assert set(paginator.get_meta()) == {"next_cursor", "has_more"}
    assert paginator.get_meta()["has_more"] is True


def test_the_cursor_walks_the_whole_set_without_repeats(tenant: Any) -> None:
    from rest_framework.request import Request

    from apps.parties.models import Party
    from tests.factories.parties import PartyFactory

    PartyFactory.create_batch(7, tenant=tenant)
    seen: list[str] = []
    cursor = None
    for _ in range(10):
        paginator = CursorPagination()
        url = "/x?limit=3" + (f"&cursor={cursor}" if cursor else "")
        rows = paginator.paginate_queryset(
            Party.objects.for_tenant(tenant), Request(APIRequestFactory().get(url))
        )
        seen.extend(str(row.id) for row in rows)
        meta = paginator.get_meta()
        if not meta["has_more"]:
            break
        cursor = meta["next_cursor"]
    assert len(seen) == 7
    assert len(set(seen)) == 7


def test_the_cursor_limit_is_capped(tenant: Any) -> None:
    paginator = CursorPagination()
    from rest_framework.request import Request

    assert paginator.get_limit(Request(APIRequestFactory().get("/x?limit=9999"))) == 200
    assert paginator.get_limit(Request(APIRequestFactory().get("/x?limit=abc"))) == 50


def test_a_tampered_cursor_decodes_to_nothing_rather_than_raising() -> None:
    assert decode_cursor("not-base64!!") == {}
    assert decode_cursor(None) == {}


def test_a_cursor_round_trips(party: Any) -> None:
    cursor = encode_cursor(party, ("-created_at", "-id"))
    payload = decode_cursor(cursor)
    assert set(payload) == {"created_at__lt", "id__lt"}
