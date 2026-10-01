"""DUE-01 read endpoints (T-DUE-01-8): engine gating, module codenames, tenancy, filters."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.urls import reverse

from apps.dues.services.schedules import create_schedule
from apps.dues.tests.subject import OTHER_MODULE, OTHER_SUBJECT, SUBJECT, TEST_MODULE, entitle

pytestmark = pytest.mark.django_db

DUES = reverse("v1:dues-due-list")


def _detail(schedule_id: Any) -> str:
    return reverse("v1:dues-schedule-detail", args=[schedule_id])


@pytest.fixture
def world(ctx: Any, make_plan: Any, party: Any, today: Any) -> dict:
    """One schedule in `test` (backdated, so some dues are open) and one in `test_b`."""
    ours = create_schedule(
        ctx=ctx,
        module=TEST_MODULE,
        plan_id=make_plan().id,
        party_id=party.id,
        subject_type=SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=dt.date(2026, 9, 1),
        confirm_backdated=True,
    )
    theirs = create_schedule(
        ctx=ctx,
        module=OTHER_MODULE,
        plan_id=make_plan(module=OTHER_MODULE).id,
        party_id=party.id,
        subject_type=OTHER_SUBJECT,
        subject_id=uuid.uuid4(),
        start_on=dt.date(2026, 11, 1),
    )
    return {"ours": ours.schedule, "theirs": theirs.schedule, "party": party}


def test_read_endpoints_gate_by_engine_and_module_codename(
    api_as: Any, tenant: Any, other_tenant: Any, world: dict
) -> None:
    """T-DUE-01-8 — a library reader must not see gym dues through the shared
    endpoint: an owner sees both modules; an admin (who lacks `test_b`'s
    codename) sees only `test`'s rows, and `test_b`'s schedule is 404 to them;
    another tenant's member gets 404; with no consumer on, 403 naming `dues`."""
    owner, owner_member = api_as(tenant, role="owner")
    assert owner_member.role.code == "owner"
    body = owner.get(DUES).json()
    assert {row["module"] for row in body["data"]} == {TEST_MODULE, OTHER_MODULE}

    admin, admin_member = api_as(tenant, role="admin")
    assert admin_member.role.code == "admin" and admin_member.tenant_id == tenant.id
    rows = admin.get(DUES).json()["data"]
    assert rows and {row["module"] for row in rows} == {TEST_MODULE}
    assert admin.get(_detail(world["theirs"].id)).status_code == 404
    assert admin.get(_detail(world["ours"].id)).status_code == 200

    stranger, stranger_member = api_as(other_tenant, role="owner")
    assert stranger_member.tenant_id == other_tenant.id
    entitle(other_tenant, TEST_MODULE)
    assert stranger.get(_detail(world["ours"].id)).status_code == 404
    assert stranger.get(DUES).json()["data"] == []

    entitle(tenant, TEST_MODULE, OTHER_MODULE, enabled=False)
    refused = owner.get(DUES)
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "module_disabled"
    assert refused.json()["error"]["details"] == {"module": "dues"}


def test_engine_reads_have_no_write_verbs(api_as: Any, tenant: Any, world: dict) -> None:
    """ADR-041 — every engine write goes through a vertical endpoint."""
    owner, _ = api_as(tenant)
    assert owner.post(DUES, {}, format="json").status_code in (403, 405)


def test_the_due_list_shape_filters_and_totals(api_as: Any, tenant: Any, world: dict) -> None:
    """The FRD `Due` shape, filters over the set, and `meta.totals` over the
    FILTERED set — not the page — so the figure beside a filtered list is that
    list's (the PTY-02 lesson)."""
    owner, _ = api_as(tenant)
    response = owner.get(DUES, {"module": TEST_MODULE, "status": "due,overdue"})
    assert response.status_code == 200, response.content
    body = response.json()
    assert [row["due_on"] for row in body["data"]] == ["2026-09-01", "2026-10-01"]
    first = body["data"][0]
    assert first["subject"]["type"] == SUBJECT and first["subject"]["label"].startswith("Subject ")
    assert first["party"]["id"] == str(world["party"].id)
    assert (first["amount"], first["outstanding"], first["status"]) == (
        "1200.00",
        "1200.00",
        "overdue",
    )
    assert first["period_label"] == "Sep 2026"
    assert "late_fee_so_far" not in first  # C-12: omitted until DUE-04 can compute it
    assert body["meta"]["totals"] == {"outstanding": "2400.00", "overdue": "2400.00"}

    paged = owner.get(DUES, {"module": TEST_MODULE, "limit": 1}).json()
    assert paged["meta"]["has_more"] is True
    second = owner.get(
        DUES, {"module": TEST_MODULE, "limit": 1, "cursor": paged["meta"]["next_cursor"]}
    ).json()
    assert second["data"][0]["due_on"] > paged["data"][0]["due_on"]
    assert second["meta"]["totals"] == paged["meta"]["totals"]

    window = owner.get(DUES, {"due_from": "2026-10-01", "due_to": "2026-11-30"}).json()["data"]
    assert {row["due_on"] for row in window} == {"2026-10-01", "2026-11-01"}
    subject = owner.get(DUES, {"subject_id": str(world["theirs"].subject_id)}).json()["data"]
    assert subject and {row["module"] for row in subject} == {OTHER_MODULE}


@pytest.mark.parametrize(
    "params",
    [
        {"status": "late"},
        {"due_from": "yesterday"},
        {"party_id": "nope"},
        {"due_from": "2026-12-01", "due_to": "2026-11-01"},
    ],
)
def test_bad_filters_are_400(api_as: Any, tenant: Any, world: dict, params: dict) -> None:
    """A bad filter answered with the unfiltered list is a wrong answer that looks right."""
    owner, _ = api_as(tenant)
    response = owner.get(DUES, params)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"


def test_schedule_detail_carries_dues_and_pauses(
    api_as: Any, tenant: Any, world: dict, django_assert_max_num_queries: Any
) -> None:
    """The schedule with its dues in seq order and its pauses; a bounded number
    of queries however many dues it holds."""
    owner, _ = api_as(tenant)
    with django_assert_max_num_queries(30):
        response = owner.get(_detail(world["ours"].id))
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["module"] == TEST_MODULE and data["pauses"] == []
    assert [d["seq"] for d in data["dues"]] == list(range(1, len(data["dues"]) + 1))
    assert data["dues"][0]["status"] == "overdue"
    assert data["recurrence"]["anchor"] == "2026-09-01"
