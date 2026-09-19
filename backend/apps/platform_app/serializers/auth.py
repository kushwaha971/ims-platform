"""Auth wire shapes (PLT-01 §10, PLT-02 §10, Part 26 §26.6).

Write serializers validate shape only. Every rule that has consequences — the
throttle, the attempt count, the password policy, the identity of the caller —
lives in the service, because a serializer cannot open a transaction and cannot
be called from a job (Part 26 §26.6 R6.4).

The one thing these do own is **normalisation**: the value that reaches a
service is the value that reaches the unique index and the throttle key, so
`ramesh@x.com` and ` Ramesh@X.com ` must become one string here rather than in
three separate services.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.platform_app.email import InvalidEmail, normalise_email
from apps.platform_app.mobile import InvalidMobile, normalise_mobile


class EmailField(serializers.CharField):
    """The login identifier. Trimmed, lower-cased, validated (DEC-010)."""

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_length", 254)
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> str:
        value = super().to_internal_value(data)
        try:
            return normalise_email(value)
        except InvalidEmail as exc:
            raise serializers.ValidationError(str(exc)) from exc


class MobileField(serializers.CharField):
    """Accepts the four spellings a client may send; stores exactly one.

    Still here, and still validating, because a merchant's number is on the
    profile, on invitations and on every document — it simply is not how anyone
    signs in any more.
    """

    def to_internal_value(self, data: Any) -> str:
        value = super().to_internal_value(data)
        try:
            return normalise_mobile(value)
        except InvalidMobile as exc:
            raise serializers.ValidationError(str(exc)) from exc


class RegisterSerializer(serializers.Serializer):
    """`POST /auth/register` — `{email, password, full_name?, mobile?, locale?}`."""

    email = EmailField()
    password = serializers.CharField(max_length=256, trim_whitespace=False)
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    mobile = MobileField(max_length=20, required=False, allow_blank=True)
    locale = serializers.ChoiceField(choices=["en", "hi"], required=False, default="en")
    device_label = serializers.CharField(max_length=120, required=False, allow_blank=True)


class PasswordLoginSerializer(serializers.Serializer):
    """`POST /auth/login` — `{email, password}` (PLT-02 FR-1, FR-7).

    `mobile` is still accepted as an alias for the identifier field so that a
    client which has not yet been updated gets `validation_error` on a field it
    sent rather than on one it did not. It is parsed as an email either way:
    there is no mobile login at MVP.
    """

    email = serializers.CharField(max_length=254, required=False, allow_blank=True)
    mobile = serializers.CharField(max_length=254, required=False, allow_blank=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False)
    device_label = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate(self, attrs: dict) -> dict:
        raw = (attrs.get("email") or attrs.get("mobile") or "").strip()
        if not raw:
            raise serializers.ValidationError({"email": ["Enter your email address."]})
        try:
            attrs["identifier"] = normalise_email(raw)
        except InvalidEmail as exc:
            raise serializers.ValidationError({"email": [str(exc)]}) from exc
        return attrs


class PasswordSetSerializer(serializers.Serializer):
    """`POST /auth/password/set` (PLT-02 FR-3, FR-9)."""

    new_password = serializers.CharField(max_length=256, trim_whitespace=False)
    current_password = serializers.CharField(
        max_length=256, required=False, allow_blank=True, trim_whitespace=False
    )
    logout_other_devices = serializers.BooleanField(required=False, default=False)
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True)


class PasswordResetRequestSerializer(serializers.Serializer):
    """`POST /auth/password/reset/request` (FR-4). Same answer for unknown addresses."""

    email = EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """`POST /auth/password/reset/confirm` (FR-5) — the link's token, not a code."""

    token = serializers.CharField(max_length=256, trim_whitespace=True)
    new_password = serializers.CharField(max_length=256, trim_whitespace=False)
    device_label = serializers.CharField(max_length=120, required=False, allow_blank=True)


class EmailVerifyConfirmSerializer(serializers.Serializer):
    """`POST /auth/email/verify/confirm` — the address-confirmation link's token."""

    token = serializers.CharField(max_length=256, trim_whitespace=True)


class RefreshSerializer(serializers.Serializer):
    """`POST /auth/refresh`. Browsers send the cookie; API clients send the body."""

    refresh_token = serializers.CharField(required=False, allow_blank=True)


class SwitchTenantSerializer(serializers.Serializer):
    """`POST /auth/switch-tenant` — `{tenant_id}` (PLT-04 FR-2, §10)."""

    tenant_id = serializers.UUIDField()
    device_label = serializers.CharField(max_length=120, required=False, allow_blank=True)


class AcceptInvitationSerializer(serializers.Serializer):
    """`POST /invitations/{token}/accept` (PLT-05 FR-10, reached from PLT-04 FR-8)."""

    token = serializers.CharField(max_length=128)
