"""`PLT-04` — multiple businesses and the tenant switch.

Tier 1 throughout: every rule here is a tenant boundary, and the whole feature
exists to make "business A is never visible while I am in business B" true.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

SWITCH_URL = "v1:auth-switch-tenant"
ME_URL = "v1:auth-me"
PARTY_LIST_URL = "v1:party-list"


def _membership_detail(membership: Any) -> str:
    return reverse("v1:membership-detail", kwargs={"membership_id": membership.id})


# ── FR-2: switching ──────────────────────────────────────────────────────────


def test_switching_issues_a_token_for_the_new_tenant_and_revokes_the_old_session(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """T-PLT-04-1 / AC-1 / FR-2 / BR-2."""
    from rest_framework.test import APIClient

    from apps.platform_app.models import Session
    from apps.platform_app.services import sessions as session_service
    from tests.factories.platform import MembershipFactory

    client, member = api_as(tenant)
    second = MembershipFactory(
        user=member.user, tenant=other_tenant, role=system_roles["staff"], is_default=False
    )
    issued = session_service.issue(user=member.user, tenant=tenant, membership=member)

    live = APIClient()
    live.credentials(HTTP_AUTHORIZATION=f"Bearer {issued.access}", HTTP_X_CLIENT="api")
    response = live.post(reverse(SWITCH_URL), {"tenant_id": str(other_tenant.id)}, format="json")
    assert response.status_code == 200

    data = response.json()["data"]
    assert data["active_tenant_id"] == str(other_tenant.id)
    assert data["active_tenant"]["name"] == other_tenant.name
    assert response["X-Tenant-Id"] == str(other_tenant.id)  # FR-4 / CCR-3
    assert set(data["permissions"]) < set(
        _permissions_of(member)
    ), "the staff role's set must be smaller than the owner's"

    issued.session.refresh_from_db()
    assert issued.session.revoked_at is not None
    new_session = Session.objects.filter(
        user=member.user, tenant=other_tenant, revoked_at__isnull=True
    ).get()
    assert new_session.family_id != issued.session.family_id  # BR-2: a new family
    assert second.tenant_id == other_tenant.id


def _permissions_of(membership: Any) -> set:
    from apps.common.permissions_registry import permissions_for

    return set(permissions_for(membership))


def test_the_new_token_reaches_the_new_tenants_data_only(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """AC-4 / BR-4 / T-PLT-04-7: the switch is what changes what is visible."""
    from rest_framework.test import APIClient

    from tests.factories.parties import PartyFactory
    from tests.factories.platform import MembershipFactory

    PartyFactory(tenant=tenant, name="A-side party")
    PartyFactory(tenant=other_tenant, name="B-side party")

    client, member = api_as(tenant)
    client.credentials(
        HTTP_AUTHORIZATION=client._credentials["HTTP_AUTHORIZATION"], HTTP_X_CLIENT="api"
    )
    MembershipFactory(
        user=member.user, tenant=other_tenant, role=system_roles["owner"], is_default=False
    )
    assert [row["name"] for row in client.get(reverse(PARTY_LIST_URL)).json()["data"]] == [
        "A-side party"
    ]

    switched = client.post(reverse(SWITCH_URL), {"tenant_id": str(other_tenant.id)}, format="json")
    after = APIClient()
    after.credentials(
        HTTP_AUTHORIZATION=f"Bearer {switched.json()['data']['access_token']}",
        HTTP_X_CLIENT="api",
    )
    assert [row["name"] for row in after.get(reverse(PARTY_LIST_URL)).json()["data"]] == [
        "B-side party"
    ]


def test_switching_to_a_tenant_you_do_not_belong_to_is_403(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    """T-PLT-04-2 / §10: 403, not 404 — the resource is the caller's own list."""
    client, _member = api_as(tenant)
    response = client.post(reverse(SWITCH_URL), {"tenant_id": str(other_tenant.id)}, format="json")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


@pytest.mark.parametrize("status", ["invited", "suspended", "removed"])
def test_switching_to_a_membership_that_is_not_active_is_403(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict, status: str
) -> None:
    """T-PLT-04-2: only an `active` membership is switchable (FR-2, §10)."""
    from tests.factories.platform import MembershipFactory

    client, member = api_as(tenant)
    MembershipFactory(
        user=member.user,
        tenant=other_tenant,
        role=system_roles["staff"],
        status=status,
        is_default=False,
    )
    response = client.post(reverse(SWITCH_URL), {"tenant_id": str(other_tenant.id)}, format="json")
    assert response.status_code == 403


def test_switching_to_an_unknown_tenant_id_is_403_not_500(api_as: Any, tenant: Any) -> None:
    client, _member = api_as(tenant)
    response = client.post(
        reverse(SWITCH_URL),
        {"tenant_id": "00000000-0000-0000-0000-000000000000"},
        format="json",
    )
    assert response.status_code == 403


def test_a_non_uuid_tenant_id_is_a_validation_error(api_as: Any, tenant: Any) -> None:
    """§10: "`tenant_id` must be a UUID"."""
    client, _member = api_as(tenant)
    response = client.post(reverse(SWITCH_URL), {"tenant_id": "not-a-uuid"}, format="json")
    assert response.status_code == 400
    assert "tenant_id" in response.json()["error"]["details"]


def test_switching_requires_authentication(anonymous_client: Any, tenant: Any) -> None:
    response = anonymous_client.post(
        reverse(SWITCH_URL), {"tenant_id": str(tenant.id)}, format="json"
    )
    assert response.status_code == 401


def test_the_x_tenant_id_header_can_never_change_the_tenant(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    """BR-1 / canon §22.1: the `tid` claim is the only tenant context."""
    from tests.factories.parties import PartyFactory

    PartyFactory(tenant=other_tenant, name="B-side party")
    client, _member = api_as(tenant)
    body = client.get(reverse(PARTY_LIST_URL), HTTP_X_TENANT_ID=str(other_tenant.id)).json()
    assert body["data"] == []


def test_every_role_may_switch_to_a_tenant_it_belongs_to(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """§12's matrix: switching is a member's own business, whatever their role."""
    from tests.factories.platform import MembershipFactory

    for role in ("owner", "admin", "staff", "accountant"):
        client, member = api_as(tenant, role=role)
        MembershipFactory(
            user=member.user, tenant=other_tenant, role=system_roles[role], is_default=False
        )
        response = client.post(
            reverse(SWITCH_URL), {"tenant_id": str(other_tenant.id)}, format="json"
        )
        assert response.status_code == 200, role


def test_the_switch_is_audited_with_both_tenant_ids(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """§16: `auth.tenant_switched` with `from_tenant_id` and the session ids."""
    from rest_framework.test import APIClient

    from apps.platform_app.models import AuditLog
    from apps.platform_app.services import sessions as session_service
    from tests.factories.platform import MembershipFactory

    _client, member = api_as(tenant)
    MembershipFactory(
        user=member.user, tenant=other_tenant, role=system_roles["staff"], is_default=False
    )
    issued = session_service.issue(user=member.user, tenant=tenant, membership=member)
    live = APIClient()
    live.credentials(HTTP_AUTHORIZATION=f"Bearer {issued.access}")
    live.post(reverse(SWITCH_URL), {"tenant_id": str(other_tenant.id)}, format="json")

    row = AuditLog.objects.get(action="auth.tenant_switched")
    assert row.tenant_id == other_tenant.id
    assert row.metadata["from_tenant_id"] == str(tenant.id)
    assert row.metadata["from_session_id"] == str(issued.session.id)


# ── FR-9 / BR-3: defaults ────────────────────────────────────────────────────


def test_me_lists_active_and_invited_memberships_only(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """FR-1: "all memberships with `status ∈ {active, invited}`"."""
    from tests.factories.platform import MembershipFactory, TenantFactory

    client, member = api_as(tenant)
    MembershipFactory(
        user=member.user,
        tenant=other_tenant,
        role=system_roles["staff"],
        status="invited",
        is_default=False,
    )
    MembershipFactory(
        user=member.user,
        tenant=TenantFactory(partner=tenant.partner, plan=tenant.plan),
        role=system_roles["staff"],
        status="removed",
        is_default=False,
    )
    rows = client.get(reverse(ME_URL)).json()["data"]["tenants"]
    assert {row["status"] for row in rows} == {"active", "invited"}
    assert len(rows) == 2


def test_setting_a_default_clears_the_previous_one(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """T-PLT-04-3 / FR-5 / BR-3 / AC-2: exactly one default per user."""
    from apps.platform_app.models import Membership
    from tests.factories.platform import MembershipFactory

    client, member = api_as(tenant)
    second = MembershipFactory(
        user=member.user, tenant=other_tenant, role=system_roles["staff"], is_default=False
    )
    response = client.patch(_membership_detail(second), {"is_default": True}, format="json")
    assert response.status_code == 200

    defaults = Membership.objects.filter(user=member.user, is_default=True)
    assert defaults.count() == 1
    assert defaults.get().id == second.id
    assert Membership.objects.get(pk=member.pk).is_default is False


def test_is_default_false_is_refused(api_as: Any, tenant: Any) -> None:
    """§10: "`is_default` only `true` accepted"."""
    client, member = api_as(tenant)
    response = client.patch(_membership_detail(member), {"is_default": False}, format="json")
    assert response.status_code == 400
    assert "is_default" in response.json()["error"]["details"]


def test_a_membership_that_is_not_yours_is_a_404(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    """Canon §0.11 rule 2: never confirm that somebody else's row exists."""
    client, _mine = api_as(tenant)
    _other_client, theirs = api_as(other_tenant)

    response = client.patch(_membership_detail(theirs), {"is_default": True}, format="json")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# ── FR-7: leaving ────────────────────────────────────────────────────────────


def test_the_last_owner_cannot_leave(api_as: Any, tenant: Any) -> None:
    """T-PLT-04-4 / FR-7 / §10: 409 `last_owner`."""
    client, member = api_as(tenant, role="owner")
    response = client.delete(_membership_detail(member))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "last_owner"


def test_a_staff_member_may_leave_and_loses_their_sessions(api_as: Any, tenant: Any) -> None:
    """FR-7 / §16: status `removed` and every session for that tenant revoked."""
    from apps.platform_app.models import Membership, Session
    from apps.platform_app.services import sessions as session_service

    client, member = api_as(tenant, role="staff")
    issued = session_service.issue(user=member.user, tenant=tenant, membership=member)

    response = client.delete(_membership_detail(member))
    assert response.status_code == 200

    member.refresh_from_db()
    assert member.status == "removed"
    assert Membership.objects.get(pk=member.pk).status == "removed"
    issued.session.refresh_from_db()
    assert issued.session.revoked_at is not None
    assert not Session.objects.filter(
        user=member.user, tenant=tenant, revoked_at__isnull=True
    ).exists()


def test_an_owner_may_leave_once_another_owner_exists(
    api_as: Any, tenant: Any, system_roles: dict
) -> None:
    """FR-7: the guard is "last owner", not "owner"."""
    from tests.factories.platform import MembershipFactory, UserFactory

    client, member = api_as(tenant, role="owner")
    MembershipFactory(
        user=UserFactory(), tenant=tenant, role=system_roles["owner"], is_default=False
    )
    assert client.delete(_membership_detail(member)).status_code == 200


def test_leaving_moves_the_default_to_the_oldest_remaining_membership(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """BR-3: "when a default membership becomes `suspended|removed`, the default moves"."""
    from apps.platform_app.models import Membership
    from tests.factories.platform import MembershipFactory

    client, member = api_as(tenant, role="staff")
    survivor = MembershipFactory(
        user=member.user, tenant=other_tenant, role=system_roles["staff"], is_default=False
    )
    assert Membership.objects.get(pk=member.pk).is_default is True

    client.delete(_membership_detail(member))
    survivor.refresh_from_db()
    assert survivor.is_default is True


def test_leaving_a_membership_you_already_left_is_refused(api_as: Any, tenant: Any) -> None:
    client, member = api_as(tenant, role="staff")
    assert client.delete(_membership_detail(member)).status_code == 200
    assert client.delete(_membership_detail(member)).status_code in (401, 403)


# ── FR-8: the invitation row in the switcher ─────────────────────────────────


def test_accepting_an_invitation_activates_the_membership(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """PLT-05 FR-10, reached from PLT-04 FR-8."""
    from apps.platform_app.models import Invitation, Membership
    from tests.factories.platform import InvitationFactory

    client, member = api_as(tenant)
    invitation = InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-accept-1",
    )
    url = reverse("v1:invitation-accept", kwargs={"token": "tok-accept-1"})
    response = client.post(url, {}, format="json")
    assert response.status_code == 200

    joined = Membership.objects.get(user=member.user, tenant=other_tenant)
    assert (joined.status, joined.role.code) == ("active", "staff")
    invitation.refresh_from_db()
    assert invitation.status == "accepted"
    assert Invitation.objects.get(pk=invitation.pk).status == "accepted"
    assert invitation.accepted_user_id == member.user.id


def test_an_invitation_for_another_address_is_refused(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """PLT-05 §10, as amended by DEC-010: the caller's *email* must match."""
    from tests.factories.platform import InvitationFactory

    client, _member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email="somebody.else@example.com",
        raw_token="tok-wrong-address",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-wrong-address"}), {}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invitation_invalid"


def test_an_invitation_is_accepted_by_an_account_the_product_can_create(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """`CR-140`: acceptance must work for an account with no mobile at all.

    Since `DEC-010` the sign-up form is `{email, password}`, so every account the
    product issues has `mobile = None`. Matching an invitation on `mobile` made
    the whole path unreachable for all of them — and the suite stayed green only
    because `UserFactory.mobile` populated a field the product never does.
    """
    from apps.platform_app.models import Membership
    from tests.factories.platform import InvitationFactory, UserFactory

    invitee = UserFactory(mobile=None)
    client, member = api_as(tenant, user=invitee)
    assert member.user.mobile is None

    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=invitee.email,
        mobile=None,
        raw_token="tok-no-mobile",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-no-mobile"}), {}, format="json"
    )
    assert response.status_code == 200, response.json()
    assert Membership.objects.get(user=invitee, tenant=other_tenant).status == "active"


def test_a_mobile_less_stranger_cannot_take_somebody_elses_invitation(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """The other half of `CR-140`, and the dangerous half.

    Matching on `mobile` did not merely refuse the right person — with `mobile`
    absent on both sides, `None == None` *matched*, so once the invitee's row
    also carried no number any account the product creates could take any
    invitation it held a token for. Keying on the identity the product issues
    fixes both directions at once.
    """
    from apps.platform_app.models import Membership
    from tests.factories.platform import InvitationFactory, UserFactory

    stranger = UserFactory(mobile=None)
    client, member = api_as(tenant, user=stranger)
    assert member.user.mobile is None

    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email="the.actual.invitee@example.com",
        mobile=None,
        raw_token="tok-not-yours",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-not-yours"}), {}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invitation_invalid"
    assert not Membership.objects.filter(user=stranger, tenant=other_tenant).exists()


def test_an_invitation_address_matches_case_insensitively(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """`normalise_email` is how the product compares addresses everywhere else."""
    from tests.factories.platform import InvitationFactory

    client, member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email.upper(),
        raw_token="tok-upper",
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-upper"}), {}, format="json"
    )
    assert response.status_code == 200, response.json()


def test_an_expired_invitation_is_refused_and_marked_expired(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """PLT-05 FR-11."""
    import datetime as dt

    from django.utils import timezone

    from apps.platform_app.models import Invitation
    from tests.factories.platform import InvitationFactory

    client, member = api_as(tenant)
    invitation = InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-expired",
        expires_at=timezone.now() - dt.timedelta(days=1),
    )
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "tok-expired"}), {}, format="json"
    )
    assert response.status_code == 400
    assert Invitation.objects.get(pk=invitation.pk).status == "expired"


def test_an_unknown_invitation_token_is_refused(api_as: Any, tenant: Any) -> None:
    client, _member = api_as(tenant)
    response = client.post(
        reverse("v1:invitation-accept", kwargs={"token": "no-such-token"}), {}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invitation_invalid"


def test_an_invitation_cannot_be_accepted_twice(
    api_as: Any, tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    from tests.factories.platform import InvitationFactory

    client, member = api_as(tenant)
    InvitationFactory(
        tenant=other_tenant,
        role=system_roles["staff"],
        email=member.user.email,
        raw_token="tok-twice",
    )
    url = reverse("v1:invitation-accept", kwargs={"token": "tok-twice"})
    assert client.post(url, {}, format="json").status_code == 200
    assert client.post(url, {}, format="json").status_code == 400


# ── FR-5 / FR-7: the switcher acts on a membership id it has to be given ─────


def test_every_tenant_row_carries_its_membership_id(api_as: Any, two_tenants_full: dict) -> None:
    """PLT-04 FR-5 and FR-7 act on the caller's own membership row, and
    `PATCH`/`DELETE /memberships/{id}` take that row's id. Without it in
    `tenants[]` the client has no id to send, gates both affordances out, and
    the two endpoints have no reachable caller at all.
    """
    from apps.platform_app.models import Membership

    a = two_tenants_full["a"]
    rows = a["client"].get(reverse("v1:auth-me")).json()["data"]["tenants"]
    assert rows
    for row in rows:
        membership = Membership.objects.get(pk=row["membership_id"])
        assert membership.user_id == a["user"].id
        assert str(membership.tenant_id) == row["id"]


def test_the_membership_id_from_auth_me_reaches_the_membership_endpoint(
    api_as: Any, two_tenants_full: dict
) -> None:
    """The round trip the client makes: read the id from `/auth/me`, PATCH it."""
    a = two_tenants_full["a"]
    row = a["client"].get(reverse("v1:auth-me")).json()["data"]["tenants"][0]
    response = a["client"].patch(
        reverse("v1:membership-detail", kwargs={"membership_id": row["membership_id"]}),
        {"is_default": True},
        format="json",
    )
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["is_default"] is True


def test_plan_limits_carries_the_partner_support_contact(api_as: Any, tenant: Any) -> None:
    """PLT-15 FR-6/FR-7: "Contact {partner}" needs a name and a channel, on the
    Settings→Plan card and the near-limit banner — not only on the 403 the
    merchant has already been stopped by."""
    client, _member = api_as(tenant)
    plan_limits = client.get(reverse("v1:auth-me")).json()["data"]["plan_limits"]
    assert set(plan_limits["support_contact"]) == {"name", "phone", "whatsapp", "email"}
    assert plan_limits["support_contact"]["name"]
