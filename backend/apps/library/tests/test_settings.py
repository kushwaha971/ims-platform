"""B03 — library settings, the preset seed, the number kinds (LIB-01).

T-LIB-01-1, -3, -4 and the design note's extra cases: the seed runs inside
the switch-on transaction, a FY kind is a 400 rather than a 500, every field
rule answers per key, and the numbering screen shows the library's series
only while the module is on.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.test import override_settings
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.context import Ctx
from apps.library.models import LibrarySettings
from apps.library.services import settings as library_settings
from apps.platform_app.models import AuditLog, DocumentSequence
from apps.platform_app.services import calendar, guards, sequences

from .conftest import entitle_library

pytestmark = pytest.mark.django_db

SETTINGS = "v1:library-settings"
NUMBERING = "v1:library-settings-numbering"


def _body(client: Any) -> dict:
    response = client.get(reverse(SETTINGS))
    assert response.status_code == 200, response.content
    return response.json()


def _full(data: dict, **changes: Any) -> dict:
    body = {k: v for k, v in data.items() if k in library_settings.EDITABLE_FIELDS}
    body["version"] = data["version"]
    body.update(changes)
    return body


# ── Registrations ────────────────────────────────────────────────────────────


def test_ready_registers_the_three_kinds_the_hook_and_the_calendar_reader() -> None:
    """Contracts §1.7, R15, A9b: without the kinds the counter refuses every
    library number; without the hook switching on seeds nothing; without the
    reader `validate_module` refuses `module="library"` and the library's
    closed-weekday override is never listed."""
    kinds = {k.kind: k for k in sequences.number_kinds() if k.module == "library"}
    assert set(kinds) == {"library_member", "library_accession", "library_charge"}
    assert (kinds["library_member"].mode, kinds["library_member"].default_prefix) == (
        "perpetual",
        "M-",
    )
    assert kinds["library_member"].padding == 4
    assert (kinds["library_accession"].mode, kinds["library_accession"].padding) == (
        "perpetual",
        0,
    )
    assert kinds["library_accession"].default_prefix == ""
    assert (kinds["library_charge"].mode, kinds["library_charge"].default_prefix) == (
        "fy",
        "FIN",
    )
    assert all(k.label_id.startswith("library.numbering.") for k in kinds.values())
    assert library_settings.seed_library in guards._ENABLE_HOOKS["library"]
    assert "library" in calendar.calendar_readers()


def test_no_deposit_off_guard_is_registered_twice() -> None:
    """Payments already counts library deposits (`payments.off.depositsOpen`);
    a second counter here would tell the owner they hold six deposits when
    they hold three. B03 registers no off-guard of its own (G7)."""
    labels = guards._OFF_GUARD_LABELS.get("library", {})
    # B10 adds the library's own counter, open charges — once.
    assert sorted(v for v in labels.values()) == [
        "library.off.chargesOpen",
        "payments.off.depositsOpen",
    ]


# ── The seed (T-LIB-01-1, R15) ───────────────────────────────────────────────


def test_seeding_twice_leaves_one_row_with_the_defaults(tenant: Any) -> None:
    """T-LIB-01-1 / EC-2: switching off and on runs the seed again; it must not
    add a second row or overwrite what the librarian set."""
    ctx = Ctx.system(tenant)
    library_settings.seed_library(ctx, tenant)
    row = LibrarySettings.objects.get(tenant=tenant)
    row.hold_pickup_days = 9
    row.save(update_fields=["hold_pickup_days"])
    library_settings.seed_library(ctx, tenant)
    assert LibrarySettings.objects.filter(tenant=tenant).count() == 1
    row.refresh_from_db()
    assert row.hold_pickup_days == 9
    assert row.overdue_reminder_days == [1, 7, 14, 30]
    assert row.waiver_ceiling == Decimal("100.00") and row.fallback_price is None


def test_the_database_holds_one_row_per_tenant(tenant: Any) -> None:
    """`UNIQUE (tenant_id)`: two concurrent first reads must not leave two
    rows, of which every later read picks one at random."""
    LibrarySettings.objects.create(tenant=tenant)
    with pytest.raises(IntegrityError), transaction.atomic():
        LibrarySettings.objects.create(tenant=tenant)


def test_switching_library_on_seeds_it_inside_the_switch(api_as: Any, tenant: Any) -> None:
    """R15 / BR-6: the owner's switch is the seed; no wizard stands between
    them and the counter."""
    entitle_library(tenant)
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "library"]
    tenant.save(update_fields=["enabled_modules"])
    client, _member = api_as(tenant, role="owner")
    with override_settings(UB_UNRELEASED_MODULES=True):
        response = client.patch(
            reverse("v1:tenant-current"),
            {"enabled_modules": [*tenant.enabled_modules, "library"]},
            format="json",
        )
    assert response.status_code == 200, response.content
    assert LibrarySettings.objects.filter(tenant=tenant).count() == 1


def test_a_failing_seed_leaves_library_off(api_as: Any, tenant: Any, monkeypatch: Any) -> None:
    """BR-6: the hook runs inside the switching transaction, so a seed that
    raises leaves the module off rather than on and half-seeded."""

    def boom(_tenant: Any, **_kw: Any) -> Any:
        raise RuntimeError("seed failed")

    monkeypatch.setattr(library_settings, "settings_for", boom)
    entitle_library(tenant)
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "library"]
    tenant.save(update_fields=["enabled_modules"])
    client, _member = api_as(tenant, role="owner")
    client.raise_request_exception = False
    with override_settings(UB_UNRELEASED_MODULES=True):
        response = client.patch(
            reverse("v1:tenant-current"),
            {"enabled_modules": [*tenant.enabled_modules, "library"]},
            format="json",
        )
    assert response.status_code >= 400
    tenant.refresh_from_db()
    assert "library" not in tenant.enabled_modules
    assert not LibrarySettings.objects.filter(tenant=tenant).exists()


# ── GET / PUT (T-LIB-01-3) ───────────────────────────────────────────────────


def test_get_before_any_seed_returns_the_defaults(api_as: Any, library_on: Any) -> None:
    """A flagged dev database (or a fixture) can carry library in
    `enabled_modules` without the hook ever running; the screen must still
    open with the defaults rather than 404."""
    client, member = api_as(library_on, role="owner")
    assert member.role.code == "owner"
    body = _body(client)
    data = body["data"]
    assert data["fine_rounding"] == "rupee" and data["hold_pickup_days"] == 3
    assert data["lost_multiplier"] == "1.00" and data["waiver_ceiling"] == "100.00"
    assert data["damage_minor_amount"] == "20.00" and data["fallback_price"] is None
    assert data["overdue_reminder_days"] == [1, 7, 14, 30] and data["version"] == 1
    assert body["meta"]["numbering"] == {
        "accession": {"next": 1},
        "member": {"prefix": "M-", "next": 1},
    }
    assert body["meta"]["closed_weekdays"] == []


def test_meta_shows_the_library_override_or_the_tenant_weekdays(
    api_as: Any, library_on: Any
) -> None:
    """`closed_weekdays` is the library's override when it has one, else the
    tenant's — the days fines skip. Reading only the tenant's list would
    count a library-only Sunday closure as a late day."""
    client, _ = api_as(library_on, role="owner")
    ctx = Ctx.system(library_on)
    calendar.set_closed_weekdays(ctx=ctx, value=[6], modules={})
    assert _body(client)["meta"]["closed_weekdays"] == [6]
    calendar.set_closed_weekdays(ctx=ctx, value=[6], modules={"library": [0, 6]})
    assert _body(client)["meta"]["closed_weekdays"] == [0, 6]


def test_put_saves_bumps_the_version_and_audits_the_diff(api_as: Any, library_on: Any) -> None:
    """FR-4: every setting is editable and every change is in the audit log
    with what changed, not the whole row."""
    client, _ = api_as(library_on, role="admin")
    data = _body(client)["data"]
    response = client.put(
        reverse(SETTINGS),
        _full(data, hold_pickup_days=5, overdue_reminder_days=[30, 7, 7, 1]),
        format="json",
    )
    assert response.status_code == 200, response.content
    saved = response.json()["data"]
    assert saved["hold_pickup_days"] == 5 and saved["version"] == 2
    assert saved["overdue_reminder_days"] == [1, 7, 30]
    row = AuditLog.objects.get(tenant=library_on, action=AuditAction.LIBRARY_SETTINGS_UPDATED)
    assert row.before == {"hold_pickup_days": 3, "overdue_reminder_days": [1, 7, 14, 30]}
    assert row.after == {"hold_pickup_days": 5, "overdue_reminder_days": [1, 7, 30]}


def test_a_stale_version_is_refused_with_the_current_one(api_as: Any, library_on: Any) -> None:
    """T-LIB-01-3: two admins editing at once — the second save must not
    silently undo the first."""
    client, _ = api_as(library_on, role="owner")
    data = _body(client)["data"]
    first = client.put(reverse(SETTINGS), _full(data, hold_pickup_days=4), format="json")
    assert first.status_code == 200
    stale = client.put(reverse(SETTINGS), _full(data, hold_pickup_days=7), format="json")
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_version"
    assert stale.json()["error"]["details"] == {"current_version": 2}


def test_an_unchanged_put_writes_no_audit_row(api_as: Any, library_on: Any) -> None:
    """A Save pressed on an untouched form is not an event in the log."""
    client, _ = api_as(library_on, role="owner")
    data = _body(client)["data"]
    assert client.put(reverse(SETTINGS), _full(data), format="json").status_code == 200
    assert not AuditLog.objects.filter(action=AuditAction.LIBRARY_SETTINGS_UPDATED).exists()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("hold_pickup_days", 0),
        ("hold_pickup_days", 31),
        ("hold_pickup_days", True),
        ("lost_multiplier", "10.01"),
        ("lost_multiplier", "1.005"),
        ("lost_processing_fee", "-1"),
        ("damage_minor_amount", "100000000.00"),
        ("damage_major_percent", 0),
        ("fine_rounding", "nearest"),
        ("overdue_issue_rule", "maybe"),
        ("renew_from", None),
        ("fine_skip_closed_days", "yes"),
        ("overdue_reminder_days", [0]),
        ("overdue_reminder_days", [366]),
        ("overdue_reminder_days", [1, 2, 3, 4, 5, 6, 7]),
        ("overdue_reminder_days", "1,7"),
    ],
)
def test_each_field_rule_answers_400_on_its_own_key(
    api_as: Any, library_on: Any, field: str, value: Any
) -> None:
    """LIB-01 §9: a wrong value is a 400 naming the field, never a database
    error at save (a 500) and never a silent clamp."""
    client, _ = api_as(library_on, role="owner")
    data = _body(client)["data"]
    response = client.put(reverse(SETTINGS), _full(data, **{field: value}), format="json")
    assert response.status_code == 400, (field, value, response.content)
    assert response.json()["error"]["code"] == "validation_error"
    assert field in response.json()["error"]["details"]


def test_a_missing_field_is_named_and_null_clears_the_optional_money(
    api_as: Any, library_on: Any
) -> None:
    """PUT is the full row: a missing key is a client bug and is named, not
    read as "keep". `fallback_price` and `waiver_ceiling` accept null."""
    client, _ = api_as(library_on, role="owner")
    data = _body(client)["data"]
    body = _full(data)
    del body["renew_from"]
    missing = client.put(reverse(SETTINGS), body, format="json")
    assert missing.status_code == 400 and "renew_from" in missing.json()["error"]["details"]
    cleared = client.put(reverse(SETTINGS), _full(data, waiver_ceiling=None), format="json")
    assert cleared.status_code == 200 and cleared.json()["data"]["waiver_ceiling"] is None


def test_who_may_read_and_who_may_write(api_as: Any, library_on: Any) -> None:
    """LIB-01 §10: staff and the accountant read (the counter needs the rules)
    and write nothing; each client is checked for who it is first."""
    for role in ("staff", "accountant"):
        client, member = api_as(library_on, role=role)
        assert member.role.code == role
        data = _body(client)["data"]
        assert client.put(reverse(SETTINGS), _full(data), format="json").status_code == 403
        refused = client.post(
            reverse(NUMBERING), {"kind": "library_accession", "next_number": 9}, format="json"
        )
        assert refused.status_code == 403, role


def test_a_member_with_no_library_codename_cannot_read(api_as: Any, library_on: Any) -> None:
    """G9: `GET` is "settings.manage OR any library read"; a member whose
    library reads are all denied gets 403, not the settings."""
    client, member = api_as(library_on, role="staff")
    member.permissions_override = {
        "deny": ["library.catalogue.read", "library.member.read", "library.loan.read"]
    }
    member.save(update_fields=["permissions_override"])
    assert client.get(reverse(SETTINGS)).status_code == 403


def test_library_switched_off_or_unreleased_is_module_disabled(api_as: Any, tenant: Any) -> None:
    """The release gate and the switch both hold for the library's own routes."""
    entitle_library(tenant)
    client, _ = api_as(tenant, role="owner")
    hidden = client.get(reverse(SETTINGS))
    assert hidden.status_code == 403
    assert hidden.json()["error"]["code"] == "module_disabled"


def test_another_tenants_settings_are_never_read(
    api_as: Any, library_on: Any, other_tenant: Any
) -> None:
    """Each tenant reads its own row; a change in one is invisible to another."""
    entitle_library(other_tenant)
    mine, _ = api_as(library_on, role="owner")
    theirs, _ = api_as(other_tenant, role="owner")
    data = _body(mine)["data"]
    saved = mine.put(reverse(SETTINGS), _full(data, hold_pickup_days=12), format="json")
    assert saved.status_code == 200
    with override_settings(UB_UNRELEASED_MODULES=True):
        assert _body(theirs)["data"]["hold_pickup_days"] == 3


# ── Numbering (T-LIB-01-4) ───────────────────────────────────────────────────


def test_raising_lower_equal_and_higher(api_as: Any, library_on: Any) -> None:
    """T-LIB-01-4 / BR-2: lower is 409 with the current number (it may be
    printed already); equal is 200 with no audit row; higher moves the counter
    once and says it came from settings."""
    client, _ = api_as(library_on, role="admin")
    url = reverse(NUMBERING)
    up = client.post(url, {"kind": "library_accession", "next_number": 4513}, format="json")
    assert up.status_code == 200, up.content
    assert up.json()["data"] == {"kind": "library_accession", "next_number": 4513}
    rows = AuditLog.objects.filter(tenant=library_on, action=AuditAction.COUNTER_RAISED)
    assert [r.after["via"] for r in rows] == ["settings"]
    same = client.post(url, {"kind": "library_accession", "next_number": 4513}, format="json")
    assert same.status_code == 200 and rows.count() == 1
    down = client.post(url, {"kind": "library_accession", "next_number": 4000}, format="json")
    assert down.status_code == 409
    assert down.json()["error"]["code"] == "sequence_backwards"
    assert down.json()["error"]["details"]["current"] == 4513
    assert _body(client)["meta"]["numbering"]["accession"] == {"next": 4513}


def test_the_member_series_shows_the_prefix_the_core_screen_set(
    api_as: Any, library_on: Any
) -> None:
    """The core numbering screen may change a perpetual kind's prefix; the
    library's card must show that row's prefix, not the registered default."""
    client, _ = api_as(library_on, role="owner")
    raised = client.post(
        reverse(NUMBERING), {"kind": "library_member", "next_number": 43}, format="json"
    )
    assert raised.status_code == 200
    DocumentSequence.objects.filter(tenant=library_on, kind="library_member").update(prefix="LM-")
    assert _body(client)["meta"]["numbering"]["member"] == {"prefix": "LM-", "next": 43}


@pytest.mark.parametrize(
    "body",
    [
        {"kind": "library_charge", "next_number": 5},
        {"kind": "sales_invoice", "next_number": 5},
        {"kind": "library_accession", "next_number": "12"},
        {"kind": "library_accession", "next_number": 0},
        {"kind": "library_accession"},
    ],
)
def test_a_wrong_kind_or_number_is_400(api_as: Any, library_on: Any, body: dict) -> None:
    """`raise_counter` raises ImproperlyConfigured for an FY kind: without the
    view's own check `library_charge` is a 500. Another module's series is not
    the library's to move."""
    client, _ = api_as(library_on, role="owner")
    response = client.post(reverse(NUMBERING), body, format="json")
    assert response.status_code == 400, (body, response.content)
    assert response.json()["error"]["code"] == "validation_error"


def test_the_core_numbering_screen_lists_the_kinds_only_while_library_is_on(
    api_as: Any, tenant: Any
) -> None:
    """FR-3 (A8's pattern): a hidden or switched-off library adds no rows to
    the shop's numbering screen."""
    entitle_library(tenant)
    client, _ = api_as(tenant, role="owner")
    url = reverse("v1:tenant-settings")
    assert "library_accession" not in client.get(url).json()["data"]["numbering"]
    with override_settings(UB_UNRELEASED_MODULES=True):
        numbering = client.get(url).json()["data"]["numbering"]
    assert {"library_accession", "library_member", "library_charge"} <= set(numbering)
