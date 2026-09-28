"""What every CSV export does before it streams a byte (LED-04, LED-09, PLT-08).

Moved here from `apps.ledger.views.exports` when the audit log (PLT-08 FR-7)
became the first export outside the ledger: `platform_app` may not import
`ledger`, and two copies of a cross-site check are two places for it to drift.
`apps.ledger.views.exports` re-exports every name, so its callers are unchanged.

IMP-02 grew it into the one export pipeline: the CSV writer (BOM, CRLF,
formula neutralising), the `?format=csv` mixin every list uses, and the
>5,000-row async path through `reports_export` and a `platform_job`.
"""

from __future__ import annotations

import csv
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass
from typing import Any

from rest_framework.exceptions import Throttled

from apps.common.exceptions import PermissionDenied
from apps.common.throttling import ScopedUserRateThrottle

#: The one `Sec-Fetch-Site` value an export refuses. `same-origin` and
#: `same-site` are our own pages (the SPA and the API are one site, which the
#: session cookie already requires); `none` is a URL typed or bookmarked; and a
#: missing header is an older browser, curl or a script with a token.
CROSS_SITE = "cross-site"


def request_has(request: Any, codename: str) -> bool:
    """The actor's effective permission set, through the SAME resolver the
    permission classes use.

    `permissions_for` applies the role set, the member's allow and deny
    overrides, and the tenant's module gating, in that order. Reading the role's
    codenames directly here would be a second implementation of that resolution
    — and the one place it would first differ is a member with a `deny`
    override, which is to say the exact member somebody set the override FOR.
    """
    from apps.common.permissions_registry import permissions_for
    from apps.common.tenancy import get_effective_tenant

    tenant = get_effective_tenant(request)
    membership = getattr(tenant, "_ub_membership", None) if tenant else None
    return bool(membership) and codename in permissions_for(membership)


def refuse_cross_site(request: Any) -> None:
    """403 for an export another site started (security review F-3).

    The session cookies are `SameSite=Lax`, which a top-level GET navigation
    from ANY site still carries — and both exports are GETs. So a link or a
    redirect on a hostile page could make a signed-in merchant's browser
    download their book, spend their export budget and leave an audit row
    saying they chose to. Browsers mark such a request `Sec-Fetch-Site:
    cross-site`, which a page cannot forge or suppress.

    Only the exact value is refused. Absent means a client that does not send
    the header, and refusing those would break curl and older browsers for no
    gain: the attack needs a browser, and every browser that sends cookies
    under `SameSite=Lax` sends this header too.
    """
    site = (request.META.get("HTTP_SEC_FETCH_SITE") or "").strip().lower()
    if site == CROSS_SITE:
        raise PermissionDenied("Start the export from inside the app, not from a link elsewhere.")


def charge_export_budget(request: Any, view: Any) -> None:
    """Spend one unit of `UB_RATE_LIMIT_EXPORT` or answer 429.

    Reading is on the 600/min user budget; exporting streams the whole period
    and is on the 10/hour export one. LED-04's first version put the whole view
    on the export scope and a merchant arguing over a bill at the counter ran
    out of statement views in ten taps.

    The scope goes to the CONSTRUCTOR. This used to build the throttle bare and
    assign `.scope = "export"` afterwards, and `get_cache_key` then replaced it
    with the statement view's `throttle_scope = "user"` — so statement exports
    ran on 600/min (F-1). Aging escaped only because its view has no scope.
    """
    throttle = ScopedUserRateThrottle("export")
    if not throttle.allow_request(request, view):
        raise Throttled(wait=throttle.wait())


def authorise_export(request: Any, view: Any, *, codename: str, refusal: str) -> None:
    """Everything an export must pass before it reads a row, in this order.

    1. Not started by another site (F-3) — first, so a hostile page can neither
       learn what the victim may export nor spend their budget.
    2. The export's own permission — a query parameter on a URL everybody may
       read, so the permission class cannot see it.
    3. The export budget — charged only for an export that is going to run.

    The caller computes the report AFTER this, never before (I-5): a refused
    export must not cost the server the whole walk over the book.

    Moved here from `apps.ledger.views.exports` when IMP-02 made every list
    exportable: `parties`, `inventory` and `expenses` may not import `ledger`,
    and a second copy of this order is a second place for it to drift. The
    ledger module re-exports the name, so its callers are unchanged.
    """
    refuse_cross_site(request)
    if not request_has(request, codename):
        raise PermissionDenied(refusal)
    charge_export_budget(request, view)


# ── IMP-02 — `?format=csv` on a list, with the >5,000-row path async ─────────
#
# One pipeline for every list (IMP-02 BR-1, BR-10). A viewset opts in with
# `CsvExportMixin`, names its `export_resource` and `export_columns`, and — if
# its list does anything beyond `filter_queryset(get_queryset())` — overrides
# `export_queryset()`, which its OWN `list()` also calls. That last point is the
# whole of BR-1 ("the file is the screen"): the export and the JSON list read
# the same method, so a filter added to one is in the other by construction.
#
# The async path cannot hold the request, so it stores the view's dotted path
# and the query string and REPLAYS the same method in the scheduler, on a
# synthetic request carrying the same tenant and user. The replay is the same
# code the synchronous path ran, not a second implementation of the filters.

#: IMP-02 FR-6 / BR-5 — at most this many rows stream in the request; above it
#: the export is queued. Settings-tunable per deployment, not per tenant.
SYNC_MAX_ROWS = 5_000
#: The hard ceiling — "Narrow the date range — at most 1,00,000 rows per file".
MAX_EXPORT_ROWS = 100_000
#: BR-6 — a stored export file expires after seven days.
EXPORT_TTL_DAYS = 7
#: The job type the async path queues (handler in `apps.reports.tasks`).
JOB_BUILD_EXPORT = "reports.build_export"

#: §19 — the characters Excel and LibreOffice read as "this cell is a formula".
FORMULA_LEAD = ("=", "+", "-", "@", "\t", "\r")

#: The query parameters that shape a PAGE rather than the SET. Dropped from an
#: export, because pagination is the only thing an export leaves out (BR-1).
PAGE_PARAMS = frozenset({"format", "page", "page_size", "cursor"})


def neutralise(value: Any) -> str:
    """Prefix a formula-leading cell with an apostrophe (IMP-01 §17.8.0).

    The apostrophe is Excel's own escape and is not shown to the reader. `-` is
    in the set and that is not paranoia: "-500 returned" is a formula to a
    spreadsheet and a note a shopkeeper would write. Applied here, centrally,
    so no exporter can forget it.
    """
    text = "" if value is None else str(value)
    return f"'{text}" if text[:1] in FORMULA_LEAD else text


@dataclass(frozen=True, slots=True)
class ExportColumn:
    """One column of a list export (IMP-02 FR-2 `ColumnSpec`, trimmed).

    `value(row)` returns the cell. Money and quantities are plain decimals — no
    `₹`, no grouping — so Excel totals the column (FR-4, BR-3); dates are
    dd/mm/yyyy, the way an en-IN spreadsheet reads them. `permission` hides the
    column server-side from a member who lacks it (BR-4: cost columns need
    `reports.financial.read`), whatever the client asked for.
    """

    header: str
    value: Callable[[Any], Any]
    permission: str | None = None
    #: Text cells go through `neutralise`; numbers never start with a formula
    #: character except `-`, and a negative amount must stay a number.
    numeric: bool = False


def csv_date(value: Any) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def csv_decimal(value: Any) -> str:
    return "" if value is None else str(value)


def csv_bool(value: Any) -> str:
    return "Yes" if value else "No"


def csv_lines(columns: Iterable[ExportColumn], rows: Iterable[Any]) -> Iterator[str]:
    """BOM, header, one CRLF line per row — as a generator, so nothing is held.

    The BOM is what makes Excel on Windows open Devanagari correctly (EC-5).
    """
    columns = tuple(columns)

    class _Echo:
        def write(self, value: str) -> str:
            return value

    writer = csv.writer(_Echo(), lineterminator="\r\n")
    yield "\ufeff" + writer.writerow([column.header for column in columns])
    for row in rows:
        cells = []
        for column in columns:
            value = column.value(row)
            cells.append(csv_decimal(value) if column.numeric else neutralise(value))
        yield writer.writerow(cells)


def export_filename(resource: str, tenant: Any) -> str:
    """`digikhaato-parties-20260918-1142.csv` in the tenant's own clock (FR-6)."""
    from django.utils import timezone

    from apps.common.dates import tenant_timezone

    stamp = timezone.localtime(timezone.now(), tenant_timezone(tenant)).strftime("%Y%m%d-%H%M")
    return f"digikhaato-{resource}-{stamp}.csv"


def export_params(request: Any) -> dict[str, str]:
    """The list's query string minus pagination — what the async replay needs."""
    return {
        key: value
        for key, value in request.query_params.items()
        if key not in PAGE_PARAMS and value not in (None, "")
    }


class CsvExportMixin:
    """`?format=csv` on a list endpoint (IMP-02).

    Declares `PassthroughCsvRenderer` beside the JSON one, because DRF resolves
    `format` against the view's renderers BEFORE the handler runs, and with no
    renderer claiming `csv` negotiation answers 404 (see the renderer).
    """

    #: `parties`, `items`, `expenses` — the resource name in the file name and
    #: in `reports_export.resource`.
    export_resource: str = ""
    #: The codename an export of this list needs beyond reading it.
    export_codename: str = "reports.export"
    export_columns: tuple[ExportColumn, ...] = ()

    @property
    def renderer_classes(self) -> list:  # type: ignore[override]
        from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer

        return [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def wants_csv(self, request: Any) -> bool:
        return request.query_params.get("format") == "csv"

    def export_queryset(self) -> Any:
        """The FILTERED set the list pages over. Override when `list()` does more."""
        return self.filter_queryset(self.get_queryset())  # type: ignore[attr-defined]

    def export_file_name(self, tenant: Any) -> str:
        """The download's name. Reports override it with RPT-08 FR-8's
        `<slug>_<from>_<to>.csv`; lists keep the stamped default."""
        return export_filename(self.export_resource, tenant)

    def allowed_export_columns(self, request: Any) -> tuple[ExportColumn, ...]:
        return tuple(
            column
            for column in self.export_columns
            if column.permission is None or request_has(request, column.permission)
        )

    def csv_export(self, request: Any) -> Any:
        """Authorise, count, then stream (≤ 5,000) or queue (> 5,000)."""
        from django.http import StreamingHttpResponse

        from apps.common.exceptions import BusinessRuleViolation
        from apps.common.responses import StandardResponse
        from apps.common.tenancy import get_effective_tenant

        authorise_export(
            request,
            self,
            codename=self.export_codename,
            refusal="You do not have permission to export this list.",
        )
        tenant = get_effective_tenant(request)
        queryset = self.export_queryset()
        count = queryset.count()
        if count == 0:
            raise BusinessRuleViolation(
                "nothing_to_export", "Nothing matches these filters — clear a filter and try again."
            )
        if count > MAX_EXPORT_ROWS:
            raise BusinessRuleViolation(
                "export_too_large",
                "Narrow the filters — at most 1,00,000 rows per file.",
                details={"count": count, "maximum": MAX_EXPORT_ROWS},
            )
        columns = self.allowed_export_columns(request)
        params = export_params(request)
        _audit_export_request(
            request, tenant, self.export_resource, params, count, sync=count <= SYNC_MAX_ROWS
        )
        if count > SYNC_MAX_ROWS:
            export = queue_export(
                tenant=tenant,
                user=request.user,
                resource=self.export_resource,
                view=type(self),
                params=params,
                columns=[column.header for column in columns],
                codename=self.export_codename,
                row_count=count,
                request_id=getattr(request, "request_id", None),
            )
            return StandardResponse.accepted(
                {"export_id": str(export.id), "status": export.status, "row_count": count},
                message="Preparing your file.",
            )
        response = StreamingHttpResponse(
            (
                line.encode("utf-8")
                for line in csv_lines(columns, queryset.iterator(chunk_size=500))
            ),
            content_type="text/csv; charset=utf-8",
        )
        response["Content-Disposition"] = f'attachment; filename="{self.export_file_name(tenant)}"'
        response["X-Row-Count"] = str(count)
        return response


def _audit_export_request(
    request: Any, tenant: Any, resource: str, params: dict, count: int, *, sync: bool
) -> None:
    """IMP-02 §16 — "who took the customer list out of the system", sync included."""
    from apps.common.audit import write_audit
    from apps.common.context import Ctx

    write_audit(
        ctx=Ctx(
            tenant=tenant,
            actor=request.user,
            actor_type="user",
            request_id=getattr(request, "request_id", "") or "",
            ip=getattr(request, "client_ip", None),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        ),
        action="export.requested",
        entity_type="reports_export",
        metadata={"resource": resource, "filters": params, "row_count": count, "sync": sync},
    )


def queue_export(
    *,
    tenant: Any,
    user: Any,
    resource: str,
    view: type,
    params: dict,
    columns: list[str],
    codename: str,
    row_count: int,
    request_id: str | None = None,
) -> Any:
    """A `reports_export` row and its `platform_job`, in one transaction."""
    from django.apps import apps
    from django.db import transaction

    from apps.common.jobs import enqueue

    model = apps.get_model("reports", "Export")
    with transaction.atomic():
        export = model.objects.create(
            tenant=tenant,
            created_by=user,
            report_name=f"list:{resource}",
            resource=resource,
            format="csv",
            status="queued",
            row_count=row_count,
            params={
                "filters": params,
                "columns": columns,
                "view": f"{view.__module__}.{view.__qualname__}",
                "codename": codename,
            },
        )
        enqueue(
            job_type=JOB_BUILD_EXPORT,
            payload={"export_id": str(export.id)},
            tenant=tenant,
            created_by=user,
            idempotency_token=f"{JOB_BUILD_EXPORT}:{export.id}",
            request_id=request_id,
        )
    return export


def replay_export_queryset(export: Any) -> tuple[Any, tuple[ExportColumn, ...]]:
    """Rebuild the list's filtered queryset in the scheduler (the async half).

    The view class is imported from the stored dotted path and must be a
    `CsvExportMixin` whose `export_resource` matches the row — so a tampered
    row cannot make the runner import and call an arbitrary object.
    """
    import importlib

    from django.http import HttpRequest, QueryDict
    from rest_framework.request import Request

    path = export.params.get("view") or ""
    module_name, _, class_name = path.rpartition(".")
    view_class = getattr(importlib.import_module(module_name), class_name, None)
    if (
        view_class is None
        or not isinstance(view_class, type)
        or not issubclass(view_class, CsvExportMixin)
        or view_class.export_resource != export.resource
    ):
        raise ValueError(f"{path!r} is not an exportable list")

    raw = HttpRequest()
    raw.method = "GET"
    query = QueryDict(mutable=True)
    for key, value in (export.params.get("filters") or {}).items():
        query[key] = value
    raw.GET = query
    raw.user = export.created_by
    raw._ub_tenant = export.tenant  # the memo `get_effective_tenant` reads first
    request = Request(raw)
    request._request._ub_tenant = export.tenant
    view = view_class()
    view.request = request
    view.args = ()
    view.kwargs = {}
    view.format_kwarg = None
    view.action = "list"
    wanted = set(export.params.get("columns") or [])
    columns = tuple(column for column in view_class.export_columns if column.header in wanted)
    return view.export_queryset(), columns
