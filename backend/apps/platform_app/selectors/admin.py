"""PLT-14 FR-2/FR-3/FR-4/FR-7 — what the operator console reads. Read-only (D8).

Usage figures are computed on demand with correlated subqueries. FRD §20 plans
nightly cached counters for 100 k tenants; at MVP scale (one deployment, a few
hundred businesses) the subqueries are cheaper than a snapshot table nobody has
built, and CR-LOG records the switch point.
"""

from __future__ import annotations

import datetime as dt
import shutil
import time
import uuid
from typing import Any

from django.apps import apps
from django.conf import settings
from django.db import connection
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.common.constants import JobStatus
from apps.common.jobs import HEARTBEAT_KEY

#: The scheduler ticks at least once a minute; two missed ticks is "red" (AC-5).
HEARTBEAT_STALE_S = 120


def _count_sub(model: Any, **filters: Any) -> Subquery:
    return Subquery(
        model._base_manager.filter(tenant=OuterRef("pk"), **filters)
        .order_by()
        .values("tenant")
        .annotate(n=Count("pk"))
        .values("n")[:1],
        output_field=IntegerField(),
    )


def tenants_queryset(
    *, q: str | None = None, status: str | None = None, partner_id: Any = None, plan_id: Any = None
) -> Any:
    from apps.platform_app.models import AuditLog, Membership, Tenant

    party = apps.get_model("parties", "Party")
    owner_email = Subquery(
        Membership.objects.filter(tenant=OuterRef("pk"), role__code="owner", status="active")
        .order_by("created_at")
        .values("user__email")[:1]
    )
    last_activity = Subquery(
        AuditLog.objects.filter(tenant=OuterRef("pk"))
        .order_by("-created_at")
        .values("created_at")[:1]
    )
    rows = (
        Tenant.objects.select_related("partner", "plan")
        .annotate(
            owner_email=owner_email,
            last_activity_at=last_activity,
            members_count=Coalesce(_count_sub(Membership, status="active"), Value(0)),
            parties_count=Coalesce(_count_sub(party, deleted_at__isnull=True), Value(0)),
        )
        .order_by("-created_at")
    )
    if status:
        rows = rows.filter(status=status)
    if partner_id:
        rows = rows.filter(partner_id=partner_id)
    if plan_id:
        rows = rows.filter(plan_id=plan_id)
    term = (q or "").strip()
    if term:
        match = Q(name__icontains=term) | Q(gstin=term.upper())
        match |= Q(
            pk__in=Membership.objects.filter(role__code="owner", user__email__iexact=term).values(
                "tenant_id"
            )
        )
        try:
            match |= Q(pk=uuid.UUID(term))
        except ValueError:
            pass
        rows = rows.filter(match)
    return rows


def tenant_row(tenant: Any) -> dict:
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "status": tenant.status,
        "business_type": tenant.business_type,
        "gstin": tenant.gstin,
        "partner": {
            "id": str(tenant.partner_id),
            "code": tenant.partner.code,
            "name": tenant.partner.name,
        },
        "plan": {"id": str(tenant.plan_id), "code": tenant.plan.code, "name": tenant.plan.name},
        "owner_email": getattr(tenant, "owner_email", None),
        "created_at": tenant.created_at,
        "last_activity_at": getattr(tenant, "last_activity_at", None),
        "usage": {
            "members": int(getattr(tenant, "members_count", 0) or 0),
            "parties": int(getattr(tenant, "parties_count", 0) or 0),
        },
    }


def support_access_row(access: Any) -> dict | None:
    if access is None:
        return None
    from apps.platform_app.services.support_access import live_session_of

    # The lapse is computed here rather than written: selectors never write (D8),
    # and `support_access.refresh_status` persists it on the next write path.
    status = access.status
    if status in ("requested", "granted") and access.expires_at <= timezone.now():
        status = "expired"
    live = live_session_of(access) if status == "granted" else None
    requester = access.requested_by
    decider = access.decided_by
    return {
        "id": str(access.id),
        "status": status,
        "reason": access.reason,
        "requested_by": (
            {"id": str(requester.id), "name": requester.full_name, "email": requester.email}
            if requester
            else None
        ),
        "requested_at": access.created_at,
        "decided_by": {"id": str(decider.id), "name": decider.full_name} if decider else None,
        "decided_at": access.decided_at,
        "expires_at": access.expires_at,
        "active_session": (
            {"started_at": live.created_at, "expires_at": live.expires_at} if live else None
        ),
    }


def tenant_detail(tenant_id: Any) -> dict | None:
    from apps.platform_app.models import AuditLog, Membership, SupportAccess
    from apps.platform_app.services.entitlements import (
        _overrides_for,
        effective_modules,
        plan_limits_payload,
    )

    tenant = tenants_queryset().filter(pk=tenant_id).first()
    if tenant is None:
        return None
    limits = plan_limits_payload(tenant)
    owners = (
        Membership.objects.filter(tenant=tenant, role__code="owner", status="active")
        .select_related("user")
        .order_by("created_at")
    )
    audit = (
        AuditLog.objects.filter(tenant=tenant).select_related("actor").order_by("-created_at")[:15]
    )
    latest_access = (
        SupportAccess.objects.filter(tenant=tenant)
        .select_related("requested_by", "decided_by")
        .order_by("-created_at")
        .first()
    )
    return {
        **tenant_row(tenant),
        "legal_name": tenant.legal_name,
        "state_code": tenant.state_code,
        "deletion_requested_at": tenant.deletion_requested_at,
        "enabled_modules": sorted(effective_modules(tenant)),
        "entitlements": {
            "plan_code": limits["plan_code"],
            "limits": limits["limits"],
            "overrides": dict(_overrides_for(tenant).get("limits") or {}),
        },
        "owners": [
            {"id": str(m.user_id), "name": m.user.full_name, "email": m.user.email} for m in owners
        ],
        "support_access": support_access_row(latest_access),
        "recent_audit": [
            {
                "id": str(row.id),
                "action": row.action,
                "actor_type": row.actor_type,
                "actor_name": row.actor.full_name if row.actor else None,
                "created_at": row.created_at,
                "metadata": {
                    k: v
                    for k, v in (row.metadata or {}).items()
                    if k not in ("ip", "user_agent", "request_id")
                },
            }
            for row in audit
        ],
    }


def partners() -> list[dict]:
    from apps.platform_app.models import Partner

    rows = (
        Partner.objects.select_related("default_plan")
        .annotate(tenant_count=Count("tenants"))
        .order_by("name")
    )
    return [
        {
            "id": str(p.id),
            "code": p.code,
            "name": p.name,
            "status": p.status,
            "default_plan": (
                {"id": str(p.default_plan_id), "code": p.default_plan.code}
                if p.default_plan
                else None
            ),
            "tenant_count": p.tenant_count,
            "created_at": p.created_at,
        }
        for p in rows
    ]


def plans() -> list[dict]:
    from apps.platform_app.models import Plan

    return [
        {"id": str(p.id), "code": p.code, "name": p.name, "is_active": p.is_active}
        for p in Plan.objects.order_by("code")
    ]


def _job_counts(now: dt.datetime) -> dict:
    from apps.platform_app.models import Job

    since = now - dt.timedelta(hours=24)
    counts = Job.objects.aggregate(
        queued=Count("pk", filter=Q(status=JobStatus.QUEUED)),
        running=Count("pk", filter=Q(status=JobStatus.RUNNING)),
        failed_24h=Count(
            "pk",
            filter=Q(status__in=[JobStatus.DEAD_LETTER, JobStatus.FAILED], updated_at__gte=since),
        ),
    )
    oldest = (
        Job.objects.filter(status=JobStatus.QUEUED, run_after__lte=now)
        .order_by("run_after")
        .values_list("run_after", flat=True)
        .first()
    )
    counts["oldest_queued_s"] = int((now - oldest).total_seconds()) if oldest else None
    return counts


def overview() -> dict:
    from apps.platform_app.models import Partner, Tenant

    by_status = dict(
        Tenant.objects.order_by()
        .values_list("status")
        .annotate(n=Count("pk"))
        .values_list("status", "n")
    )
    return {
        "tenants": {
            "total": sum(by_status.values()),
            "active": by_status.get("active", 0),
            "suspended": by_status.get("suspended", 0),
            "pending_deletion": by_status.get("pending_deletion", 0),
            "deleted": by_status.get("deleted", 0),
        },
        "partners": Partner.objects.count(),
        "jobs": {k: v for k, v in _job_counts(timezone.now()).items() if k != "oldest_queued_s"},
    }


def health() -> dict:
    """FR-7 — the deep, authenticated health view. `/api/healthz` stays shallow."""
    from apps.platform_app.models import Job

    now = timezone.now()
    started = time.monotonic()
    db_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        db_ok = False
    latency_ms = round((time.monotonic() - started) * 1000, 1)

    free_mb = None
    storage_ok = False
    try:
        usage = shutil.disk_usage(settings.MEDIA_ROOT)
        free_mb = int(usage.free // (1024 * 1024))
        storage_ok = free_mb > 512
    except OSError:
        storage_ok = False

    beat = (
        Job.objects.filter(scheduled_key=HEARTBEAT_KEY).values_list("updated_at", flat=True).first()
    )
    lag = int((now - beat).total_seconds()) if beat else None
    return {
        "db": {"ok": db_ok, "latency_ms": latency_ms},
        "storage": {"ok": storage_ok, "free_mb": free_mb},
        "scheduler": {
            "ok": lag is not None and lag <= HEARTBEAT_STALE_S,
            "last_heartbeat_at": beat,
            "lag_s": lag,
        },
        "jobs": _job_counts(now),
        "version": getattr(settings, "UB_VERSION", "dev"),
        "email_backend": str(getattr(settings, "UB_EMAIL_BACKEND", "")).rsplit(".", 1)[-1],
        "checked_at": now,
    }
