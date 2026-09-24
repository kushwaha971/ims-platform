"""`/tenants/current/settings`, `/tenants/current/branding`, `/audit-logs`, `/auth/sessions`.

PLT-06, WLB-01 (with PLT-07's signature), PLT-08 and PLT-09. Thin by
construction (Part 26 §26.7 R7.1): parse, call one service or selector, wrap.
"""

from __future__ import annotations

import csv
import datetime as dt
from typing import Any

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_timezone
from apps.common.exceptions import BusinessRuleViolation, NoActiveTenant, NotFound, ValidationFailed
from apps.common.exports import charge_export_budget, refuse_cross_site
from apps.common.pagination import PagePagination
from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.platform_app import branding as branding_rules
from apps.platform_app.permissions import (
    AuditReadPermission,
    BrandingPermission,
    MembersManagePermission,
    SettingsPermission,
)
from apps.platform_app.selectors import audit as audit_selectors
from apps.platform_app.selectors import devices as device_selectors
from apps.platform_app.selectors.memberships import member_of_tenant
from apps.platform_app.services import branding as branding_service
from apps.platform_app.services import devices as device_service
from apps.platform_app.services import tenant_settings as settings_service


def _tenant(request: Any) -> Any:
    tenant = get_effective_tenant(request)
    if tenant is None:
        raise NoActiveTenant()
    return tenant


# ── PLT-06 ───────────────────────────────────────────────────────────────────


class TenantSettingsView(APIView):
    """`GET`/`PUT /tenants/current/settings` — FR-2, FR-8 (CR-011's ETag)."""

    permission_classes = [IsAuthenticated, SettingsPermission]

    def get(self, request: Any) -> Any:
        payload = settings_service.settings_payload(_tenant(request))
        response = StandardResponse.ok(payload)
        response["ETag"] = payload["etag"]
        return response

    def put(self, request: Any) -> Any:
        tenant = _tenant(request)
        payload = settings_service.save_settings(
            tenant=tenant,
            body=request.data,
            if_match=request.headers.get("If-Match"),
            ctx=Ctx.from_request(request),
        )
        response = StandardResponse.ok(payload, message="Settings saved")
        response["ETag"] = payload["etag"]
        return response


class TenantSettingsDefaultsView(APIView):
    """`GET /tenants/current/settings/defaults` — FR-10's preset values."""

    permission_classes = [IsAuthenticated, SettingsPermission]

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(settings_service.preset_payload(_tenant(request)))


# ── WLB-01 / PLT-07 FR-2 ─────────────────────────────────────────────────────


class BrandingFieldsSerializer(serializers.Serializer):
    """The multipart text half of `PUT /tenants/current/branding`.

    `reset` is a comma list of keys to hand back to the partner or product
    default (FR-9); `remove_logo` / `remove_signature` clear a file.
    """

    primary_hex = serializers.CharField(required=False, allow_blank=True, max_length=7)
    secondary_hex = serializers.CharField(required=False, allow_blank=True, max_length=7)
    app_name = serializers.CharField(required=False, allow_blank=True, max_length=60)
    doc_header = serializers.CharField(required=False, allow_blank=True, max_length=400)
    doc_footer = serializers.CharField(required=False, allow_blank=True, max_length=600)
    remove_logo = serializers.BooleanField(required=False, default=False)
    remove_signature = serializers.BooleanField(required=False, default=False)
    reset = serializers.CharField(required=False, allow_blank=True, default="")


class TenantBrandingView(APIView):
    """`GET`/`PUT /tenants/current/branding` — WLB-01 FR-1…FR-3, FR-9."""

    permission_classes = [IsAuthenticated, BrandingPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(branding_rules.resolve(_tenant(request)))

    def put(self, request: Any) -> Any:
        tenant = _tenant(request)
        serializer = BrandingFieldsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        fields = {
            key: data[key]
            for key in branding_service.TEXT_KEYS
            if key in request.data  # only the keys this request actually carried
        }
        reset = [k.strip() for k in (data.get("reset") or "").split(",") if k.strip()]
        resolved = branding_service.update_branding(
            tenant=tenant,
            ctx=Ctx.from_request(request),
            fields=fields,
            logo=request.FILES.get("logo"),
            signature=request.FILES.get("signature"),
            remove_logo=bool(data.get("remove_logo")),
            remove_signature=bool(data.get("remove_signature")),
            reset=reset,
        )
        return StandardResponse.ok(resolved, message="Branding updated")


# ── PLT-08 ───────────────────────────────────────────────────────────────────


class AuditQuerySerializer(serializers.Serializer):
    """§10: range ≤ 366 days, `action` pattern, `entity_id` UUID, page size ≤ 100."""

    entity_type = serializers.CharField(required=False, max_length=48)
    entity_id = serializers.UUIDField(required=False)
    actor_id = serializers.UUIDField(required=False)
    action = serializers.RegexField(audit_selectors.ACTION_RE, required=False)
    group = serializers.ChoiceField(choices=sorted(audit_selectors.ACTION_GROUPS), required=False)
    q = serializers.CharField(required=False, allow_blank=True, max_length=80)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)
    format = serializers.ChoiceField(choices=["json", "csv"], required=False, default="json")

    def validate(self, attrs: dict) -> dict:
        start, end = attrs.get("date_from"), attrs.get("date_to")
        if start and end:
            if end < start:
                raise serializers.ValidationError({"date_to": ["Choose an end after the start."]})
            if (end - start).days > audit_selectors.MAX_RANGE_DAYS:
                raise serializers.ValidationError({"date_to": ["Choose a range up to 1 year"]})
        return attrs


def _bounds(tenant: Any, data: dict) -> tuple[dt.datetime | None, dt.datetime | None]:
    """Calendar days in the TENANT's timezone (EC-4) → UTC instants."""
    zone = tenant_timezone(tenant)
    starts = ends = None
    if data.get("date_from"):
        starts = dt.datetime.combine(data["date_from"], dt.time.min, tzinfo=zone)
    if data.get("date_to"):
        ends = dt.datetime.combine(data["date_to"] + dt.timedelta(days=1), dt.time.min, tzinfo=zone)
    return starts, ends


class _Echo:
    def write(self, value: str) -> str:
        return value


class AuditLogListView(APIView):
    """`GET /audit-logs` — FR-1, FR-3, FR-7 (sync CSV only).

    `platform.audit.read` (owner, admin, accountant). The IP is shown only to
    owner/admin (§19) — an accountant sees the request id, which is what support
    needs, and not where staff were standing.
    """

    permission_classes = [IsAuthenticated, AuditReadPermission]
    # `PassthroughCsvRenderer` is what lets `?format=csv` reach the handler at
    # all; without it DRF's negotiation answers 404 (see its docstring).
    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def get(self, request: Any) -> Any:
        tenant = _tenant(request)
        query = AuditQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        data = query.validated_data
        starts, ends = _bounds(tenant, data)
        queryset = audit_selectors.audit_rows_for(
            tenant=tenant,
            entity_type=data.get("entity_type"),
            entity_id=data.get("entity_id"),
            actor_id=data.get("actor_id"),
            action=data.get("action"),
            group=data.get("group"),
            q=data.get("q"),
            starts=starts,
            ends=ends,
        )
        membership = getattr(tenant, "_ub_membership", None)
        show_ip = membership is not None and membership.role.code in ("owner", "admin")
        if data.get("format") == "csv":
            return self._csv(request, tenant, queryset, data, show_ip=show_ip)
        paginator = PagePagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        rows = audit_selectors.build_rows(list(page), tenant=tenant, show_ip=show_ip)
        return StandardResponse.paginated(paginator, rows)

    def _csv(self, request: Any, tenant: Any, queryset: Any, data: dict, *, show_ip: bool) -> Any:
        """FR-7's synchronous half. Above 50 000 rows the async job (RPT-08) is
        needed and is not built, so the export is refused with the count rather
        than silently truncated."""
        refuse_cross_site(request)
        charge_export_budget(request, self)
        total = queryset.count()
        if total > audit_selectors.CSV_MAX_ROWS:
            raise BusinessRuleViolation(
                "too_many_rows",
                "Narrow the dates to export fewer than 50,000 rows.",
                details={"count": total, "maximum": audit_selectors.CSV_MAX_ROWS},
            )
        write_audit(
            ctx=Ctx.from_request(request),
            action=AuditAction.AUDIT_EXPORTED,
            entity_type="platform_audit_log",
            metadata={
                "filters": {k: str(v) for k, v in data.items() if k != "format"},
                "row_count": total,
            },
        )
        zone = tenant_timezone(tenant)
        writer = csv.writer(_Echo())

        def _neutral(value: Any) -> str:
            text = "" if value is None else str(value)
            # CSV injection: a cell starting with = + - @ is a formula in Excel.
            return "'" + text if text[:1] in ("=", "+", "-", "@") else text

        def rows() -> Any:
            yield writer.writerow(["When", "Who", "Action", "Entity", "Label", "Changed", "Reason"])
            chunk: list[Any] = []
            for row in queryset.iterator(chunk_size=500):
                chunk.append(row)
                if len(chunk) == 500:
                    yield from _emit(chunk)
                    chunk = []
            if chunk:
                yield from _emit(chunk)

        def _emit(chunk: list[Any]) -> Any:
            for item in audit_selectors.build_rows(chunk, tenant=tenant, show_ip=show_ip):
                when = timezone.localtime(item["created_at"], zone).strftime("%d/%m/%Y %H:%M")
                who = (item["actor"] or {}).get("name") or item["actor_type"]
                yield writer.writerow(
                    [
                        when,
                        _neutral(who),
                        item["action"],
                        item["entity_type"],
                        _neutral(item["entity_label"]),
                        " ".join(item["changed_keys"]),
                        _neutral(item["metadata"].get("reason")),
                    ]
                )

        response = StreamingHttpResponse(rows(), content_type="text/csv; charset=utf-8")
        stamp = timezone.localtime(timezone.now(), zone).strftime("%Y%m%d")
        response["Content-Disposition"] = f'attachment; filename="activity-log-{stamp}.csv"'
        return response


class AuditActorsView(APIView):
    """`GET /audit-logs/actors` — FR-3's "Who" options, removed members included."""

    permission_classes = [IsAuthenticated, AuditReadPermission]

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(audit_selectors.active_actors(tenant=_tenant(request)))


# ── PLT-09 ───────────────────────────────────────────────────────────────────


def _current_sid(request: Any) -> Any:
    return (getattr(request, "auth_claims", {}) or {}).get("sid")


def _meta(request: Any) -> dict:
    return {
        "request_id": getattr(request, "request_id", None),
        "ip": getattr(request, "client_ip", None),
    }


class SessionRenameSerializer(serializers.Serializer):
    device_label = serializers.CharField(min_length=1, max_length=120, trim_whitespace=True)


class SessionListView(APIView):
    """`GET /auth/sessions` — FR-1 (CR-013). Any authenticated user, own sessions."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Any) -> Any:
        sid = _current_sid(request)
        rows = [
            device_selectors.session_row(s, current_session_id=sid)
            for s in device_selectors.live_sessions(user=request.user)
        ]
        return StandardResponse.ok(rows)


class SessionDetailView(APIView):
    """`PATCH`/`DELETE /auth/sessions/{id}` — FR-7 and FR-2.

    404 for a session that is not the caller's (§10): matched inside the user
    filter, so another person's session id is indistinguishable from a made-up
    one.
    """

    permission_classes = [IsAuthenticated]

    def _own(self, request: Any, session_id: Any) -> Any:
        session = device_selectors.own_live_session(user=request.user, session_id=session_id)
        if session is None:
            raise NotFound()
        return session

    def patch(self, request: Any, session_id: Any) -> Any:
        session = self._own(request, session_id)
        serializer = SessionRenameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = device_service.rename(
            session=session,
            actor=request.user,
            label=serializer.validated_data["device_label"],
            **_meta(request),
        )
        return StandardResponse.ok(
            device_selectors.session_row(session, current_session_id=_current_sid(request))
        )

    def delete(self, request: Any, session_id: Any) -> Any:
        session = self._own(request, session_id)
        device_service.revoke_own(
            session=session,
            actor=request.user,
            current_session_id=_current_sid(request),
            **_meta(request),
        )
        return StandardResponse.no_content()


class MemberRevokeSessionsView(APIView):
    """`POST /memberships/{id}/revoke-sessions` — FR-4 (CR-013).

    `platform.members.manage`; 404 for a membership outside the current tenant
    (§10). Revoking yourself is refused — "Log out everywhere" is that button,
    and it is honest about signing THIS device out too.
    """

    permission_classes = [IsAuthenticated, MembersManagePermission]

    def post(self, request: Any, membership_id: Any) -> Any:
        tenant = _tenant(request)
        membership = member_of_tenant(tenant=tenant, membership_id=membership_id)
        if membership is None:
            raise NotFound()
        if membership.user_id == request.user.id:
            raise ValidationFailed({"membership": ["Use Log out everywhere to sign yourself out."]})
        revoked = device_service.revoke_member_sessions(
            membership=membership, ctx=Ctx.from_request(request)
        )
        return StandardResponse.ok({"sessions_revoked": revoked})
