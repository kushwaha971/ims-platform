"""The `invited` membership (PLT-05 FR-2, BR-7, FR-8, FR-12) — CR-2026-09-23-B.

`invite()` used to create an invitation and nothing else, so the FRD's
`status='invited'` membership existed only in fixtures. It now exists for any
address that already has an account (`platform_membership.user_id` is NOT NULL,
so an address with no account cannot have one; its invitation holds the seat on
its own).

The rule every test in the first half of this file defends is that such a row
grants NOTHING — no tenant, no switch, no permission, no data — until
`accept_invitation` flips it. It carries a real `role_id`, which is exactly the
thing the permission layer turns into codenames, so one lookup that forgets its
status filter would hand an invitee staff rights in a business they never agreed
to join.

The second half pins the lifecycle — accept, replay, revoke, resend, expiry,
the DEC-012 "owner creates the login" conversion — and the seat count, which was
blind to pending invitations and let ten go out against three seats.

The last section is the security review's three findings in the same area: the
owner role was invitable by an admin, `regenerate` crossed the tenancy boundary,
and the raw token reached the access log through the URL path.
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.common.constants import RoleCode
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, PlanLimitReached
from apps.platform_app.constants import InvitationStatus, MembershipStatus
from apps.platform_app.models import AuditLog, Invitation, Membership
from apps.platform_app.services import credentials, memberships
from apps.platform_app.services.entitlements import member_usage
from tests.factories.parties import PartyFactory
from tests.factories.platform import InvitationFactory, MembershipFactory, UserFactory
from tests.fixtures import build_access_token

pytestmark = pytest.mark.django_db

INVITATIONS_URL = "v1:invitation-list"
MEMBERS_URL = "v1:member-list"
PARTY_LIST_URL = "v1:party-list"


def _ctx(user: Any, tenant: Any) -> Ctx:
    return Ctx(actor=user, tenant=tenant, request_id="test-request")


def _cap(tenant: Any, seats: int | None) -> None:
    tenant.plan.limits = {"max_users": seats}
    tenant.plan.save(update_fields=["limits"])


def _invite(tenant: Any, actor: Any, email: str, role: Any) -> tuple[Any, str]:
    return memberships.invite(
        tenant=tenant, role=role, email=email, actor=actor, ctx=_ctx(actor, tenant)
    )


def _accept_url(token: str) -> str:
    return reverse("v1:invitation-accept", kwargs={"token": token})


def _client_for(membership: Any) -> APIClient:
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(membership)}")
    return client


@pytest.fixture
def owner(tenant: Any, system_roles: dict) -> Any:
    return MembershipFactory(
        user=UserFactory(), tenant=tenant, role=system_roles[RoleCode.OWNER.value]
    )


@pytest.fixture
def invitee(other_tenant: Any, system_roles: dict) -> Any:
    """Somebody with an account and a business of their own — the common case."""
    home = MembershipFactory(
        user=UserFactory(email="priya@shop.test"),
        tenant=other_tenant,
        role=system_roles[RoleCode.OWNER.value],
    )
    return home.user


# ── Creation ────────────────────────────────────────────────────────────────


def test_inviting_an_existing_account_creates_an_invited_membership(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """FR-2 / T-PLT-05-2: invitation AND `invited` membership, with the chosen role.

    Not the invitee's default (they have not joined), no `joined_at` (they have
    not joined), and the audit row names the membership so the trail links the
    two rows the one action wrote.
    """
    invitation, _raw = _invite(
        tenant, owner.user, "Priya@Shop.test", system_roles[RoleCode.ACCOUNTANT.value]
    )

    row = Membership.objects.get(user=invitee, tenant=tenant)
    assert row.status == MembershipStatus.INVITED
    assert row.role.code == RoleCode.ACCOUNTANT.value
    assert row.is_default is False
    assert row.joined_at is None
    audit = AuditLog.objects.get(action="member.invited", entity_id=invitation.id)
    assert audit.metadata["membership_id"] == str(row.id)


def test_inviting_an_address_with_no_account_creates_no_membership(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """EC-1: there is no user to hang a membership on; the invitation stands alone.

    `user_id` is NOT NULL. Inventing a placeholder account here would make the
    address unregistrable ("that email is taken") for the person it belongs to.
    """
    _invite(tenant, owner.user, "nobody-yet@shop.test", system_roles[RoleCode.STAFF.value])

    assert Membership.objects.filter(tenant=tenant).count() == 1  # the owner only
    assert Invitation.objects.filter(tenant=tenant, status=InvitationStatus.PENDING).count() == 1


def test_a_removed_member_is_re_invited_on_the_same_row(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """BR-7: "the existing row returns to `invited`" — `U(user_id, tenant_id)`.

    And `joined_at` is cleared so acceptance stamps the NEW join rather than
    carrying the date of an employment that ended.
    """
    gone = MembershipFactory(
        user=UserFactory(email="old@shop.test"),
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        status=MembershipStatus.REMOVED,
        joined_at=timezone.now() - dt.timedelta(days=400),
    )
    _invite(tenant, owner.user, "old@shop.test", system_roles[RoleCode.ADMIN.value])

    gone.refresh_from_db()
    assert gone.status == MembershipStatus.INVITED
    assert gone.role.code == RoleCode.ADMIN.value
    assert gone.joined_at is None
    assert Membership.objects.filter(user=gone.user, tenant=tenant).count() == 1


def test_a_suspended_member_cannot_be_invited_back(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """§10: "no active|suspended membership". An invitation must not be a second,
    unaudited way to lift a suspension — reactivating is FR-7's decision."""
    suspended = MembershipFactory(
        user=UserFactory(email="held@shop.test"),
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        status=MembershipStatus.SUSPENDED,
    )
    with pytest.raises(BusinessRuleViolation):
        _invite(tenant, owner.user, "held@shop.test", system_roles[RoleCode.STAFF.value])

    suspended.refresh_from_db()
    assert suspended.status == MembershipStatus.SUSPENDED
    assert not Invitation.objects.filter(tenant=tenant, email="held@shop.test").exists()


# ── An invited row grants nothing ───────────────────────────────────────────


def test_an_invited_membership_holds_no_permissions(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """The second lock in `permissions_for`: the row has a role, and a role is
    exactly what that function turns into codenames. Invited → the empty set."""
    from apps.common.permissions_registry import permissions_for

    _invite(tenant, owner.user, invitee.email, system_roles[RoleCode.ADMIN.value])
    row = Membership.objects.get(user=invitee, tenant=tenant)

    assert permissions_for(row) == frozenset()


def test_an_invitee_cannot_read_the_businesss_data_even_with_a_forged_tid(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """The strongest form of the rule: a token that CLAIMS the tenant.

    A valid signature, the invitee's own epoch, `tid` = the inviting business.
    `tenancy` admits `active` only, so the request has no tenant, the
    permission layer refuses it, and nothing from that business is in the body.
    """
    PartyFactory(tenant=tenant, name="Confidential Traders")
    _invite(tenant, owner.user, invitee.email, system_roles[RoleCode.STAFF.value])
    row = Membership.objects.get(user=invitee, tenant=tenant)

    response = _client_for(row).get(reverse(PARTY_LIST_URL))

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"
    assert b"Confidential Traders" not in response.content


def test_an_invitee_cannot_switch_into_the_business(
    tenant: Any, owner: Any, invitee: Any, other_tenant: Any, system_roles: dict
) -> None:
    """PLT-04 FR-8: an invitation in the switcher OPENS, it never switches. The
    server refuses the switch even if a client tries it."""
    _invite(tenant, owner.user, invitee.email, system_roles[RoleCode.STAFF.value])
    home = Membership.objects.get(user=invitee, tenant=other_tenant)

    response = _client_for(home).post(
        reverse("v1:auth-switch-tenant"), {"tenant_id": str(tenant.id)}, format="json"
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


def test_signing_in_lists_the_invitation_but_never_opens_it(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """PLT-04 FR-1 / FR-9: an invited-only user signs in with NO active tenant,
    sees the business as `invited` in `tenants[]`, and holds no permissions."""
    person = UserFactory(email="fresh@shop.test", password="Kirana1234")
    _invite(tenant, owner.user, person.email, system_roles[RoleCode.STAFF.value])

    data = (
        APIClient()
        .post(
            reverse("v1:auth-login"),
            {"email": person.email, "password": "Kirana1234"},
            format="json",
        )
        .json()["data"]
    )

    assert data["active_tenant_id"] is None
    assert data["permissions"] == []
    assert [(row["id"], row["status"]) for row in data["tenants"]] == [(str(tenant.id), "invited")]


def test_regenerate_is_refused_for_an_invited_row_without_revealing_anything(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """An invitee has not joined, so there is no login of theirs for this business
    to reissue — and the refusal must not say whether a stranger has chosen their
    own password yet, which is a fact about another tenant's staff."""
    _invite(tenant, owner.user, invitee.email, system_roles[RoleCode.STAFF.value])
    row = Membership.objects.get(user=invitee, tenant=tenant)
    before = invitee.password

    response = _client_for(owner).post(
        reverse("v1:member-credentials", kwargs={"membership_id": str(row.id)})
    )

    assert response.status_code == 400
    assert "not joined" in response.json()["error"]["message"]
    assert "password" not in response.json()["error"]["message"].lower()
    invitee.refresh_from_db()
    assert invitee.password == before


# ── The team list ───────────────────────────────────────────────────────────


def test_the_team_list_shows_the_invitee_as_invited_and_no_more(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """AC-1: "the row appears under Invited". What it may NOT show is the
    invitee's profile — name, phone, last sign-in anywhere on the platform,
    whether they are on another business's temporary password. They have not
    agreed to join; the inviter knows the address it typed and the role it chose.
    """
    invitee.last_login_at = timezone.now()
    invitee.save(update_fields=["last_login_at"])
    _invite(tenant, owner.user, invitee.email, system_roles[RoleCode.STAFF.value])

    rows = _client_for(owner).get(reverse(MEMBERS_URL)).json()["data"]
    invited = [row for row in rows if row["status"] == "invited"]

    assert len(invited) == 1
    row = invited[0]
    assert row["email"] == invitee.email
    assert row["role"] == "staff"
    assert row["full_name"] is None
    assert row["mobile"] is None
    assert row["last_login_at"] is None
    assert row["must_change_password"] is False
    assert row["password_expires_at"] is None


def test_another_business_never_sees_this_businesss_invitees(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict, partner: Any, plan: Any
) -> None:
    """Canon §0.11 rule 2: the list is scoped to the `tid` tenant, so a third
    business's owner sees their own team and nothing of ours."""
    from tests.factories.platform import TenantFactory

    _invite(tenant, owner.user, invitee.email, system_roles[RoleCode.STAFF.value])
    third = TenantFactory(partner=partner, plan=plan)
    third_owner = MembershipFactory(
        user=UserFactory(), tenant=third, role=system_roles[RoleCode.OWNER.value]
    )

    rows = _client_for(third_owner).get(reverse(MEMBERS_URL)).json()["data"]

    assert [row["email"] for row in rows] == [third_owner.user.email]


# ── Acceptance ──────────────────────────────────────────────────────────────


def test_accepting_flips_the_same_row_to_active_in_one_write(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """FR-10: the invited row BECOMES the membership — same id, `active`, joined
    now, permissions version bumped so any cached `ver` is stale — and the
    invitation is `accepted` by this user. One audit row, actor = invitee."""
    invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    row = Membership.objects.get(user=invitee, tenant=tenant)
    version = row.permissions_version

    accepted = memberships.accept_invitation(user=invitee, token=raw)

    assert accepted.id == row.id
    row.refresh_from_db()
    assert row.status == MembershipStatus.ACTIVE
    assert row.joined_at is not None
    assert row.permissions_version == version + 1
    invitation.refresh_from_db()
    assert invitation.status == InvitationStatus.ACCEPTED
    assert invitation.accepted_user_id == invitee.id
    audit = AuditLog.objects.get(action="member.accepted", entity_id=row.id)
    assert audit.actor_id == invitee.id
    assert audit.before == {"status": "invited"}


def test_after_acceptance_the_invitee_reaches_the_business(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """The other side of the "grants nothing" tests: the same token-with-`tid`
    that was refused while invited now reads the party list."""
    PartyFactory(tenant=tenant, name="Now Visible Traders")
    _invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    memberships.accept_invitation(user=invitee, token=raw)
    row = Membership.objects.get(user=invitee, tenant=tenant)

    response = _client_for(row).get(reverse(PARTY_LIST_URL))

    assert response.status_code == 200
    assert [p["name"] for p in response.json()["data"]] == ["Now Visible Traders"]


def test_a_replayed_accept_returns_the_membership_and_writes_nothing(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """Idempotent for the acceptor: same row back, no second audit row, no
    version bump — so a refresh of the accept screen is not "cannot be used"."""
    _invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    first = memberships.accept_invitation(user=invitee, token=raw)
    version = Membership.objects.get(pk=first.pk).permissions_version

    second = memberships.accept_invitation(user=invitee, token=raw)

    assert second.id == first.id
    assert Membership.objects.filter(user=invitee, tenant=tenant).count() == 1
    assert Membership.objects.get(pk=first.pk).permissions_version == version
    assert AuditLog.objects.filter(action="member.accepted", tenant=tenant).count() == 1


def test_a_replay_never_restores_access_after_suspension(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """Replay returns an ACTIVE membership or nothing. A suspended member holding
    the old link gets 400 and stays suspended — the link is not a way back in."""
    _invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    memberships.accept_invitation(user=invitee, token=raw)
    Membership.objects.filter(user=invitee, tenant=tenant).update(status=MembershipStatus.SUSPENDED)

    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token=raw)

    assert Membership.objects.get(user=invitee, tenant=tenant).status == (
        MembershipStatus.SUSPENDED
    )


def test_a_pending_invitation_cannot_lift_a_suspension(
    tenant: Any, invitee: Any, system_roles: dict
) -> None:
    """A link that predates the suspension (only reachable through old data, since
    `invite()` now refuses suspended members) still cannot reactivate anybody."""
    MembershipFactory(
        user=invitee,
        tenant=tenant,
        role=system_roles["staff"],
        status=MembershipStatus.SUSPENDED,
        is_default=False,
    )
    InvitationFactory(
        tenant=tenant, role=system_roles["admin"], email=invitee.email, raw_token="tok-old"
    )

    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token="tok-old")

    row = Membership.objects.get(user=invitee, tenant=tenant)
    assert (row.status, row.role.code) == (MembershipStatus.SUSPENDED, "staff")


def test_somebody_else_cannot_replay_an_accepted_token(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """Single use (BR-5) for everybody but the acceptor."""
    _invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    memberships.accept_invitation(user=invitee, token=raw)
    stranger = UserFactory()

    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=stranger, token=raw)

    assert not Membership.objects.filter(user=stranger, tenant=tenant).exists()


def test_an_expired_invitation_takes_its_invited_membership_with_it(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """FR-11 (lazily, there is no scheduler yet): the link is marked `expired`
    and the invited row is closed in the same commit, so an expired link and a
    revoked one leave the team in the same state."""
    invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    Invitation.objects.filter(pk=invitation.pk).update(
        expires_at=timezone.now() - dt.timedelta(minutes=1)
    )

    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token=raw)

    assert Invitation.objects.get(pk=invitation.pk).status == InvitationStatus.EXPIRED
    assert Membership.objects.get(user=invitee, tenant=tenant).status == (MembershipStatus.REMOVED)


# ── Revoke and resend ───────────────────────────────────────────────────────


def test_revoking_cancels_the_invited_membership_and_the_link(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """FR-8's converse, in one transaction: the row leaves the team list, the
    seat frees, the person's switcher stops listing the business, and the link
    is refused. The audit row names the membership it closed."""
    invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    row = Membership.objects.get(user=invitee, tenant=tenant)
    usage = member_usage(tenant)

    memberships.revoke_invitation(invitation=invitation, ctx=_ctx(owner.user, tenant))

    row.refresh_from_db()
    assert row.status == MembershipStatus.REMOVED
    assert member_usage(tenant) == usage - 1
    audit = AuditLog.objects.get(action="member.invite_revoked", entity_id=invitation.id)
    assert audit.metadata["membership_id"] == str(row.id)
    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token=raw)
    assert Membership.objects.get(pk=row.pk).status == MembershipStatus.REMOVED


def test_revoking_an_already_accepted_invitation_never_removes_the_member(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """Revoking a link somebody already used is not how a member is removed."""
    invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    memberships.accept_invitation(user=invitee, token=raw)

    memberships.revoke_invitation(invitation=invitation, ctx=_ctx(owner.user, tenant))

    assert Membership.objects.get(user=invitee, tenant=tenant).status == (MembershipStatus.ACTIVE)


def test_a_resend_keeps_the_invited_row_and_only_the_new_link_works(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """FR-9: re-inviting supersedes the old link but NOT the membership — the new
    invitation still needs it — and a changed role lands on the same row."""
    _first, first_raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    row = Membership.objects.get(user=invitee, tenant=tenant)
    _second, second_raw = _invite(
        tenant, owner.user, invitee.email, system_roles[RoleCode.ACCOUNTANT.value]
    )

    row.refresh_from_db()
    assert row.status == MembershipStatus.INVITED
    assert row.role.code == RoleCode.ACCOUNTANT.value
    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token=first_raw)
    assert memberships.accept_invitation(user=invitee, token=second_raw).id == row.id


def test_revoking_another_businesss_invitation_is_404_and_leaves_it_alone(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict, partner: Any, plan: Any
) -> None:
    """Cross-tenant: 404 (never 403), and the invited row in OUR business is
    untouched by a request made from theirs."""
    from tests.factories.platform import TenantFactory

    invitation, _raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    third = TenantFactory(partner=partner, plan=plan)
    third_owner = MembershipFactory(
        user=UserFactory(), tenant=third, role=system_roles[RoleCode.OWNER.value]
    )

    response = _client_for(third_owner).delete(
        reverse("v1:invitation-detail", kwargs={"invitation_id": str(invitation.id)})
    )

    assert response.status_code == 404
    assert Membership.objects.get(user=invitee, tenant=tenant).status == (MembershipStatus.INVITED)


# ── Seats (PLT-05 FR-12, PLT-15 FR-3) ───────────────────────────────────────


def test_pending_invitations_consume_seats_so_ten_cannot_go_out_against_three(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """The defect `invite()`'s docstring claimed was impossible.

    Three seats, the owner in one. Invitations to two people with no account
    fill the other two; the third is refused — before this change every one of
    them passed, because each checked a membership count the others never moved.
    """
    _cap(tenant, 3)
    staff = system_roles["staff"]
    _invite(tenant, owner.user, "one@shop.test", staff)
    _invite(tenant, owner.user, "two@shop.test", staff)

    with pytest.raises(PlanLimitReached):
        _invite(tenant, owner.user, "three@shop.test", staff)

    assert member_usage(tenant) == 3


def test_a_resend_at_the_limit_does_not_need_a_new_seat(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """The seat was promised by the first send; the second only rotates the link."""
    _cap(tenant, 2)
    _invite(tenant, owner.user, invitee.email, system_roles["staff"])

    _invite(tenant, owner.user, invitee.email, system_roles["staff"])  # does not raise

    assert member_usage(tenant) == 2


def test_an_invited_person_is_counted_once_not_twice(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """An `invited` membership and its live invitation are one person, one seat."""
    _invite(tenant, owner.user, invitee.email, system_roles["staff"])

    assert member_usage(tenant) == 2  # owner + invitee


def test_a_lapsed_invitation_stops_holding_a_seat(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """Past `expires_at` the link cannot be used, so the seat is nobody's — even
    before anything has marked the row `expired` (FR-11 has no scheduler)."""
    invitation, _raw = _invite(tenant, owner.user, "late@shop.test", system_roles["staff"])
    assert member_usage(tenant) == 2
    Invitation.objects.filter(pk=invitation.pk).update(
        expires_at=timezone.now() - dt.timedelta(seconds=1)
    )

    assert member_usage(tenant) == 1


def test_accepting_at_the_limit_converts_the_promised_seat(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """Somebody invited before they had an account signs up, then accepts, with
    the business exactly full: their own invitation was the seat, so this is a
    conversion and succeeds — it is not charged a second time."""
    _cap(tenant, 2)
    _invitation, raw = _invite(tenant, owner.user, "later@shop.test", system_roles["staff"])
    person = UserFactory(email="later@shop.test")

    membership = memberships.accept_invitation(user=person, token=raw)

    assert membership.status == MembershipStatus.ACTIVE
    assert member_usage(tenant) == 2


def test_accepting_after_a_downgrade_below_usage_is_refused(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """EC-6: existing members keep access, new joins are blocked. The owner plus
    a staff member fill a plan cut to two; a third person's pending invitation
    can no longer be redeemed."""
    _invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    MembershipFactory(user=UserFactory(), tenant=tenant, role=system_roles["staff"])
    _cap(tenant, 2)

    with pytest.raises(PlanLimitReached):
        memberships.accept_invitation(user=invitee, token=raw)

    assert Membership.objects.get(user=invitee, tenant=tenant).status == (MembershipStatus.INVITED)


# ── DEC-012: the owner creates the login for somebody already invited ──────


def test_creating_the_login_converts_an_invited_row_and_closes_the_link(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """The ordinary case under DEC-012: invited, then — with no email to carry the
    link — added directly. Same row, now active; not charged a second seat at a
    full plan; the pending link revoked so it cannot later re-apply its role."""
    _cap(tenant, 2)
    invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["admin"])
    row = Membership.objects.get(user=invitee, tenant=tenant)

    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles["staff"],
        email=invitee.email,
        full_name="Priya",
        actor=owner.user,
        ctx=_ctx(owner.user, tenant),
    )

    assert issued.membership.id == row.id
    row.refresh_from_db()
    assert (row.status, row.role.code) == (MembershipStatus.ACTIVE, "staff")
    assert Invitation.objects.get(pk=invitation.pk).status == InvitationStatus.REVOKED
    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token=raw)
    assert Membership.objects.get(pk=row.pk).role.code == "staff"


def test_creating_the_login_for_an_invited_address_with_no_account_at_the_limit(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """Same conversion for somebody invited before they had an account: their
    invitation held the seat, so creating their login at a full plan succeeds."""
    _cap(tenant, 2)
    invitation, _raw = _invite(tenant, owner.user, "newbie@shop.test", system_roles["staff"])

    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles["staff"],
        email="newbie@shop.test",
        full_name="Newbie",
        actor=owner.user,
        ctx=_ctx(owner.user, tenant),
    )

    assert issued.created_user is True
    assert Invitation.objects.get(pk=invitation.pk).status == InvitationStatus.REVOKED
    assert member_usage(tenant) == 2


# ── Security findings in the same area ─────────────────────────────────────


@pytest.mark.parametrize("caller_role", ["owner", "admin"])
def test_owner_cannot_be_granted_by_invitation(api_as: Any, tenant: Any, caller_role: str) -> None:
    """PLT-05 §12: "Invite/promote owner — admin ❌". An admin holds
    `platform.members.manage`, so an owner-role invitation to an address the
    admin controls was a two-step escalation to owner. Refused for everybody, as
    `POST /members` already refused it: ownership is transferred (canon §0.7)."""
    client, _member = api_as(tenant, role=caller_role)

    response = client.post(
        reverse(INVITATIONS_URL), {"email": "boss@shop.test", "role": "owner"}, format="json"
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "role" in response.json()["error"]["details"]
    assert not Invitation.objects.filter(email="boss@shop.test").exists()


def test_a_second_business_cannot_reissue_a_password_it_did_not_issue(
    tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """Cross-tenant account takeover, closed.

    Business A creates Ravi's login; before Ravi picks his own password,
    business B adds his (existing) address to its team. `must_change_password`
    is still set, so B's "New password" used to mint a password, show it to B,
    and bump Ravi's epoch — B could then sign in as Ravi and switch into A.
    Only the business that issued the temporary password may reissue it.
    """
    owner_a = MembershipFactory(user=UserFactory(), tenant=tenant, role=system_roles["owner"])
    owner_b = MembershipFactory(user=UserFactory(), tenant=other_tenant, role=system_roles["owner"])
    issued_a = credentials.create_member(
        tenant=tenant,
        role=system_roles["staff"],
        email="ravi@shop.test",
        full_name="Ravi",
        actor=owner_a.user,
        ctx=_ctx(owner_a.user, tenant),
    )
    added_b = credentials.create_member(
        tenant=other_tenant,
        role=system_roles["staff"],
        email="ravi@shop.test",
        full_name="Ravi",
        actor=owner_b.user,
        ctx=_ctx(owner_b.user, other_tenant),
    )
    assert added_b.created_user is False
    ravi = issued_a.user
    ravi.refresh_from_db()
    hash_before, epoch_before = ravi.password, ravi.token_epoch

    with pytest.raises(BusinessRuleViolation):
        credentials.regenerate(
            membership=added_b.membership, actor=owner_b.user, ctx=_ctx(owner_b.user, other_tenant)
        )

    ravi.refresh_from_db()
    assert (ravi.password, ravi.token_epoch) == (hash_before, epoch_before)
    # The issuing business still can — that is the feature DEC-012 built.
    again = credentials.regenerate(
        membership=issued_a.membership, actor=owner_a.user, ctx=_ctx(owner_a.user, tenant)
    )
    assert again.password


def test_a_legacy_temporary_password_is_reissuable_only_where_it_is_the_only_business(
    tenant: Any, other_tenant: Any, system_roles: dict
) -> None:
    """Rows from before `temp_password_tenant` existed carry NULL. For those the
    fallback is "no other business sits behind this credential"."""
    person = UserFactory()
    person.must_change_password = True
    person.save(update_fields=["must_change_password"])
    here = MembershipFactory(user=person, tenant=tenant, role=system_roles["staff"])
    owner = MembershipFactory(user=UserFactory(), tenant=tenant, role=system_roles["owner"])

    assert credentials.regenerate(membership=here, actor=owner.user, ctx=_ctx(owner.user, tenant))

    person.refresh_from_db()
    person.temp_password_tenant = None
    person.save(update_fields=["temp_password_tenant"])
    MembershipFactory(
        user=person, tenant=other_tenant, role=system_roles["staff"], is_default=False
    )
    with pytest.raises(BusinessRuleViolation):
        credentials.regenerate(membership=here, actor=owner.user, ctx=_ctx(owner.user, tenant))


def test_choosing_a_password_clears_the_issuer_too(
    tenant: Any, owner: Any, system_roles: dict
) -> None:
    """Cleared with the gate, so no business keeps reissue rights over a password
    the person now owns."""
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles["staff"],
        email="own@shop.test",
        full_name="Own",
        actor=owner.user,
        ctx=_ctx(owner.user, tenant),
    )
    assert issued.user.temp_password_tenant_id == tenant.id

    credentials.clear_on_chosen_password(user=issued.user)

    issued.user.refresh_from_db()
    assert issued.user.temp_password_tenant_id is None


def test_the_token_is_in_no_audit_row_across_the_whole_lifecycle(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict
) -> None:
    """Invite, resend, accept, revoke: not one audit row — before, after or
    metadata — contains the raw token or its hash. A support engineer reads
    this table; a token in it is a live seat."""
    first, first_raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    second, second_raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    memberships.accept_invitation(user=invitee, token=second_raw)
    memberships.revoke_invitation(invitation=second, ctx=_ctx(owner.user, tenant))
    other, other_raw = _invite(tenant, owner.user, "x@shop.test", system_roles["staff"])
    memberships.revoke_invitation(invitation=other, ctx=_ctx(owner.user, tenant))

    secrets_ = {
        first_raw,
        second_raw,
        other_raw,
        first.token_hash,
        second.token_hash,
        other.token_hash,
    }
    dump = " ".join(
        str((row.before, row.after, row.metadata)) for row in AuditLog.objects.filter(tenant=tenant)
    )
    assert AuditLog.objects.filter(tenant=tenant, action__startswith="member.").count() >= 5
    for secret in secrets_:
        assert secret not in dump


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_the_accept_request_never_writes_its_token_to_the_access_log(
    tenant: Any, owner: Any, invitee: Any, system_roles: dict, other_tenant: Any
) -> None:
    """`POST /invitations/{token}/accept` carries the raw token IN THE PATH, and
    `AccessLogMiddleware` logs the path of every request. The log file is at rest
    exactly as a column is; the path is scrubbed at source."""
    _invitation, raw = _invite(tenant, owner.user, invitee.email, system_roles["staff"])
    home = Membership.objects.get(user=invitee, tenant=other_tenant)
    capture = _Capture()
    access = logging.getLogger("ub.access")
    previous_level = access.level
    access.setLevel(logging.INFO)  # the test settings run the `ub` tree quieter
    access.addHandler(capture)
    try:
        response = _client_for(home).post(_accept_url(raw), {}, format="json")
    finally:
        access.removeHandler(capture)
        access.setLevel(previous_level)

    assert response.status_code == 200
    lines = [r for r in capture.records if r.getMessage() == "http.request"]
    assert lines, "the access log wrote nothing — this test would pass vacuously"
    for record in lines:
        assert raw not in str(record.__dict__)
    assert any("/invitations/[redacted]/accept" in r.path for r in lines)


def test_the_log_filter_scrubs_django_server_style_records() -> None:
    """The second lock: `runserver`'s own request line puts the path in the
    message AND hangs the request object on the record, which the JSON formatter
    would stringify. Both come out scrubbed, and the filter is on every handler
    and on `django.server` in the logging config."""
    from apps.common.logging import SecretPathFilter, build_logging_config

    class FakeRequest:
        method = "POST"
        path = "/api/v1/invitations/SeCrEt-Token_123/accept"

        def __str__(self) -> str:
            return f"<WSGIRequest: POST '{self.path}'>"

    record = logging.LogRecord(
        "django.server",
        logging.INFO,
        __file__,
        1,
        '"%s" %s %s',
        ("POST /api/v1/invitations/SeCrEt-Token_123/accept HTTP/1.1", "200", "12"),
        None,
    )
    record.request = FakeRequest()
    record.path = "/api/v1/invitations/SeCrEt-Token_123/accept"

    SecretPathFilter().filter(record)

    assert "SeCrEt-Token_123" not in record.getMessage()
    assert "SeCrEt-Token_123" not in str(record.request)
    assert "SeCrEt-Token_123" not in record.path
    config = build_logging_config(log_dir="/tmp")
    assert all("secret_paths" in h["filters"] for h in config["handlers"].values())
    assert "django.server" in config["loggers"]
