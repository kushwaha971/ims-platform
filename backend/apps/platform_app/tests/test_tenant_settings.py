"""PLT-06 — tenant settings, numbering and module switches.

T-PLT-06-1…-7. Each test names the defect it prevents; the ones that matter
most are the numbering rules (a lowered counter is a duplicate bill number)
and the ETag (two admins silently overwriting each other).
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.platform_app import settings_schema as schema
from apps.platform_app.services import guards
from apps.platform_app.services.onboarding import apply_preset

pytestmark = pytest.mark.django_db

URL = "v1:tenant-settings"


@pytest.fixture
def owner(api_as: Any, tenant: Any) -> Any:
    apply_preset(tenant=tenant)
    client, _member = api_as(tenant, role="owner")
    return client


@pytest.fixture
def clean_guards() -> Any:
    guards._reset_for_tests()
    yield
    guards._reset_for_tests()


def _get(client: Any) -> Any:
    response = client.get(reverse(URL))
    assert response.status_code == 200, response.content
    return response


# ── Pure rules ───────────────────────────────────────────────────────────────


def test_the_numbering_preview_uses_the_short_financial_year() -> None:
    """T-PLT-06-1: FR-3's preview reads INV/26-27/0042, not INV/2026-27/0042."""
    assert schema.format_number(prefix="INV", fy_label="2026-27", number=42, padding=4) == (
        "INV/26-27/0042"
    )
    assert schema.format_number(prefix="", fy_label="2026-27", number=7, padding=3) == "26-27/007"


def test_a_bill_number_longer_than_sixteen_characters_is_refused() -> None:
    """T-PLT-06-1: CGST Rule 46 caps a tax invoice number at 16 characters."""
    assert (
        schema.numbering_row_errors(prefix="KB", padding=4, next_number=500, fy_label="2026-27")
        == []
    )
    errors = schema.numbering_row_errors(
        prefix="LONGPREFIX12", padding=6, next_number=1, fy_label="2026-27"
    )
    assert errors and "too long" in errors[0]


def test_reminder_templates_refuse_unknown_placeholders_and_a_missing_amount() -> None:
    """T-PLT-06-2 / EC-4: a reminder must state the amount, and a typo'd
    placeholder would reach the customer as literal braces."""
    assert schema.reminder_template_errors("Namaste {party_name}, {amount} due.") == []
    assert any(
        "Unknown placeholder {balanse}" in e
        for e in schema.reminder_template_errors("{balanse} {amount}")
    )
    assert any("Include {amount}" in e for e in schema.reminder_template_errors("Please pay soon."))
    assert schema.reminder_template_errors("") == []  # empty falls back to the default (BR-5)


# ── GET ──────────────────────────────────────────────────────────────────────


def test_get_returns_every_key_numbering_and_an_etag(owner: Any) -> None:
    """FR-2 and CR-011: the whole object, keyed by setting, with an ETag header."""
    response = _get(owner)
    data = response.json()["data"]
    assert set(data["values"]) == set(schema.SETTINGS)
    assert data["values"]["ledger.credit_limit_mode"] == {"mode": "warn"}
    assert data["numbering"]["invoice"]["prefix"] == "INV"
    assert data["numbering"]["invoice"]["preview"].startswith("INV/")
    assert response["ETag"] == data["etag"]


def test_a_key_with_no_row_reads_as_its_preset(api_as: Any, tenant: Any) -> None:
    """TSK-PLT-06-02: a tenant that never ran the preset still reads real defaults,
    not nulls that crash the page."""
    client, _member = api_as(tenant)
    data = _get(client).json()["data"]
    assert data["values"]["sales.default_due_days"] == {"days": 7}  # retail preset
    assert data["values"]["documents.terms"] == {"text": ""}


# ── PUT ──────────────────────────────────────────────────────────────────────


def test_an_unknown_key_is_refused_with_its_name(owner: Any) -> None:
    """T-PLT-06-3: FR-2 "rejects unknown keys (400 validation_error, details.<key>)"."""
    response = owner.put(reverse(URL), {"values": {"sales.colour": {"x": 1}}}, format="json")
    assert response.status_code == 400
    body = response.json()["error"]
    assert body["code"] == "validation_error"
    assert "sales.colour" in body["details"]


def test_plan_overrides_cannot_be_written_by_a_merchant(owner: Any) -> None:
    """A merchant who could PUT `plan.overrides` could grant themselves seats."""
    response = owner.put(
        reverse(URL), {"values": {"plan.overrides": {"limits": {"max_users": 99}}}}, format="json"
    )
    assert response.status_code == 400


def test_lowering_the_next_number_is_refused(owner: Any) -> None:
    """T-PLT-06-4: a lower counter re-issues numbers that may already be on paper."""
    from apps.platform_app.models import DocumentSequence

    DocumentSequence.objects.filter(kind="invoice").update(next_number=42)
    response = owner.put(
        reverse(URL), {"numbering": {"invoice": {"next_number": 41}}}, format="json"
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "sequence_backwards"
    assert DocumentSequence.objects.get(kind="invoice").next_number == 42


def test_changing_prefix_and_raising_the_counter_moves_the_next_number(
    owner: Any, tenant: Any
) -> None:
    """AC-1 (US-1): prefix INV next 42 → KB next 500 → the next number is KB/…/0500."""
    from apps.platform_app.models import AuditLog, DocumentSequence

    DocumentSequence.objects.filter(kind="invoice").update(next_number=42)
    response = owner.put(
        reverse(URL),
        {"numbering": {"invoice": {"prefix": "kb", "next_number": 500}}},
        format="json",
    )
    assert response.status_code == 200, response.content
    row = response.json()["data"]["numbering"]["invoice"]
    assert row["prefix"] == "KB"  # upper-cased (FR-3 input is uppercase)
    assert row["preview"].startswith("KB/") and row["preview"].endswith("/0500")
    seq = DocumentSequence.objects.get(kind="invoice")
    assert (seq.prefix, seq.next_number) == ("KB", 500)
    audit = AuditLog.objects.get(action="numbering.updated", tenant=tenant)
    assert audit.before["invoice"]["prefix"] == "INV"
    assert audit.after["invoice"]["prefix"] == "KB"


def test_an_unchanged_preset_row_that_breaks_the_length_rule_does_not_block_saving(
    owner: Any,
) -> None:
    """The preset `PAYOUT/26-27/0001` is 17 characters. Validating untouched rows
    would make every save of the page fail for a series nobody edited."""
    data = _get(owner).json()["data"]
    response = owner.put(
        reverse(URL),
        {"numbering": data["numbering"], "values": {"sales.default_due_days": {"days": 30}}},
        format="json",
    )
    assert response.status_code == 200, response.content


def test_a_stale_if_match_is_412(owner: Any) -> None:
    """T-PLT-06-6 / EC-5: the second of two admins editing must not overwrite the first."""
    etag = _get(owner)["ETag"]
    first = owner.put(
        reverse(URL),
        {"values": {"sales.default_due_days": {"days": 10}}},
        format="json",
        HTTP_IF_MATCH=etag,
    )
    assert first.status_code == 200
    second = owner.put(
        reverse(URL),
        {"values": {"sales.default_due_days": {"days": 20}}},
        format="json",
        HTTP_IF_MATCH=etag,
    )
    assert second.status_code == 412
    assert second.json()["error"]["code"] == "precondition_failed"


def test_a_save_audits_before_and_after_of_each_changed_key(owner: Any, tenant: Any) -> None:
    """FR-9 / §16: `settings.updated` with full before/after per key, templates included."""
    from apps.platform_app.models import AuditLog

    templates = {
        "en": "Hello {party_name}, {amount} due.",
        "hi": "नमस्ते {party_name}, {amount} बकाया।",
    }
    response = owner.put(
        reverse(URL),
        {
            "values": {
                "ledger.reminder_templates": templates,
                "ledger.credit_limit_mode": {"mode": "warn"},
            }
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    audit = AuditLog.objects.get(action="settings.updated", tenant=tenant)
    assert list(audit.after) == [
        "ledger.reminder_templates"
    ]  # the unchanged key is not in the diff
    assert audit.after["ledger.reminder_templates"]["hi"].startswith("नमस्ते")


def test_block_mode_saved_here_is_what_the_credit_check_reads(owner: Any, tenant: Any) -> None:
    """AC-3 (US-3): the setting shape must stay the one `parties.services.credit` reads,
    or saving "block" here would silently leave the check on "warn"."""
    from apps.parties.services.credit import credit_mode

    owner.put(
        reverse(URL), {"values": {"ledger.credit_limit_mode": {"mode": "block"}}}, format="json"
    )
    assert credit_mode(tenant) == "block"


def test_a_composition_business_cannot_default_to_tax_invoices(owner: Any) -> None:
    """EC-2: `invoice` is for regular registration only (400 `kind_not_allowed`)."""
    value = {
        "by_gst_type": {"regular": "invoice", "composition": "invoice", "unregistered": "estimate"}
    }
    response = owner.put(reverse(URL), {"values": {"sales.default_kind": value}}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "kind_not_allowed"


def test_the_defaults_endpoint_returns_the_business_type_preset(owner: Any) -> None:
    """FR-10: "Reset to preset" merges these into the object and saves through PUT."""
    data = owner.get(reverse("v1:tenant-settings-defaults")).json()["data"]
    assert data["business_type"] == "retail"
    assert data["values"]["parties.labels"] == {"customer": "Customer", "supplier": "Supplier"}
    assert "next_number" not in data["numbering"]["invoice"]  # BR-1: never renumber


def test_the_accountant_reads_but_cannot_write(api_as: Any, tenant: Any) -> None:
    """T-PLT-06-7: accountant GET 200, PUT 403; staff GET 403."""
    accountant, _m = api_as(tenant, role="accountant")
    assert accountant.get(reverse(URL)).status_code == 200
    assert accountant.put(reverse(URL), {"values": {}}, format="json").status_code == 403
    staff, _m = api_as(tenant, role="staff")
    assert staff.get(reverse(URL)).status_code == 403


# ── Module switches (FR-4) ───────────────────────────────────────────────────


def test_switching_off_a_module_removes_it_from_the_menu_and_gates_its_endpoints(
    owner: Any, tenant: Any
) -> None:
    """T-PLT-06-5 / AC-2: with stock off, Items leaves the menu and the module gate closes."""
    from apps.platform_app.models import AuditLog

    modules = [m for m in tenant.enabled_modules if m != "inventory"]
    response = owner.patch(
        reverse("v1:tenant-current"), {"enabled_modules": modules}, format="json"
    )
    assert response.status_code == 200, response.content
    assert "inventory" not in response.json()["data"]["enabled_modules"]
    me = owner.get(reverse("v1:auth-me")).json()["data"]
    assert "inventory" not in me["active_tenant"]["enabled_modules"]
    # `ModuleEnabled` answers `module_disabled` from `effective_modules`; no
    # inventory endpoint exists on this branch yet (Track T3 builds them), so the
    # gate is asserted at the function every module-gated view calls.
    from apps.platform_app.services.entitlements import effective_modules

    tenant.refresh_from_db()
    assert "inventory" not in effective_modules(tenant)
    assert AuditLog.objects.filter(action="tenant.modules_changed", tenant=tenant).exists()


def test_a_module_with_live_data_cannot_be_switched_off(
    owner: Any, tenant: Any, clean_guards: Any
) -> None:
    """T-PLT-06-5: 409 `module_has_data` with the count, from the owning app's guard."""
    guards.register_module_off_guard("inventory", lambda t: 12)
    modules = [m for m in tenant.enabled_modules if m != "inventory"]
    response = owner.patch(
        reverse("v1:tenant-current"), {"enabled_modules": modules}, format="json"
    )
    assert response.status_code == 409
    body = response.json()["error"]
    assert body["code"] == "module_has_data"
    # A12 (R14) added `breakdown` beside the unchanged `module` and `count`.
    assert body["details"] == {
        "module": "inventory",
        "count": 12,
        "breakdown": [{"label_id": None, "count": 12}],
    }


def test_core_modules_stay_on_whatever_is_sent(owner: Any, tenant: Any) -> None:
    """A khata without parties and a ledger is nothing; `platform` switches the rest."""
    response = owner.patch(reverse("v1:tenant-current"), {"enabled_modules": []}, format="json")
    assert response.status_code == 200
    tenant.refresh_from_db()
    assert {"platform", "parties", "ledger"} <= set(tenant.enabled_modules)


def test_a_module_outside_the_plan_is_refused_not_dropped(owner: Any, tenant: Any) -> None:
    """FR-4: options are `plan.modules ∩ partner.allowed_modules`; a locked module is a client bug."""
    tenant.plan.modules = [m for m in tenant.plan.modules if m != "sales"]
    tenant.plan.save(update_fields=["modules"])
    response = owner.patch(
        reverse("v1:tenant-current"), {"enabled_modules": ["sales", "parties"]}, format="json"
    )
    assert response.status_code == 400
    locked = owner.get(reverse(URL)).json()["data"]["modules"]["locked"]
    assert "sales" in locked


def test_a_modules_only_patch_does_not_touch_the_profile(owner: Any, tenant: Any) -> None:
    """A switch flip must not re-run the profile's GST validation or write `tenant.updated`."""
    from apps.platform_app.models import AuditLog

    owner.patch(
        reverse("v1:tenant-current"), {"enabled_modules": tenant.enabled_modules}, format="json"
    )
    assert not AuditLog.objects.filter(action="tenant.updated", tenant=tenant).exists()
