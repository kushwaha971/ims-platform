"""PLT-10 FR-1/FR-2 — the full-tenant export: every table a business owns, as CSVs in a ZIP.

── Where an export lives ─────────────────────────────────────────────────────
There is no `reports_export` table yet (RPT-08 is unbuilt), so an export IS its
`platform_job` row: `job_type='platform.tenant_export'`, and the job's `result`
carries the storage key, the per-file row counts, the size and `expires_at`.
The ZIP sits under `MEDIA_ROOT/<tenant>/exports/…` with an unguessable name; the
only way out is the owner-only download endpoint, which matches the id inside
the caller's tenant. When RPT-08 lands, the row moves and the endpoints do not.

── What is in it ────────────────────────────────────────────────────────────
`tenant.csv`, `settings.json`, one CSV per table registered in
`apps.common.tenant_data` with an `export_name` (so a new app's tables join the
bundle by registering, not by editing this file), `attachments/` with the
stored logo, signature and bill photos, and `README.txt` naming every file and
its columns. Streaming: rows are read with `.iterator(chunk_size=5000)` and
written straight into a temporary ZIP, so memory does not grow with the book.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import logging
import tempfile
import zipfile
from collections.abc import Iterable
from typing import Any

from django.core.files import File
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from apps.common.audit import write_audit
from apps.common.constants import PRIORITY_INTERACTIVE, JobStatus
from apps.common.context import Ctx
from apps.common.csv_cells import cell
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied
from apps.common.storage import tenant_media_path

logger = logging.getLogger("ub.platform.export")

JOB_TYPE = "platform.tenant_export"
EXPORT_TTL = dt.timedelta(days=7)
#: BR-4 — the final export made by the deletion job is the merchant's retention
#: copy, kept thirty days after the business is gone.
FINAL_EXPORT_TTL = dt.timedelta(days=30)
DAILY_LIMIT = 3
BATCH = 5000

#: Columns of the tenant row that are the business's own data. `branding` and
#: `bank_details` are JSON and go in whole; nothing here is a secret.
TENANT_COLUMNS = (
    "id",
    "name",
    "legal_name",
    "business_type",
    "gst_type",
    "gstin",
    "pan",
    "state_code",
    "address",
    "phone",
    "email",
    "currency",
    "timezone",
    "locale",
    "fy_start_month",
    "enabled_modules",
    "branding",
    "bank_details",
    "upi_vpa",
    "status",
    "created_at",
)

ACTION_REQUESTED = "tenant.export_requested"
ACTION_COMPLETED = "tenant.export_completed"


def assert_owner(tenant: Any, membership: Any) -> None:
    """FRD §12: export and deletion are OWNER only — a role check, not a codename.

    `platform.tenant.manage` is held by admins too, and admins must not be able
    to take the whole book away or delete the business.
    """
    role = getattr(getattr(membership, "role", None), "code", None)
    if membership is None or role != "owner" or membership.tenant_id != tenant.id:
        raise PermissionDenied("Only the business owner can do this.")


def _exports(tenant: Any) -> Any:
    from apps.platform_app.models import Job

    return Job.objects.filter(tenant=tenant, job_type=JOB_TYPE).order_by("-created_at")


def request_export(*, ctx: Ctx, final: bool = False) -> Any:
    """Queue an export (202). An export already in flight is returned, not doubled.

    Three a day per tenant (FRD §10) — the deletion job's own final export is
    exempt, because refusing it would block a deletion the owner asked for.
    """
    from apps.common.jobs import enqueue

    tenant = ctx.tenant
    with transaction.atomic():
        live = _exports(tenant).filter(status__in=[JobStatus.QUEUED, JobStatus.RUNNING]).first()
        if live is not None:
            return live
        if not final:
            since = timezone.now() - dt.timedelta(days=1)
            recent = _exports(tenant).filter(created_at__gte=since, payload__final=False).count()
            if recent >= DAILY_LIMIT:
                raise BusinessRuleViolation(
                    "rate_limited",
                    "You can download your data three times a day. Try again tomorrow.",
                    details={"limit": DAILY_LIMIT},
                )
        job = enqueue(
            job_type=JOB_TYPE,
            payload={"final": bool(final)},
            tenant=tenant,
            priority=PRIORITY_INTERACTIVE,
            max_attempts=3,  # EC-4: retried up to three times, then failed
            created_by=ctx.actor,
            request_id=ctx.request_id,
        )
        write_audit(
            ctx=ctx,
            action=ACTION_REQUESTED,
            entity_type="platform_job",
            entity_id=job.id,
            metadata={"final": bool(final)},
        )
    return job


def get_export(*, tenant: Any, export_id: Any) -> Any:
    """One export of THIS tenant, or None — another tenant's id is a 404, not a 403."""
    return _exports(tenant).filter(pk=export_id).select_related("created_by").first()


def recent_exports(*, tenant: Any, limit: int = 5) -> list[Any]:
    return list(_exports(tenant).select_related("created_by")[:limit])


def export_status(job: Any, *, now: dt.datetime | None = None) -> str:
    """`queued | running | succeeded | failed | expired` — the client's vocabulary."""
    now = now or timezone.now()
    if job.status in (JobStatus.QUEUED,):
        # A retry after a failed attempt is queued again; to the owner it is still going.
        return "queued" if not job.attempts else "running"
    if job.status == JobStatus.RUNNING:
        return "running"
    if job.status == JobStatus.SUCCEEDED:
        result = job.result or {}
        expires = _parse(result.get("expires_at"))
        if result.get("expired") or (expires is not None and expires <= now):
            return "expired"
        return "succeeded"
    return "failed"


def download_key(job: Any) -> str | None:
    """The storage key of a downloadable export, or None (not ready, failed, expired)."""
    if export_status(job) != "succeeded":
        return None
    return (job.result or {}).get("storage_key")


def _parse(value: Any) -> dt.datetime | None:
    if not value:
        return None
    if isinstance(value, dt.datetime):
        return value
    try:
        return dt.datetime.fromisoformat(str(value))
    except ValueError:
        return None


# ── Building the ZIP (the job handler's body) ────────────────────────────────


def _field_names(model: Any, exclude: Iterable[str]) -> list[str]:
    skipped = set(exclude)
    return [f.attname for f in model._meta.concrete_fields if f.attname not in skipped]


def _write_csv(zf: zipfile.ZipFile, name: str, header: list[str], rows: Iterable[Any]) -> int:
    count = 0
    with zf.open(name, "w") as raw:
        # utf-8-sig: Excel on Windows reads a BOM-less UTF-8 CSV as ANSI and
        # turns every Hindi customer name into mojibake.
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        writer = csv.writer(text)
        writer.writerow(header)
        for row in rows:
            writer.writerow([cell(v) for v in row])
            count += 1
        text.flush()
        text.detach()
    return count


def _readme(files: dict[str, list[str]], tenant: Any, generated_at: dt.datetime) -> str:
    lines = [
        f"{tenant.name} — full data export",
        # CR-2026-09-29-BRAND-A: the merchant's export names the merchant and
        # nothing else. No product name and no domain: this file is handed to
        # an accountant, and a copy of the business's own books is not an
        # advertisement.
        f"Generated {generated_at.isoformat()} for {tenant.name}.",
        "",
        "Every file is UTF-8. Amounts are rupees with two decimals; dates are ISO 8601.",
        "Invoices, bills and ledger entries are records GST law requires you to keep",
        "for 72 months. Keep this file safe: it is your copy.",
        "",
        "Files and their columns:",
    ]
    for name in sorted(files):
        lines.append(f"  {name}: {', '.join(files[name]) if files[name] else '(files)'}")
    lines.append("")
    return "\n".join(lines)


def build_export(*, job: Any) -> dict:
    """Write the ZIP for `job` and return the job's `result`. Idempotent per attempt."""
    from apps.common.tenant_data import export_tables
    from apps.platform_app.models import Tenant, TenantSetting

    tenant = Tenant.objects.get(pk=job.tenant_id)
    generated_at = timezone.now()
    row_counts: dict[str, int] = {}
    columns: dict[str, list[str]] = {}

    with tempfile.TemporaryFile() as handle:
        with zipfile.ZipFile(handle, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            tenant_values = Tenant.objects.filter(pk=tenant.pk).values_list(*TENANT_COLUMNS)
            row_counts["tenant.csv"] = _write_csv(
                zf, "tenant.csv", list(TENANT_COLUMNS), tenant_values
            )
            columns["tenant.csv"] = list(TENANT_COLUMNS)

            settings_doc = {
                row.key: row.value
                for row in TenantSetting.objects.filter(tenant=tenant).order_by("key")
            }
            zf.writestr(
                "settings.json",
                json.dumps(settings_doc, ensure_ascii=False, indent=2, default=str),
            )
            columns["settings.json"] = ["key → value"]

            for table in export_tables():
                name = table.export_name
                assert name is not None
                if table.rows is not None:
                    header, rows = table.rows(tenant)
                else:
                    model = table.model_class()
                    header = _field_names(model, table.exclude_fields)
                    rows = (
                        table.queryset(tenant)
                        .order_by("pk")
                        .values_list(*header)
                        .iterator(chunk_size=BATCH)
                    )
                row_counts[name] = _write_csv(zf, name, header, rows)
                columns[name] = header
                if table.attachments is not None:
                    for arcname, key in table.attachments(tenant):
                        try:
                            with (
                                default_storage.open(key, "rb") as src,
                                zf.open(arcname, "w") as dst,
                            ):
                                for chunk in iter(lambda: src.read(1 << 16), b""):
                                    dst.write(chunk)
                        except OSError:
                            # A row whose bytes are gone is listed in its CSV and
                            # skipped here; one missing logo must not fail the book.
                            logger.warning("export.attachment_missing", extra={"key": key})
                            continue
                        columns.setdefault("attachments/", [])

            zf.writestr("README.txt", _readme(columns, tenant, generated_at))

        size = handle.tell()
        handle.seek(0)
        stamp = generated_at.strftime("%Y%m%d-%H%M")
        key = default_storage.save(
            tenant_media_path(tenant.id, "exports", f"export-{stamp}.zip"), File(handle)
        )

    ttl = FINAL_EXPORT_TTL if (job.payload or {}).get("final") else EXPORT_TTL
    expires_at = generated_at + ttl
    result = {
        "storage_key": key,
        "size_bytes": size,
        "row_counts": row_counts,
        "expires_at": expires_at.isoformat(),
        "generated_at": generated_at.isoformat(),
    }
    ctx = Ctx.system(tenant, request_id=(job.payload or {}).get("_request_id"))
    with transaction.atomic():
        write_audit(
            ctx=ctx,
            action=ACTION_COMPLETED,
            entity_type="platform_job",
            entity_id=job.id,
            metadata={"row_counts": row_counts, "size_bytes": size},
        )
        _notify_ready(tenant)
    return result


def _notify_ready(tenant: Any) -> None:
    from apps.notifications.services.notify import notify

    notify(tenant, "data_export_ready", params={})


def expire_exports(*, now: dt.datetime | None = None) -> int:
    """Delete the bytes of every export past `expires_at` and mark the row expired."""
    from apps.platform_app.models import Job

    now = now or timezone.now()
    expired = 0
    rows = Job.objects.filter(job_type=JOB_TYPE, status=JobStatus.SUCCEEDED).exclude(
        result__has_key="expired"
    )
    for job in rows.iterator(chunk_size=500):
        result = dict(job.result or {})
        expires = _parse(result.get("expires_at"))
        if expires is None or expires > now:
            continue
        key = result.get("storage_key")
        if key:
            try:
                default_storage.delete(key)
            except OSError:
                pass
        result["expired"] = True
        Job.objects.filter(pk=job.pk).update(result=result, updated_at=now)
        expired += 1
    return expired
