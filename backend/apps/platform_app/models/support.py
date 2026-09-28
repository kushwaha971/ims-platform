"""Consented support access and impersonation sessions (PLT-14 FR-5/FR-6, CCR-12).

Two tables, because they answer two different questions. `SupportAccess` is the
owner's CONSENT: an operator asked, with a reason, and an owner of that business
said yes (or no). Its id is the consent token the operator must present — and
the only way to make one `granted` is an owner calling the allow endpoint, so
there is no path by which an operator consents on a merchant's behalf.

`ImpersonationSession` is one USE of that consent: a sixty-minute,
non-refreshable access token. The token itself is never stored; `jti_hash` is
the sha256 of its `jti` claim, and the authentication layer refuses an `imp`
token whose jti does not hash to a live row — so ending a session, revoking the
consent or letting either expire cuts the token at once rather than when its
own `exp` passes.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel


class SupportAccessStatus(models.TextChoices):
    REQUESTED = "requested", _("Requested")
    GRANTED = "granted", _("Granted")
    DENIED = "denied", _("Denied")
    REVOKED = "revoked", _("Revoked")
    EXPIRED = "expired", _("Expired")


class SupportAccess(TimeStampedModel):
    """An operator's request to enter a business, and the owner's answer."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, related_name="support_accesses"
    )
    requested_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    reason = models.CharField(max_length=500)
    status = models.CharField(
        max_length=12, choices=SupportAccessStatus.choices, default=SupportAccessStatus.REQUESTED
    )
    #: For `requested`: when the request lapses unanswered. For `granted`: when
    #: the consent lapses. Both 24 h (FR-5/FR-6).
    expires_at = models.DateTimeField()
    decided_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "platform_support_access"
        verbose_name = "support access"
        verbose_name_plural = "support accesses"
        indexes = [
            models.Index(fields=["tenant", "-created_at"], name="ix_support_access_tenant"),
        ]

    def __str__(self) -> str:
        return f"support_access:{self.status}:{self.tenant_id}"


class ImpersonationSession(TimeStampedModel):
    """One support session minted from a granted `SupportAccess`."""

    id = uuid7_pk()
    access = models.ForeignKey(SupportAccess, on_delete=models.RESTRICT, related_name="sessions")
    tenant = models.ForeignKey("platform.Tenant", on_delete=models.RESTRICT, related_name="+")
    admin = models.ForeignKey("platform.User", on_delete=models.RESTRICT, related_name="+")
    #: The operator's own login session, so the way back is their own token.
    session_id = models.UUIDField(null=True, blank=True)
    jti_hash = models.CharField(max_length=64, unique=True)
    reason = models.CharField(max_length=500)
    expires_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    end_reason = models.CharField(max_length=24, null=True, blank=True)

    class Meta:
        db_table = "platform_impersonation_session"
        verbose_name = "impersonation session"
        verbose_name_plural = "impersonation sessions"
        indexes = [
            models.Index(fields=["tenant", "-created_at"], name="ix_impersonation_tenant"),
        ]

    def __str__(self) -> str:
        return f"impersonation:{self.admin_id}:{self.tenant_id}"
