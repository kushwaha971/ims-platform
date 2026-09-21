"""Creating, superseding and revoking invitations (PLT-05 FR-9, FR-11).

The half that did not exist. `accept_invitation` has been in the codebase since
Sprint 1 and nothing could create the row it accepts — the lifecycle was modelled
correctly and then had no way in. These are the rules that are easy to get wrong
and expensive to discover later, so each one is pinned.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.utils import timezone

from apps.common.constants import RoleCode
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation
from apps.platform_app.constants import InvitationStatus, MembershipStatus
from apps.platform_app.models import Invitation
from apps.platform_app.services import memberships
from apps.platform_app.tokens import hash_token


def _ctx(user: Any, tenant: Any) -> Ctx:
    return Ctx(actor=user, tenant=tenant, request_id="test-request")


@pytest.mark.django_db
def test_invite_returns_a_raw_token_that_is_never_stored(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """The raw token exists once, in the return value, and nowhere else.

    Only its sha256 is persisted, like every other token here. If the caller
    drops it the invitation can only be revoked and reissued — which is the
    intended property: a token a support engineer can read from the database is
    a token that hands them a seat.
    """
    invitation, raw = memberships.invite(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="Priya@Shop.test",
        actor=user,
        ctx=_ctx(user, tenant),
    )

    assert raw
    assert invitation.token_hash == hash_token(raw)
    assert raw not in str(Invitation.objects.values_list("token_hash", flat=True))
    # Normalised on the way in, so acceptance can match on equality.
    assert invitation.email == "priya@shop.test"
    assert invitation.status == InvitationStatus.PENDING
    assert invitation.expires_at > timezone.now()
    assert invitation.invited_by_id == user.id


@pytest.mark.django_db
def test_the_invitation_it_creates_is_one_accept_can_use(
    tenant: Any, user: Any, system_roles: dict, django_user_model: Any
) -> None:
    """The two halves meet. This is the test that would have caught the gap.

    `invite` and `accept_invitation` were written months apart against the same
    model, which is exactly the situation where a field is written in one
    spelling and read in another. Driving one into the other is the only way to
    know they agree.
    """
    invitee = django_user_model.objects.create_user(
        email="priya@shop.test", password="KhataBook2026!", full_name="Priya"
    )
    _invitation, raw = memberships.invite(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="priya@shop.test",
        actor=user,
        ctx=_ctx(user, tenant),
    )

    membership = memberships.accept_invitation(user=invitee, token=raw)

    assert membership.tenant_id == tenant.id
    assert membership.status == MembershipStatus.ACTIVE
    assert Invitation.objects.get(pk=_invitation.pk).status == InvitationStatus.ACCEPTED


@pytest.mark.django_db
def test_re_inviting_revokes_the_earlier_link_rather_than_adding_a_second(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """Two live invitations for one address would both work.

    Whichever arrived second would look to the recipient like the only one, and
    the first would keep working silently. Superseding is also how a genuine
    resend behaves: the old link stops, the new one is the only one that does.
    """
    first, first_raw = memberships.invite(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="priya@shop.test",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    second, second_raw = memberships.invite(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="priya@shop.test",
        actor=user,
        ctx=_ctx(user, tenant),
    )

    assert first_raw != second_raw
    assert Invitation.objects.get(pk=first.pk).status == InvitationStatus.REVOKED
    assert Invitation.objects.get(pk=second.pk).status == InvitationStatus.PENDING
    assert (
        Invitation.objects.filter(
            tenant=tenant, email="priya@shop.test", status=InvitationStatus.PENDING
        ).count()
        == 1
    )


@pytest.mark.django_db
def test_a_revoked_invitation_stops_working(
    tenant: Any, user: Any, system_roles: dict, django_user_model: Any
) -> None:
    invitee = django_user_model.objects.create_user(
        email="priya@shop.test", password="KhataBook2026!", full_name="Priya"
    )
    invitation, raw = memberships.invite(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="priya@shop.test",
        actor=user,
        ctx=_ctx(user, tenant),
    )

    memberships.revoke_invitation(invitation=invitation, ctx=_ctx(user, tenant))

    with pytest.raises(memberships.InvitationInvalid):
        memberships.accept_invitation(user=invitee, token=raw)


@pytest.mark.django_db
def test_revoking_is_idempotent_and_keeps_the_history(
    tenant: Any, user: Any, system_roles: dict
) -> None:
    """Revoked, not deleted, and revoking twice is not an error.

    "Who invited this person and what became of it" is exactly what an audit
    answers, and a deleted row answers nothing. Revoking again is what the
    caller wanted — it does not work — so it is not a failure.
    """
    invitation, _ = memberships.invite(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="priya@shop.test",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    memberships.revoke_invitation(invitation=invitation, ctx=_ctx(user, tenant))
    again = memberships.revoke_invitation(invitation=invitation, ctx=_ctx(user, tenant))

    assert again.status == InvitationStatus.REVOKED
    assert Invitation.objects.filter(pk=invitation.pk).exists()


@pytest.mark.django_db
def test_an_active_member_cannot_be_invited_again(
    tenant: Any, membership: Any, user: Any, system_roles: dict
) -> None:
    """`membership` is an ACTIVE owner on `tenant`, so this is the real case."""
    with pytest.raises(BusinessRuleViolation):
        memberships.invite(
            tenant=tenant,
            role=system_roles[RoleCode.STAFF.value],
            email=user.email,
            actor=user,
            ctx=_ctx(user, tenant),
        )


@pytest.mark.django_db
def test_an_invitation_needs_an_address(tenant: Any, user: Any, system_roles: dict) -> None:
    with pytest.raises(BusinessRuleViolation):
        memberships.invite(
            tenant=tenant,
            role=system_roles[RoleCode.STAFF.value],
            email="   ",
            actor=user,
            ctx=_ctx(user, tenant),
        )
