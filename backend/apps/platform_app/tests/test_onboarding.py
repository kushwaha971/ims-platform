"""`PLT-03` — the business onboarding wizard.

Tier 1 throughout: the wizard creates the tenant every other row in the product
hangs off, and it is the only place in the app a tenant comes into existence.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

CREATE_URL = "v1:tenant-create"
CURRENT_URL = "v1:tenant-current"

VALID_GSTIN = "27AAPFU0939F1ZV"  # T-PLT-03-1 names this one as valid.


def _create(client: Any, **overrides: Any) -> Any:
    payload = {
        "name": "Sharma General Store",
        "business_type": "retail",
        "state_code": "27",
        "locale": "en",
    }
    payload.update(overrides)
    key = payload.pop("idempotency_key", "wizard-step-1")
    return client.post(reverse(CREATE_URL), payload, format="json", HTTP_IDEMPOTENCY_KEY=key)


# ── T-PLT-03-1 unit: the GSTIN checksum ──────────────────────────────────────


def test_the_gstin_checksum_accepts_the_documented_valid_value() -> None:
    """T-PLT-03-1: `27AAPFU0939F1ZV` is valid (PLT-03 §21)."""
    from apps.tax.validators import gstin_checksum, is_valid_gstin

    assert is_valid_gstin(VALID_GSTIN)
    assert gstin_checksum(VALID_GSTIN) == VALID_GSTIN[14]


@pytest.mark.parametrize(
    "candidate",
    [
        "27AAPFU0939F1ZW",  # one character off the checksum
        "27AAPFU0939F1Z",  # too short
        "27aapfu0939f1zv".upper()[:-1] + "1",  # wrong check digit
        "99AAPFU0939F1ZV",  # bad state prefix — checksum fails too
        "",
        None,
    ],
)
def test_an_invalid_gstin_is_rejected(candidate: Any) -> None:
    from apps.tax.validators import is_valid_gstin

    assert is_valid_gstin(candidate) is False


def test_pan_and_state_are_derived_from_the_gstin() -> None:
    """FR-3: state from characters 1–2, PAN from 3–12."""
    from apps.tax.validators import pan_from_gstin, state_from_gstin

    assert state_from_gstin(VALID_GSTIN) == "27"
    assert pan_from_gstin(VALID_GSTIN) == "AAPFU0939F"


def test_state_code_99_is_refused_and_97_is_accepted() -> None:
    """EC-4: `97` Other Territory is a taxpayer; `99` Centre jurisdiction is not."""
    from apps.tax.validators import is_valid_state_code

    assert is_valid_state_code("97") is True
    assert is_valid_state_code("99") is False
    assert is_valid_state_code("27") is True


# ── T-PLT-03-2 unit: the preset table ────────────────────────────────────────


def test_every_business_type_has_a_preset() -> None:
    """T-PLT-03-2 / FR-7: nine types, nine rows."""
    from apps.platform_app.constants import BusinessType
    from apps.platform_app.services.presets import PRESETS

    assert set(PRESETS) == {choice.value for choice in BusinessType}


@pytest.mark.parametrize(
    ("business_type", "inventory", "labels", "due_days"),
    [
        ("retail", True, ("Customer", "Supplier"), 7),
        ("wholesale", True, ("Party", "Supplier"), 15),
        ("distribution", True, ("Retailer", "Company"), 15),
        ("services", False, ("Client", "Vendor"), 30),
        ("trader", True, ("Party", "Supplier"), 15),
        ("manufacturer", True, ("Customer", "Supplier"), 15),
        ("professional", False, ("Client", "Vendor"), 30),
        ("food", True, ("Customer", "Supplier"), 7),
        ("other", True, ("Party", "Supplier"), 30),
    ],
)
def test_the_preset_table_matches_the_frd(
    business_type: str, inventory: bool, labels: tuple, due_days: int
) -> None:
    """T-PLT-03-2: FR-7's normative table, row for row."""
    from apps.platform_app.services.presets import preset_for

    preset = preset_for(business_type)
    assert preset.inventory_enabled is inventory
    assert preset.party_labels == labels
    assert preset.default_due_days == due_days


def test_food_items_default_to_not_tracking_stock() -> None:
    """FR-7: "`food` — yes (items default `track_stock=false`)"."""
    from apps.platform_app.services.presets import preset_for

    assert preset_for("food").items_track_stock_default is False
    assert preset_for("retail").items_track_stock_default is True


def test_business_type_gates_no_behaviour_anywhere(tmp_path: Any) -> None:
    """FR-8 / canon: the preset seeds values; it never becomes an `if`.

    An AST-free grep is enough here because the property is textual: outside the
    preset table and the serializer's choice list, nothing may compare
    `business_type` to a literal.
    """
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parents[3] / "apps"
    allowed = {"services/presets.py", "services/onboarding.py"}
    pattern = re.compile(r"business_type\s*[=!]=\s*['\"]")
    offenders = []
    for path in root.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        if any(str(path).endswith(suffix) for suffix in allowed):
            continue
        if pattern.search(path.read_text(encoding="utf-8")):
            offenders.append(str(path.relative_to(root)))
    assert offenders == []


# ── T-PLT-03-3 API: step 1 ───────────────────────────────────────────────────


def test_creating_a_tenant_makes_the_caller_its_owner_and_reissues_the_token(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """T-PLT-03-3 / AC-1 / FR-2 / BR-5."""
    from apps.platform_app.models import Membership, Tenant

    client, member = api_as(tenant)
    response = _create(client, name="Kirana Bhandar")
    assert response.status_code == 201

    data = response.json()["data"]
    created = Tenant.objects.get(pk=data["tenant"]["id"])
    assert created.onboarding_step == 1
    assert created.status == "active"
    assert created.phone == member.user.mobile  # BR-6
    assert created.partner.code == "metis"
    assert created.plan_id == created.partner.default_plan_id

    owner = Membership.objects.get(user=member.user, tenant=created)
    assert (owner.role.code, owner.status) == ("owner", "active")
    assert owner.joined_at is not None
    assert response["X-Tenant-Id"] == str(created.id)
    assert data["session"]["active_tenant_id"] == str(created.id)


def test_the_owner_name_fills_a_blank_full_name_only(
    api_as: Any, tenant: Any, onboarding_ready: Any, passwordless_user: Any
) -> None:
    """BR-7: written "when blank" — never over a name the user already has."""
    client, member = api_as(tenant, user=passwordless_user)
    assert member.user.full_name == "No Password"
    _create(client, owner_name="Ramesh Sharma")
    member.user.refresh_from_db()
    assert member.user.full_name == "No Password"

    member.user.full_name = ""
    member.user.save(update_fields=["full_name"])
    _create(client, name="Second Shop", owner_name="Ramesh Sharma", idempotency_key="k2")
    member.user.refresh_from_db()
    assert member.user.full_name == "Ramesh Sharma"


def test_creating_a_tenant_needs_only_authentication(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """§12: "any authenticated user" — including a staff member of another business."""
    for role in ("owner", "admin", "staff", "accountant"):
        client, _member = api_as(tenant, role=role)
        response = _create(client, name=f"{role} shop", idempotency_key=f"key-{role}")
        assert response.status_code == 201, role


def test_an_anonymous_caller_cannot_create_a_tenant(
    anonymous_client: Any, onboarding_ready: Any
) -> None:
    assert _create(anonymous_client).status_code == 401


def test_a_short_name_or_an_unknown_type_is_a_validation_error(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """§10."""
    client, _member = api_as(tenant)
    assert "name" in _create(client, name="A").json()["error"]["details"]
    assert "business_type" in _create(client, business_type="bank").json()["error"]["details"]
    assert "state_code" in _create(client, state_code="99").json()["error"]["details"]


# ── EC-7 idempotency ─────────────────────────────────────────────────────────


def test_a_retried_step_one_replays_and_creates_no_second_tenant(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """EC-7 / T-PLT-03-6: "retry with same `Idempotency-Key` replays the created tenant"."""
    from apps.platform_app.models import Tenant

    client, member = api_as(tenant)
    first = _create(client, idempotency_key="lost-response")
    second = _create(client, idempotency_key="lost-response")

    assert first.status_code == second.status_code == 201
    assert second["Idempotent-Replayed"] == "true"
    assert first.json()["data"]["tenant"]["id"] == second.json()["data"]["tenant"]["id"]
    assert (
        Tenant.objects.filter(memberships__user=member.user, name="Sharma General Store").count()
        == 1
    )


def test_the_same_key_with_a_different_body_is_a_conflict(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Part 22 §22.1: same key + different body → 409 `idempotency_conflict`."""
    client, _member = api_as(tenant)
    _create(client, name="First Shop", idempotency_key="same-key")
    clash = _create(client, name="Other Shop", idempotency_key="same-key")
    assert clash.status_code == 409
    assert clash.json()["error"]["code"] == "idempotency_conflict"


def test_two_tenant_less_users_may_use_the_same_idempotency_key(
    onboarding_ready: Any,
) -> None:
    """A key presented before any tenant exists is scoped to the user.

    Part 21 §21.3.1 scopes idempotency keys per tenant, and this is the one
    endpoint whose caller may not have one yet. Without the `(user, scope, key)`
    partial index the two sign-ups below would collide on `(NULL, …)` — or, in
    PostgreSQL, not collide at all and lose the lock entirely.
    """
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import AccessToken

    from apps.platform_app.models import Tenant
    from tests.factories.platform import UserFactory

    clients = []
    for _ in range(2):
        fresh = UserFactory()
        token = AccessToken.for_user(fresh)
        token["sid"] = str(fresh.id)
        token["epo"] = fresh.token_epoch
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        clients.append(client)

    assert _create(clients[0], idempotency_key="k").status_code == 201
    assert _create(clients[1], idempotency_key="k").status_code == 201
    assert Tenant.objects.filter(name="Sharma General Store").count() == 2


# ── Steps 2–4 ────────────────────────────────────────────────────────────────


_WIZARD_RUNS = itertools.count()


def _wizard(api_as: Any, tenant_fixture: Any) -> tuple:
    """Run step 1 and return an authenticated client for the new tenant.

    Each run uses its own `Idempotency-Key`: the key is scoped to (tenant,
    scope, key), and every caller here is already a member of the same fixture
    tenant, so a shared key would legitimately replay the first run's tenant.
    """
    from rest_framework.test import APIClient

    from apps.platform_app.models import Membership, Tenant
    from tests.fixtures import build_access_token

    client, member = api_as(tenant_fixture)
    created = _create(client, idempotency_key=f"wizard-{next(_WIZARD_RUNS)}")
    new_tenant = Tenant.objects.get(pk=created.json()["data"]["tenant"]["id"])
    membership = Membership.objects.get(user=member.user, tenant=new_tenant)
    scoped = APIClient()
    scoped.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(membership)}")
    return scoped, new_tenant, membership


def _complete(client: Any) -> Any:
    """Walk steps 2 → 3 → 4 the way the wizard does, and return the last response.

    `onboarding_step` advances by one request per step (FR-1, "progress is saved
    after each step"): the server refuses to be jumped from step 1 straight to
    step 4, because that would apply the preset for a business whose GST and
    address steps never ran. Tests that want a *completed* tenant therefore have
    to complete it, not assert it.
    """
    client.patch(reverse(CURRENT_URL), {"onboarding_step": 2}, format="json")
    client.patch(reverse(CURRENT_URL), {"onboarding_step": 3}, format="json")
    return client.patch(reverse(CURRENT_URL), {"onboarding_step": 4}, format="json")


def test_step_two_derives_pan_and_keeps_the_gstin(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-3 / AC-2: PAN prefilled, state checked, only a mismatch warns."""
    client, new_tenant, _m = _wizard(api_as, tenant)
    response = client.patch(
        reverse(CURRENT_URL),
        {"gst_type": "regular", "gstin": VALID_GSTIN, "onboarding_step": 2},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"]["gstin"] == VALID_GSTIN
    assert body["data"]["pan"] == "AAPFU0939F"
    assert body["meta"]["warnings"] == []

    new_tenant.refresh_from_db()
    assert new_tenant.onboarding_step == 2


def test_a_state_mismatch_is_a_warning_not_an_error(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """T-PLT-03-5 / FR-3."""
    client, _new_tenant, _m = _wizard(api_as, tenant)
    response = client.patch(
        reverse(CURRENT_URL),
        {"state_code": "29", "gst_type": "regular", "gstin": VALID_GSTIN},
        format="json",
    )
    assert response.status_code == 200
    warnings = response.json()["meta"]["warnings"]
    assert [w["code"] for w in warnings] == ["gstin_state_mismatch"]
    assert warnings[0]["gstin_state_code"] == "27"


def test_a_duplicate_gstin_under_one_partner_is_409(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """T-PLT-03-4 / BR-1 / §10: `U(partner_id, gstin)` among non-deleted tenants."""
    client, _new_tenant, _m = _wizard(api_as, tenant)
    assert (
        client.patch(
            reverse(CURRENT_URL),
            {"gst_type": "regular", "gstin": VALID_GSTIN},
            format="json",
        ).status_code
        == 200
    )

    second_client, _second, _m2 = _wizard(api_as, tenant)
    clash = second_client.patch(
        reverse(CURRENT_URL), {"gst_type": "regular", "gstin": VALID_GSTIN}, format="json"
    )
    assert clash.status_code == 409
    assert clash.json()["error"]["code"] == "gstin_in_use"


def test_an_invalid_gstin_is_refused_server_side(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """§19: "GSTIN validated server-side regardless of client"."""
    client, _new_tenant, _m = _wizard(api_as, tenant)
    response = client.patch(
        reverse(CURRENT_URL),
        {"gst_type": "regular", "gstin": "27AAPFU0939F1ZW"},
        format="json",
    )
    assert response.status_code == 400
    assert "gstin" in response.json()["error"]["details"]


def test_skipping_gst_leaves_the_tenant_unregistered_with_no_gstin(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-10 / AC-3."""
    client, new_tenant, _m = _wizard(api_as, tenant)
    client.patch(
        reverse(CURRENT_URL),
        {"gst_type": "regular", "gstin": VALID_GSTIN},
        format="json",
    )
    client.patch(reverse(CURRENT_URL), {"gst_type": "unregistered"}, format="json")
    new_tenant.refresh_from_db()
    assert new_tenant.gst_type == "unregistered"
    assert new_tenant.gstin is None


def test_a_bad_pincode_is_a_field_error(api_as: Any, tenant: Any, onboarding_ready: Any) -> None:
    """§10: `^[1-9][0-9]{5}$`."""
    client, _new_tenant, _m = _wizard(api_as, tenant)
    response = client.patch(reverse(CURRENT_URL), {"address": {"pincode": "012345"}}, format="json")
    assert response.status_code == 400
    assert "address" in response.json()["error"]["details"]


# ── FR-5/FR-6: preset application ────────────────────────────────────────────


def test_completing_the_wizard_seeds_every_default(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """AC-5 / FR-6: settings, sequences, MAIN location and expense categories."""
    from apps.expenses.models import ExpenseCategory
    from apps.inventory.models import Location
    from apps.platform_app.models import DocumentSequence, TenantSetting
    from apps.platform_app.services.presets import NUMBERING_PREFIXES

    client, new_tenant, _m = _wizard(api_as, tenant)
    response = _complete(client)
    assert response.status_code == 200

    keys = set(TenantSetting.objects.filter(tenant=new_tenant).values_list("key", flat=True))
    assert keys == {
        "inventory.enabled",
        "inventory.favourite_units",
        "sales.default_kind",
        "sales.default_due_days",
        "numbering",
        "ledger.credit_limit_mode",
        "ledger.reminder_templates",
        "documents.show_upi_qr",
        "parties.labels",
    }
    labels = TenantSetting.objects.get(tenant=new_tenant, key="parties.labels").value
    assert labels == {"customer": "Customer", "supplier": "Supplier"}

    sequences = DocumentSequence.objects.filter(tenant=new_tenant)
    assert sequences.count() == len(NUMBERING_PREFIXES) == 12
    invoice = sequences.get(kind="invoice")
    assert (invoice.prefix, invoice.next_number, invoice.padding) == ("INV", 1, 4)

    main = Location.objects.get(tenant=new_tenant)
    assert (main.code, main.is_default) == ("MAIN", True)

    categories = ExpenseCategory.objects.filter(tenant=new_tenant)
    assert categories.filter(is_system=True).count() == 9
    assert set(categories.filter(is_system=False).values_list("name", flat=True)) == {
        "Packaging",
        "Shop maintenance",
    }


def test_the_reminder_templates_are_seeded_in_both_locales(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-6: "default text in `en` and `hi`"."""
    from apps.platform_app.models import TenantSetting

    client, new_tenant, _m = _wizard(api_as, tenant)
    _complete(client)
    value = TenantSetting.objects.get(tenant=new_tenant, key="ledger.reminder_templates").value
    assert set(value) == {"en", "hi"}
    assert all(text.strip() for text in value.values())


def test_completion_is_idempotent(api_as: Any, tenant: Any, onboarding_ready: Any) -> None:
    """T-PLT-03-6 / BR-3: a second completion creates no duplicate row.

    Row counts alone do not prove BR-3: every seed is a `get_or_create`, so the
    counts are stable even when the preset is re-applied in full. BR-3 says
    "idempotent **and audited once**", so the audit row is the assertion that
    actually bites, and it is checked here alongside the counts.
    """
    from apps.common.audit import AuditAction
    from apps.expenses.models import ExpenseCategory
    from apps.inventory.models import Location
    from apps.platform_app.models import AuditLog, DocumentSequence, TenantSetting

    client, new_tenant, _m = _wizard(api_as, tenant)

    def counts() -> tuple:
        return (
            TenantSetting.objects.filter(tenant=new_tenant).count(),
            DocumentSequence.objects.filter(tenant=new_tenant).count(),
            ExpenseCategory.objects.filter(tenant=new_tenant).count(),
            Location.objects.filter(tenant=new_tenant).count(),
        )

    def preset_audits() -> int:
        return AuditLog.objects.filter(
            tenant=new_tenant, action=AuditAction.TENANT_PRESET_APPLIED
        ).count()

    _complete(client)
    after_first = counts()
    assert preset_audits() == 1

    client.patch(reverse(CURRENT_URL), {"onboarding_step": 4}, format="json")
    client.patch(reverse(CURRENT_URL), {"onboarding_step": 4}, format="json")
    assert counts() == after_first
    assert preset_audits() == 1


def test_a_services_business_does_not_get_inventory(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-6/FR-7: `inventory` is in `enabled_modules` only when the preset says so."""
    from apps.platform_app.models import Tenant, TenantSetting

    client, member = api_as(tenant)
    created = _create(client, business_type="services", idempotency_key="svc")
    new_tenant = Tenant.objects.get(pk=created.json()["data"]["tenant"]["id"])
    assert "inventory" not in new_tenant.enabled_modules

    from apps.platform_app.services.onboarding import apply_preset

    apply_preset(tenant=new_tenant, actor=member.user)
    assert (
        TenantSetting.objects.get(tenant=new_tenant, key="inventory.enabled").value["value"]
        is False
    )


def test_modules_are_intersected_with_the_partner_allow_list(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """T-PLT-03-7 / EC-6: a partner without `inventory` silently drops it."""
    from apps.platform_app.models import Tenant

    partner = onboarding_ready
    partner.allowed_modules = [m for m in partner.allowed_modules if m != "inventory"]
    partner.save(update_fields=["allowed_modules"])

    client, _member = api_as(tenant)
    created = _create(client, business_type="retail", idempotency_key="no-inv")
    new_tenant = Tenant.objects.get(pk=created.json()["data"]["tenant"]["id"])
    assert "inventory" not in new_tenant.enabled_modules
    assert "sales" in new_tenant.enabled_modules


def test_the_fy_label_follows_the_tenants_financial_year(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """BR-4: `YYYY-YY` from `fy_start_month` and the tenant timezone."""
    from apps.common.dates import fy_label_for, tenant_today
    from apps.platform_app.models import DocumentSequence

    client, new_tenant, _m = _wizard(api_as, tenant)
    _complete(client)
    expected = fy_label_for(new_tenant, tenant_today(new_tenant))
    assert set(
        DocumentSequence.objects.filter(tenant=new_tenant).values_list("fy_label", flat=True)
    ) == {expected}


# ── Resume and permissions ───────────────────────────────────────────────────


def test_me_reports_the_step_the_wizard_stopped_at(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-9 / AC-4 / EC-1: resume is driven by `active_tenant.onboarding_step`."""
    client, _new_tenant, _m = _wizard(api_as, tenant)
    client.patch(reverse(CURRENT_URL), {"onboarding_step": 2}, format="json")
    body = client.get(reverse("v1:auth-me")).json()["data"]
    assert body["active_tenant"]["onboarding_step"] == 2


def test_staff_and_accountant_cannot_run_the_wizard(api_as: Any, tenant: Any) -> None:
    """T-PLT-03-11 / §12's matrix."""
    for role in ("staff", "accountant"):
        client, _member = api_as(tenant, role=role)
        response = client.patch(reverse(CURRENT_URL), {"name": "Renamed"}, format="json")
        assert response.status_code == 403, role
        assert response.json()["error"]["code"] == "permission_denied"


def test_owner_and_admin_can_run_the_wizard(api_as: Any, tenant: Any) -> None:
    """§12's matrix, the other half."""
    for role in ("owner", "admin"):
        client, _member = api_as(tenant, role=role)
        response = client.patch(reverse(CURRENT_URL), {"name": f"Renamed by {role}"}, format="json")
        assert response.status_code == 200, role


def test_any_member_may_read_the_current_tenant(api_as: Any, tenant: Any) -> None:
    """Part 22 §22.3 restricts the PATCH only; the shell renders the name for everyone."""
    for role in ("owner", "admin", "staff", "accountant"):
        client, _member = api_as(tenant, role=role)
        assert client.get(reverse(CURRENT_URL)).status_code == 200, role


def test_a_caller_with_no_tenant_gets_no_active_tenant(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Fail closed: `/tenants/current` without a `tid` claim is never somebody else's."""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import AccessToken

    from tests.factories.platform import UserFactory

    stranger = UserFactory()
    token = AccessToken.for_user(stranger)
    token["sid"] = str(stranger.id)
    token["epo"] = stranger.token_epoch
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    assert client.get(reverse(CURRENT_URL)).status_code == 403


# ── EC-7: the idempotency key must outlive the tenant switch it causes ───────


def test_a_retry_under_the_new_tid_replays_instead_of_creating_a_second_business(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """EC-7: `POST /tenants` re-issues the caller's `tid`, so the retry arrives
    under a *different* tenant than the first attempt. If the key's namespace
    included that tenant, the retry would land on a fresh tuple and "Add a
    business" retried with the same key would create a second business.
    """
    from rest_framework.test import APIClient

    from apps.platform_app.models import Membership, Tenant
    from tests.fixtures import build_access_token

    client, member = api_as(tenant)
    before = Tenant.objects.count()

    first = _create(client, name="Sharma Wholesale", idempotency_key="add-business-1")
    assert first.status_code == 201
    created_id = first.json()["data"]["tenant"]["id"]
    assert Tenant.objects.count() == before + 1

    # The retry carries the token the first response issued — the new tenant's.
    new_membership = Membership.objects.get(user=member.user, tenant_id=created_id)
    retried = APIClient()
    retried.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(new_membership)}")

    second = _create(retried, name="Sharma Wholesale", idempotency_key="add-business-1")
    assert second.status_code == 201
    assert second["Idempotent-Replayed"] == "true"
    assert second.json()["data"]["tenant"]["id"] == created_id
    assert Tenant.objects.count() == before + 1


def test_a_replayed_creation_reissues_the_session_for_the_created_tenant(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """EC-7: a replay has to be a whole response, not a stored body.

    The 201's usable half is the cookie carrying the new `tid`. A replay without
    it hands the client a 201 for a business it holds no token for, and the
    wizard's next step is refused `no_active_tenant` — the wedge EC-7 exists to
    prevent, reached by the retry EC-7 prescribes.
    """
    from rest_framework.test import APIClient

    from apps.platform_app.tokens import ACCESS_COOKIE, CSRF_COOKIE

    client, _member = api_as(tenant)
    first = _create(client, idempotency_key="lost-response")
    created_id = first.json()["data"]["tenant"]["id"]

    replay = _create(client, idempotency_key="lost-response")
    assert replay.status_code == 201
    assert replay["Idempotent-Replayed"] == "true"
    assert replay["X-Tenant-Id"] == created_id
    assert ACCESS_COOKIE in replay.cookies
    assert CSRF_COOKIE in replay.cookies

    # The cookie the replay issued is enough to run the next wizard step.
    cookie_client = APIClient()
    cookie_client.cookies[ACCESS_COOKIE] = replay.cookies[ACCESS_COOKIE].value
    cookie_client.cookies[CSRF_COOKIE] = replay.cookies[CSRF_COOKIE].value
    stepped = cookie_client.patch(
        reverse(CURRENT_URL),
        {"onboarding_step": 2},
        format="json",
        HTTP_X_CSRF_TOKEN=replay.cookies[CSRF_COOKIE].value,
    )
    assert stepped.status_code == 200, stepped.json()
    assert stepped.json()["data"]["id"] == created_id


# ── FR-10 / B-3: `null` is how a client clears an optional field ─────────────


def test_skipping_the_gst_step_with_nulls_is_accepted(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-10 "Skip for now" — the client normalises a blank input to `null`."""
    client, new_tenant, _m = _wizard(api_as, tenant)
    response = client.patch(
        reverse(CURRENT_URL),
        {
            "gst_type": "unregistered",
            "gstin": None,
            "legal_name": None,
            "pan": None,
            "onboarding_step": 2,
        },
        format="json",
    )
    assert response.status_code == 200, response.json()
    new_tenant.refresh_from_db()
    assert new_tenant.gstin is None
    assert new_tenant.legal_name is None


def test_a_blank_address_field_is_accepted_as_null(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """Step 3: `optionalText` sends `null` for every input the merchant left blank."""
    client, new_tenant, _m = _wizard(api_as, tenant)
    client.patch(reverse(CURRENT_URL), {"onboarding_step": 2}, format="json")
    response = client.patch(
        reverse(CURRENT_URL),
        {
            "address": {
                "line1": "12 Station Road",
                "line2": None,
                "city": "Pune",
                "district": None,
                "state": None,
                "pincode": None,
            },
            "phone": None,
            "email": None,
            "onboarding_step": 3,
        },
        format="json",
    )
    assert response.status_code == 200, response.json()
    new_tenant.refresh_from_db()
    assert new_tenant.address == {"line1": "12 Station Road", "city": "Pune"}
    assert new_tenant.email is None
    assert new_tenant.phone == ""


# ── FR-1 / FR-9: `onboarding_step` is a progress marker, not a free field ────


def test_the_wizard_cannot_be_jumped_to_the_last_step(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-1: a client cannot complete the wizard — and apply the preset — from step 1."""
    from apps.platform_app.models import TenantSetting

    client, new_tenant, _m = _wizard(api_as, tenant)
    response = client.patch(reverse(CURRENT_URL), {"onboarding_step": 4}, format="json")
    assert response.status_code == 200
    new_tenant.refresh_from_db()
    assert new_tenant.onboarding_step == 2
    assert not TenantSetting.objects.filter(tenant=new_tenant).exists()


def test_editing_an_earlier_step_does_not_regress_a_completed_tenant(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """FR-9: a completed step is navigable for edits, and the edit is not a regression."""
    client, new_tenant, _m = _wizard(api_as, tenant)
    _complete(client)
    new_tenant.refresh_from_db()
    assert new_tenant.onboarding_step == 4

    response = client.patch(
        reverse(CURRENT_URL),
        {"legal_name": "Sharma General Store Pvt Ltd", "onboarding_step": 2},
        format="json",
    )
    assert response.status_code == 200
    new_tenant.refresh_from_db()
    assert new_tenant.legal_name == "Sharma General Store Pvt Ltd"
    assert new_tenant.onboarding_step == 4


def test_a_profile_edit_after_completion_does_not_re_apply_the_preset(
    api_as: Any, tenant: Any, onboarding_ready: Any
) -> None:
    """BR-3 / FR-8: the preset is applied on the transition, never on a later save.

    `enabled_modules` is the part that bites: `apply_preset` rewrites it back to
    the full preset set, so once `PLT-06`'s toggles land an owner who switches
    `inventory` off and then edits their address has it switched back on.
    """
    from apps.common.audit import AuditAction
    from apps.platform_app.models import AuditLog

    client, new_tenant, _m = _wizard(api_as, tenant)
    _complete(client)

    new_tenant.refresh_from_db()
    assert "inventory" in new_tenant.enabled_modules
    owner_choice = [m for m in new_tenant.enabled_modules if m != "inventory"]
    new_tenant.enabled_modules = owner_choice
    new_tenant.save(update_fields=["enabled_modules", "updated_at"])

    response = client.patch(reverse(CURRENT_URL), {"address": {"city": "Nashik"}}, format="json")
    assert response.status_code == 200

    new_tenant.refresh_from_db()
    assert new_tenant.enabled_modules == owner_choice
    assert (
        AuditLog.objects.filter(tenant=new_tenant, action=AuditAction.TENANT_PRESET_APPLIED).count()
        == 1
    )
