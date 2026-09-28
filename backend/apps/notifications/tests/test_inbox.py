"""NTF-01 — the bell and the inbox.

What these protect: a broadcast reaches only members whose role holds its
permission (BR-1); the badge counts exactly what the list can show (§5); read
state is per member on a shared row; coalescing merges only while unread
(BR-3); another tenant's or another user's row is 404, never 403 (§19); and
nothing is kept past 180 days (FR-10).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.notifications.models import Notification
from apps.notifications.services.notify import UnknownNotificationType, notify, purge_old

pytestmark = pytest.mark.django_db


def _count(client: Any) -> int:
    return client.get(reverse("v1:notification-unread-count")).json()["data"]["count"]


def test_a_broadcast_reaches_only_members_holding_its_permission(tenant: Any, api_as: Any) -> None:
    """BR-1 / T-NTF-01-2 — staff lack `notifications.settings.manage`, so a
    failed-SMS row (which names the business's collection trouble) never
    reaches them, while the due-today row (`ledger.entry.read`) does."""
    owner, _ = api_as(tenant, "owner")
    staff, _ = api_as(tenant, "staff")
    notify(tenant, "reminder_failed", params={"count": 1}, group_key="d1")
    notify(tenant, "reminder_due", params={"count": 3}, group_key="d1")

    assert _count(owner) == 2
    assert _count(staff) == 1
    types = [row["type"] for row in staff.get(reverse("v1:notification-list")).json()["data"]]
    assert types == ["reminder_due"]


def test_read_state_is_per_member_on_a_shared_row(tenant: Any, api_as: Any) -> None:
    """FR-5 — one broadcast row; the owner reading it does not read it for the admin."""
    owner, _ = api_as(tenant, "owner")
    admin, _ = api_as(tenant, "admin")
    row = notify(tenant, "reminder_due", params={"count": 2}, group_key="d")

    response = owner.post(reverse("v1:notification-read", args=[row.id]))
    assert response.status_code == 204
    assert (
        owner.post(reverse("v1:notification-read", args=[row.id])).status_code == 204
    )  # idempotent
    assert (_count(owner), _count(admin)) == (0, 1)
    assert Notification.objects.count() == 1


def test_the_list_meta_and_the_badge_agree(tenant: Any, api_as: Any) -> None:
    """§5 — "the badge must never show a count the list cannot explain"."""
    owner, _ = api_as(tenant)
    notify(tenant, "reminder_due", params={"count": 1}, group_key="a")
    notify(tenant, "low_stock", params={"count": 4}, group_key="b")
    body = owner.get(reverse("v1:notification-list") + "?unread=true").json()
    assert body["meta"]["unread_count"] == _count(owner) == len(body["data"]) == 2


def test_read_all_can_be_scoped_to_one_category(tenant: Any, api_as: Any) -> None:
    """T-NTF-01-12."""
    owner, _ = api_as(tenant)
    notify(tenant, "reminder_due", params={"count": 1}, group_key="a")
    notify(tenant, "low_stock", params={"count": 1}, group_key="b")
    marked = owner.post(reverse("v1:notification-read-all"), {"category": "stock"}, format="json")
    assert marked.json()["data"]["marked"] == 1
    assert _count(owner) == 1
    owner.post(reverse("v1:notification-read-all"), {}, format="json")
    assert _count(owner) == 0


def test_another_tenants_row_is_not_found(tenant: Any, other_tenant: Any, api_as: Any) -> None:
    """Canon §0.11 rule 2 — 404, never 403, and nothing changes."""
    theirs = notify(other_tenant, "reminder_due", params={"count": 1}, group_key="x")
    mine, _ = api_as(tenant)
    assert mine.post(reverse("v1:notification-read", args=[theirs.id])).status_code == 404
    theirs.refresh_from_db()
    assert theirs.read_by == []


def test_another_users_personal_row_is_not_found(tenant: Any, api_as: Any) -> None:
    owner, owner_member = api_as(tenant)
    other, _ = api_as(tenant, "admin")
    personal = notify(tenant, "reminder_due", user=owner_member.user, params={"count": 1})
    assert other.post(reverse("v1:notification-read", args=[personal.id])).status_code == 404
    assert owner.post(reverse("v1:notification-read", args=[personal.id])).status_code == 204


def test_coalescing_merges_only_while_unread(tenant: Any, api_as: Any) -> None:
    """FR-6 / BR-3 / T-NTF-01-3 — one row grows; once read, a new event starts a new row."""
    owner, _ = api_as(tenant)
    first = notify(tenant, "reminder_due", group_key="2026-09-24", ids=["p1", "p2"])
    again = notify(tenant, "reminder_due", group_key="2026-09-24", ids=["p2", "p3"])
    assert again.pk == first.pk
    again.refresh_from_db()
    assert again.count == 3 and again.data["ids"] == ["p1", "p2", "p3"]
    assert again.title == "3 parties have a payment due today"

    owner.post(reverse("v1:notification-read", args=[first.id]))
    later = notify(tenant, "reminder_due", group_key="2026-09-24", ids=["p4"])
    assert later.pk != first.pk


def test_an_unknown_type_fails_loudly_under_test(tenant: Any) -> None:
    """FR-2 / EC-12 — nothing may raise a notification outside the registry."""
    with pytest.raises(UnknownNotificationType):
        notify(tenant, "made_up_type")


def test_rows_older_than_180_days_are_purged_and_a_second_run_does_nothing(tenant: Any) -> None:
    """FR-10 / T-NTF-01-9, and the double-run proof for the scheduled sweep."""
    old = notify(tenant, "reminder_due", params={"count": 1}, group_key="old")
    fresh = notify(tenant, "reminder_due", params={"count": 1}, group_key="new")
    Notification.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - dt.timedelta(days=181)
    )
    assert purge_old() == 1
    assert purge_old() == 0
    assert list(Notification.objects.values_list("pk", flat=True)) == [fresh.pk]


def test_the_route_on_the_wire_is_always_an_in_app_path(tenant: Any, api_as: Any) -> None:
    """§19 — a crafted `data.route` cannot become an open redirect or `javascript:`."""
    owner, _ = api_as(tenant)
    row = notify(tenant, "reminder_due", params={"count": 1}, group_key="r")
    Notification.objects.filter(pk=row.pk).update(data={"route": "javascript:alert(1)"})
    item = owner.get(reverse("v1:notification-list")).json()["data"][0]
    assert item["route"] == "/notifications"


def test_the_list_pages_by_cursor_without_repeats(tenant: Any, api_as: Any) -> None:
    owner, _ = api_as(tenant)
    for i in range(5):
        notify(tenant, "reminder_due", params={"count": 1}, group_key=f"g{i}")
    first = owner.get(reverse("v1:notification-list") + "?limit=3").json()
    assert first["meta"]["has_more"] is True
    second = owner.get(
        reverse("v1:notification-list") + f"?limit=3&cursor={first['meta']['next_cursor']}"
    ).json()
    ids = [r["id"] for r in first["data"]] + [r["id"] for r in second["data"]]
    assert len(ids) == len(set(ids)) == 5
