"""PLT-X08 — the tenant's closed-day calendar (A9b, ADR-055, contracts §1.8, R26, R32).

T-PLT-X08-1…5. One calendar per tenant — closed weekdays plus dated closures,
with an optional per-module override — instead of three calendars that disagree
about Diwali. Lending's collection days, the library's fines and gym sessions all
read it; nothing here rewrites history (BR-4).

The fake module `test` stands in for a calendar reader.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.platform_app.models import AuditLog, ClosedDay
from apps.platform_app.services import calendar

pytestmark = pytest.mark.django_db

SUN_11_OCT = dt.date(2026, 10, 11)
MON_12_OCT = dt.date(2026, 10, 12)
SAT_10_OCT = dt.date(2026, 10, 10)
SAT_17_OCT = dt.date(2026, 10, 17)
URL = "v1:calendar-closed-days"


@pytest.fixture
def reader() -> Any:
    calendar._reset_readers_for_tests()
    calendar.register_calendar_reader("test")
    yield
    calendar._reset_readers_for_tests()


def _module_on(tenant: Any, module: str = "test") -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | {module}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | {module})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


def _weekdays(tenant: Any, value: list[int], modules: dict | None = None) -> None:
    calendar.set_closed_weekdays(ctx=Ctx.system(tenant), value=value, modules=modules or {})


# ── The rule (T-PLT-X08-1) ───────────────────────────────────────────────────


def test_a_day_is_closed_by_weekday_override_or_row(tenant: Any, reader: Any) -> None:
    """T-PLT-X08-1 / BR-1: closed for module `m` when its weekday is in `m`'s
    override if it has one (else the tenant's), OR a row exists for every
    module or for `m`."""
    _module_on(tenant)
    _weekdays(tenant, [6], {"test": [0, 6]})  # Sunday for all; the test module also Monday
    ClosedDay.objects.create(
        tenant=tenant, date=SAT_10_OCT, reason="Only the test module", module="test"
    )
    ClosedDay.objects.create(tenant=tenant, date=dt.date(2026, 10, 14), reason="Diwali")

    assert calendar.is_open(tenant, SUN_11_OCT) is False  # tenant weekday
    assert calendar.is_open(tenant, MON_12_OCT) is True  # the override is the module's only
    assert calendar.is_open(tenant, MON_12_OCT, module="test") is False  # module override
    assert calendar.is_open(tenant, SAT_10_OCT) is True  # a module row closes only that module
    assert calendar.is_open(tenant, SAT_10_OCT, module="test") is False
    assert calendar.is_open(tenant, dt.date(2026, 10, 14), module="test") is False  # tenant row
    assert calendar.is_open(tenant, dt.date(2026, 10, 15), module="test") is True


def test_a_module_override_replaces_the_tenant_weekdays_rather_than_adding(
    tenant: Any, reader: Any
) -> None:
    """BR-1 says "in `modules[m]` if `m` has an override, ELSE in `value`": a
    library open on Sundays while the shop is not is the reason overrides exist."""
    _module_on(tenant)
    _weekdays(tenant, [6], {"test": [0]})
    assert calendar.is_open(tenant, SUN_11_OCT, module="test") is True


def test_the_worked_example_counts_five_open_days_late(tenant: Any, reader: Any) -> None:
    """FRD §9: Sundays closed, a tenant-wide closure on Mon 12 Oct 2026; a book
    due Sat 10 Oct returned Sat 17 Oct is 7 calendar days late, of which
    `closed_days_between(11 Oct, 17 Oct)` = {11, 12 Oct} — 5 open days."""
    _weekdays(tenant, [6])
    ClosedDay.objects.create(tenant=tenant, date=MON_12_OCT, reason="Local holiday")
    closed = calendar.closed_days_between(tenant, SUN_11_OCT, SAT_17_OCT)
    assert closed == {SUN_11_OCT, MON_12_OCT}
    assert (SAT_17_OCT - SAT_10_OCT).days - len(closed) == 5


def test_the_range_is_inclusive_across_a_year_boundary(tenant: Any) -> None:
    """R32 / EC-3: both ends are in the range."""
    ClosedDay.objects.create(tenant=tenant, date=dt.date(2026, 12, 31), reason="Year end")
    ClosedDay.objects.create(tenant=tenant, date=dt.date(2027, 1, 1), reason="New year")
    assert calendar.closed_days_between(tenant, dt.date(2026, 12, 31), dt.date(2027, 1, 1)) == {
        dt.date(2026, 12, 31),
        dt.date(2027, 1, 1),
    }


def test_another_tenants_closures_are_not_this_tenants(tenant: Any, other_tenant: Any) -> None:
    ClosedDay.objects.create(tenant=other_tenant, date=MON_12_OCT, reason="Theirs")
    assert calendar.is_open(tenant, MON_12_OCT) is True


# ── next_open_day (T-PLT-X08-2) and the query budget (T-PLT-X08-3) ──────────


def test_next_open_day_skips_a_run_of_closures_and_a_weekend(tenant: Any) -> None:
    """T-PLT-X08-2: Fri 9 Oct closed, Sat and Sun closed by weekday, Mon a
    holiday → Tue 13 Oct; an open day is returned as itself."""
    _weekdays(tenant, [5, 6])
    ClosedDay.objects.create(tenant=tenant, date=dt.date(2026, 10, 9), reason="Festival")
    ClosedDay.objects.create(tenant=tenant, date=MON_12_OCT, reason="Festival")
    assert calendar.next_open_day(tenant, dt.date(2026, 10, 9)) == dt.date(2026, 10, 13)
    assert calendar.next_open_day(tenant, dt.date(2026, 10, 13)) == dt.date(2026, 10, 13)


def test_closed_days_between_a_year_is_one_query(tenant: Any) -> None:
    """T-PLT-X08-3: a fine over a long loan or a year of sessions reads the
    calendar ONCE — the weekday settings and the rows in one statement."""
    _weekdays(tenant, [6])
    for day in range(1, 29):
        ClosedDay.objects.create(tenant=tenant, date=dt.date(2026, 2, day), reason="Closed")
    with CaptureQueriesContext(connection) as queries:
        closed = calendar.closed_days_between(tenant, dt.date(2026, 1, 1), dt.date(2026, 12, 31))
    assert len(queries) == 1, [q["sql"] for q in queries]
    assert dt.date(2026, 2, 14) in closed and dt.date(2026, 1, 4) in closed  # a row, a Sunday


# ── Weekdays (BR-2) ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "modules"),
    [
        ([0, 1, 2, 3, 4, 5, 6], {}),
        ([6], {"test": [0, 1, 2, 3, 4, 5, 6]}),
        ([7], {}),
        (["sunday"], {}),
        ([6], {"nosuchmodule": [0]}),
    ],
)
def test_weekdays_that_close_every_day_or_do_not_parse_are_refused(
    tenant: Any, reader: Any, value: list, modules: dict
) -> None:
    """BR-2: a calendar closed every day makes `next_open_day` search forever
    and a due date impossible; it is refused for the tenant and for each
    module. A module that is not an effective calendar reader has no override."""
    _module_on(tenant)
    with pytest.raises(ValidationFailed):
        calendar.set_closed_weekdays(ctx=Ctx.system(tenant), value=value, modules=modules)


def test_weekdays_are_stored_as_the_contract_keys_and_audited(tenant: Any, reader: Any) -> None:
    """R32: `calendar.closed_weekdays` and `calendar.closed_weekdays.<module>`;
    one audit row for the change, none for a repeat."""
    from apps.platform_app.models import TenantSetting

    _module_on(tenant)
    _weekdays(tenant, [6], {"test": [0, 6]})
    _weekdays(tenant, [6], {"test": [0, 6]})
    rows = dict(TenantSetting.objects.filter(tenant=tenant).values_list("key", "value"))
    assert rows["calendar.closed_weekdays"] == {"value": [6]}
    assert rows["calendar.closed_weekdays.test"] == {"value": [0, 6]}
    assert AuditLog.objects.filter(tenant=tenant, action="calendar.weekdays.updated").count() == 1
    # An empty override list removes the override (the module follows the tenant again).
    _weekdays(tenant, [6], {"test": None})
    assert not TenantSetting.objects.filter(
        tenant=tenant, key="calendar.closed_weekdays.test"
    ).exists()


# ── The API (T-PLT-X08-4) ───────────────────────────────────────────────────


def test_a_range_add_skips_existing_days_and_reports_them(api_as: Any, tenant: Any) -> None:
    """T-PLT-X08-4 / BR-3: adding 12–16 Oct over an existing 14 Oct creates four
    rows and says one was already there."""
    ClosedDay.objects.create(tenant=tenant, date=dt.date(2026, 10, 14), reason="Diwali")
    client, member = api_as(tenant, role="admin")
    assert member.role.code == "admin"
    response = client.post(
        reverse(URL),
        {"from": "2026-10-12", "to": "2026-10-16", "reason": "Diwali week"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert [row["date"] for row in body["data"]] == [
        "2026-10-12",
        "2026-10-13",
        "2026-10-15",
        "2026-10-16",
    ]
    assert body["meta"] == {"skipped_existing": 1}
    assert AuditLog.objects.filter(tenant=tenant, action="calendar.closed_day.created").count() == 1


@pytest.mark.parametrize(
    "body",
    [
        {"from": "2026-10-16", "to": "2026-10-12", "reason": "Backwards"},
        {"from": "2026-10-01", "to": "2026-11-15", "reason": "Too long"},
        {"from": "2026-10-12", "reason": ""},
        {"from": "2026-10-12", "reason": "x" * 61},
        {"from": "2026-10-12", "reason": "Unknown module", "module": "nosuchmodule"},
        {"from": "not-a-date", "reason": "Bad"},
    ],
)
def test_a_bad_closure_is_a_validation_error(api_as: Any, tenant: Any, body: dict) -> None:
    """T-PLT-X08-4: `to < from`, more than 31 days, an empty or long reason, a
    module that is not an effective reader, and an unparseable date."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    response = client.post(reverse(URL), body, format="json")
    assert response.status_code == 400, response.content
    assert response.json()["error"]["code"] == "validation_error"


def test_reading_is_any_member_and_writing_needs_the_calendar_codename(
    api_as: Any, tenant: Any
) -> None:
    """FRD §10 / R26: every member reads the calendar (a counter clerk must know
    the shop is shut on Sunday); owner and admin write it through the new
    `platform.calendar.manage`; staff and accountant do not."""
    ClosedDay.objects.create(tenant=tenant, date=MON_12_OCT, reason="Local holiday")
    for role in ("owner", "admin", "staff", "accountant"):
        client, member = api_as(tenant, role=role)
        assert member.role.code == role
        listing = client.get(reverse(URL), {"from": "2026-10-01", "to": "2026-10-31"})
        assert listing.status_code == 200, (role, listing.content)
        assert [r["date"] for r in listing.json()["data"]] == ["2026-10-12"]
        added = client.post(reverse(URL), {"from": "2026-10-20", "reason": "Test"}, format="json")
        assert added.status_code == (201 if role in ("owner", "admin") else 403), role
        ClosedDay.objects.filter(tenant=tenant, date=dt.date(2026, 10, 20)).delete()


def test_a_modules_own_closure_may_be_written_with_its_settings_codename(
    api_as: Any, tenant: Any, reader: Any, monkeypatch: Any
) -> None:
    """R26: a row with `module = X` may also be written by X's settings
    codename (a librarian closing the library, not the shop)."""
    from apps.common import permissions_registry as reg

    _module_on(tenant)
    monkeypatch.setattr(reg, "PERMISSIONS", frozenset(reg.PERMISSIONS | {"test.settings.manage"}))
    monkeypatch.setitem(reg.MODULE_OF, "test.settings.manage", "test")
    client, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    member.permissions_override = {"allow": ["test.settings.manage"]}
    member.save(update_fields=["permissions_override"])
    url = reverse(URL)
    tenant_wide = client.post(url, {"from": "2026-10-20", "reason": "Shop"}, format="json")
    assert tenant_wide.status_code == 403
    own = client.post(
        url, {"from": "2026-10-20", "reason": "Library", "module": "test"}, format="json"
    )
    assert own.status_code == 201, own.content
    row_id = own.json()["data"][0]["id"]
    assert client.delete(reverse("v1:calendar-closed-day", args=[row_id])).status_code == 204


def test_the_list_carries_the_weekdays_and_refuses_a_long_range(
    api_as: Any, tenant: Any, reader: Any
) -> None:
    """FRD §6: `meta.closed_weekdays` and `meta.module_weekdays` travel with the
    rows; a range over 400 days is refused rather than scanned."""
    _module_on(tenant)
    _weekdays(tenant, [6], {"test": [0, 6]})
    client, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    body = client.get(reverse(URL), {"from": "2026-10-01", "to": "2026-10-31"}).json()
    assert body["meta"] == {
        "closed_weekdays": [6],
        "module_weekdays": {"test": [0, 6]},
        "readers": ["test"],
    }
    too_long = client.get(reverse(URL), {"from": "2026-01-01", "to": "2027-03-01"})
    assert too_long.status_code == 400


def test_another_tenants_closure_is_not_found(api_as: Any, tenant: Any, other_tenant: Any) -> None:
    """T-PLT-X08-4 / ADR-032: a cross-tenant id is 404, never 403."""
    theirs = ClosedDay.objects.create(tenant=other_tenant, date=MON_12_OCT, reason="Theirs")
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    response = client.delete(reverse("v1:calendar-closed-day", args=[theirs.id]))
    assert response.status_code == 404
    assert ClosedDay.objects.filter(pk=theirs.pk).exists()


def test_deleting_is_audited_and_changes_nothing_computed_from_it(api_as: Any, tenant: Any) -> None:
    """BR-4 / EC-2: the calendar is configuration, hard-deleted and audited; it
    never reaches back into what was computed from it."""
    row = ClosedDay.objects.create(tenant=tenant, date=MON_12_OCT, reason="Local holiday")
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    assert client.delete(reverse("v1:calendar-closed-day", args=[row.id])).status_code == 204
    assert not ClosedDay.objects.filter(pk=row.pk).exists()
    assert AuditLog.objects.filter(tenant=tenant, action="calendar.closed_day.deleted").count() == 1


def test_the_weekdays_endpoint_needs_the_calendar_codename(
    api_as: Any, tenant: Any, reader: Any
) -> None:
    """FRD §6: `PUT /calendar/weekdays` is the screen's write; staff cannot."""
    _module_on(tenant)
    url = reverse("v1:calendar-weekdays")
    staff, member = api_as(tenant, role="staff")
    assert member.role.code == "staff"
    assert staff.put(url, {"value": [6], "modules": {}}, format="json").status_code == 403
    admin, member = api_as(tenant, role="admin")
    assert member.role.code == "admin"
    saved = admin.put(url, {"value": [6], "modules": {"test": [0, 6]}}, format="json")
    assert saved.status_code == 200, saved.content
    assert saved.json()["data"] == {"value": [6], "modules": {"test": [0, 6]}}
    refused = admin.put(url, {"value": [0, 1, 2, 3, 4, 5, 6], "modules": {}}, format="json")
    assert refused.status_code == 400


# ── Visibility (T-PLT-X08-5) ────────────────────────────────────────────────


def test_the_session_names_the_calendar_readers_among_enabled_modules(
    api_as: Any, tenant: Any, reader: Any
) -> None:
    """T-PLT-X08-5: the Business days screen appears only when an enabled module
    reads the calendar; `/auth/me` is how the client knows."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    me = client.get(reverse("v1:auth-me")).json()["data"]
    assert me["active_tenant"]["calendar_readers"] == []
    _module_on(tenant)
    me = client.get(reverse("v1:auth-me")).json()["data"]
    assert me["active_tenant"]["calendar_readers"] == ["test"]
    # The Settings hub reads the same answer from the payload it already loads,
    # so the client's static session slice does not grow for one link.
    settings = client.get(reverse("v1:tenant-settings")).json()["data"]
    assert settings["calendar_readers"] == ["test"]


def test_the_codename_is_owner_and_admin_only() -> None:
    """R26 / owner Q2: `platform.calendar.manage` for owner and admin."""
    from apps.common.permissions_registry import ROLE_PERMISSIONS

    held = {role for role, codes in ROLE_PERMISSIONS.items() if "platform.calendar.manage" in codes}
    assert held == {"owner", "admin"}


def test_an_override_of_a_switched_off_module_is_not_listed(
    api_as: Any, tenant: Any, reader: Any
) -> None:
    """QA finding (A9b): the list's `module_weekdays` read every stored
    override, so a module switched off (or an unreleased one on a flagged dev
    database) still appeared by name in the response. Only the calendar readers
    that are on are listed; the stored override is kept for when it returns."""
    from apps.platform_app.models import TenantSetting

    _module_on(tenant)
    _weekdays(tenant, [6], {"test": [0, 6]})
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "test"]
    tenant.save(update_fields=["enabled_modules"])
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    meta = client.get(reverse(URL), {"from": "2026-10-01", "to": "2026-10-31"}).json()["meta"]
    assert meta["module_weekdays"] == {} and meta["readers"] == []
    assert TenantSetting.objects.filter(tenant=tenant, key="calendar.closed_weekdays.test").exists()
