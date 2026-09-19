"""The retired mobile-OTP endpoints (PLT-01 FR-2…FR-8).

Reached only through `urls_otp.py`, which `urls_auth.py` includes only when
`UB_AUTH_OTP_ENABLED=1`. With the flag off — the default — this module is never
imported, the routes do not exist, and `POST /api/v1/auth/otp/request` is a 404.

Nothing here has been weakened. The code, its service, its model and its 37
tests are intact so that turning the flag back on is a configuration change,
not an archaeology exercise.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.common.responses import StandardResponse
from apps.platform_app.serializers.otp import OtpRequestSerializer, OtpVerifySerializer
from apps.platform_app.services import auth as auth_service
from apps.platform_app.services import otp as otp_service
from apps.platform_app.services import passwords as password_service
from apps.platform_app.views.auth import _client_meta, _login_response


class OtpRequestView(APIView):
    """`POST /auth/otp/request` (PLT-01 FR-2, FR-7).

    The response is byte-for-byte identical for a known and an unknown mobile
    (BR-2, T-PLT-01-6): no branch here reads whether a user exists.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []  # Part 27 §27.4.1: the durable counter, not LocMem

    def post(self, request: Any) -> Any:
        serializer = OtpRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _client_meta(request)
        issued = otp_service.request_otp(
            mobile=data["mobile"],
            purpose=data["purpose"],
            ip=meta["ip"],
            device_hint=data.get("device_hint") or None,
            locale=data.get("locale") or "en",
            request_id=meta["request_id"],
        )
        return StandardResponse.ok(
            {
                "challenge_id": str(issued.challenge_id),
                "expires_in": issued.expires_in,
                "retry_after": issued.retry_after,
            }
        )


class OtpVerifyView(APIView):
    """`POST /auth/otp/verify` (PLT-01 FR-4, FR-5, FR-6, FR-8)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def post(self, request: Any) -> Any:
        serializer = OtpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _client_meta(request)

        challenge = otp_service.consume_challenge(
            challenge_id=data["challenge_id"],
            code=data["code"],
            request_id=meta["request_id"],
            ip=meta["ip"],
        )
        user, is_new = auth_service.get_or_create_user(
            mobile=challenge.mobile,
            locale=data.get("locale") or "en",
            request_id=meta["request_id"],
        )
        if not user.is_active:
            # §12: an inactive user gets 401 and the challenge stays consumed.
            raise password_service.InvalidCredentials()

        outcome = auth_service.start_session(
            user=user,
            method="otp",
            device_label=data.get("device_label") or challenge.device_hint,
            user_agent=meta["user_agent"],
            ip=meta["ip"],
            request_id=meta["request_id"],
            is_new=is_new,
        )
        return _login_response(request, outcome)
