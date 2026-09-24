"""`/api/v1/auth/*` (PLT-01, PLT-02, PLT-04; Part 22 §22.2).

Thin by construction (Part 26 §26.7 R7.1): validate, delegate to one service,
wrap the result in the envelope, set the cookies. No view here contains a
business `if` that is not about transport.

Every response body is the one shape of `selectors.session_payload.build`,
because PLT-01 FR-5 and PLT-04 FR-2 both say "the same body as `/auth/me`".

The OTP views are **not** here. They live in `views/otp.py`, reached only from
`urls_otp.py`, which `urls_auth.py` includes only when `UB_AUTH_OTP_ENABLED=1`
(DEC-010). That is what makes "the endpoints 404 and nothing on the default
path touches them" a structural fact rather than a claim.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import transaction
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.platform_app import tokens
from apps.platform_app.selectors import session_payload
from apps.platform_app.selectors.memberships import active_membership
from apps.platform_app.serializers.auth import (
    EmailVerifyConfirmSerializer,
    PasswordLoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordSetSerializer,
    RefreshSerializer,
    RegisterSerializer,
    SwitchTenantSerializer,
)
from apps.platform_app.services import auth as auth_service
from apps.platform_app.services import memberships as membership_service
from apps.platform_app.services import passwords as password_service
from apps.platform_app.services import sessions as session_service


def _client_meta(request: Any) -> dict:
    return {
        "ip": getattr(request, "client_ip", None),
        "user_agent": (request.META.get("HTTP_USER_AGENT", "") or "")[:255] or None,
        "request_id": getattr(request, "request_id", None),
    }


def _wants_tokens_in_body(request: Any) -> bool:
    """PLT-01 FR-4: API clients declare themselves with `X-Client: api`.

    A browser never sets that header, so a browser never receives a token it
    could store in `localStorage` — which is the point of the httpOnly cookie.
    """
    return (request.headers.get("X-Client") or "").lower() == "api"


def _login_response(request: Any, outcome: Any, *, status_created: bool = False) -> Any:
    expose = _wants_tokens_in_body(request)
    payload = session_payload.build(
        user=outcome.user,
        membership=outcome.membership,
        is_new=outcome.is_new,
        access_token=outcome.tokens.access if expose else None,
        refresh_token=outcome.tokens.refresh if expose else None,
    )
    builder = StandardResponse.created if status_created else StandardResponse.ok
    response = builder(payload)
    return tokens.set_auth_cookies(
        response,
        access=outcome.tokens.access,
        refresh=outcome.tokens.refresh,
        csrf=outcome.tokens.csrf,
    )


class RegisterView(APIView):
    """`POST /auth/register` (PLT-01 FR-1/FR-4 as amended by DEC-010).

    Creates the account and signs the person straight in — there is no
    intermediate state for a client to get stuck in, because there is no
    challenge to complete.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []  # Part 27 §27.4.1: the durable counter, not LocMem

    def post(self, request: Any) -> Any:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _client_meta(request)

        user = auth_service.register(
            email=data["email"],
            password=data["password"],
            full_name=data.get("full_name") or "",
            mobile=data.get("mobile") or None,
            locale=data.get("locale") or "en",
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
        )
        outcome = auth_service.start_session(
            user=user,
            method="register",
            device_label=data.get("device_label"),
            user_agent=meta["user_agent"],
            ip=meta["ip"],
            request_id=meta["request_id"],
            is_new=True,
        )
        return _login_response(request, outcome, status_created=True)


class PasswordLoginView(APIView):
    """`POST /auth/login` (PLT-02 FR-1, FR-6, FR-7; AC-1, AC-5)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def post(self, request: Any) -> Any:
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _client_meta(request)

        user = password_service.authenticate(
            identifier=data["identifier"],
            password=data["password"],
            ip=meta["ip"],
            request_id=meta["request_id"],
        )
        outcome = auth_service.start_session(
            user=user,
            method="password",
            device_label=data.get("device_label"),
            user_agent=meta["user_agent"],
            ip=meta["ip"],
            request_id=meta["request_id"],
        )
        return _login_response(request, outcome)


class RefreshView(APIView):
    """`POST /auth/refresh` (PLT-01 §14; Part 20 §20.5.2).

    Reuse of an already-rotated token revokes the whole family and answers 401
    `session_revoked` — the token-theft response, not an inconvenience.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def post(self, request: Any) -> Any:
        serializer = RefreshSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        raw = serializer.validated_data.get("refresh_token") or request.COOKIES.get(
            tokens.REFRESH_COOKIE
        )
        if not raw:
            raise session_service.InvalidToken()

        meta = _client_meta(request)
        issued = session_service.rotate(
            raw_refresh=raw,
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
        )
        session = issued.session
        membership = (
            active_membership(user=session.user, tenant_id=session.tenant_id)
            if session.tenant_id
            else None
        )
        expose = _wants_tokens_in_body(request)
        payload = session_payload.build(
            user=session.user,
            membership=membership,
            access_token=issued.access if expose else None,
            refresh_token=issued.refresh if expose else None,
        )
        return tokens.set_auth_cookies(
            StandardResponse.ok(payload),
            access=issued.access,
            refresh=issued.refresh,
            csrf=issued.csrf,
        )


class LogoutView(APIView):
    """`POST /auth/logout` (`?all=true`) — Part 27 §27.4.3."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Any) -> Any:
        everywhere = str(request.query_params.get("all", "")).lower() in ("1", "true", "yes")
        meta = _client_meta(request)
        revoked = auth_service.logout(
            user=request.user,
            claims=getattr(request, "auth_claims", {}) or {},
            everywhere=everywhere,
            request_id=meta["request_id"],
            ip=meta["ip"],
        )
        return tokens.clear_auth_cookies(
            StandardResponse.ok({"sessions_revoked": revoked, "all_devices": everywhere})
        )


class MeView(APIView):
    """`GET /auth/me` — user, memberships, active tenant, permissions, plan limits."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> Any:
        claims = getattr(request, "auth_claims", {}) or {}
        if claims.get("imp"):
            # PLT-14 FR-5: a support session has no membership row; the tenancy
            # layer built an unsaved owner one, which is what this body describes.
            tenant = get_effective_tenant(request)
            membership = getattr(tenant, "_ub_membership", None) if tenant else None
        else:
            membership = (
                active_membership(user=request.user, tenant_id=claims.get("tid"))
                if claims.get("tid")
                else None
            )
        return StandardResponse.ok(session_payload.build(user=request.user, membership=membership))


class SwitchTenantView(APIView):
    """`POST /auth/switch-tenant` (PLT-04 FR-2, BR-1, BR-2)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Any) -> Any:
        serializer = SwitchTenantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        meta = _client_meta(request)

        membership, issued = membership_service.switch_tenant(
            user=request.user,
            tenant_id=serializer.validated_data["tenant_id"],
            current_claims=getattr(request, "auth_claims", {}) or {},
            device_label=serializer.validated_data.get("device_label"),
            user_agent=meta["user_agent"],
            ip=meta["ip"],
            request_id=meta["request_id"],
        )
        expose = _wants_tokens_in_body(request)
        payload = session_payload.build(
            user=request.user,
            membership=membership,
            access_token=issued.access if expose else None,
            refresh_token=issued.refresh if expose else None,
        )
        response = StandardResponse.ok(payload)
        response["X-Tenant-Id"] = str(membership.tenant_id)  # PLT-04 FR-4 (CCR-3)
        return tokens.set_auth_cookies(
            response, access=issued.access, refresh=issued.refresh, csrf=issued.csrf
        )


class PasswordSetView(APIView):
    """`POST /auth/password/set` (PLT-02 FR-3, FR-9, §12 "for self only")."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Any) -> Any:
        serializer = PasswordSetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _client_meta(request)
        claims = getattr(request, "auth_claims", {}) or {}

        result = password_service.set_password(
            user=request.user,
            new_password=data["new_password"],
            current_password=data.get("current_password") or None,
            logout_other_devices=bool(data.get("logout_other_devices")),
            current_session_id=claims.get("sid"),
            request_id=meta["request_id"],
            ip=meta["ip"],
            user_agent=meta["user_agent"],
        )
        # After `set_password`, never before it: `set_password` is where the
        # caller's `current_password` is checked, and a request that fails that
        # check must change nothing. Writing the name first meant a wrong
        # current password returned 401 *and* renamed the account.
        if data.get("full_name") and not (request.user.full_name or "").strip():
            request.user.full_name = data["full_name"].strip()[:120]
            request.user.save(update_fields=["full_name", "updated_at"])

        return StandardResponse.ok(
            {"sessions_revoked": result["sessions_revoked"], "has_password": True},
            message="Password updated",
        )


class PasswordResetRequestView(APIView):
    """`POST /auth/password/reset/request` (PLT-02 FR-4).

    The body is computed from settings alone, so it is byte-for-byte identical
    for an address nobody has ever registered. No branch in this view reads
    whether a user exists, so there is nothing to get wrong later.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def post(self, request: Any) -> Any:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        meta = _client_meta(request)
        issued = password_service.request_reset(
            email=serializer.validated_data["email"],
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
        )
        return StandardResponse.ok(
            {"expires_in": issued.expires_in, "retry_after": issued.retry_after}
        )


class PasswordResetConfirmView(APIView):
    """`POST /auth/password/reset/confirm` (PLT-02 FR-5, BR-2, AC-3).

    **Spending the link and accepting the password are one transaction.**
    The token used to be consumed in its own committed transaction and the
    password validated afterwards, on the reasoning that a link must not be
    probeable by submitting deliberately bad passwords. That reasoning does not
    hold — whoever holds the link can already spend it by submitting a *good*
    password, so probing buys an attacker nothing — and the cost was real: the
    client can mirror §10's composition rule but not Django's 20,000-word
    `CommonPasswordValidator` or `UserAttributeSimilarityValidator`
    (`settings/base.py`), so a merchant who typed `Password123` at the end of a
    reset was told to choose a less common password *and* handed a dead link,
    behind a 60-second minimum gap and a five-per-hour cap. §9's "Failed" state
    describes the opposite.

    `ATOMIC_REQUESTS` is `False` (Part 20 §20.11.1), so the boundary is declared
    here. Everything the request does — the spend, the password write, the
    session revocation and the new session — commits together or not at all.

    This does **not** open a token-reuse hole: `consume_reset_token` takes its
    `SELECT … FOR UPDATE` on the token row inside this block, and a row lock is
    held to the end of the *outermost* transaction, so a second confirm of the
    same link blocks until this one resolves and then sees `used_at` set. The
    only thing the rollback restores is a link whose password was refused, which
    is precisely FR-5's intent.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def post(self, request: Any) -> Any:
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _client_meta(request)

        with transaction.atomic():
            user = password_service.consume_reset_token(token=data["token"])
            revoked = password_service.reset_password(
                user=user,
                new_password=data["new_password"],
                request_id=meta["request_id"],
                ip=meta["ip"],
                user_agent=meta["user_agent"],
            )
            outcome = auth_service.start_session(
                user=user,
                method="password_reset",
                device_label=data.get("device_label"),
                user_agent=meta["user_agent"],
                ip=meta["ip"],
                request_id=meta["request_id"],
            )
        response = _login_response(request, outcome)
        response.data["data"]["sessions_revoked"] = revoked
        return response


class EmailVerifyRequestView(APIView):
    """`POST /auth/email/verify/request` — send (or re-send) the confirmation link.

    Authenticated and self-only: the address it confirms is the caller's own, so
    there is no body and nothing to enumerate.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Any) -> Any:
        meta = _client_meta(request)
        auth_service.send_verification(
            user=request.user,
            ip=meta["ip"],
            user_agent=meta["user_agent"],
            request_id=meta["request_id"],
        )
        return StandardResponse.ok(
            {
                "expires_in": int(settings.UB_VERIFY_TOKEN_TTL_SECONDS),
                "email_verified": bool(request.user.email_verified_at),
            }
        )


class EmailVerifyConfirmView(APIView):
    """`POST /auth/email/verify/confirm` — spend the link. Never a login gate."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    def post(self, request: Any) -> Any:
        serializer = EmailVerifyConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        meta = _client_meta(request)
        user = auth_service.confirm_email(
            token=serializer.validated_data["token"],
            request_id=meta["request_id"],
            ip=meta["ip"],
        )
        return StandardResponse.ok({"email_verified": bool(user.email_verified_at)})
