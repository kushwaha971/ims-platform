"""PLT-14 — the super-admin console API, `/api/v1/admin/*`.

`IsSuperAdmin` (`platform_user.is_super_admin`) on every view; everyone else is
403. A support token can never reach these (authentication refuses `/admin/*`
under `imp`), except `/admin/impersonation/end`, which is how it leaves.

Every write requires `reason` (≥ 5 characters, FR-10) and is audited with
`actor_type='super_admin'` by the service it calls. Reads are not audited.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.exceptions import BusinessRuleViolation, NotFound
from apps.common.pagination import PagePagination
from apps.common.permissions import IsSuperAdmin
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.platform_app import tokens
from apps.platform_app.selectors import admin as admin_selectors
from apps.platform_app.services import admin_console
from apps.platform_app.services import support_access as support_service


def _meta(request: Any) -> dict:
    return {
        "ip": getattr(request, "client_ip", None),
        "user_agent": (request.META.get("HTTP_USER_AGENT", "") or "")[:255] or None,
        "request_id": getattr(request, "request_id", None),
    }


def _tenant(tenant_id: Any) -> Any:
    from apps.platform_app.models import Tenant

    tenant = Tenant.objects.select_related("plan", "partner").filter(pk=tenant_id).first()
    if tenant is None:
        raise NotFound("No such business.")
    return tenant


class ReasonField(serializers.CharField):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__(min_length=5, max_length=500, **kwargs)


class AdminView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]


class AdminOverviewView(AdminView):
    def get(self, request: Any) -> Any:
        return StandardResponse.ok(admin_selectors.overview())


class TenantListQuery(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True, max_length=120)
    status = serializers.ChoiceField(
        required=False,
        allow_blank=True,
        choices=["active", "suspended", "pending_deletion", "deleted"],
    )
    partner_id = serializers.UUIDField(required=False)
    plan_id = serializers.UUIDField(required=False)


class AdminTenantListView(AdminView):
    """`GET /admin/tenants` (FR-2)."""

    def get(self, request: Any) -> Any:
        query = TenantListQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        rows = admin_selectors.tenants_queryset(**query.validated_data)
        paginator = PagePagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return StandardResponse.paginated(paginator, [admin_selectors.tenant_row(t) for t in page])


class TenantPatchSerializer(serializers.Serializer):
    reason = ReasonField()
    plan_id = serializers.UUIDField(required=False)
    status = serializers.ChoiceField(required=False, choices=["active", "suspended"])
    entitlement_overrides = serializers.DictField(required=False, allow_empty=True)


class AdminTenantDetailView(AdminView):
    """`GET/PATCH /admin/tenants/{id}` (FR-3)."""

    def get(self, request: Any, tenant_id: Any) -> Any:
        detail = admin_selectors.tenant_detail(tenant_id)
        if detail is None:
            raise NotFound("No such business.")
        return StandardResponse.ok(detail)

    def patch(self, request: Any, tenant_id: Any) -> Any:
        serializer = TenantPatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        admin_console.update_tenant(
            admin=request.user,
            tenant=_tenant(tenant_id),
            reason=data["reason"],
            plan_id=data.get("plan_id"),
            status=data.get("status"),
            entitlement_overrides=data.get("entitlement_overrides"),
            meta=_meta(request),
        )
        return StandardResponse.ok(admin_selectors.tenant_detail(tenant_id))


class AdminPartnerListView(AdminView):
    def get(self, request: Any) -> Any:
        return StandardResponse.ok(admin_selectors.partners())


class AdminPlanListView(AdminView):
    def get(self, request: Any) -> Any:
        return StandardResponse.ok(admin_selectors.plans())


class AdminHealthView(AdminView):
    """`GET /admin/health` (FR-7) — deep and authenticated."""

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(admin_selectors.health())


class ReasonSerializer(serializers.Serializer):
    reason = ReasonField()


class AdminAccessRequestView(AdminView):
    """`POST /admin/tenants/{id}/access-requests` (FR-6)."""

    def post(self, request: Any, tenant_id: Any) -> Any:
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        access = support_service.request_access(
            admin=request.user,
            tenant=_tenant(tenant_id),
            reason=serializer.validated_data["reason"],
            meta=_meta(request),
        )
        return StandardResponse.created(admin_selectors.support_access_row(access))


class ImpersonateSerializer(serializers.Serializer):
    reason = ReasonField()
    consent_id = serializers.UUIDField()


def impersonation_info(session: Any, tenant: Any) -> dict:
    return {
        "id": str(session.id),
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "admin_name": session.admin.full_name,
        "started_at": session.created_at,
        "expires_at": session.expires_at,
    }


class AdminImpersonateView(AdminView):
    """`POST /admin/tenants/{id}/impersonate` (FR-5) — sets a 60-minute support cookie."""

    def post(self, request: Any, tenant_id: Any) -> Any:
        serializer = ImpersonateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        claims = getattr(request, "auth_claims", {}) or {}
        tenant = _tenant(tenant_id)
        session, token = support_service.start(
            admin=request.user,
            admin_session_id=claims.get("sid"),
            tenant=tenant,
            consent_id=serializer.validated_data["consent_id"],
            reason=serializer.validated_data["reason"],
            meta=_meta(request),
        )
        response = StandardResponse.ok(impersonation_info(session, tenant))
        seconds = (session.expires_at - session.created_at).total_seconds()
        return tokens.set_access_cookie(response, access=token, max_age=int(seconds))


class AdminImpersonationEndView(APIView):
    """`POST /admin/impersonation/end` — leave; the cookie becomes the operator's own again.

    Reachable only WITH a support token (it is the one console route the scope
    guard lets through), so its permission is "is in a support session", which
    implies super admin.
    """

    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def post(self, request: Any) -> Any:
        from django.conf import settings

        from apps.platform_app.selectors.memberships import active_membership
        from apps.platform_app.services.sessions import session_for_claims

        claims = getattr(request, "auth_claims", {}) or {}
        tenant = get_effective_tenant(request)
        session = getattr(tenant, "_ub_impersonation", None) if tenant else None
        if not claims.get("imp") or session is None:
            raise BusinessRuleViolation("precondition_failed", "You are not in a support session.")
        support_service.end(session=session, reason="ended", meta=_meta(request))

        own = session_for_claims(user=request.user, claims=claims)
        response = StandardResponse.ok({"ended": True, "tenant_id": str(session.tenant_id)})
        if own is None:
            return tokens.clear_auth_cookies(response)
        membership = (
            active_membership(user=request.user, tenant_id=own.tenant_id) if own.tenant_id else None
        )
        access = tokens.mint_access(
            user=request.user,
            session_id=own.id,
            tenant_id=own.tenant_id if membership is not None else None,
            role_code=membership.role.code if membership is not None else None,
            permissions_version=membership.permissions_version if membership else None,
        )
        return tokens.set_access_cookie(
            response, access=access, max_age=settings.UB_ACCESS_TOKEN_MINUTES * 60
        )
