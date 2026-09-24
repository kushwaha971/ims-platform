"""The import engine (IMP-01) — upload, validate, commit, cancel.

Everything a kind does NOT own lives here (BR-4): encoding and dialect, the
header, comments and blank lines, within-file duplicates, limits, progress, the
error list and the error file, retention on cancel, the transaction and the
lock. A spec says what the columns mean and how to create rows; adding a kind
changes nothing in this file.

── The two properties the sprint's exit criteria name ───────────────────────
*Committing twice creates no duplicates.* The commit request moves the job
`ready → importing` under `SELECT … FOR UPDATE`, so a second request finds it
`importing` (or `completed`) and is refused 409 `import_not_ready`; the job the
first request enqueued is keyed by an idempotency token, so it cannot be queued
twice; and the handler itself re-checks `importing` before it touches a row, so
a platform job retried after a crash never runs a completed import again.

*A cancelled import leaves no partial data.* Validation writes nothing but the
job row, and cancel is refused once the commit has started — at which point the
commit is ONE `transaction.atomic()` that the database commits whole or rolls
back whole (BR-1). There is no state in which some of a file's rows exist.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import logging
import tempfile
import time
from typing import IO, Any

from django.core.files.base import File
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.utils import timezone

from apps.common.audit import write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, PermissionDenied, ValidationFailed
from apps.common.exports import neutralise
from apps.common.jobs import enqueue
from apps.common.storage import tenant_media_path
from apps.imports import registry
from apps.imports.constants import (
    AUDIT_IMPORT_CANCELLED,
    AUDIT_IMPORT_COMMITTED,
    AUDIT_IMPORT_FAILED,
    AUDIT_IMPORT_REQUESTED,
    AUDIT_IMPORT_VALIDATED,
    CANCELLABLE_STATUSES,
    COMMIT_LOCK_NAMESPACE,
    ERRORS_CAP,
    JOB_COMMIT,
    JOB_VALIDATE,
    MAX_COLUMNS,
    MAX_FILE_BYTES,
    OWNER_JOB,
    OWNER_JOB_ERRORS,
    PREVIEW_ROWS,
    PROGRESS_EVERY,
    STALE_IMPORTING_MINUTES,
    STALE_VALIDATING_MINUTES,
    VALUE_ECHO_MAX,
    WARNINGS_CAP,
    ImportStatus,
)
from apps.imports.models import ImportJob
from apps.imports.services.reader import (
    FileRefused,
    looks_like_text,
    normalise_header,
    open_records,
)

logger = logging.getLogger("ub.imports")

CSV_CONTENT_TYPE = "text/csv"


# ── permissions (BR-10: at upload, and again inside the commit task) ─────────


def member_permissions(*, tenant: Any, user: Any) -> frozenset[str]:
    """The member's effective codenames NOW, through the one resolver."""
    from apps.common.permissions_registry import permissions_for
    from apps.platform_app.models import Membership

    if user is None:
        return frozenset()
    membership = (
        Membership.objects.select_related("role", "tenant")
        .filter(tenant=tenant, user=user, status="active")
        .first()
    )
    return permissions_for(membership) if membership is not None else frozenset()


def modules_open(*, tenant: Any, spec: registry.ImporterSpec) -> bool:
    from apps.platform_app.services.entitlements import effective_modules

    enabled = effective_modules(tenant)
    return all(module in enabled for module in ("import_export", *spec.modules))


def assert_may_write(*, tenant: Any, user: Any, spec: registry.ImporterSpec) -> None:
    held = member_permissions(tenant=tenant, user=user)
    if not all(codename in held for codename in spec.required_permissions):
        raise PermissionDenied("You do not have permission to import this.")


# ── upload (FR-3) ────────────────────────────────────────────────────────────


def _refuse_file(upload: Any) -> None:
    """§10's file-level checks, before a byte is stored."""
    name = (getattr(upload, "name", "") or "").lower()
    if not name.endswith(".csv"):
        raise BusinessRuleViolation(
            "unsupported_file_type",
            "Upload a CSV file — you can save an Excel sheet as CSV.",
            details={"file": ["Upload a CSV file — you can save an Excel sheet as CSV."]},
        )
    size = getattr(upload, "size", None) or 0
    if size > MAX_FILE_BYTES:
        raise BusinessRuleViolation(
            "file_too_large",
            "The file is larger than 5 MB.",
            details={"maximum_bytes": MAX_FILE_BYTES, "bytes": size},
        )
    upload.seek(0)
    head = upload.read(4096)
    upload.seek(0)
    if not head or not looks_like_text(head):
        raise BusinessRuleViolation(
            "unsupported_file_type",
            "This file is not a CSV — save your sheet as CSV UTF-8 and upload it again.",
            details={"file": ["This file is not a CSV."]},
        )


def _sha256(handle: Any) -> str:
    digest = hashlib.sha256()
    handle.seek(0)
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
    handle.seek(0)
    return digest.hexdigest()


def upload(*, ctx: Ctx, kind: str, upload: Any) -> ImportJob:
    """Store the file, create the job, queue validation. The request never parses it.

    The attachment is written FIRST and the job after it (EC-11): a disk that
    fills mid-upload leaves no orphan job row pointing at nothing. The stored
    name is the job's UUID, never the merchant's file name (§19), which is kept
    only as metadata — path traversal through a file name is impossible because
    the name is never part of a path.
    """
    from apps.common.db.fields import uuid7
    from apps.files.constants import AttachmentKind
    from apps.files.models import Attachment

    spec = registry.get(kind or "")
    if spec is None:
        raise ValidationFailed({"kind": ["Choose what to import."]})
    if upload is None:
        raise ValidationFailed({"file": ["Choose a file."]})
    if not modules_open(tenant=ctx.tenant, spec=spec):
        from apps.common.exceptions import ModuleDisabled

        raise ModuleDisabled(details={"modules": list(("import_export", *spec.modules))})
    assert_may_write(tenant=ctx.tenant, user=ctx.actor, spec=spec)
    _refuse_file(upload)

    job_id = uuid7()
    sha = _sha256(upload)
    key = tenant_media_path(ctx.tenant.id, "imports", f"{job_id}.csv")
    stored_key = default_storage.save(key, File(upload))
    original = (getattr(upload, "name", "") or "import.csv")[-255:]
    try:
        with transaction.atomic():
            attachment = Attachment.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor,
                owner_type=OWNER_JOB,
                owner_id=job_id,
                kind=AttachmentKind.IMPORT_FILE,
                storage_key=stored_key,
                original_name=original,
                content_type=CSV_CONTENT_TYPE,
                size_bytes=upload.size,
                sha256=sha,
            )
            job = ImportJob.objects.create(
                id=job_id,
                tenant=ctx.tenant,
                created_by=ctx.actor,
                kind=spec.kind,
                file_attachment=attachment,
                status=ImportStatus.UPLOADED,
            )
            write_audit(
                ctx=ctx,
                action=AUDIT_IMPORT_REQUESTED,
                entity_type="imports_job",
                entity_id=job.id,
                metadata={
                    "job_id": str(job.id),
                    "kind": spec.kind,
                    "file_name": original,
                    "size_bytes": upload.size,
                    "sha256": sha,
                },
            )
            enqueue(
                job_type=JOB_VALIDATE,
                payload={"job_id": str(job.id)},
                tenant=ctx.tenant,
                created_by=ctx.actor,
                idempotency_token=f"{JOB_VALIDATE}:{job.id}",
                request_id=ctx.request_id,
            )
    except Exception:
        default_storage.delete(stored_key)
        raise
    return job


# ── validation (FR-4, FR-5) ──────────────────────────────────────────────────


class _Collector:
    """Counts, the first 500 errors, warnings, the preview — and the error file.

    Every failing row goes to the error CSV (on a temporary file, so 10,000 bad
    rows do not sit in memory), while `errors` keeps the first 500 (§17.8.0).
    """

    def __init__(self, header: list[str]) -> None:
        self.header = header
        self.total = 0
        self.valid = 0
        self.error_rows = 0
        self.errors: list[dict] = []
        self.errors_seen = 0
        self.warnings: list[dict] = []
        self.warning_codes: dict[str, int] = {}
        self.preview: list[dict] = []
        self.codes: dict[str, int] = {}
        self._file: IO[str] | None = None
        self._writer: Any = None

    def _error_writer(self) -> Any:
        if self._writer is None:
            self._file = tempfile.SpooledTemporaryFile(  # noqa: SIM115 — closed in finish()
                max_size=1024 * 1024, mode="w+", encoding="utf-8", newline=""
            )
            self._file.write("\ufeff")
            self._writer = csv.writer(self._file, lineterminator="\r\n")
            self._writer.writerow(
                [neutralise(cell) for cell in self.header] + ["_row", "_column", "_problem"]
            )
        return self._writer

    def add_errors(self, number: int, cells: list[str], errors: list[dict]) -> None:
        self.error_rows += 1
        for error in errors:
            self.errors_seen += 1
            self.codes[error["code"]] = self.codes.get(error["code"], 0) + 1
            if len(self.errors) < ERRORS_CAP:
                self.errors.append(error)
        padded = list(cells) + [""] * max(0, len(self.header) - len(cells))
        self._error_writer().writerow(
            [neutralise(cell) for cell in padded[: len(self.header)]]
            + [
                number,
                "; ".join(dict.fromkeys(e["column"] for e in errors)),
                neutralise("; ".join(e["message"] for e in errors)),
            ]
        )

    def add_warning(self, warning: dict) -> None:
        count = self.warning_codes.get(warning["code"], 0)
        self.warning_codes[warning["code"]] = count + 1
        if len(self.warnings) < WARNINGS_CAP:
            self.warnings.append(warning)

    def error_file(self) -> IO[str] | None:
        if self._file is not None:
            self._file.seek(0)
        return self._file


def _echo(value: str | None) -> str:
    text = (value or "").strip()
    return text[:VALUE_ECHO_MAX]


def _bind_header(
    header: list[str], spec: registry.ImporterSpec
) -> tuple[dict[str, int], list[str], list[str]]:
    """`{column: index}`, the missing required columns, and the ignored ones."""
    lookup: dict[str, str] = {}
    for column in spec.columns:
        lookup[normalise_header(column.name)] = column.name
        for alias in column.aliases:
            lookup.setdefault(normalise_header(alias), column.name)
    bound: dict[str, int] = {}
    unknown: list[str] = []
    for index, cell in enumerate(header):
        key = normalise_header(cell)
        name = lookup.get(key)
        if name is None or name in bound:
            if (cell or "").strip():
                unknown.append(cell.strip())
            continue
        bound[name] = index
    missing = [name for name in spec.required_columns if name not in bound]
    return bound, missing, unknown


def _fail(job: ImportJob, *, code: str, message: str, **details: Any) -> None:
    job.status = ImportStatus.FAILED
    job.finished_at = timezone.now()
    job.result = {**(job.result or {}), "error": {"code": code, "message": message, **details}}
    job.save(update_fields=["status", "finished_at", "result", "updated_at"])


def _set_progress(job_id: Any, done: int, total: int | None) -> None:
    """A single-statement UPDATE outside any transaction, so the poller sees it."""
    ImportJob.objects.filter(pk=job_id).update(
        result=_progress_json(done, total), updated_at=timezone.now()
    )


def _progress_json(done: int, total: int | None) -> Any:
    """`result || {"progress": …}` — a merge, so nothing else in the bag is lost."""
    from django.db.models import F, JSONField, Value
    from django.db.models.expressions import CombinedExpression
    from django.db.models.functions import Coalesce

    return CombinedExpression(
        Coalesce(F("result"), Value({}, output_field=JSONField())),
        "||",
        Value({"progress": {"done": done, "total": total}}, output_field=JSONField()),
        output_field=JSONField(),
    )


def _open(job: ImportJob) -> IO[bytes]:
    return default_storage.open(job.file_attachment.storage_key, "rb")


def validate_file(
    *, job: ImportJob, spec: registry.ImporterSpec, collect_rows: bool = False
) -> tuple[_Collector | None, dict, list[tuple[int, dict]]]:
    """Stream the stored file through the spec. Pure: writes nothing but progress.

    Used by BOTH phases (BR-2): validation to report, and the commit to re-read
    what the merchant approved — so the rows committed are the rows checked,
    rule for rule, never a cached copy of them.
    """
    with _open(job) as handle:
        parsed = open_records(handle)
        if len(parsed.header) > MAX_COLUMNS:
            raise FileRefused("too_many_columns", f"The file has more than {MAX_COLUMNS} columns.")
        bound, missing, unknown = _bind_header(parsed.header, spec)
        if missing:
            raise FileRefused(
                "missing_columns",
                f"These columns are missing: {', '.join(missing)}. "
                "The first row must be the column names.",
                columns=missing,
            )
        collector = _Collector(parsed.header)
        if unknown:
            collector.add_warning(
                {
                    "row": parsed.header_row,
                    "column": ", ".join(unknown)[:VALUE_ECHO_MAX],
                    "value": "",
                    "code": "unknown_column",
                    "message": "These columns are not in the template and were ignored.",
                }
            )
        ctx = spec.preflight(job.tenant)
        seen: dict[str, dict[str, int]] = {column: {} for column in spec.unique_columns}
        rows: list[tuple[int, dict]] = []
        extra_warned = False
        for record in parsed.records:
            collector.total += 1
            if collector.total > spec.max_rows:
                raise FileRefused(
                    "too_many_rows",
                    f"Import at most {spec.max_rows:,} rows at a time — split the file.",
                    maximum=spec.max_rows,
                )
            cells = record.cells
            if len(cells) > len(parsed.header) and not extra_warned:
                extra_warned = True  # EC-7: once per file, not once per row
                collector.add_warning(
                    {
                        "row": record.row,
                        "column": "",
                        "value": "",
                        "code": "unknown_column",
                        "message": "Some rows have more cells than there are columns; the extras were ignored.",
                    }
                )
            row = {
                name: (cells[index] if index < len(cells) else "") for name, index in bound.items()
            }
            outcome = spec.validate_row(ctx, row, record.row)
            errors = [
                {
                    "row": record.row,
                    "column": column,
                    "value": _echo(row.get(column)),
                    "code": code,
                    "message": message,
                }
                for column, code, message in outcome.errors
            ]
            # FR-5 — a repeat is an error on the LATER row, naming the earlier.
            for column in spec.unique_columns:
                raw = (row.get(column) or "").strip()
                if not raw:
                    continue
                key = _unique_key(column, outcome.clean, raw)
                first = seen[column].get(key)
                if first is None:
                    seen[column][key] = record.row
                else:
                    errors.append(
                        {
                            "row": record.row,
                            "column": column,
                            "value": _echo(raw),
                            "code": "duplicate_in_file",
                            "message": f"Repeats row {first}.",
                        }
                    )
            if spec.is_example(row):
                collector.add_warning(
                    {
                        "row": record.row,
                        "column": "name",
                        "value": _echo(row.get("name")),
                        "code": "example_row",
                        "message": "This looks like the template's example row — delete it if it is not yours.",
                    }
                )
            for column, code, message in outcome.warnings:
                collector.add_warning(
                    {
                        "row": record.row,
                        "column": column,
                        "value": _echo(row.get(column)),
                        "code": code,
                        "message": message,
                    }
                )
            if errors:
                collector.add_errors(record.row, cells, errors)
            else:
                collector.valid += 1
                if collect_rows:
                    rows.append((record.row, outcome.clean))
            if len(collector.preview) < PREVIEW_ROWS:
                collector.preview.append(
                    {"row": record.row, "valid": not errors, **outcome.preview}
                )
            if collector.total % PROGRESS_EVERY == 0 and not collect_rows:
                _set_progress(job.pk, collector.total, None)
        if collector.total == 0:
            raise FileRefused("empty_file", "The file has no rows.")
        return collector, ctx, rows


def _unique_key(column: str, clean: dict, raw: str) -> str:
    """Compare the NORMALISED value where the spec produced one (a mobile)."""
    value = clean.get(column)
    return str(value if value else raw).strip().lower()


def run_validation(job_id: Any) -> dict:
    """The `imports.validate` handler's body (FR-4)."""
    job = ImportJob.objects.select_related("tenant", "file_attachment", "created_by").get(pk=job_id)
    if job.status not in (ImportStatus.UPLOADED, ImportStatus.VALIDATING):
        return {"skipped": job.status}  # cancelled meanwhile, or a duplicate run
    spec = registry.get(job.kind)
    if spec is None:
        _fail(job, code="invalid_choice", message="This kind of import is no longer available.")
        return {"failed": "invalid_choice"}
    started = time.monotonic()
    updated = ImportJob.objects.filter(
        pk=job.pk, status__in=(ImportStatus.UPLOADED, ImportStatus.VALIDATING)
    ).update(status=ImportStatus.VALIDATING, started_at=timezone.now(), updated_at=timezone.now())
    if not updated:
        return {"skipped": "raced"}
    try:
        collector, ctx, _rows = validate_file(job=job, spec=spec)
    except FileRefused as refusal:
        job.refresh_from_db()
        if job.status != ImportStatus.VALIDATING:
            return {"skipped": job.status}
        _fail(job, code=refusal.code, message=refusal.message, **refusal.details)
        _audit_system(
            job,
            AUDIT_IMPORT_FAILED,
            {"job_id": str(job.id), "code": refusal.code, "at": "validate"},
        )
        return {"failed": refusal.code}

    error_attachment = _store_error_file(job, collector)
    job.refresh_from_db()
    if job.status != ImportStatus.VALIDATING:
        # Cancelled while the file was being read: the cancel already deleted
        # the upload and must not be overwritten by a late `ready`.
        if error_attachment is not None:
            _delete_attachment(error_attachment)
        return {"skipped": job.status}
    job.status = ImportStatus.READY
    job.total_rows = collector.total
    job.valid_rows = collector.valid
    job.error_rows = collector.error_rows
    job.errors = collector.errors
    job.result = {
        "progress": {"done": collector.total, "total": collector.total},
        "warnings": collector.warnings,
        "warning_counts": collector.warning_codes,
        "errors_total": collector.errors_seen,
        "errors_truncated": collector.errors_seen > len(collector.errors),
        "preview_rows": collector.preview,
        "columns": [column.name for column in spec.columns],
        "header": collector.header,
        "totals": spec.totals(ctx) if spec.totals else {},
        "error_file": bool(error_attachment),
        "duration_ms": int((time.monotonic() - started) * 1000),
    }
    job.save(
        update_fields=[
            "status",
            "total_rows",
            "valid_rows",
            "error_rows",
            "errors",
            "result",
            "updated_at",
        ]
    )
    top = sorted(collector.codes.items(), key=lambda pair: -pair[1])[:5]
    _audit_system(
        job,
        AUDIT_IMPORT_VALIDATED,
        {
            "job_id": str(job.id),
            "total_rows": job.total_rows,
            "valid_rows": job.valid_rows,
            "error_rows": job.error_rows,
            "top_error_codes": [code for code, _count in top],
        },
    )
    return {"total_rows": job.total_rows, "error_rows": job.error_rows}


def _store_error_file(job: ImportJob, collector: _Collector) -> Any:
    from apps.files.constants import AttachmentKind
    from apps.files.models import Attachment

    handle = collector.error_file()
    if handle is None:
        return None
    data = handle.read().encode("utf-8")
    handle.close()
    key = tenant_media_path(job.tenant_id, "imports", f"{job.id}-errors.csv")
    stored = default_storage.save(key, File(io.BytesIO(data)))
    return Attachment.objects.create(
        tenant=job.tenant,
        created_by=job.created_by,
        owner_type=OWNER_JOB_ERRORS,
        owner_id=job.id,
        kind=AttachmentKind.IMPORT_FILE,
        storage_key=stored,
        original_name="errors.csv",
        content_type=CSV_CONTENT_TYPE,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )


def error_attachment(job: ImportJob) -> Any:
    from apps.files.models import Attachment

    return (
        Attachment.objects.filter(
            tenant=job.tenant_id, owner_type=OWNER_JOB_ERRORS, owner_id=job.id
        )
        .order_by("-created_at")
        .first()
    )


def _delete_attachment(attachment: Any) -> None:
    """Soft-delete the row and remove the bytes (FR-7, AC-7)."""
    try:
        default_storage.delete(attachment.storage_key)
    except OSError:  # pragma: no cover - a missing file is already deleted
        logger.warning("imports.file_delete_failed", extra={"attachment_id": str(attachment.id)})
    type(attachment).all_objects.filter(pk=attachment.pk).update(
        deleted_at=timezone.now(), updated_at=timezone.now()
    )


def _audit_system(job: ImportJob, action: str, metadata: dict) -> None:
    """Audit rows the scheduler writes still name the uploader (FR-11, §16)."""
    ctx = Ctx(
        tenant=job.tenant,
        actor=job.created_by,
        actor_type="user",
        audit_meta={"runner": True},
    )
    write_audit(
        ctx=ctx, action=action, entity_type="imports_job", entity_id=job.id, metadata=metadata
    )


# ── commit (FR-6) ────────────────────────────────────────────────────────────


def request_commit(*, ctx: Ctx, job: ImportJob) -> ImportJob:
    """`ready → importing`, then queue the commit. 409s per §10's commit level."""
    spec = registry.get(job.kind)
    if spec is None:
        raise ValidationFailed({"kind": ["This kind of import is no longer available."]})
    assert_may_write(tenant=ctx.tenant, user=ctx.actor, spec=spec)
    with transaction.atomic():
        locked = ImportJob.objects.select_for_update().get(pk=job.pk)
        if locked.status == ImportStatus.FAILED and _is_retryable_failure(locked):
            # AC-4 / Alternate E — a failed commit rolled everything back, so
            # committing again is safe and is what the banner offers.
            locked.status = ImportStatus.READY
        if locked.status != ImportStatus.READY:
            raise BusinessRuleViolation(
                "import_not_ready",
                "This import is not ready to be imported.",
                details={"status": locked.status},
            )
        if locked.error_rows > 0:
            raise BusinessRuleViolation(
                "import_has_errors",
                f"Fix {locked.error_rows} rows first.",
                details={"error_rows": locked.error_rows},
            )
        locked.status = ImportStatus.IMPORTING
        locked.finished_at = None
        result = dict(locked.result or {})
        result.pop("error", None)
        result["progress"] = {"done": 0, "total": locked.valid_rows}
        result["commit_requested_by"] = str(ctx.actor.id) if ctx.actor else None
        # One token per ATTEMPT: a commit that failed and rolled back may be
        # committed again, and `uq_job_idem` counts a succeeded job as live.
        attempt = int(result.get("commit_attempt") or 0) + 1
        result["commit_attempt"] = attempt
        locked.result = result
        locked.save(update_fields=["status", "finished_at", "result", "updated_at"])
        enqueue(
            job_type=JOB_COMMIT,
            payload={
                "job_id": str(locked.id),
                "actor_id": str(ctx.actor.id) if ctx.actor else None,
            },
            tenant=ctx.tenant,
            created_by=ctx.actor,
            idempotency_token=f"{JOB_COMMIT}:{locked.id}:{attempt}",
            request_id=ctx.request_id,
        )
    return locked


def _is_retryable_failure(job: ImportJob) -> bool:
    """A job that failed AT COMMIT (not at validation) may be committed again."""
    error = (job.result or {}).get("error") or {}
    return bool(error.get("at") == "commit") and job.error_rows == 0 and job.valid_rows > 0


def run_commit(job_id: Any, actor_id: Any) -> dict:
    """The `imports.commit` handler's body: one transaction, one lock (FR-6, FR-13)."""
    from apps.platform_app.constants import TenantStatus
    from apps.platform_app.models import User

    job = ImportJob.objects.select_related("tenant", "file_attachment", "created_by").get(pk=job_id)
    if job.status != ImportStatus.IMPORTING:
        return {"skipped": job.status}
    spec = registry.get(job.kind)
    actor = User.objects.filter(pk=actor_id).first() if actor_id else job.created_by
    request_id = f"import-{job.id}"
    started = time.monotonic()
    try:
        if spec is None:
            raise BusinessRuleViolation(
                "validation_error", "This kind of import is no longer available."
            )
        if job.tenant.status != TenantStatus.ACTIVE:
            raise PermissionDenied("This business cannot import right now.")
        # BR-10 — the runner executes later; a role can change in between.
        assert_may_write(tenant=job.tenant, user=actor, spec=spec)
        service_ctx = Ctx(
            tenant=job.tenant,
            actor=actor,
            actor_type="user",
            request_id=request_id,
            audit_meta={
                "via": "import",
                "import_job_id": str(job.id),
                "batch": True,
                "runner": True,
            },
        )
        with transaction.atomic():
            with connection.cursor() as cursor:
                # FR-13 — a second commit for this tenant waits rather than
                # interleaving; the lock ends with the transaction.
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(%s, hashtext(%s))",
                    [COMMIT_LOCK_NAMESPACE, str(job.tenant_id)],
                )
            collector, ctx, rows = validate_file(job=job, spec=spec, collect_rows=True)
            if collector is None or collector.error_rows:
                # The book changed since the preview (someone added a party with
                # one of these mobiles). Nothing is written; the merchant re-checks.
                raise _Stale(collector.error_rows if collector else 0)
            summary = _commit_rows(spec, ctx, service_ctx, rows)
            write_audit(
                ctx=service_ctx,
                action=AUDIT_IMPORT_COMMITTED,
                entity_type="imports_job",
                entity_id=job.id,
                after={"job_id": str(job.id), "kind": job.kind, "result": summary},
                metadata={"rows": len(rows)},
            )
            job.status = ImportStatus.COMPLETED
            job.finished_at = timezone.now()
            job.result = {
                **(job.result or {}),
                "summary": summary,
                "progress": {"done": len(rows), "total": len(rows)},
                "commit_duration_ms": int((time.monotonic() - started) * 1000),
            }
            job.save(update_fields=["status", "finished_at", "result", "updated_at"])
    except _Stale as stale:
        return _commit_failed(
            job,
            code="import_has_errors",
            message=(
                f"{stale.error_rows} rows no longer pass — something changed in your book "
                "since the check. Nothing was saved; upload the file again."
            ),
            request_id=request_id,
            retryable=False,
        )
    except _RowFailure as failure:
        return _commit_failed(
            job,
            code=failure.code,
            message=f"Row {failure.row}: {failure.message} Nothing was saved.",
            request_id=request_id,
            row=failure.row,
        )
    except FileRefused as refusal:
        return _commit_failed(
            job, code=refusal.code, message=refusal.message, request_id=request_id
        )
    except (PermissionDenied, BusinessRuleViolation) as exc:
        return _commit_failed(
            job,
            code=getattr(exc, "code", "permission_denied"),
            message=str(exc.message),
            request_id=request_id,
        )
    except Exception as exc:
        logger.exception("imports.commit_failed", extra={"job_id": str(job.id)})
        return _commit_failed(
            job,
            code="server_error",
            message=f"The import failed and nothing was saved ({type(exc).__name__}). Try again.",
            request_id=request_id,
        )
    _notify(job, success=True)
    return {"completed": True, **(job.result or {}).get("summary", {})}


class _Stale(Exception):
    def __init__(self, error_rows: int) -> None:
        super().__init__(error_rows)
        self.error_rows = error_rows


class _RowFailure(Exception):
    """A service refused one row inside the commit — the whole batch rolls back."""

    def __init__(self, row: int, code: str, message: str) -> None:
        super().__init__(message)
        self.row = row
        self.code = code
        self.message = message


def _commit_rows(
    spec: registry.ImporterSpec,
    ctx: dict,
    service_ctx: Ctx,
    rows: list[tuple[int, dict]],
) -> dict:
    """Hand the rows to the spec, turning a service refusal into its row number.

    The spec calls `progress(n)` after its n-th row, so when a service raises,
    the row being written is the one after the last reported — which is how
    "Row 400: …" reaches the merchant without the spec knowing about errors.
    """
    from apps.common.exceptions import DomainError

    state = {"done": 0}

    def progress(done: int) -> None:
        state["done"] = done

    try:
        return spec.commit_rows(ctx, service_ctx, rows, progress)
    except DomainError as exc:
        index = min(state["done"], len(rows) - 1) if rows else 0
        row = rows[index][0] if rows else 0
        details = exc.details if isinstance(exc.details, dict) else {}
        first = next(
            (
                value[0]
                for key, value in details.items()
                if key != "field_codes"
                and isinstance(value, list)
                and value
                and isinstance(value[0], str)
            ),
            None,
        )
        message = str(first or exc.message)
        if not message.endswith("."):
            message += "."
        raise _RowFailure(row, getattr(exc, "code", "validation_error"), message) from exc


def _commit_failed(
    job: ImportJob,
    *,
    code: str,
    message: str,
    request_id: str,
    row: int | None = None,
    retryable: bool = True,
) -> dict:
    job.refresh_from_db()
    job.status = ImportStatus.FAILED
    job.finished_at = timezone.now()
    error = {
        "code": code,
        "message": message,
        "request_id": request_id,
        "at": "commit" if retryable else "stale",
    }
    if row is not None:
        error["row"] = row
    job.result = {**(job.result or {}), "error": error}
    job.save(update_fields=["status", "finished_at", "result", "updated_at"])
    _audit_system(
        job, AUDIT_IMPORT_FAILED, {"job_id": str(job.id), "code": code, "message": message}
    )
    _notify(job, success=False)
    return {"failed": code}


def _notify(job: ImportJob, *, success: bool) -> None:
    """EC-13 — best-effort: a notification that fails never touches the import."""
    try:
        from apps.notifications.services.notify import notify

        summary = (job.result or {}).get("summary", {})
        created = next((v for k, v in summary.items() if k.startswith("created_")), 0)
        notify(
            job.tenant,
            "import_done" if success else "import_failed",
            user=job.created_by,
            params={"kind": job.kind, "count": created or 1, "job_id": str(job.id)},
        )
    except Exception:
        logger.warning("imports.notify_failed", extra={"job_id": str(job.id)})


# ── cancel (FR-7) ────────────────────────────────────────────────────────────


def cancel(*, ctx: Ctx, job: ImportJob) -> ImportJob:
    from apps.platform_app.models import Job

    with transaction.atomic():
        locked = (
            ImportJob.objects.select_for_update(of=("self",))
            .select_related("file_attachment")
            .get(pk=job.pk)
        )
        if locked.status == ImportStatus.IMPORTING:
            raise BusinessRuleViolation(
                "import_in_progress",
                "The import has started and cannot be cancelled — it will finish or change nothing.",
            )
        if locked.status not in CANCELLABLE_STATUSES:
            raise BusinessRuleViolation(
                "import_not_ready",
                "This import has already finished.",
                details={"status": locked.status},
            )
        at_status = locked.status
        locked.status = ImportStatus.CANCELLED
        locked.finished_at = timezone.now()
        locked.save(update_fields=["status", "finished_at", "updated_at"])
        Job.objects.filter(
            tenant=locked.tenant,
            job_type=JOB_VALIDATE,
            status="queued",
            payload__job_id=str(locked.id),
        ).update(status="cancelled", finished_at=timezone.now(), updated_at=timezone.now())
        write_audit(
            ctx=ctx,
            action=AUDIT_IMPORT_CANCELLED,
            entity_type="imports_job",
            entity_id=locked.id,
            metadata={"job_id": str(locked.id), "at_status": at_status},
        )
    for attachment in (locked.file_attachment, error_attachment(locked)):
        if attachment is not None:
            _delete_attachment(attachment)
    return locked


# ── stale jobs (FR-12) ───────────────────────────────────────────────────────


def reap_if_stale(job: ImportJob) -> ImportJob:
    """Mark a job stuck in a running state as interrupted, on read.

    `reap_stale_jobs` on every scheduler tick is FR-12's letter; this is its
    effect at the one moment it matters — when somebody looks. The commit is
    one transaction, so an interrupted commit has already been rolled back and
    the merchant may simply commit again.
    """
    limits = {
        ImportStatus.VALIDATING: STALE_VALIDATING_MINUTES,
        ImportStatus.IMPORTING: STALE_IMPORTING_MINUTES,
    }
    minutes = limits.get(job.status)
    if minutes is None or job.updated_at > timezone.now() - dt.timedelta(minutes=minutes):
        return job
    at = "commit" if job.status == ImportStatus.IMPORTING else "validate"
    updated = ImportJob.objects.filter(
        pk=job.pk, status=job.status, updated_at=job.updated_at
    ).update(
        status=ImportStatus.FAILED,
        finished_at=timezone.now(),
        updated_at=timezone.now(),
    )
    if updated:
        job.refresh_from_db()
        job.result = {
            **(job.result or {}),
            "error": {
                "code": "interrupted",
                "message": "The import was interrupted and nothing was saved — import again.",
                "at": at,
            },
        }
        job.save(update_fields=["result", "updated_at"])
    return job


# ── templates (FR-2) ─────────────────────────────────────────────────────────


def template_csv(spec: registry.ImporterSpec) -> str:
    """Header, a `#` line of allowed values, the example rows — BOM and CRLF."""
    buffer = io.StringIO()
    buffer.write("\ufeff")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(spec.column_names)
    writer.writerow(["# " + spec.columns[0].help] + [column.help for column in spec.columns[1:]])
    for example in spec.template_rows:
        writer.writerow([neutralise(example.get(name, "")) for name in spec.column_names])
    return buffer.getvalue()
