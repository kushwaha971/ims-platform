"""The manager's half of the team screen — edit, block, unblock, remove (owner, 12 Oct 2026).

What these prevent, in one line each: a staff member or a custom role locking
the owner out; an admin locking out another admin; anybody locking THEMSELVES
out; a blocked member whose phone keeps working because a refresh token or an
access token outlived the block; a role change that the old token never hears
about; and an unblock that quietly spends a seat the plan does not have.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.common.constants import RoleCode

pytestmark = pytest.mark.django_db

PASSWORD = "Kirana1234"


def _url(name: str, membership: Any) -> str:
    return reverse(f"v1:member-{name}", kwargs={"membership_id": str(membership.id)})


def _block(client: Any, target: Any) -> Any:
    return client.post(_url("block", target), format="json")


def _unblock(client: Any, target: Any) -> Any:
    return client.post(_url("unblock", target), format="json")


def _remove(client: Any, target: Any) -> Any:
    return client.post(_url("remove", target), format="json")


def _patch(client: Any, target: Any, **body: Any) -> Any:
    return client.patch(_url("detail", target), body, format="json")


def _refresh_from_db(membership: Any) -> Any:
    membership.refresh_from_db()
    return membership


def _signed_in(membership: Any) -> tuple[APIClient, dict]:
    """A real password sign-in, so there is a refresh session to revoke."""
    membership.user.set_password(PASSWORD)
    membership.user.save(update_fields=["password"])
    client = APIClient()
    client.credentials(HTTP_X_CLIENT="api")
    response = client.post(
        reverse("v1:auth-login"),
        {"email": membership.user.email, "password": PASSWORD},
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    signed_in = APIClient()
    signed_in.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access_token']}")
    return signed_in, data


# ── The owner can do all four to staff ───────────────────────────────────────


def test_the_owner_can_edit_a_staff_members_name_and_role(api_as: Any, tenant: Any) -> None:
    """The feature's first half: correct a typo in a name, promote a cashier.

    Without it the only way to fix "Rmesh" was to remove the person and add
    them again — a new account, a new sign-in, and their history split in two.
    """
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)

    response = _patch(owner_client, staff, full_name="Ramesh Kumar", role="accountant")

    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["full_name"] == "Ramesh Kumar"
    assert data["role"] == "accountant"
    staff = _refresh_from_db(staff)
    assert staff.role.code == "accountant"
    assert staff.user.full_name == "Ramesh Kumar"


def test_a_role_change_makes_the_old_token_stale(api_as: Any, tenant: Any) -> None:
    """A role is a permission set; a token minted under the old one must stop.

    Without the `permissions_version` bump a demoted admin keeps admin rights
    for the rest of their access token's life — fifteen minutes in which they
    can do exactly what they were demoted to stop doing.
    """
    owner_client, _ = api_as(tenant)
    staff_client, staff = api_as(tenant, RoleCode.STAFF.value)
    before = staff.permissions_version

    assert _patch(owner_client, staff, role="accountant").status_code == 200

    assert _refresh_from_db(staff).permissions_version == before + 1
    stale = staff_client.get(reverse("v1:party-list"))
    assert stale.status_code == 401
    assert stale.json()["error"]["code"] == "token_stale"


def test_a_name_only_edit_does_not_sign_the_member_out(api_as: Any, tenant: Any) -> None:
    """Correcting a spelling changes no access, so it must not throw the person
    at the till back to the sign-in screen mid-sale."""
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    before = staff.permissions_version

    assert _patch(owner_client, staff, full_name="Ramesh K").status_code == 200

    assert _refresh_from_db(staff).permissions_version == before


def test_the_owner_blocks_a_staff_member_and_every_session_here_dies(
    api_as: Any, tenant: Any
) -> None:
    """Block is the reason this feature exists: the salesman who left on bad
    terms still has the app on his phone. Suspending the row is not enough on
    its own — the refresh token and the access token must both stop working,
    now, not when they expire."""
    from apps.platform_app.models import AuditLog, Session

    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    staff_client, tokens = _signed_in(staff)
    assert staff_client.get(reverse("v1:party-list")).status_code == 200

    response = _block(owner_client, staff)

    assert response.status_code == 200, response.content
    assert response.json()["data"]["status"] == "suspended"
    assert not Session.objects.filter(
        user=staff.user, tenant=tenant, revoked_at__isnull=True
    ).exists()
    refresh = APIClient().post(
        reverse("v1:auth-refresh"), {"refresh_token": tokens["refresh_token"]}, format="json"
    )
    assert refresh.status_code == 401
    assert refresh.json()["error"]["code"] == "session_revoked"
    assert staff_client.get(reverse("v1:party-list")).status_code in (401, 403)
    audit = AuditLog.objects.get(action="member.blocked", entity_id=staff.id)
    assert audit.metadata["sessions_revoked"] >= 1


def test_blocking_twice_is_not_an_error(api_as: Any, tenant: Any) -> None:
    """A merchant on a slow link taps Block twice; the second tap wanted the
    same state and must not read as a failure, nor write a second audit row."""
    from apps.platform_app.models import AuditLog

    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)

    assert _block(owner_client, staff).status_code == 200
    assert _block(owner_client, staff).status_code == 200
    assert AuditLog.objects.filter(action="member.blocked", entity_id=staff.id).count() == 1


def test_unblocking_lets_the_member_sign_in_again(api_as: Any, tenant: Any) -> None:
    """Block is reversible by design — role, grants and name all survive it —
    and a fresh sign-in after Unblock lands in this business again."""
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    assert _block(owner_client, staff).status_code == 200

    response = _unblock(owner_client, staff)

    assert response.status_code == 200, response.content
    assert response.json()["data"]["status"] == "active"
    assert _refresh_from_db(staff).role.code == "staff"
    signed_in, data = _signed_in(staff)
    assert [t["id"] for t in data["tenants"]] == [str(tenant.id)]
    assert signed_in.get(reverse("v1:party-list")).status_code == 200


def test_unblocking_needs_a_free_seat(api_as: Any, tenant: Any) -> None:
    """A blocked member holds no seat, so letting them back in spends one.

    Without the check an owner on a two-seat plan could block, add somebody
    new, and unblock — three people on a plan sold for two.
    """
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    assert _block(owner_client, staff).status_code == 200
    api_as(tenant, RoleCode.STAFF.value)  # the seat is taken by somebody new
    tenant.plan.limits = {"max_users": 2}
    tenant.plan.save(update_fields=["limits"])

    response = _unblock(owner_client, staff)

    assert response.status_code == 403, response.content
    assert response.json()["error"]["code"] == "plan_limit_reached"
    assert _refresh_from_db(staff).status == "suspended"


def test_removing_a_member_hides_them_and_signs_them_out(api_as: Any, tenant: Any) -> None:
    """Remove is final from the team screen's point of view: the row is kept
    for the record but leaves the list, and no session of theirs survives."""
    from apps.platform_app.models import Session

    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    _signed_in(staff)

    response = _remove(owner_client, staff)

    assert response.status_code == 200, response.content
    assert _refresh_from_db(staff).status == "removed"
    assert not Session.objects.filter(
        user=staff.user, tenant=tenant, revoked_at__isnull=True
    ).exists()
    listed = owner_client.get(reverse("v1:member-list")).json()["data"]
    assert str(staff.id) not in {row["id"] for row in listed}
    assert _block(owner_client, staff).status_code == 404


# ── The list shows the blocked, never the removed ────────────────────────────


def test_the_list_shows_blocked_members_and_filters_by_status(api_as: Any, tenant: Any) -> None:
    """A blocked member who vanished from the list could never be unblocked —
    the screen would have lost the only row the Unblock button lives on."""
    owner_client, _ = api_as(tenant)
    _, blocked = api_as(tenant, RoleCode.STAFF.value)
    _, working = api_as(tenant, RoleCode.STAFF.value)
    assert _block(owner_client, blocked).status_code == 200

    everyone = owner_client.get(reverse("v1:member-list")).json()["data"]
    statuses = {row["id"]: row["status"] for row in everyone}
    assert statuses[str(blocked.id)] == "suspended"
    assert statuses[str(working.id)] == "active"

    only = owner_client.get(reverse("v1:member-list") + "?status=suspended").json()["data"]
    assert [row["id"] for row in only] == [str(blocked.id)]
    refused = owner_client.get(reverse("v1:member-list") + "?status=removed")
    assert refused.status_code == 400


# ── Who may act on whom ──────────────────────────────────────────────────────


def test_an_admin_manages_staff(api_as: Any, tenant: Any) -> None:
    """An admin is a manager too; they run the floor when the owner is away."""
    admin_client, _ = api_as(tenant, RoleCode.ADMIN.value)
    _, staff = api_as(tenant, RoleCode.STAFF.value)

    assert _patch(admin_client, staff, full_name="Suresh").status_code == 200
    assert _block(admin_client, staff).status_code == 200
    assert _unblock(admin_client, staff).status_code == 200
    assert _remove(admin_client, staff).status_code == 200


def test_an_admin_cannot_touch_another_admin_or_the_owner(api_as: Any, tenant: Any) -> None:
    """Two admins who can block each other is a race to lock the other out.
    The owner is the tiebreak, and nobody but the owner acts on an admin."""
    _, owner = api_as(tenant)
    admin_client, _ = api_as(tenant, RoleCode.ADMIN.value)
    _, other_admin = api_as(tenant, RoleCode.ADMIN.value)

    for target in (other_admin, owner):
        for response in (
            _block(admin_client, target),
            _remove(admin_client, target),
            _patch(admin_client, target, full_name="X"),
        ):
            assert response.status_code == 403, response.content
            assert response.json()["error"]["code"] == "permission_denied"
    assert _refresh_from_db(other_admin).status == "active"
    assert _refresh_from_db(owner).status == "active"


def test_an_admin_cannot_make_an_admin(api_as: Any, tenant: Any) -> None:
    """Promotion to admin is the owner's alone, as `set_app_grants` already
    says; otherwise one admin could mint the ally they need to outvote the
    rule above."""
    admin_client, _ = api_as(tenant, RoleCode.ADMIN.value)
    _, staff = api_as(tenant, RoleCode.STAFF.value)

    response = _patch(admin_client, staff, role="admin")

    assert response.status_code == 400
    assert "role" in response.json()["error"]["details"]
    assert _refresh_from_db(staff).role.code == "staff"


def test_the_owner_manages_an_admin(api_as: Any, tenant: Any) -> None:
    """The other side of the rule: the owner can demote and block an admin."""
    owner_client, _ = api_as(tenant)
    _, admin = api_as(tenant, RoleCode.ADMIN.value)

    assert _patch(owner_client, admin, role="staff").status_code == 200
    assert _block(owner_client, admin).status_code == 200


def test_nobody_can_make_somebody_the_owner(api_as: Any, tenant: Any) -> None:
    """Ownership is transferred, never assigned (canon §0.7); a PATCH that
    minted a second owner would be privilege escalation with a form in front."""
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)

    response = _patch(owner_client, staff, role="owner")

    assert response.status_code == 400
    assert _refresh_from_db(staff).role.code == "staff"


def test_nobody_acts_on_themselves(api_as: Any, tenant: Any) -> None:
    """Blocking yourself is a lock-out with no key. Leaving has its own
    endpoint, which is honest about what it does."""
    owner_client, owner = api_as(tenant)
    admin_client, admin = api_as(tenant, RoleCode.ADMIN.value)

    for client, me in ((owner_client, owner), (admin_client, admin)):
        for response in (_block(client, me), _remove(client, me), _patch(client, me, role="staff")):
            assert response.status_code == 403, response.content
            assert response.json()["error"]["code"] in (
                "self_change_forbidden",
                "permission_denied",
            )
    assert _block(admin_client, admin).json()["error"]["code"] == "self_change_forbidden"
    assert _refresh_from_db(owner).role.code == "owner"


@pytest.mark.parametrize("role", [RoleCode.STAFF.value, RoleCode.ACCOUNTANT.value])
def test_staff_and_accountants_are_refused(api_as: Any, tenant: Any, role: str) -> None:
    """Canon §0.9 withholds `platform.members.manage` from these roles."""
    client, _ = api_as(tenant, role)
    _, target = api_as(tenant, RoleCode.STAFF.value)

    for response in (_block(client, target), _remove(client, target), _patch(client, target)):
        assert response.status_code == 403


def test_a_custom_role_with_the_codename_is_still_refused(api_as: Any, tenant: Any) -> None:
    """The owner's rule (12 Oct 2026) is about STANDING, not codenames: a shop
    that ticks "manage members" on a custom Supervisor role must not thereby
    hand the counter the power to block the owner's admin."""
    from tests.factories.platform import MembershipFactory, RoleFactory, UserFactory
    from tests.fixtures import build_access_token

    supervisor = RoleFactory(
        tenant=tenant,
        code="supervisor",
        name="Supervisor",
        is_system=False,
        permissions=["platform.members.manage", "parties.party.read"],
    )
    member = MembershipFactory(user=UserFactory(), tenant=tenant, role=supervisor)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
    _, target = api_as(tenant, RoleCode.STAFF.value)

    # The codename does let them READ the team, so the 403 below is the
    # standing rule and not a missing permission.
    assert client.get(reverse("v1:member-list")).status_code == 200
    for response in (_block(client, target), _remove(client, target), _patch(client, target)):
        assert response.status_code == 403, response.content
    assert _refresh_from_db(target).status == "active"


def test_another_businesss_member_is_not_found(api_as: Any, tenant: Any, other_tenant: Any) -> None:
    """Canon §0.11 rule 2: a cross-tenant id is indistinguishable from one that
    does not exist — 404, never a 403 that confirms the row."""
    owner_client, _ = api_as(tenant)
    _, elsewhere = api_as(other_tenant, RoleCode.STAFF.value)

    assert _block(owner_client, elsewhere).status_code == 404
    assert _refresh_from_db(elsewhere).status == "active"


def test_a_name_shared_with_another_business_is_not_ours_to_edit(
    api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    """`full_name` is the person's identity on the whole platform. A member who
    also works elsewhere would be renamed on another owner's screen by this
    owner's typo fix, so the name is refused and the role still changes."""
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    api_as(other_tenant, RoleCode.STAFF.value, user=staff.user)
    original = staff.user.full_name

    refused = _patch(owner_client, staff, full_name="Somebody Else")
    assert refused.status_code == 400
    assert "full_name" in refused.json()["error"]["details"]
    assert _refresh_from_db(staff).user.full_name == original

    assert _patch(owner_client, staff, role="accountant").status_code == 200


def test_a_blocked_member_who_signs_in_is_told_which_business_blocked_them(
    api_as: Any, tenant: Any
) -> None:
    """Without this a blocked salesman signs in, has no business, and is walked
    into setting up one of his own with no word of why the shop vanished. The
    session names the business instead, and does not offer it."""
    owner_client, _ = api_as(tenant)
    _, staff = api_as(tenant, RoleCode.STAFF.value)
    assert _block(owner_client, staff).status_code == 200

    _, session = _signed_in(staff)

    assert session["blocked_from"] == [tenant.name]
    assert str(tenant.id) not in {row["id"] for row in session["tenants"]}
    assert _unblock(owner_client, staff).status_code == 200
    _, again = _signed_in(staff)
    assert again["blocked_from"] == []
