"""PLT-10 FR-3…FR-6 — deleting a business, with a 30-day change of mind.

── Re-verification is the PASSWORD, not an OTP ──────────────────────────────
The FRD asks for "a fresh OTP (`purpose='verify'`)". DEC-010 removed the OTP
identity and CLAUDE.md is explicit that anything still naming OTP is stale; the
credential this product actually has is the password, so the owner types it
again. Checked with `passwords._verify`, which spends exactly one hash whatever
the outcome (the same timing discipline as login). A wrong password is a 400
on the `password` field and never a 401 — a 401 would make the client's
refresh interceptor treat a typo as an expired session. CR-LOG carries it.

── The export gate (FRD §10, EC-3) ─────────────────────────────────────────
"A fresh export exists": a succeeded, unexpired export that finished AFTER the
business last changed. "Changed" is read from the audit log, which every state
change writes through the service layer (canon §0.11 rule 4) — its newest row
that is not itself about exporting, deleting, signing in or support access. So
an entry posted after the export fails the gate, exactly as EC-3 says.

── The cool-off ───────────────────────────────────────────────────────────
`deletion_requested_at + 30 days`, and the daily run executes on the first run
after it (BR-1). During it the tenant is read-only (authentication refuses every
write except export, cancel and auth — see `common.authentication`).

── Execution (FR-5) ───────────────────────────────────────────────────────
A final export first (BR-4: the merchant's retention copy), then every table in
`apps.common.tenant_data.deletion_order()` — children before parents, each in
its own transaction, append-only triggers disabled by name inside that
transaction only. Progress is recorded per table in the job's payload, so a
killed run resumes where it stopped. The tenant row stays as a tombstone with
its personal data blanked and `status='deleted'`, which frees the GSTIN (the
unique constraint excludes deleted rows).
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any

from django.db import connection, transaction
from django.utils import timezone

from apps.common.audit import write_audit
from apps.common.constants import JobStatus
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, PermanentJobError, ValidationFailed
from apps.platform_app.constants import TenantStatus

logger = logging.getLogger("ub.platform.deletion")

COOL_OFF = dt.timedelta(days=30)
JOB_TYPE = "platform.delete_tenant"
DELETED_NAME = "Deleted business"
CHUNK = 10_000

ACTION_REQUESTED = "tenant.deletion_requested"
ACTION_CANCELLED = "tenant.deletion_cancelled"
ACTION_DELETED = "tenant.deleted"

#: Audit actions that are not "the business changed" for the export gate.
_NOT_A_CHANGE_PREFIXES = (
    "tenant.export_",
    "tenant.deletion_",
    "tenant.support_access_",
    "auth.",
    "admin.",
)


def scheduled_for(tenant: Any) -> dt.datetime | None:
    if tenant.status != TenantStatus.PENDING_DELETION or tenant.deletion_requested_at is None:
        return None
    return tenant.deletion_requested_at + COOL_OFF


def last_change_at(tenant: Any) -> dt.datetime | None:
    from django.db.models import Q

    from apps.platform_app.models import AuditLog

    noise = Q()
    for prefix in _NOT_A_CHANGE_PREFIXES:
        noise |= Q(action__startswith=prefix)
    row = (
        AuditLog.objects.filter(tenant=tenant)
        .exclude(noise)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    )
    return row


def latest_export(tenant: Any) -> Any:
    from apps.platform_app.services.tenant_export import recent_exports

    rows = recent_exports(tenant=tenant, limit=1)
    return rows[0] if rows else None


def export_is_fresh(tenant: Any) -> bool:
    """FRD §10's gate: a downloadable export newer than the last change."""
    from apps.platform_app.services.tenant_export import export_status, recent_exports

    changed = last_change_at(tenant)
    for job in recent_exports(tenant=tenant, limit=5):
        if export_status(job) != "succeeded" or job.finished_at is None:
            continue
        if changed is None or job.finished_at >= changed:
            return True
    return False


def request_deletion(
    *, ctx: Ctx, password: str, confirm_name: str, reason: str | None = None
) -> Any:
    """FR-3. Owner only (the view checks the role), password re-verified here."""
    from apps.platform_app.models import Membership, Session, Tenant
    from apps.platform_app.services.passwords import _verify

    user = ctx.actor
    errors: dict[str, list[str]] = {}
    if not _verify(user=user, password=password or ""):
        errors["password"] = ["Password is incorrect."]
    tenant = Tenant.objects.get(pk=ctx.tenant.pk)
    if (confirm_name or "").strip().casefold() != (tenant.name or "").strip().casefold():
        errors["confirm_name"] = ["Name does not match."]
    if errors:
        raise ValidationFailed(errors)

    with transaction.atomic():
        tenant = Tenant.objects.select_for_update().get(pk=ctx.tenant.pk)
        if tenant.status == TenantStatus.PENDING_DELETION:
            raise BusinessRuleViolation(
                "tenant_pending_deletion", "Deletion has already been requested."
            )
        if tenant.status != TenantStatus.ACTIVE:
            raise BusinessRuleViolation("precondition_failed", "This business cannot be deleted.")
        if not export_is_fresh(tenant):
            raise BusinessRuleViolation(
                "export_required", "Download your data before deleting the business."
            )
        now = timezone.now()
        tenant.status = TenantStatus.PENDING_DELETION
        tenant.deletion_requested_at = now
        tenant.save(update_fields=["status", "deletion_requested_at", "updated_at"])

        # FR-3: every non-owner session in this business is revoked now — staff
        # cannot write anyway, and the request is exactly when a disgruntled
        # member with a live token matters.
        owner_ids = Membership.objects.filter(
            tenant=tenant, role__code="owner", status="active"
        ).values_list("user_id", flat=True)
        revoked = (
            Session.objects.filter(tenant=tenant, revoked_at__isnull=True)
            .exclude(user_id__in=list(owner_ids))
            .update(revoked_at=now)
        )
        write_audit(
            ctx=ctx,
            action=ACTION_REQUESTED,
            entity_type="platform_tenant",
            entity_id=tenant.id,
            metadata={
                "reason": (reason or "")[:500],
                "scheduled_for": (now + COOL_OFF).isoformat(),
                "sessions_revoked": revoked,
                "reverification": "password",
            },
        )
        _notify(
            tenant,
            "deletion_requested",
            {"actor": user.full_name, "date": (now + COOL_OFF).date().isoformat()},
        )
    return tenant


def cancel_deletion(*, ctx: Ctx) -> Any:
    from apps.platform_app.models import Tenant

    with transaction.atomic():
        tenant = Tenant.objects.select_for_update().get(pk=ctx.tenant.pk)
        if tenant.status != TenantStatus.PENDING_DELETION:
            raise BusinessRuleViolation(
                "precondition_failed", "This business is not scheduled for deletion."
            )
        requested = tenant.deletion_requested_at
        tenant.status = TenantStatus.ACTIVE
        tenant.deletion_requested_at = None
        tenant.save(update_fields=["status", "deletion_requested_at", "updated_at"])
        days = (timezone.now() - requested).days if requested else None
        write_audit(
            ctx=ctx,
            action=ACTION_CANCELLED,
            entity_type="platform_tenant",
            entity_id=tenant.id,
            metadata={"days_elapsed": days},
        )
        _notify(tenant, "deletion_cancelled", {"actor": ctx.actor.full_name if ctx.actor else ""})
    return tenant


def _notify(tenant: Any, code: str, params: dict) -> None:
    from apps.notifications.services.notify import notify

    notify(tenant, code, params=params)


# ── Execution ─────────────────────────────────────────────────────────────────


def due_tenants(now: dt.datetime | None = None) -> Any:
    from apps.platform_app.models import Tenant

    now = now or timezone.now()
    return Tenant.objects.filter(
        status=TenantStatus.PENDING_DELETION, deletion_requested_at__lte=now - COOL_OFF
    )


def enqueue_due(now: dt.datetime | None = None) -> int:
    """The daily selection (BR-1): one deletion job per due tenant, deduplicated."""
    from apps.common.jobs import enqueue

    count = 0
    for tenant in due_tenants(now).iterator():
        job = enqueue(
            job_type=JOB_TYPE,
            payload={"progress": {}},
            tenant=tenant,
            max_attempts=5,
            idempotency_token=f"delete:{tenant.id}",
        )
        count += 1 if job is not None else 0
    return count


def plan(tenant: Any) -> list[dict]:
    """The dry run TSK-PLT-10-04 asks for: every table, in order, with its row count."""
    from apps.common.tenant_data import deletion_order

    return [
        {
            "table": t.model,
            "rows": t.queryset(tenant).count(),
            "action": "custom" if t.purge else "delete",
            "triggers": list(t.triggers),
        }
        for t in deletion_order()
    ]


def _default_purge(table: Any, tenant: Any) -> int:
    """Chunked raw DELETE of one tenant's rows of one table.

    `_raw_delete` because the ORM's collector would load every row to emulate
    `on_delete` in Python — a million-row ledger through memory — and the order
    already guarantees nothing still points at these rows. Chunks run inside one
    transaction so a self-referencing table (reversals, category parents) never
    commits with a dangling half.
    """
    model = table.model_class()
    total = 0
    while True:
        ids = list(table.queryset(tenant).values_list("pk", flat=True)[:CHUNK])
        if not ids:
            return total
        doomed = model._base_manager.filter(pk__in=ids)
        total += int(doomed._raw_delete(doomed.db) or 0)


def _purge_table(table: Any, tenant: Any) -> int:
    model = table.model_class()
    db_table = connection.ops.quote_name(model._meta.db_table)
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout = '300s'")
            if table.triggers:
                # PostgreSQL refuses ALTER TABLE while deferred FK checks are
                # pending on it, so they are fired first (every child is already
                # gone, so they pass), then deferred again for the chunked
                # deletes, where a self-reference may span two chunks.
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            for trigger in table.triggers:
                # The ONE place a DELETE on an append-only table is permitted
                # (ledger migration 0002). ALTER TABLE is transactional: a
                # rollback re-enables the trigger with everything else.
                cursor.execute(
                    f"ALTER TABLE {db_table} DISABLE TRIGGER {connection.ops.quote_name(trigger)}"
                )
        if table.purge is not None:
            count = table.purge(tenant, table.queryset(tenant))
        else:
            count = _default_purge(table, tenant)
        if table.triggers:
            with connection.cursor() as cursor:
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")
                for trigger in table.triggers:
                    cursor.execute(
                        f"ALTER TABLE {db_table} ENABLE TRIGGER "
                        f"{connection.ops.quote_name(trigger)}"
                    )
    return count


def execute_deletion(*, job: Any) -> dict:
    """FR-5. Resumable: `job.payload['progress']` records every finished table."""
    from apps.common.tenant_data import deletion_order, unregistered_tenant_models
    from apps.platform_app.models import Job, Tenant
    from apps.platform_app.services.tenant_export import JOB_TYPE as EXPORT_JOB

    tenant = Tenant.objects.get(pk=job.tenant_id)
    if tenant.status == TenantStatus.DELETED:
        return {"already_deleted": True}
    if tenant.status != TenantStatus.PENDING_DELETION:
        raise PermanentJobError("tenant is no longer pending deletion (cancelled?)")
    due = scheduled_for(tenant)
    if due is None or due > timezone.now():
        raise PermanentJobError("cool-off has not elapsed")
    missing = unregistered_tenant_models()
    if missing:
        # Fail closed BEFORE anything is removed: a table nobody declared would
        # either stop the job half-way on a RESTRICT or keep this tenant's rows.
        raise PermanentJobError(f"unregistered tenant tables: {', '.join(missing)}")

    payload = dict(job.payload or {})
    progress: dict[str, int] = dict(payload.get("progress") or {})

    # BR-4 — the retention copy, made once, before anything is gone.
    if not payload.get("final_export_id"):
        from apps.platform_app.services.tenant_export import build_export

        export = Job.objects.create(
            tenant=tenant,
            job_type=EXPORT_JOB,
            payload={"final": True},
            status=JobStatus.RUNNING,
            run_after=timezone.now(),
            started_at=timezone.now(),
            max_attempts=1,
        )
        result = build_export(job=export)
        Job.objects.filter(pk=export.pk).update(
            status=JobStatus.SUCCEEDED, result=result, finished_at=timezone.now()
        )
        payload["final_export_id"] = str(export.pk)
        Job.objects.filter(pk=job.pk).update(payload=payload)

    for table in deletion_order():
        if table.model in progress:
            continue
        progress[table.model] = _purge_table(table, tenant)
        payload["progress"] = progress
        Job.objects.filter(pk=job.pk).update(payload=payload)

    with transaction.atomic():
        tenant = Tenant.objects.select_for_update().get(pk=tenant.pk)
        tenant.name = DELETED_NAME
        tenant.legal_name = None
        tenant.gstin = None
        tenant.pan = None
        tenant.address = {}
        tenant.phone = ""
        tenant.email = None
        tenant.branding = {}
        tenant.bank_details = {}
        tenant.upi_vpa = None
        tenant.status = TenantStatus.DELETED
        tenant.save()
        # The one audit row that survives un-anonymised: counts only, system actor.
        write_audit(
            ctx=Ctx.system(tenant),
            action=ACTION_DELETED,
            entity_type="platform_tenant",
            entity_id=tenant.id,
            metadata={"counts": progress, "final_export_id": payload.get("final_export_id")},
        )
    logger.info("tenant.deleted", extra={"tenant_id": str(tenant.id), "tables": len(progress)})
    return {"counts": progress, "final_export_id": payload.get("final_export_id")}
