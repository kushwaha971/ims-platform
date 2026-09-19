"""The retired OTP wire shapes (PLT-01 §10).

Imported only by `views/otp.py`, which is imported only by `urls_otp.py`, which
is included only when `UB_AUTH_OTP_ENABLED=1`. Nothing on the default path
reaches this module.
"""

from __future__ import annotations

import re

from rest_framework import serializers

from apps.platform_app.constants import OtpPurpose
from apps.platform_app.serializers.auth import MobileField

CODE_RE = re.compile(r"^\d{6}$")


class OtpRequestSerializer(serializers.Serializer):
    """`POST /auth/otp/request` — `{mobile, purpose}` (PLT-01 FR-2)."""

    mobile = MobileField(max_length=20)
    purpose = serializers.ChoiceField(choices=OtpPurpose.choices, default=OtpPurpose.LOGIN.value)
    device_hint = serializers.CharField(max_length=120, required=False, allow_blank=True)
    locale = serializers.ChoiceField(choices=["en", "hi"], required=False, default="en")


class OtpVerifySerializer(serializers.Serializer):
    """`POST /auth/otp/verify` — `{challenge_id, code, device_label}` (FR-4)."""

    challenge_id = serializers.UUIDField()
    code = serializers.RegexField(CODE_RE, help_text="Exactly six digits.")
    device_label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    locale = serializers.ChoiceField(choices=["en", "hi"], required=False)
