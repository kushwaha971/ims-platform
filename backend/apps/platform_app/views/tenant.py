"""`/api/v1/tenants/*` and `/api/v1/memberships/*` (PLT-03, PLT-04, PLT-15).

`POST /tenants` is the one endpoint in the product that a user with no tenant at
all may call: it is how a tenant comes into existence. Everything else here is
scoped by the `tid` claim and fails closed without it.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import NoActiveTenant, NotFound
from apps.common.idempotency import idempotent
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.platform_app import tokens
from apps.platform_app.permissions import TenantManagePermission
from apps.platform_app.selectors import session_payload
from apps.platform_app.selectors.memberships import active_membership, membership_of_user
from apps.platform_app.serializers.auth import AcceptInvitationSerializer
from apps.platform_app.serializers.tenant import (
    MembershipPatchSerializer,
    MembershipReadSerializer,
    TenantCreateSerializer,
    TenantReadSerializer,
    TenantUpdateSerializer,
)
from apps.platform_app.services import memberships as membership_service
from apps.platform_app.services import onboarding as onboarding_service
from apps.platform_app.services import sessions as session_service


def _meta(request: Any) -> dict:
    return {
        "ip": getattr(request, "client_ip", None),
        "user_agent": (request.META.get("HTTP_USER_AGENT", "") or "")[:255] or None,
        "request_id": getattr(request, "request_id", None),
    }


class TenantCreateView(APIView):
    """`POST /tenants` — onboarding step 1 (PLT-03 FR-2, §12, EC-7).

    §12: "any authenticated user". Creating a business is not a permission a
    business grants — it is what a person does before they have one — so the
    only gate is authentication.

    The `Idempotency-Key` header is what makes EC-7 true: a retry after a lost
    response replays the created tenant instead of creating a second business.
    """

    permission_classes = [IsAuthenticated]

    @idempotent("tenant_create", keyed_by="user")
    def post(self, request: Any) -> Any:
        serializer = TenantCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        meta = _meta(request)

        membership = onboarding_service.create_tenant(
            user=request.user,
            name=data["name"],
            business_type=data["business_type"],
            state_code=data["state_code"],
            locale=data.get("locale") or "en",
            owner_name=data.get("owner_name") or None,
            request_id=meta["request_id"],
            ip=meta["ip"],
            user_agent=meta["user_agent"],
        )
        # FR-2: "then returns new tokens with `tid`" — the wizard's next step is
        # already tenant-scoped, so the token must be too before it is taken.
        issued = session_service.issue(
            user=request.user,
            tenant=membership.tenant,
            membership=membership,
            user_agent=meta["user_agent"],
            ip=meta["ip"],
        )
        expose = (request.headers.get("X-Client") or "").lower() == "api"
        payload = {
            "tenant": TenantReadSerializer(membership.tenant).data,
            "membership": MembershipReadSerializer(membership).data,
            "session": session_payload.build(
                user=request.user,
                membership=membership,
                access_token=issued.access if expose else None,
                refresh_token=issued.refresh if expose else None,
            ),
        }
        if expose:
            payload["access_token"] = issued.access
        response = StandardResponse.created(payload)
        response["X-Tenant-Id"] = str(membership.tenant_id)
        return self._with_session(response, issued)

    def idempotent_replay(self, request: Any, record: Any, response: Any) -> Any:
        """Give a replayed 201 the side effects the original 201 carried.

        The stored body describes a tenant; the *cookies* are what make that
        tenant usable, and they are set on the response rather than written to a
        row, so replaying the body alone is replaying half the answer. The
        client then holds a 201 for a business it has no `tid` for, and the
        wizard's next step — already tenant-scoped, as `post` says above — is
        refused `no_active_tenant`. That is precisely the wedge EC-7 exists to
        prevent, reached by the retry EC-7 tells the client to make.

        A fresh session is issued rather than a stored one: tokens are not put
        at rest, and the caller retrying is by definition the caller who lost
        the first set. If the membership is gone by now — left, removed, tenant
        deleted — the body still replays and the cookies simply do not, because
        re-issuing a session for a membership that no longer exists would be a
        worse answer than a stale body.
        """
        body = record.response_body or {}
        tenant_id = ((body.get("data") or {}).get("tenant") or {}).get("id")
        membership = active_membership(user=request.user, tenant_id=tenant_id)
        if membership is None:
            return response
        meta = _meta(request)
        issued = session_service.issue(
            user=request.user,
            tenant=membership.tenant,
            membership=membership,
            user_agent=meta["user_agent"],
            ip=meta["ip"],
        )
        response["X-Tenant-Id"] = str(membership.tenant_id)
        return self._with_session(response, issued)

    @staticmethod
    def _with_session(response: Any, issued: Any) -> Any:
        return tokens.set_auth_cookies(
            response, access=issued.access, refresh=issued.refresh, csrf=issued.csrf
        )


class TenantCurrentView(APIView):
    """`GET`/`PATCH /tenants/current` (PLT-03 FR-3…FR-5; Part 22 §22.3).

    The GET is readable by any member — it is what the shell renders the
    business name from. The PATCH requires `platform.tenant.manage`, which
    §12's matrix gives to owner and admin and denies to staff and accountant.
    """

    permission_classes = [IsAuthenticated, TenantManagePermission]

    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        if tenant is None:
            raise NoActiveTenant()
        return StandardResponse.ok(TenantReadSerializer(tenant).data)

    def patch(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        if tenant is None:
            raise NoActiveTenant()
        serializer = TenantUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        meta = _meta(request)

        tenant, warnings = onboarding_service.update_tenant(
            tenant=tenant,
            actor=request.user,
            changes=dict(serializer.validated_data),
            request_id=meta["request_id"],
            ip=meta["ip"],
            user_agent=meta["user_agent"],
        )
        return StandardResponse.ok(TenantReadSerializer(tenant).data, meta={"warnings": warnings})


class MembershipDetailView(APIView):
    """`PATCH`/`DELETE /memberships/{id}` — the self-service half (PLT-04 FR-5, FR-7).

    Managing *other people's* memberships is `PLT-05`. This view refuses any id
    that is not one of the caller's own rows, with 404 rather than 403, because
    a 403 would confirm that somebody else's membership exists.
    """

    permission_classes = [IsAuthenticated]

    def _own(self, request: Any, membership_id: Any) -> Any:
        membership = membership_of_user(user=request.user, membership_id=membership_id)
        if membership is None:
            raise NotFound()
        return membership

    def patch(self, request: Any, membership_id: Any) -> Any:
        membership = self._own(request, membership_id)
        serializer = MembershipPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        membership = membership_service.set_default(
            user=request.user,
            membership=membership,
            request_id=getattr(request, "request_id", None),
        )
        return StandardResponse.ok(MembershipReadSerializer(membership).data)

    def delete(self, request: Any, membership_id: Any) -> Any:
        membership = self._own(request, membership_id)
        meta = _meta(request)
        membership = membership_service.leave(
            user=request.user,
            membership=membership,
            request_id=meta["request_id"],
            ip=meta["ip"],
        )
        return StandardResponse.ok(
            MembershipReadSerializer(membership).data, message="You left this business."
        )


class InvitationAcceptView(APIView):
    """`POST /invitations/{token}/accept` (PLT-05 FR-10; PLT-04 FR-8; PLT-15 FR-3).

    Here because it is the seat-consuming gate `PLT-15` FR-3 names and the
    destination `PLT-04` FR-8 routes an invitation row to. The rest of `PLT-05`
    — inviting, revoking, role changes — is a later sprint.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request: Any, token: str) -> Any:
        serializer = AcceptInvitationSerializer(data={"token": token})
        serializer.is_valid(raise_exception=True)
        meta = _meta(request)
        membership = membership_service.accept_invitation(
            user=request.user,
            token=serializer.validated_data["token"],
            request_id=meta["request_id"],
            ip=meta["ip"],
        )
        return StandardResponse.ok(
            MembershipReadSerializer(membership).data, message="You joined this business."
        )
