"""`OtpChallenge`, `AuthToken` and `Session` (Part 21 §21.3.1).

`OtpChallenge` is retired behind `UB_AUTH_OTP_ENABLED`, which is off. The model
stays because the table stays: dropping it would be a destructive migration in
service of a decision that is explicitly reversible, and the OTP service and
its suite still run when the flag is on.
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel
from apps.platform_app.constants import AuthTokenPurpose, OtpPurpose


class OtpChallenge(TimeStampedModel):
    """OTP send/verify with throttling. Rows are purged after 24 h.

    Reachable only when `UB_AUTH_OTP_ENABLED=1` (DEC-010).
    """

    id = uuid7_pk()
    mobile = models.CharField(max_length=15)
    purpose = models.CharField(max_length=16, choices=OtpPurpose.choices)
    code_hash = models.CharField(max_length=128)
    attempts = models.SmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    verified_at = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    device_hint = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        db_table = "platform_otp_challenge"
        verbose_name = "OTP challenge"
        verbose_name_plural = "OTP challenges"
        indexes = [
            models.Index(fields=["mobile", "created_at"], name="ix_otp_mobile_created"),
            models.Index(fields=["expires_at"], name="ix_otp_expires"),
        ]
        constraints = [
            models.CheckConstraint(condition=models.Q(attempts__gte=0), name="ck_otp_attempts"),
        ]

    def __str__(self) -> str:
        return f"{self.purpose}:{self.mobile}"


class AuthToken(TimeStampedModel):
    """A single-use, expiring, hashed link token (Part 27 §27.4.2 "Reset").

    One table serves both link flows the email identity needs — the password
    reset and the optional address verification — because they are the same
    object with a different `purpose`: a random secret, delivered out of band,
    spendable once, dead after its window. Part 27's row is explicit that the
    reset token is "single-use, 15-minute, hashed at rest", and all three are
    properties of this row rather than of the code that reads it.

    `token_hash` is `sha256(raw)` with no pepper, unlike `platform_otp_challenge`.
    The pepper exists there because a six-digit code has 20 bits of entropy and
    a leaked table would be brute-forceable offline; a 256-bit `secrets` token
    is not, so the pepper would buy nothing and cost a secret to rotate. This is
    the same reasoning `platform_session.token_hash` already runs on.
    """

    id = uuid7_pk()
    user = models.ForeignKey("platform.User", on_delete=models.CASCADE, related_name="auth_tokens")
    purpose = models.CharField(max_length=24, choices=AuthTokenPurpose.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "platform_auth_token"
        verbose_name = "auth token"
        verbose_name_plural = "auth tokens"
        indexes = [
            models.Index(fields=["user", "purpose", "created_at"], name="ix_auth_token_user"),
            models.Index(fields=["expires_at"], name="ix_auth_token_expires"),
        ]

    def __str__(self) -> str:
        return f"{self.purpose}:{self.user_id}"


class Session(TimeStampedModel):
    """One row per issued refresh token, chained by `family_id` (Part 20 §20.5.2)."""

    id = uuid7_pk()
    user = models.ForeignKey("platform.User", on_delete=models.CASCADE, related_name="sessions")
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    family_id = models.UUIDField()
    token_hash = models.CharField(max_length=64, unique=True)
    device_label = models.CharField(max_length=120, null=True, blank=True)
    user_agent = models.CharField(max_length=255, null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    replaced_by = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "platform_session"
        verbose_name = "session"
        verbose_name_plural = "sessions"
        indexes = [
            models.Index(fields=["user", "revoked_at"], name="ix_session_user_revoked"),
            models.Index(fields=["family_id"], name="ix_session_family"),
        ]

    def __str__(self) -> str:
        return f"session:{self.id}"
