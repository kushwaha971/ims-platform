"""`/imports` — upload, poll, commit, cancel, the error file, the templates (IMP-01 §14).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, delegate to
the engine or a selector, wrap the result.

── Why authorisation is per KIND and not on the class ───────────────────────
IMP-01 §12 introduces no codename: the framework borrows the module's own.
Uploading parties needs `parties.party.write` and `ledger.entry.write` (opening
balances are ledger writes); items need `inventory.item.write`; reading a job
or its error file needs the kind's read codename. The kind is in the body or
on the row, which a permission class keyed on the action cannot see — so the
class gates what is common (signed in, `import_export` switched on) and each
handler checks the kind's codenames through the same resolver the classes use.
"""

from __future__ import annotations

from typing import Any

from django.core.files.storage import default_storage
from django.http import FileResponse, HttpResponse
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.audit import write_audit
from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NoActiveTenant, NotFound, PermissionDenied
from apps.common.exports import request_has
from apps.common.idempotency import idempotent
from apps.common.pagination import PagePagination
from apps.common.permissions import ModuleEnabled
from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.common.throttling import ScopedUserRateThrottle
from apps.imports import registry
from apps.imports.constants import AUDIT_IMPORT_ERROR_FILE, ImportStatus
from apps.imports.models import ImportJob
from apps.imports.selectors.jobs import job_for, jobs_for
from apps.imports.serializers.output import job_detail, job_row
from apps.imports.services import engine

#: FR-9 — the upload budget, per member (§14: "20 uploads per hour").
UPLOAD_SCOPE = "import_upload"


def _tenant(request: Any) -> Any:
    tenant = get_effective_tenant(request)
    if tenant is None:
        raise NoActiveTenant()
    return tenant


def _may_read(request: Any, spec: registry.ImporterSpec | None) -> bool:
    return spec is not None and request_has(request, spec.read_permission)


def _may_write(request: Any, spec: registry.ImporterSpec | None) -> bool:
    return spec is not None and all(request_has(request, c) for c in spec.required_permissions)


def _job_or_404(request: Any, job_id: Any) -> tuple[ImportJob, registry.ImporterSpec | None]:
    """Another tenant's job, or a kind the member may not read, is not found."""
    job = job_for(tenant=_tenant(request), job_id=job_id)
    if job is None:
        raise NotFound("No such import.")
    spec = registry.get(job.kind)
    if spec is not None and not _may_read(request, spec):
        raise NotFound("No such import.")
    return engine.reap_if_stale(job), spec


def _can_commit(request: Any, job: ImportJob, spec: registry.ImporterSpec | None) -> bool:
    """The button's state, decided by the server (an accountant sees it disabled)."""
    if spec is None or not _may_write(request, spec):
        return False
    if job.error_rows or job.valid_rows == 0:
        return False
    if job.status == ImportStatus.READY:
        return True
    error = (job.result or {}).get("error") or {}
    return job.status == ImportStatus.FAILED and error.get("at") == "commit"


class _ImportView(APIView):
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.IMPORT_EXPORT)]
    throttle_classes = [ScopedUserRateThrottle]


class ImportJobListView(_ImportView):
    """`GET /imports` (history, FR-10) and `POST /imports` (upload, FR-3)."""

    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_throttles(self) -> list[Any]:
        if self.request.method == "POST":
            return [ScopedUserRateThrottle(UPLOAD_SCOPE)]
        return [ScopedUserRateThrottle("user")]

    def get(self, request: Any) -> Any:
        readable = [kind for kind in registry.kinds() if _may_read(request, registry.get(kind))]
        queryset = jobs_for(
            tenant=_tenant(request),
            kinds=readable,
            kind=request.query_params.get("kind") or None,
            status=request.query_params.get("status") or None,
        )
        paginator = PagePagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        return StandardResponse.paginated(paginator, [job_row(job) for job in page])

    def post(self, request: Any) -> Any:
        kind = str(request.data.get("kind") or "")
        spec = registry.get(kind)
        if spec is not None and not _may_write(request, spec):
            raise PermissionDenied("You do not have permission to import this.")
        job = engine.upload(
            ctx=Ctx.from_request(request), kind=kind, upload=request.FILES.get("file")
        )
        job = ImportJob.objects.select_related("file_attachment", "created_by").get(pk=job.pk)
        return StandardResponse.created(job_detail(job, can_commit=False))


class ImportJobDetailView(_ImportView):
    """`GET /imports/{id}` — what the wizard polls (FR-8)."""

    def get(self, request: Any, job_id: Any) -> Any:
        job, spec = _job_or_404(request, job_id)
        return StandardResponse.ok(job_detail(job, can_commit=_can_commit(request, job, spec)))


class ImportCommitView(_ImportView):
    """`POST /imports/{id}/commit` → 202 (FR-6)."""

    def get_throttles(self) -> list[Any]:
        return [ScopedUserRateThrottle("party_write")]

    @idempotent("import_commit")
    def post(self, request: Any, job_id: Any) -> Any:
        job, spec = _job_or_404(request, job_id)
        if not _may_write(request, spec):
            raise PermissionDenied("Only someone who can add these records can import them.")
        job = engine.request_commit(ctx=Ctx.from_request(request), job=job)
        job = ImportJob.objects.select_related("file_attachment", "created_by").get(pk=job.pk)
        return StandardResponse.accepted(
            job_detail(job, can_commit=False), message="Import started"
        )


class ImportCancelView(_ImportView):
    """`POST /imports/{id}/cancel` (FR-7) — the uploader, or the tenant's manager."""

    def post(self, request: Any, job_id: Any) -> Any:
        job, spec = _job_or_404(request, job_id)
        own = job.created_by_id == getattr(request.user, "id", None)
        if not (own and _may_write(request, spec)) and not request_has(
            request, "platform.tenant.manage"
        ):
            raise PermissionDenied("Only the person who uploaded this file can cancel it.")
        job = engine.cancel(ctx=Ctx.from_request(request), job=job)
        job = ImportJob.objects.select_related("file_attachment", "created_by").get(pk=job.pk)
        return StandardResponse.ok(job_detail(job, can_commit=False))


class ImportErrorFileView(_ImportView):
    """`GET /imports/{id}/errors.csv` (FR-9, CCR-19) — the file with problems.

    Built during validation, so this streams a stored file rather than
    re-reading the upload; 409 when there is nothing wrong to download.
    """

    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def get(self, request: Any, job_id: Any) -> Any:
        job, _spec = _job_or_404(request, job_id)
        attachment = engine.error_attachment(job) if job.error_rows else None
        if attachment is None or not default_storage.exists(attachment.storage_key):
            raise BusinessRuleViolation(
                "import_not_ready",
                "This file has no problems to download.",
                details={"error_rows": 0},
            )
        write_audit(
            ctx=Ctx.from_request(request),
            action=AUDIT_IMPORT_ERROR_FILE,
            entity_type="imports_job",
            entity_id=job.id,
            metadata={"job_id": str(job.id)},
        )
        response = FileResponse(
            default_storage.open(attachment.storage_key, "rb"),
            content_type="text/csv; charset=utf-8",
            as_attachment=True,
            filename=f"digikhaato-{job.kind}-problems.csv",
        )
        response["Cache-Control"] = "private, no-store"
        return response


class ImportTemplateView(_ImportView):
    """`GET /imports/templates/{kind}.csv` (FR-2) — header, allowed values, examples."""

    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def get(self, request: Any, kind: str) -> Any:
        spec = registry.get(kind)
        if spec is None:
            raise NotFound("No such template.")
        if not _may_read(request, spec):
            raise PermissionDenied("You do not have permission to see this template.")
        response = HttpResponse(
            engine.template_csv(spec).encode("utf-8"), content_type="text/csv; charset=utf-8"
        )
        response["Content-Disposition"] = f'attachment; filename="digikhaato-{kind}-template.csv"'
        response["Cache-Control"] = "private, max-age=300"
        return response
