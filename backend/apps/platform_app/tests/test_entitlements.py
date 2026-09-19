"""`PLT-15` — plan entitlements, as narrowed by `DEC-001`.

`DEC-001` (defaulted 2026-09-19, option (b)) is the specification this file
tests: at MVP `PLT-15` enforces **module entitlement and member count only**,
the ledger is never capped, and `max_parties` / `max_invoices_per_month` are
removed from enforcement on every MVP plan. Free tier is owner plus two members.

Tier 1 throughout: an entitlement rule that is wrong either sells a seat twice
or locks a merchant out of a module they paid for.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

ME_URL = "v1:auth-me"
PARTY_LIST_URL = "v1:party-list"


# ── FR-1: the seeded plans ───────────────────────────────────────────────────


def test_seed_plans_creates_free_and_unlimited_and_the_metis_partner(
    seeded_plans: Any,
) -> None:
    """FR-1 / T-PLT-15-1."""
    from apps.platform_app.models import Plan

    free = Plan.objects.get(code="free")
    unlimited = Plan.objects.get(code="unlimited")
    assert free.limits["max_users"] == 3  # DEC-001: owner plus two members
    assert unlimited.limits["max_users"] is None
    assert seeded_plans.code == "metis"
    assert seeded_plans.default_plan_id == unlimited.id


def test_the_removed_limits_are_absent_from_every_seeded_plan(seeded_plans: Any) -> None:
    """DEC-001: "`max_parties` and `max_invoices_per_month` are removed".

    Absent, not `null`: a `null` reads as "unlimited, and still a limit", and the
    decision was that these are not limits any more.
    """
    from apps.platform_app.models import Plan
    from apps.platform_app.services.entitlements import REMOVED_AT_MVP

    for plan in Plan.objects.all():
        assert set(plan.limits) & set(REMOVED_AT_MVP) == set(), plan.code


def test_seed_plans_is_idempotent(seeded_plans: Any) -> None:
    """Part 21 §21.8: running a seed twice changes no row count."""
    from django.core.management import call_command

    from apps.platform_app.models import Partner, Plan

    before = (Plan.objects.count(), Partner.objects.count())
    call_command("seed_plans")
    call_command("seed_plans")
    assert (Plan.objects.count(), Partner.objects.count()) == before


def test_the_enforced_key_list_is_exactly_what_dec_001_left(seeded_plans: Any) -> None:
    """The list is the decision, in code, where a reintroduction has to edit it."""
    from apps.platform_app.services.entitlements import LIMIT_KEYS, REMOVED_AT_MVP

    assert set(LIMIT_KEYS) == {"max_users", "storage_mb"}
    assert set(LIMIT_KEYS) & set(REMOVED_AT_MVP) == set()


# ── FR-2: the effective entitlement ──────────────────────────────────────────


def test_modules_are_the_intersection_of_plan_and_partner(tenant: Any) -> None:
    """T-PLT-15-1 / FR-2."""
    from apps.platform_app.services.entitlements import for_tenant

    tenant.plan.modules = ["platform", "parties", "ledger", "sales"]
    tenant.plan.save(update_fields=["modules"])
    tenant.partner.allowed_modules = ["platform", "parties", "ledger", "inventory"]
    tenant.partner.save(update_fields=["allowed_modules"])

    entitlement = for_tenant(tenant)
    assert set(entitlement.modules) == {"platform", "parties", "ledger"}


def test_a_null_limit_means_unlimited(tenant: Any) -> None:
    """FR-2 / BR-1: `null` = unlimited."""
    from apps.platform_app.services.entitlements import for_tenant

    tenant.plan.limits = {"max_users": None}
    tenant.plan.save(update_fields=["limits"])
    assert for_tenant(tenant).limit("max_users") is None


def test_a_tenant_override_beats_the_plan(tenant: Any) -> None:
    """FR-2: "`limit[k] = override[k] if present else plan.limits[k]`" (PLT-14)."""
    from apps.platform_app.models import TenantSetting
    from apps.platform_app.services.entitlements import OVERRIDE_SETTING_KEY, for_tenant

    tenant.plan.limits = {"max_users": 3}
    tenant.plan.save(update_fields=["limits"])
    TenantSetting.objects.create(
        tenant=tenant,
        key=OVERRIDE_SETTING_KEY,
        value={"limits": {"max_users": 25}, "modules_extra": ["inventory"]},
    )
    entitlement = for_tenant(tenant)
    assert entitlement.limit("max_users") == 25
    assert "inventory" in entitlement.modules


def test_modules_extra_is_still_intersected_with_the_partner(tenant: Any) -> None:
    """FR-2: "(+ `plan.overrides.modules_extra` …, still ∩ partner allowed)"."""
    from apps.platform_app.models import TenantSetting
    from apps.platform_app.services.entitlements import OVERRIDE_SETTING_KEY, for_tenant

    tenant.partner.allowed_modules = ["platform", "parties"]
    tenant.partner.save(update_fields=["allowed_modules"])
    TenantSetting.objects.create(
        tenant=tenant, key=OVERRIDE_SETTING_KEY, value={"modules_extra": ["inventory"]}
    )
    assert "inventory" not in for_tenant(tenant).modules


def test_effective_modules_needs_both_the_plan_and_the_owner_switch(tenant: Any) -> None:
    """BR-6: "`enabled_modules` (owner choice) ∩ effective modules; both must be true"."""
    from apps.platform_app.services.entitlements import effective_modules

    tenant.enabled_modules = ["platform", "parties"]
    tenant.save(update_fields=["enabled_modules"])
    assert "sales" not in effective_modules(tenant)
    assert "parties" in effective_modules(tenant)


def test_platform_is_never_module_gated(tenant: Any) -> None:
    """The switch that turns modules on cannot itself be behind a module switch."""
    from apps.platform_app.services.entitlements import effective_modules

    tenant.enabled_modules = []
    tenant.save(update_fields=["enabled_modules"])
    assert "platform" in effective_modules(tenant)


def test_the_entitlement_is_computed_once_per_tenant_instance(tenant: Any) -> None:
    """§20: "per-request cache of the effective plan"."""
    from apps.platform_app.services.entitlements import for_tenant

    first = for_tenant(tenant)
    assert for_tenant(tenant) is first


# ── FR-3: module gating at the endpoint ──────────────────────────────────────


def test_a_module_outside_the_plan_returns_module_disabled(api_as: Any, tenant: Any) -> None:
    """T-PLT-15-2 / AC-4 / FR-3: 403 `module_disabled`, never `permission_denied`."""
    tenant.plan.modules = [m for m in tenant.plan.modules if m != "parties"]
    tenant.plan.save(update_fields=["modules"])

    client, _member = api_as(tenant)
    response = client.get(reverse(PARTY_LIST_URL))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "module_disabled"
    assert response.json()["error"]["details"]["module"] == "parties"


def test_a_module_the_partner_does_not_resell_is_disabled(api_as: Any, tenant: Any) -> None:
    """AC-4 / US-4: "a partner without `inventory` … `/items` returns `module_disabled`"."""
    tenant.partner.allowed_modules = [m for m in tenant.partner.allowed_modules if m != "parties"]
    tenant.partner.save(update_fields=["allowed_modules"])

    client, _member = api_as(tenant)
    assert client.get(reverse(PARTY_LIST_URL)).json()["error"]["code"] == "module_disabled"


def test_a_module_the_owner_switched_off_is_disabled(api_as: Any, tenant: Any) -> None:
    """BR-6's other half."""
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "parties"]
    tenant.save(update_fields=["enabled_modules"])

    client, _member = api_as(tenant)
    assert client.get(reverse(PARTY_LIST_URL)).json()["error"]["code"] == "module_disabled"


def test_module_gating_is_checked_before_the_permission(api_as: Any, tenant: Any) -> None:
    """§27.5.1 / FR-3: "the user gets the accurate error"."""
    tenant.plan.modules = [m for m in tenant.plan.modules if m != "parties"]
    tenant.plan.save(update_fields=["modules"])

    client, _member = api_as(tenant, role="accountant")
    body = client.get(reverse(PARTY_LIST_URL)).json()
    assert body["error"]["code"] == "module_disabled"


# ── FR-3: `max_users`, the one enforced limit ────────────────────────────────


def _cap_seats(tenant: Any, seats: int | None) -> None:
    tenant.plan.limits = {"max_users": seats}
    tenant.plan.save(update_fields=["limits"])


def test_the_member_count_is_active_plus_invited(tenant: Any, system_roles: dict) -> None:
    """FR-3 / BR-2: the owner counts; `removed` and `suspended` do not."""
    from apps.platform_app.services.entitlements import member_usage
    from tests.factories.platform import MembershipFactory, UserFactory

    MembershipFactory(user=UserFactory(), tenant=tenant, role=system_roles["owner"])
    MembershipFactory(
        user=UserFactory(), tenant=tenant, role=system_roles["staff"], status="invited"
    )
    MembershipFactory(
        user=UserFactory(), tenant=tenant, role=system_roles["staff"], status="removed"
    )
    MembershipFactory(
        user=UserFactory(), tenant=tenant, role=system_roles["staff"], status="suspended"
    )
    assert member_usage(tenant) == 2


def test_accepting_an_invitation_at_the_seat_limit_is_refused(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """T-PLT-15-2 / FR-3 / FR-4: 403 `plan_limit_reached` with used/limit/plan."""
    from tests.factories.platform import InvitationFactory, MembershipFactory, UserFactory

    _cap_seats(other_tenant, 2)
    MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["owner"])
    MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["staff"])

    client, member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-at-limit",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-at-limit"}), {}, format="json"
    )
    assert response.status_code == 403
    details = response.json()["error"]["details"]
    assert response.json()["error"]["code"] == "plan_limit_reached"
    assert details["limit_key"] == "max_users"
    assert (details["limit"], details["used"]) == (2, 2)
    assert details["plan_code"] == other_tenant.plan.code
    # `name` is part of the block: FR-6/FR-7's "Contact {partner}" has nothing
    # to interpolate without it.
    assert set(details["support_contact"]) == {"name", "phone", "whatsapp", "email"}


def test_accepting_below_the_seat_limit_succeeds(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """T-PLT-15-2: "below → 200"."""
    from tests.factories.platform import InvitationFactory, MembershipFactory, UserFactory

    _cap_seats(other_tenant, 3)
    MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["owner"])
    MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["staff"])

    client, member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-room",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-room"}), {}, format="json"
    )
    assert response.status_code == 200


def test_an_unlimited_plan_never_blocks_a_seat(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """T-PLT-15-2: "`null` → never blocks"."""
    from tests.factories.platform import InvitationFactory, MembershipFactory, UserFactory

    _cap_seats(other_tenant, None)
    for _ in range(5):
        MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["staff"])

    client, member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-unlimited",
    )
    assert (
        client.post(
            reverse("v1:invitation-accept", kwargs={"token": "tok-unlimited"}),
            {},
            format="json",
        ).status_code
        == 200
    )


def test_an_invited_seat_is_not_charged_twice_on_acceptance(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """FR-3 counts `invited` already; accepting converts a seat, it does not buy one."""
    from tests.factories.platform import InvitationFactory, MembershipFactory, UserFactory

    _cap_seats(other_tenant, 2)
    MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["owner"])

    client, member = api_as(tenant)
    MembershipFactory(
        user=member.user,
        tenant=other_tenant,
        role=system_roles["staff"],
        status="invited",
        is_default=False,
    )
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-converted",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-converted"}), {}, format="json"
    )
    assert response.status_code == 200


def test_activating_a_membership_at_the_limit_is_refused(tenant: Any, system_roles: dict) -> None:
    """FR-3: "`PATCH status→active`" is the third gate."""
    from apps.common.exceptions import PlanLimitReached
    from apps.platform_app.services.memberships import activate_membership
    from tests.factories.platform import MembershipFactory, UserFactory

    _cap_seats(tenant, 1)
    MembershipFactory(user=UserFactory(), tenant=tenant, role=system_roles["owner"])
    suspended = MembershipFactory(
        user=UserFactory(), tenant=tenant, role=system_roles["staff"], status="suspended"
    )
    with pytest.raises(PlanLimitReached):
        activate_membership(membership=suspended, actor=None)


def test_a_limit_hit_writes_an_audit_row(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """§16: `plan.limit_hit` with `limit_key`, `limit`, `used`, `endpoint`."""
    from apps.platform_app.models import AuditLog
    from tests.factories.platform import InvitationFactory, MembershipFactory, UserFactory

    _cap_seats(other_tenant, 1)
    MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["owner"])
    client, member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-audited",
    )
    client.post(reverse("v1:invitation-accept", kwargs={"token": "tok-audited"}), {}, format="json")
    row = AuditLog.objects.filter(action="plan.limit_hit").first()
    assert row is not None
    assert row.metadata["limit_key"] == "max_users"
    assert row.metadata["endpoint"] == "invitations.accept"


# ── US-3 / AC-3: the ledger is never capped ──────────────────────────────────


def test_no_removed_limit_key_is_read_anywhere_in_the_codebase() -> None:
    """DEC-001 / T-PLT-15-3: the keys are gone, not merely set to `null`.

    A structural assertion rather than a behavioural one, because the promise is
    a negative: there must be no code path that could ever cap the ledger or the
    party list. If a key cannot be read, it cannot block anything.
    """
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[3] / "apps"
    allowed_files = {
        "services/entitlements.py",
        "management/commands/seed_plans.py",
        "common/permissions.py",  # names them only to refuse them
    }
    offenders = []
    for path in root.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        if any(str(path).endswith(suffix) for suffix in allowed_files):
            continue
        text = path.read_text(encoding="utf-8")
        if "max_parties" in text or "max_invoices_per_month" in text:
            offenders.append(str(path.relative_to(root)))
    assert offenders == []


def test_the_plan_limit_permission_refuses_an_unenforceable_key() -> None:
    """A `PlanLimit("max_parties", …)` must fail loudly, at import or at request."""
    from django.core.exceptions import ImproperlyConfigured

    from apps.common.permissions import PlanLimit

    gate = PlanLimit("max_parties", lambda tenant: 0)()

    class _Request:
        method = "POST"

    with pytest.raises(ImproperlyConfigured):
        gate.has_permission(_FakeRequest(), None)


class _FakeRequest:
    method = "POST"
    user = None

    def __init__(self) -> None:
        self._request = self
        self._ub_tenant = _FakeTenant()


class _FakeTenant:
    enabled_modules: list = []
    plan = None
    partner = None


def test_a_full_plan_never_blocks_a_read(api_as: Any, tenant: Any) -> None:
    """AC-3 / FR-3 "Never enforced: … reads"."""
    _cap_seats(tenant, 1)
    client, _member = api_as(tenant)
    assert client.get(reverse(PARTY_LIST_URL)).status_code == 200


# ── FR-5: `plan_limits` on `/auth/me` ────────────────────────────────────────


def test_me_reports_the_plan_limits_and_the_effective_modules(api_as: Any, tenant: Any) -> None:
    """T-PLT-15-1 / AC-1 / FR-5."""
    _cap_seats(tenant, 3)
    client, _member = api_as(tenant)
    payload = client.get(reverse(ME_URL)).json()["data"]["plan_limits"]

    assert payload["plan_code"] == tenant.plan.code
    assert set(payload["limits"]) == {"max_users", "storage_mb"}
    assert payload["limits"]["max_users"] == {"limit": 3, "used": 1}
    assert "parties" in payload["modules"]


def test_me_reports_no_removed_limit(api_as: Any, tenant: Any) -> None:
    """DEC-001: a client that still draws a parties meter finds nothing to draw."""
    client, _member = api_as(tenant)
    limits = client.get(reverse(ME_URL)).json()["data"]["plan_limits"]["limits"]
    assert "max_parties" not in limits
    assert "max_invoices_per_month" not in limits


def test_me_has_no_plan_limits_without_an_active_tenant(
    onboarding_ready: Any,
) -> None:
    """Fail closed: no tenant, no entitlement — never somebody else's."""
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import AccessToken

    from tests.factories.platform import UserFactory

    stranger = UserFactory()
    token = AccessToken.for_user(stranger)
    token["sid"] = str(stranger.id)
    token["epo"] = stranger.token_epoch
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    body = client.get(reverse(ME_URL)).json()["data"]
    assert body["plan_limits"] is None
    assert body["active_tenant_id"] is None
    assert body["permissions"] == []


# ── §12: who may see what ────────────────────────────────────────────────────


def test_every_role_can_read_its_own_plan(api_as: Any, tenant: Any) -> None:
    """§12: "Viewing own plan: any member (`/auth/me`)"."""
    for role in ("owner", "admin", "staff", "accountant"):
        client, _member = api_as(tenant, role=role)
        body = client.get(reverse(ME_URL)).json()["data"]
        assert body["plan_limits"]["plan_code"] == tenant.plan.code, role


def test_no_tenant_role_can_change_its_plan(api_as: Any, tenant: Any) -> None:
    """§12: "No tenant role can change its plan at MVP" — there is no endpoint."""
    from django.urls import NoReverseMatch

    with pytest.raises(NoReverseMatch):
        reverse("v1:plan-detail")


# ── FR-8: the nightly reconcile ──────────────────────────────────────────────


def test_reconcile_trims_modules_the_partner_no_longer_allows(tenant: Any) -> None:
    """T-PLT-15-7 / FR-8 / EC-3: trim the switch, keep the data."""
    from apps.platform_app.management.commands.reconcile_entitlements import reconcile
    from apps.platform_app.models import AuditLog
    from tests.factories.parties import PartyFactory

    party = PartyFactory(tenant=tenant)
    tenant.partner.allowed_modules = [m for m in tenant.partner.allowed_modules if m != "inventory"]
    tenant.partner.save(update_fields=["allowed_modules"])

    changed = reconcile(tenant_id=str(tenant.id))
    assert changed == [{"tenant_id": str(tenant.id), "removed": ["inventory"]}]

    tenant.refresh_from_db()
    assert "inventory" not in tenant.enabled_modules
    assert "parties" in tenant.enabled_modules
    # EC-3: "data retained".
    party.refresh_from_db()
    assert party.pk is not None

    row = AuditLog.objects.get(action="plan.modules_trimmed")
    assert row.after["enabled_modules"] == sorted(tenant.enabled_modules)
    assert row.metadata["removed"] == ["inventory"]


def test_reconcile_is_idempotent_and_never_widens(tenant: Any) -> None:
    """FR-8: a second run trims nothing, and it never adds a module back."""
    from apps.platform_app.management.commands.reconcile_entitlements import reconcile

    tenant.enabled_modules = ["platform", "parties"]
    tenant.save(update_fields=["enabled_modules"])

    assert reconcile(tenant_id=str(tenant.id)) == []
    tenant.refresh_from_db()
    assert sorted(tenant.enabled_modules) == ["parties", "platform"]


def test_reconcile_dry_run_writes_nothing(tenant: Any) -> None:
    from apps.platform_app.management.commands.reconcile_entitlements import reconcile

    tenant.plan.modules = ["platform", "parties"]
    tenant.plan.save(update_fields=["modules"])
    before = sorted(tenant.enabled_modules)

    changed = reconcile(tenant_id=str(tenant.id), dry_run=True)
    assert changed
    tenant.refresh_from_db()
    assert sorted(tenant.enabled_modules) == before


def test_the_reconcile_job_is_registered_for_its_schedule(db: Any) -> None:
    """Part 20 §20.8.4: a schedule whose handler is unregistered never runs."""
    from apps.common.jobs import REGISTRY, SCHEDULES

    scheduled = {schedule.job_type for schedule in SCHEDULES}
    assert "platform.reconcile_entitlements" in scheduled
    assert "platform.reconcile_entitlements" in REGISTRY
