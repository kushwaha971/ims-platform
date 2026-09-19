"""Role, Membership, Invitation (Part 21 §21.3.1)."""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel
from apps.platform_app.constants import InvitationStatus, MembershipStatus


class Role(TimeStampedModel):
    """`tenant` is NULL for the four system roles, set for custom roles (P3).

    For the system roles the authority on the codename set is
    `apps.common.permissions_registry.ROLE_PERMISSIONS`, not this column
    (Part 20 §20.5.5). `seed_reference_data` writes the same sets here so
    `GET /roles` can serve them, and a test asserts the two never diverge.
    """

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, null=True, blank=True, related_name="roles"
    )
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=120)
    is_system = models.BooleanField(default=False)
    permissions = ArrayField(models.CharField(max_length=64), default=list, blank=True)

    class Meta:
        db_table = "platform_role"
        verbose_name = "role"
        verbose_name_plural = "roles"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "code"], name="uq_role_tenant_code"),
            models.UniqueConstraint(
                fields=["code"],
                condition=models.Q(tenant__isnull=True),
                name="uq_role_system_code",
            ),
        ]

    def __str__(self) -> str:
        return self.code


class Membership(TimeStampedModel):
    """A user's role-bearing relationship to a tenant (canon §0.2)."""

    id = uuid7_pk()
    user = models.ForeignKey("platform.User", on_delete=models.CASCADE, related_name="memberships")
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, related_name="memberships"
    )
    role = models.ForeignKey("platform.Role", on_delete=models.RESTRICT, related_name="memberships")
    status = models.CharField(
        max_length=16, choices=MembershipStatus.choices, default=MembershipStatus.ACTIVE
    )
    is_default = models.BooleanField(default=False)
    joined_at = models.DateTimeField(null=True, blank=True)
    permissions_override = models.JSONField(default=dict, blank=True)
    permissions_version = models.IntegerField(default=1)

    class Meta:
        db_table = "platform_membership"
        verbose_name = "membership"
        verbose_name_plural = "memberships"
        constraints = [
            models.UniqueConstraint(fields=["user", "tenant"], name="uq_membership_user_tenant"),
        ]
        indexes = [
            models.Index(fields=["tenant", "status"], name="ix_membership_tenant_status"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}@{self.tenant_id}:{self.role_id}"


class Invitation(TimeStampedModel):
    """A pending membership invite (Part 21 §21.3.1).

    **Identity is `email`, not `mobile` (DEC-010, `CR-140`).** The column was
    originally `mobile` alone, from the sprint when a mobile number was how a
    person signed in. `DEC-010` made email the identifier and left `mobile` an
    optional profile field, and `CR-2026-09-19-D` removed it from the sign-up
    form — so every account the product can create has `mobile = None`, and an
    invitation matched on mobile is one no account can ever accept. An
    invitation has to key on the identity the product actually issues.

    `mobile` stays as what it now is: a notification channel, nullable, used to
    reach an invitee by SMS or WhatsApp and never to decide who they are.
    """

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, related_name="invitations"
    )
    email = models.EmailField(max_length=254)
    mobile = models.CharField(max_length=15, null=True, blank=True)
    role = models.ForeignKey("platform.Role", on_delete=models.RESTRICT, related_name="+")
    token_hash = models.CharField(max_length=64, unique=True)
    status = models.CharField(
        max_length=16, choices=InvitationStatus.choices, default=InvitationStatus.PENDING
    )
    expires_at = models.DateTimeField()
    invited_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    accepted_user = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "platform_invitation"
        verbose_name = "invitation"
        verbose_name_plural = "invitations"
        indexes = [
            models.Index(fields=["tenant", "status"], name="ix_invitation_tenant_status"),
            # `accept` looks a row up by token and then checks the address; the
            # invitee-facing list ("your pending invitations") looks up by
            # address alone, which is what this serves.
            models.Index(fields=["email", "status"], name="ix_invitation_email_status"),
        ]

    def __str__(self) -> str:
        return f"{self.email} → {self.tenant_id}"
