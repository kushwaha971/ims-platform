"""Pagination meta shapes (Part 22 §22.1, task S0-28)."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIRequestFactory

from apps.common.pagination import CursorPagination, decode_cursor, encode_cursor

pytestmark = pytest.mark.django_db


def test_page_meta_has_exactly_the_four_canon_keys(tenant: Any) -> None:
    """The PAGINATOR's contribution, asserted on the paginator.

    This used to read the `/parties` response and assert the whole `meta` had
    exactly four keys — which made it a test of that endpoint rather than of
    this class, and it broke the moment PTY-02 added `meta.totals`, a key Part
    22 §22.4 documents for that endpoint. An endpoint is allowed to say more
    than the paginator does; what must not drift is what the paginator itself
    contributes, which is what this now checks — the same way its cursor
    sibling below always has.
    """
    from rest_framework.request import Request

    from apps.common.pagination import PagePagination
    from apps.parties.models import Party
    from tests.factories.parties import PartyFactory

    PartyFactory.create_batch(3, tenant=tenant)
    paginator = PagePagination()
    request = Request(APIRequestFactory().get("/x"))
    paginator.paginate_queryset(Party.objects.for_tenant(tenant).order_by("id"), request)

    assert set(paginator.get_meta()) == {"page", "page_size", "total", "total_pages"}


def test_an_endpoint_may_add_to_the_meta_but_never_drop_a_canon_key(
    tenant: Any, api_as: Any
) -> None:
    """`/parties` adds `totals` (Part 22 §22.4). The four stay."""
    client, _member = api_as(tenant)
    meta = client.get(reverse("v1:party-list")).json()["meta"]
    assert {"page", "page_size", "total", "total_pages"} <= set(meta)


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


def test_a_two_column_cursor_does_not_drop_the_rows_that_tie(tenant: Any) -> None:
    """Prevents: paging a ledger timeline silently lost every entry that tied on date.

    A keyset cursor over more than one column is a TUPLE comparison —
    `(entry_date, created_at) < (X, Y)` — and the paginator was building an AND
    of independent terms instead: `entry_date < X AND created_at < Y`. Those are
    different predicates. Every row sharing the page's last `entry_date` fails
    `entry_date < X` and is skipped, however recent it is.

    One column hid it. `(-created_at, -id)` is the default ordering and those two
    columns are almost perfectly correlated — uuid7 ids sort by creation time —
    so the wrong predicate agreed with the right one on essentially every row,
    and the class shipped with a test that paged a list ordered by one field.

    LED-01 is the first caller that orders by two genuinely independent columns:
    the khata timeline is `(-entry_date, -created_at)`, and a shop that wrote
    down twelve entries on one busy Saturday pages through them three at a time.
    Under the old predicate the second page skipped the rest of Saturday and
    started on Friday, and nothing anywhere failed — the entries were in the
    database, the balance was right, and they were simply not on the screen.
    """
    from rest_framework.request import Request

    from apps.common.pagination import CursorPagination
    from apps.parties.models import Party
    from tests.factories.parties import PartyFactory

    # Six parties, all created in order, but only TWO distinct `balance` values
    # — the stand-in for two distinct entry dates with several entries each.
    for index in range(6):
        PartyFactory(tenant=tenant, balance="100.00" if index < 3 else "50.00")

    ordering = ("-balance", "-created_at")
    seen: list[str] = []
    cursor = ""
    for _ in range(4):  # generous: 6 rows at 2 per page is 3, plus a stop
        paginator = CursorPagination()
        request = Request(APIRequestFactory().get(f"/x?limit=2&cursor={cursor}"))
        rows = paginator.paginate_queryset(
            Party.objects.for_tenant(tenant), request, view=_OrderedBy(ordering)
        )
        seen.extend(str(row.id) for row in rows)
        if not paginator.has_more:
            break
        cursor = paginator.next_cursor or ""

    assert len(seen) == 6, "paging dropped rows that tied on the first sort column"
    assert len(set(seen)) == 6, "paging returned the same row on two pages"


class _OrderedBy:
    """The smallest thing `paginate_queryset` reads a `cursor_ordering` off."""

    def __init__(self, ordering: tuple[str, ...]) -> None:
        self.cursor_ordering = ordering
