"""PLT-10 — "Your data": the full export, the deletion request, and support consent.

Every endpoint here is OWNER only, by role (FRD §12). Admins hold
`platform.tenant.manage` too, which is exactly why no permission codename is
used: an admin must not be able to take the whole book away, delete the
business, or let an operator in.
"""

from __future__ import annotations

from typing import Any

from django.core.files.storage import default_storage
from django.http import FileResponse
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.exceptions import NoActiveTenant, NotFound
from apps.common.exports import refuse_cross_site
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.common.throttling import ScopedUserRateThrottle
from apps.platform_app.selectors.admin import support_access_row
from apps.platform_app.services import support_access as support_service
from apps.platform_app.services import tenant_delete as delete_service
from apps.platform_app.services import tenant_export as export_service


def _owner_tenant(request: Any) -> Any:
    tenant = get_effective_tenant(request)
    if tenant is None:
        raise NoActiveTenant()
    export_service.assert_owner(tenant, getattr(tenant, "_ub_membership", None))
    return tenant


def export_row(job: Any) -> dict:
    status = export_service.export_status(job)
    result = job.result or {}
    requester = job.created_by
    return {
        "id": str(job.id),
        "status": status,
        "requested_at": job.created_at,
        "finished_at": job.finished_at if status in ("succeeded", "expired", "failed") else None,
        "expires_at": result.get("expires_at") if status in ("succeeded", "expired") else None,
        "size_bytes": result.get("size_bytes") if status == "succeeded" else None,
        "row_counts": result.get("row_counts", {}) if status == "succeeded" else {},
        "download_url": (
            f"/api/v1/tenants/current/exports/{job.id}/download" if status == "succeeded" else None
        ),
        "requested_by": (
            {"id": str(requester.id), "name": requester.full_name} if requester else None
        ),
    }


def deletion_state(tenant: Any) -> dict:
    latest = delete_service.latest_export(tenant)
    return {
        "status": tenant.status,
        "deletion_requested_at": tenant.deletion_requested_at,
        "scheduled_for": delete_service.scheduled_for(tenant),
        "cool_off_days": delete_service.COOL_OFF.days,
        "export_fresh": delete_service.export_is_fresh(tenant),
        "latest_export": export_row(latest) if latest is not None else None,
        "business_name": tenant.name,
    }


class TenantExportView(APIView):
    """`POST /tenants/current/export` → 202 (FR-1)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Any) -> Any:
        _owner_tenant(request)
        job = export_service.request_export(ctx=Ctx.from_request(request))
        return StandardResponse.accepted(export_row(job))


class TenantExportListView(APIView):
    """`GET /tenants/current/exports` — the last five (FRD §7 `ExportHistoryList`)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> Any:
        tenant = _owner_tenant(request)
        return StandardResponse.ok(
            [export_row(job) for job in export_service.recent_exports(tenant=tenant)]
        )


class TenantExportDetailView(APIView):
    """`GET /tenants/current/exports/{id}` — the poll (FR-2)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any, export_id: Any) -> Any:
        tenant = _owner_tenant(request)
        job = export_service.get_export(tenant=tenant, export_id=export_id)
        if job is None:
            raise NotFound("No such export.")
        return StandardResponse.ok(export_row(job))


class TenantExportDownloadView(APIView):
    """`GET /tenants/current/exports/{id}/download` — the ZIP itself.

    Tenant-checked on every request (FRD §19); a cross-site navigation is
    refused for the reason the statement export refuses it (security review
    F-3): a link on a hostile page must not make a signed-in owner's browser
    download their whole book.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request: Any, export_id: Any) -> Any:
        tenant = _owner_tenant(request)
        refuse_cross_site(request)
        job = export_service.get_export(tenant=tenant, export_id=export_id)
        key = export_service.download_key(job) if job is not None else None
        if not key or not default_storage.exists(key):
            raise NotFound("This export has expired. Start a new one.")
        stamp = job.created_at.strftime("%Y-%m-%d")
        response = FileResponse(
            default_storage.open(key, "rb"),
            as_attachment=True,
            filename=f"digikhaato-export-{stamp}.zip",
            content_type="application/zip",
        )
        response["Cache-Control"] = "no-store"
        return response


class DeletionView(APIView):
    """`GET /tenants/current/deletion` — the page's whole state."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(deletion_state(_owner_tenant(request)))


class DeleteRequestSerializer(serializers.Serializer):
    password = serializers.CharField(max_length=256, trim_whitespace=False)
    confirm_name = serializers.CharField(max_length=200)
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True)


class DeleteRequestView(APIView):
    """`POST /tenants/current/delete-request` (FR-3) — password re-verified."""

    permission_classes = [IsAuthenticated]
    # The re-verification budget: a stolen session guessing the owner's password
    # through this endpoint gets ten tries an hour.

    def get_throttles(self) -> list:
        return [ScopedUserRateThrottle("reverify")]

    def post(self, request: Any) -> Any:
        _owner_tenant(request)
        serializer = DeleteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        tenant = delete_service.request_deletion(
            ctx=Ctx.from_request(request),
            password=data["password"],
            confirm_name=data["confirm_name"],
            reason=data.get("reason") or None,
        )
        return StandardResponse.ok(deletion_state(tenant))


class DeleteCancelView(APIView):
    """`POST /tenants/current/delete-cancel` (FR-4)."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Any) -> Any:
        _owner_tenant(request)
        tenant = delete_service.cancel_deletion(ctx=Ctx.from_request(request))
        return StandardResponse.ok(deletion_state(tenant))


# ── Support access, the owner's side (PLT-14 FR-6, CCR-12) ───────────────────


class SupportAccessListView(APIView):
    """`GET /support/access-requests` — this business's recent requests."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> Any:
        tenant = _owner_tenant(request)
        return StandardResponse.ok(
            [support_access_row(row) for row in support_service.accesses_for(tenant)]
        )


class SupportAccessDecisionView(APIView):
    """`POST /support/access-requests/{id}/{allow|deny|revoke}`."""

    permission_classes = [IsAuthenticated]
    decision: str = ""

    def post(self, request: Any, access_id: Any) -> Any:
        _owner_tenant(request)
        action = getattr(support_service, self.decision)
        access = action(ctx=Ctx.from_request(request), access_id=access_id)
        access.refresh_from_db()
        return StandardResponse.ok(support_access_row(access))
