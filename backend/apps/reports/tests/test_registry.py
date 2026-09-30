"""The dashboard-section and report registries (FRD 00 PLT-X13, contracts §1.9, task A10).

Verticals publish their dashboard sections and reports HERE instead of `reports`
importing them (10-architecture §3: `reports` keeps its current import set). The
defects these prevent: a vertical's section rendered for a tenant who switched
the module off, or for a member without its codename (BR-1, §10); one bad
section taking the whole landing screen down with it; two modules silently
sharing a key so one report replaces the other (BR-2); and a registry that a
test fills and never empties, so the next test's dashboard has a stranger's
section in it (T-PLT-X13-1).
"""

from __future__ import annotations

import csv
import io
from decimal import Decimal
from typing import Any

import pytest
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.reports import registry

pytestmark = pytest.mark.django_db

DASHBOARD = "v1:report-dashboard"
REPORTS = "v1:report-list"


@pytest.fixture(autouse=True)
def _clean_registry() -> Any:
    registry._reset_for_tests()
    cache.clear()
    yield
    registry._reset_for_tests()
    cache.clear()


def _section(tenant: Any, today: Any) -> dict:
    return {"members": 3, "as_of": today.isoformat()}


def _register_probe(**overrides: Any) -> None:
    key = overrides.pop("key", "inventory.probe")
    kwargs: dict[str, Any] = {
        "module": "inventory",
        "permission": "inventory.item.read",
        "selector": _section,
        "order": 10,
    }
    kwargs.update(overrides)
    registry.register_dashboard_section(key, **kwargs)


# ── T-PLT-X13-1: keyed, idempotent, resettable ────────────────────────────────


def test_a_second_identical_registration_is_harmless() -> None:
    """ADR-042: a second `ready()` must not raise or duplicate."""
    _register_probe()
    _register_probe()
    assert [s.key for s in registry.dashboard_sections()] == ["inventory.probe"]


def test_a_different_registration_under_a_used_key_refuses_at_start_up() -> None:
    """BR-2: two modules claiming one key would make one of them vanish."""
    _register_probe()
    with pytest.raises(ImproperlyConfigured):
        _register_probe(order=20)
    registry.register_report(
        "inventory.probe", module="inventory", permission="inventory.item.read",
        label_id="x", selector=_section, csv=None,
    )  # fmt: skip
    with pytest.raises(ImproperlyConfigured):
        registry.register_report(
            "inventory.probe", module="inventory", permission="inventory.item.read",
            label_id="y", selector=_section, csv=None,
        )  # fmt: skip


@pytest.mark.parametrize(
    "key", ["probe", "sales.probe", "inventory.", "Inventory.Probe", "inventory.probe x"]
)
def test_a_key_must_be_the_modules_own_dotted_name(key: str) -> None:
    """BR-2: `<module>.<name>`, and the module must be the registrant's."""
    with pytest.raises(ImproperlyConfigured):
        registry.register_dashboard_section(
            key, module="inventory", permission="inventory.item.read", selector=_section, order=1
        )
    with pytest.raises(ImproperlyConfigured):
        registry.register_report(
            key, module="inventory", permission="inventory.item.read",
            label_id="x", selector=_section, csv=None,
        )  # fmt: skip


def test_reset_restores_the_start_up_snapshot() -> None:
    before = registry.dashboard_sections(), registry.reports()
    _register_probe()
    registry._reset_for_tests()
    assert (registry.dashboard_sections(), registry.reports()) == before


def test_sections_come_back_in_order_then_key() -> None:
    _register_probe(key="inventory.b", order=5)
    _register_probe(key="inventory.a", order=5)
    _register_probe(key="inventory.c", order=1)
    assert [s.key for s in registry.dashboard_sections()] == [
        "inventory.c",
        "inventory.a",
        "inventory.b",
    ]


# ── T-PLT-X13-2: the dashboard's `sections` ───────────────────────────────────


def test_the_dashboard_of_a_tenant_without_modules_has_an_empty_sections_list(
    tenant: Any, api_as: Any
) -> None:
    """Nothing changes for today's tenants: the key is there, and empty."""
    owner, _ = api_as(tenant)
    body = owner.get(reverse(DASHBOARD)).json()["data"]
    assert body["sections"] == []
    assert "tiles" in body


def test_a_registered_section_is_returned_with_its_data(tenant: Any, api_as: Any) -> None:
    _register_probe()
    owner, _ = api_as(tenant)
    sections = owner.get(reverse(DASHBOARD)).json()["data"]["sections"]
    assert sections == [
        {
            "key": "inventory.probe",
            "module": "inventory",
            "order": 10,
            "data": {"members": 3, "as_of": tenant_today(tenant).isoformat()},
        }
    ]


def test_a_failing_section_is_unavailable_and_the_dashboard_still_answers(
    tenant: Any, api_as: Any
) -> None:
    """T-PLT-X13-2: one module's bug must not blank the landing screen. The
    failing selector even runs SQL that errors, which would abort the whole
    request's transaction without a savepoint."""

    def broken(tenant: Any, today: Any) -> dict:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM no_such_table_a10")
        return {}

    _register_probe(key="inventory.broken", selector=broken, order=1)
    _register_probe(key="inventory.fine", order=2)
    owner, _ = api_as(tenant)
    response = owner.get(reverse(DASHBOARD))
    assert response.status_code == 200
    sections = response.json()["data"]["sections"]
    assert sections[0] == {
        "key": "inventory.broken",
        "module": "inventory",
        "order": 1,
        "error": "unavailable",
    }
    assert sections[1]["data"] == {"members": 3, "as_of": tenant_today(tenant).isoformat()}


def test_a_disabled_modules_section_is_absent(tenant: Any, api_as: Any) -> None:
    """BR-1."""
    _register_probe()
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "inventory"]
    tenant.save(update_fields=["enabled_modules"])
    owner, _ = api_as(tenant)
    assert owner.get(reverse(DASHBOARD)).json()["data"]["sections"] == []


def test_a_section_needs_its_codename(tenant: Any, api_as: Any) -> None:
    """§10: each section declares its codename and it is checked per reader."""
    _register_probe(permission="inventory.item.write")
    owner, _ = api_as(tenant)
    accountant, _ = api_as(tenant, role="accountant")
    assert [s["key"] for s in owner.get(reverse(DASHBOARD)).json()["data"]["sections"]] == [
        "inventory.probe"
    ]
    assert accountant.get(reverse(DASHBOARD)).json()["data"]["sections"] == []


def test_sections_are_fresh_even_when_the_tiles_are_cached(tenant: Any, api_as: Any) -> None:
    """The tiles snapshot is dropped by core writes only; a module's write
    cannot drop it. So sections are computed per request, never cached with
    the tiles, or a vertical's figure could lag a minute behind its own save."""
    counter = {"n": 0}

    def counting(tenant: Any, today: Any) -> dict:
        counter["n"] += 1
        return {"n": counter["n"]}

    _register_probe(selector=counting)
    owner, _ = api_as(tenant)
    first = owner.get(reverse(DASHBOARD)).json()
    second = owner.get(reverse(DASHBOARD)).json()
    assert second["meta"]["cached"] is True
    assert first["data"]["sections"][0]["data"] == {"n": 1}
    assert second["data"]["sections"][0]["data"] == {"n": 2}


# ── T-PLT-X13-3: the query budget ─────────────────────────────────────────────


def test_every_registered_section_selector_runs_in_three_queries(tenant: Any) -> None:
    """T-PLT-X13-3: the dashboard is the screen every member opens first; each
    section may cost it at most three queries. Vacuous until a module
    registers one; binding from then on, for every one of them."""
    today = tenant_today(tenant)
    for section in registry.dashboard_sections():
        with CaptureQueriesContext(connection) as queries:
            section.selector(tenant, today)
        assert len(queries) <= registry.SECTION_QUERY_BUDGET, (
            f"{section.key} ran {len(queries)} queries; the budget is "
            f"{registry.SECTION_QUERY_BUDGET}"
        )


# ── GET /reports and GET /reports/{key} ───────────────────────────────────────


def _report_rows(tenant: Any, params: dict) -> list[list[object]]:
    return [
        ["item", "qty", "value"],
        ["=HYPERLINK(1)", Decimal("2.500"), Decimal("-10.00")],
        ["Dal", 3, Decimal("45.50")],
    ]


def _register_report(**overrides: Any) -> None:
    key = overrides.pop("key", "inventory.probe")
    kwargs: dict[str, Any] = {
        "module": "inventory",
        "permission": "inventory.item.read",
        "label_id": "inventory.reports.probe",
        "selector": lambda tenant, params: {"rows": 2, "echo": params},
        "csv": _report_rows,
    }
    kwargs.update(overrides)
    registry.register_report(key, **kwargs)


def test_the_report_list_holds_only_what_modules_registered(tenant: Any, api_as: Any) -> None:
    """The core reports hub is the client's static catalogue; this list is
    only what modules registered — today payments' "Deposits held" (A4b),
    which the owner may read (`reports.financial.read`)."""
    owner, _ = api_as(tenant)
    response = owner.get(reverse(REPORTS))
    assert response.status_code == 200
    assert [row["key"] for row in response.json()["data"]] == ["payments.deposits_held"]


def test_the_report_list_filters_by_module_and_codename(tenant: Any, api_as: Any) -> None:
    _register_report()
    _register_report(key="inventory.costly", permission="inventory.item.write", csv=None)
    owner, _ = api_as(tenant)
    accountant, _ = api_as(tenant, role="accountant")

    def inventory_rows(client: Any) -> list[dict]:
        rows = client.get(reverse(REPORTS)).json()["data"]
        return [row for row in rows if row["module"] == "inventory"]

    assert inventory_rows(owner) == [
        {
            "key": "inventory.costly",
            "module": "inventory",
            "label_id": "inventory.reports.probe",
            "permission": "inventory.item.write",
            "has_csv": False,
        },
        {
            "key": "inventory.probe",
            "module": "inventory",
            "label_id": "inventory.reports.probe",
            "permission": "inventory.item.read",
            "has_csv": True,
        },
    ]
    assert [r["key"] for r in inventory_rows(accountant)] == ["inventory.probe"]
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "inventory"]
    tenant.save(update_fields=["enabled_modules"])
    assert inventory_rows(owner) == []


def test_a_registered_report_answers_json_with_its_params(tenant: Any, api_as: Any) -> None:
    _register_report()
    owner, _ = api_as(tenant)
    url = reverse("v1:report-module", kwargs={"key": "inventory.probe"})
    response = owner.get(url, {"date_from": "2026-10-01"})
    assert response.status_code == 200
    assert response.json()["data"] == {"rows": 2, "echo": {"date_from": "2026-10-01"}}


def test_a_report_detail_refuses_what_the_list_would_not_show(tenant: Any, api_as: Any) -> None:
    """Unknown key 404; missing codename 403; module off 403 module_disabled."""
    _register_report(permission="inventory.item.write")
    owner, _ = api_as(tenant)
    accountant, _ = api_as(tenant, role="accountant")
    url = reverse("v1:report-module", kwargs={"key": "inventory.probe"})
    missing = reverse("v1:report-module", kwargs={"key": "inventory.nothing"})
    assert owner.get(missing).status_code == 404
    assert accountant.get(url).status_code == 403
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "inventory"]
    tenant.save(update_fields=["enabled_modules"])
    response = owner.get(url)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "module_disabled"


def test_a_registered_report_exports_csv_through_the_export_rules(tenant: Any, api_as: Any) -> None:
    """The export machinery's rules apply to a module report too: the
    `reports.export` codename, BOM + CRLF, numbers as plain decimals (a
    negative amount stays a number), and text formula-neutralised."""
    _register_report()
    owner, _ = api_as(tenant)
    url = reverse("v1:report-module", kwargs={"key": "inventory.probe"})
    response = owner.get(url, {"format": "csv"})
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("﻿") and "\r\n" in body
    rows = list(csv.reader(io.StringIO(body.lstrip("﻿"))))
    assert rows[0] == ["item", "qty", "value"]
    assert rows[1][0].startswith("'")  # neutralised
    assert rows[1][1:] == ["2.500", "-10.00"]
    assert rows[2] == ["Dal", "3", "45.50"]


def test_csv_needs_the_export_codename_and_a_csv(tenant: Any, api_as: Any) -> None:
    """A report without `csv` refuses the format; staff lack `reports.export`."""
    _register_report()
    _register_report(key="inventory.screen_only", csv=None)
    owner, _ = api_as(tenant)
    staff, _ = api_as(tenant, role="staff")
    url = reverse("v1:report-module", kwargs={"key": "inventory.probe"})
    screen = reverse("v1:report-module", kwargs={"key": "inventory.screen_only"})
    assert owner.get(screen, {"format": "csv"}).status_code == 400
    assert staff.get(url).status_code == 200  # the JSON follows the report's own codename
    assert staff.get(url, {"format": "csv"}).status_code == 403


def test_the_core_report_urls_are_not_captured_by_the_module_route(
    tenant: Any, api_as: Any
) -> None:
    """The generic route only matches dotted keys, so `/reports/day-book`
    and `/reports/dashboard` still reach their own views."""
    owner, _ = api_as(tenant)
    assert owner.get(reverse("v1:report-day-book")).status_code == 200
    assert owner.get("/api/v1/reports/day-book").status_code == 200


def test_no_registered_sections_costs_the_dashboard_no_query(tenant: Any, monkeypatch: Any) -> None:
    """Adversarial pass (A10): the landing screen of every tenant today must
    not pay for the module machinery it does not use — with nothing
    registered, `sections` is computed without reading the entitlement."""
    from apps.platform_app.services import entitlements
    from apps.reports.views.dashboard import module_sections

    def boom(tenant: Any) -> Any:
        raise AssertionError("effective_modules read with no section registered")

    monkeypatch.setattr(entitlements, "effective_modules", boom)
    with CaptureQueriesContext(connection) as queries:
        assert module_sections(tenant, tenant_today(tenant), granted=frozenset()) == []
    assert len(queries) == 0
