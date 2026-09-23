"""Owner-issued temporary credentials (DEC-012, PLT-05 FR-2 as amended).

**Why this exists.** `invite()` next door creates an invitation and returns a
link, and nothing sends it: there is no mail provider in this deployment and
none is being paid for until the platform earns. The owner was copying a URL
out of a dialog and pasting it into WhatsApp. This module makes that the
supported path instead of the workaround -- the owner creates the account and
hands over an email and a password, which is a thing a shop assistant already
knows how to use, on a phone where a long URL opens in an in-app browser and
loses the session.

The invitation flow is **kept, not replaced**. When email delivery is funded,
the token flow is the email flow, already built and tested.

**What is deliberately NOT copied from BrandHub's `temp_password_utils`,** which
is the pattern this was asked to follow:

* Its generator draws from `random`, the Mersenne Twister -- a *predictable*
  sequence whose internal state is recoverable from enough outputs. That is
  fine for shuffling and wrong for minting a credential. This one uses
  `secrets`.
* It stores the password Fernet-encrypted so an admin can read it back. That
  buys nothing `regenerate()` does not: the owner clicks once, the old password
  dies, the new one is shown. What it costs is a decryptable plaintext password
  at rest, a key to manage, and the `cryptography` dependency -- which ADR-021
  does not admit. Only Django's hash is stored here, so the plaintext exists in
  exactly one response and then nowhere.
"""

from __future__ import annotations

import datetime as dt
import secrets
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app.constants import InvitationStatus, MembershipStatus
from apps.platform_app.services import entitlements
from apps.platform_app.services import memberships as membership_service

# Unambiguous by construction: no I/l/1, no O/0. This password is going to be
# read off one phone screen and typed into another, by someone who did not
# choose it, and every character pair that looks alike is a failed login the
# owner gets blamed for. The cost is ~0.2 bits per character against an
# alphabet that is already far beyond what the login throttle allows anyone to
# test -- ten attempts per identifier per ten minutes, then a lockout.
_UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ"
_LOWER = "abcdefghijkmnpqrstuvwxyz"
_DIGITS = "23456789"
_ALPHABET = _UPPER + _LOWER + _DIGITS

GROUP_SIZE = 4
GROUPS = 3  # 12 characters, ~2^69 -- grouped for reading, not for strength


@dataclass(frozen=True, slots=True)
class IssuedCredentials:
    """The one and only moment the plaintext password exists.

    Returned up to the view, rendered once, never stored, never audited and
    never present in any list or detail response. A caller who drops it
    regenerates; there is no way to recover it, and that is the property, not
    an inconvenience.
    """

    user: Any
    membership: Any
    password: str
    expires_at: dt.datetime
    created_user: bool


def generate_temp_password() -> str:
    """A typeable 12-character password in three hyphenated groups.

    `secrets.choice` is a CSPRNG; `random.choice` is not, and the difference is
    the whole security of this feature. The result is re-drawn until it carries
    at least one letter and one digit, because `passwords.validate()` enforces
    exactly that and a generator that can emit a password its own policy
    refuses is a 500 waiting for an unlucky draw. The loop terminates with
    probability 1 and in practice on the first pass.
    """
    while True:
        chars = [secrets.choice(_ALPHABET) for _ in range(GROUP_SIZE * GROUPS)]
        if any(c.isalpha() for c in chars) and any(c.isdigit() for c in chars):
            break
    groups = ["".join(chars[i : i + GROUP_SIZE]) for i in range(0, len(chars), GROUP_SIZE)]
    return "-".join(groups)


def _expiry() -> dt.datetime:
    """Same window as an invitation, and for the same reason.

    `UB_INVITATION_DAYS` rather than a setting of its own: both are "a secret an
    owner sent by hand that should not outlive the conversation it was sent in",
    and two knobs that must be kept equal is one knob spelt twice.
    """
    return timezone.now() + dt.timedelta(days=int(settings.UB_INVITATION_DAYS))


def _apply(*, user: Any, password: str, tenant: Any) -> dt.datetime:
    """Set the hash, raise the gate, stamp the expiry and the issuer. Never logs the plaintext."""
    expires_at = _expiry()
    user.set_password(password)
    user.must_change_password = True
    user.password_expires_at = expires_at
    user.temp_password_tenant = tenant
    user.save(
        update_fields=[
            "password",
            "must_change_password",
            "password_expires_at",
            "temp_password_tenant",
            "updated_at",
        ]
    )
    return expires_at


def _issued_here(*, user: Any, tenant: Any) -> bool:
    """Whether `tenant` is the business that minted this person's temporary password.

    The only business allowed to reissue it. A person added to a SECOND business
    before choosing their own password still has `must_change_password` set, and
    without this check that second business could press "New password", be shown
    the result, and sign in as them — into the first business too, and every
    other one they belong to. That is not a resend, it is an account takeover
    across the tenancy boundary.

    Rows written before `temp_password_tenant` existed carry `NULL`; for those
    the rule falls back to "this is the only business they belong to", which is
    the case where no other tenant's data sits behind the credential.
    """
    from apps.platform_app.models import Membership

    if user.temp_password_tenant_id is not None:
        return user.temp_password_tenant_id == tenant.id
    return (
        not Membership.objects.filter(
            user=user,
            status__in=(
                MembershipStatus.ACTIVE,
                MembershipStatus.SUSPENDED,
                MembershipStatus.INVITED,
            ),
        )
        .exclude(tenant=tenant)
        .exists()
    )


def create_member(
    *,
    tenant: Any,
    role: Any,
    email: str,
    full_name: str,
    actor: Any,
    ctx: Ctx,
    mobile: str | None = None,
) -> IssuedCredentials:
    """`POST /members` -- create the account and the membership in one write.

    **An address that already has an account is not given a new password.** That
    person may be the owner of another business on this platform; resetting
    their password because a stranger typed their address would be a takeover
    with a friendly name. They are added to the team and keep the password they
    already chose, and `created_user` says so, so the dialog can tell the owner
    "they already have a DigiKhaato account -- they sign in with their existing
    password" instead of showing a credential that would not work.

    The seat is checked under the tenant lock (PLT-15 BR-7) before anything is
    created, so two owners cannot both spend the last one.

    **Somebody already invited is converted, not double-charged.** This is the
    primary path (DEC-012) and the invitation path is the future email one, so
    an owner who invited an address and then, with no email to carry the link,
    simply creates the login is the ordinary case. Their `invited` membership
    becomes the active one and any live invitation to the address is revoked in
    the same write: left pending, it would still be acceptable later, and
    accepting it could re-apply a role the owner has since decided against.
    """
    from apps.platform_app.models import Invitation, Membership, User

    normalised = membership_service.normalise_email_or_none(email)
    if not normalised:
        raise ValidationFailed({"email": ["An email address is required."]})
    display_name = (full_name or "").strip()
    if not display_name:
        raise ValidationFailed({"full_name": ["A name is required."]})

    with transaction.atomic():
        locked = entitlements.lock_tenant_for_write(tenant)
        existing_user = User.objects.filter(email=normalised).first()

        if existing_user is not None:
            already = Membership.objects.filter(user=existing_user, tenant=locked).first()
            if already is not None and already.status == MembershipStatus.ACTIVE:
                raise BusinessRuleViolation(
                    "validation_error", "That person is already on this team."
                )

        # "Everybody else, plus this person" — a seat already promised to the
        # address by an invitation is converted rather than bought twice.
        entitlements.assert_can_add_member(
            tenant=locked, adding=1, endpoint="members.create", excluding_email=normalised
        )

        if existing_user is None:
            user = User.objects.create_user(
                email=normalised, password=None, full_name=display_name, mobile=mobile or None
            )
            password = generate_temp_password()
            expires_at = _apply(user=user, password=password, tenant=locked)
            created_user = True
        else:
            # Their account, their password. We are only granting access.
            user = existing_user
            password = ""
            expires_at = user.password_expires_at
            created_user = False

        membership, _ = Membership.objects.update_or_create(
            user=user,
            tenant=locked,
            defaults={
                "role": role,
                "status": MembershipStatus.ACTIVE,
                "joined_at": timezone.now(),
            },
        )
        membership_service._promote_default(user=user)

        invitations_closed = Invitation.objects.filter(
            tenant=locked, email=normalised, status=InvitationStatus.PENDING
        ).update(status=InvitationStatus.REVOKED, updated_at=timezone.now())

        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_CREDENTIALS_ISSUED,
            entity_type="platform_membership",
            entity_id=membership.id,
            after={
                "email": normalised,
                "role": role.code,
                "created_user": created_user,
                "password_expires_at": expires_at,
            },
            # The password is not here and must never be. An audit row a support
            # engineer can read is an audit row that hands them the account.
            metadata={"invitations_closed": invitations_closed or None},
        )

    return IssuedCredentials(
        user=user,
        membership=membership,
        password=password,
        expires_at=expires_at,
        created_user=created_user,
    )


def regenerate(*, membership: Any, actor: Any, ctx: Ctx) -> IssuedCredentials:
    """`POST /members/{id}/credentials` -- replace the temporary password.

    This is what BrandHub's decrypt-and-show does, without keeping a readable
    password at rest: the owner lost the WhatsApp message, or the seven days
    ran out, and one click gives them a new one while the old one dies on the
    spot.

    **Refused once the person has chosen their own password.** At that point
    this would not be a resend, it would be an owner taking over a staff
    member's account -- and every audit entry afterwards would name a person who
    could no longer get in to dispute it. The way back from a forgotten password
    is the reset link, which only its owner can complete.
    """
    user = membership.user
    # Checked FIRST, before anything about the person's password: an invited
    # address has not joined, and telling this business whether a stranger has
    # chosen their own password yet would be answering a question about another
    # tenant's staff.
    if membership.status == MembershipStatus.INVITED:
        raise BusinessRuleViolation(
            "validation_error", "That person has not joined this business yet."
        )
    if not user.must_change_password:
        raise BusinessRuleViolation(
            "validation_error",
            "This person has set their own password. Ask them to use " "‘Forgot password’ instead.",
        )
    if membership.status == MembershipStatus.REMOVED:
        raise BusinessRuleViolation("validation_error", "That person is no longer on this team.")
    if not _issued_here(user=user, tenant=membership.tenant):
        raise BusinessRuleViolation(
            "validation_error",
            "This login was created by another business, so only they can issue a new "
            "password. Ask them, or ask the person to use ‘Forgot password’.",
        )

    with transaction.atomic():
        password = generate_temp_password()
        expires_at = _apply(user=user, password=password, tenant=membership.tenant)
        # Anything issued against the dead password goes with it (Part 27
        # §27.4.4 step 2): if the old one leaked, a live session is the hole
        # that changing the password on its own would leave open.
        user.token_epoch = user.token_epoch + 1
        user.save(update_fields=["token_epoch", "updated_at"])

        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_CREDENTIALS_REGENERATED,
            entity_type="platform_membership",
            entity_id=membership.id,
            after={"email": user.email, "password_expires_at": expires_at},
        )

    return IssuedCredentials(
        user=user,
        membership=membership,
        password=password,
        expires_at=expires_at,
        created_user=False,
    )


def clear_on_chosen_password(*, user: Any) -> None:
    """Called by `passwords.set_password` once the person picks their own.

    Both fields are cleared together and only here, so there is no state where
    the gate is down but the expiry still stands (which would lock the person
    out of the product the moment their own password aged past the window).
    """
    if not (user.must_change_password or user.password_expires_at or user.temp_password_tenant_id):
        return
    user.must_change_password = False
    user.password_expires_at = None
    user.temp_password_tenant = None
    user.save(
        update_fields=[
            "must_change_password",
            "password_expires_at",
            "temp_password_tenant",
            "updated_at",
        ]
    )


__all__ = [
    "IssuedCredentials",
    "clear_on_chosen_password",
    "create_member",
    "generate_temp_password",
    "regenerate",
]
