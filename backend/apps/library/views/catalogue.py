"""`/api/v1/library/titles|copies|lookup|categories|locations` (LIB-02 §6; task B05).

Every view: authenticated → `ModuleEnabled("library")` → the method's codename
(`codenames`, a safe method reads with GET's). The library has no row scoping
(LIB-14 §1), so each view declares `scope_exempt`.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.exceptions import NotFound
from apps.common.idempotency import idempotent
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library import serializers as out
from apps.library.selectors import catalogue as select
from apps.library.services import catalogue as service

READ = "library.catalogue.read"
WRITE = "library.catalogue.write"
WITHDRAW = "library.copy.withdraw"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _CatalogueView(APIView):
    scope_exempt = EXEMPT
    #: HTTP method → codename. A method missing here has no handler.
    codenames: dict[str, str] = {"GET": READ}

    def get_permissions(self) -> list:
        method = "GET" if self.request.method in SAFE_METHODS else self.request.method
        codename = self.codenames.get(method, WRITE)
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(codename)()]

    def tenant(self) -> Any:
        return get_effective_tenant(self.request)

    def ctx(self) -> Ctx:
        return Ctx.from_request(self.request)


def _page(view: APIView, request: Any, queryset: Any, shape: Any) -> Any:
    paginator = PagePagination()
    rows = paginator.paginate_queryset(queryset, request, view=view)
    return paginator.get_paginated_response([shape(r) for r in rows])


def _title_detail(title: Any) -> dict:
    return out.title_detail(title, select.title_copies(title))


# ── Titles ───────────────────────────────────────────────────────────────────


class TitleListView(_CatalogueView):
    codenames = {"GET": READ, "POST": WRITE}

    def get(self, request: Any) -> Any:
        return _page(
            self, request, select.list_titles(self.tenant(), request.query_params), out.title_row
        )

    @idempotent("library.title.create")
    def post(self, request: Any) -> Any:
        title, numbers, warnings = service.create_title(ctx=self.ctx(), data=request.data)
        return StandardResponse.created(
            _title_detail(title), meta={"created_numbers": numbers, "warnings": warnings}
        )


class TitleDetailView(_CatalogueView):
    codenames = {"GET": READ, "PATCH": WRITE}

    def get(self, request: Any, title_id: Any) -> Any:
        title = select.title_detail(self.tenant(), title_id)
        if title is None:
            raise NotFound()
        return StandardResponse.ok(_title_detail(title))

    def patch(self, request: Any, title_id: Any) -> Any:
        title, warnings = service.update_title(ctx=self.ctx(), title_id=title_id, data=request.data)
        return StandardResponse.ok(_title_detail(title), meta={"warnings": warnings})


class TitleCopiesView(_CatalogueView):
    codenames = {"POST": WRITE}

    @idempotent("library.copy.create")
    def post(self, request: Any, title_id: Any) -> Any:
        copies = service.add_copies(ctx=self.ctx(), title_id=title_id, data=request.data)
        return StandardResponse.created(
            [out.copy_row(c) for c in copies],
            meta={"created_numbers": [c.accession_number for c in copies]},
        )


class TitleArchiveView(_CatalogueView):
    codenames = {"POST": WRITE}

    def post(self, request: Any, title_id: Any) -> Any:
        title = service.archive_title(ctx=self.ctx(), title_id=title_id)
        return StandardResponse.ok(out.title_row(title))


class TitleRestoreView(_CatalogueView):
    codenames = {"POST": WRITE}

    def post(self, request: Any, title_id: Any) -> Any:
        title = service.restore_title(ctx=self.ctx(), title_id=title_id)
        return StandardResponse.ok(out.title_row(title))


# ── Copies ───────────────────────────────────────────────────────────────────


class CopyListView(_CatalogueView):
    def get(self, request: Any) -> Any:
        return _page(
            self, request, select.list_copies(self.tenant(), request.query_params), out.copy_row
        )


class _CopyView(_CatalogueView):
    def _detail(self, copy_id: Any) -> Any:
        copy = select.copy_detail(self.tenant(), copy_id)
        if copy is None:
            raise NotFound()
        return StandardResponse.ok(out.copy_detail(copy))


class CopyDetailView(_CopyView):
    codenames = {"GET": READ, "PATCH": WRITE}

    def get(self, request: Any, copy_id: Any) -> Any:
        return self._detail(copy_id)

    def patch(self, request: Any, copy_id: Any) -> Any:
        service.update_copy(ctx=self.ctx(), copy_id=copy_id, data=request.data)
        return self._detail(copy_id)


class CopyWithdrawView(_CopyView):
    codenames = {"POST": WITHDRAW}

    def post(self, request: Any, copy_id: Any) -> Any:
        service.withdraw_copy(ctx=self.ctx(), copy_id=copy_id, data=request.data)
        return self._detail(copy_id)


class CopyRepairView(_CopyView):
    codenames = {"POST": WRITE}

    def post(self, request: Any, copy_id: Any) -> Any:
        service.repair_copy(ctx=self.ctx(), copy_id=copy_id, data=request.data)
        return self._detail(copy_id)


class CopyBackToShelfView(_CopyView):
    codenames = {"POST": WRITE}

    def post(self, request: Any, copy_id: Any) -> Any:
        service.back_to_shelf(ctx=self.ctx(), copy_id=copy_id, data=request.data)
        return self._detail(copy_id)


# ── Lookup ───────────────────────────────────────────────────────────────────


class LookupView(_CatalogueView):
    """The counter's resolver (BR-8). Member numbers join in B07."""

    def get(self, request: Any) -> Any:
        found = select.lookup(self.tenant(), request.query_params.get("code") or "")
        body: dict[str, Any] = {"kind": found["kind"]}
        if found["kind"] == "copy":
            body["copy"] = out.copy_row(found["copy"])
        elif found["kind"] == "isbn":
            body["titles"] = [out.title_row(t) for t in found["titles"]]
        return StandardResponse.ok(body)


# ── Categories and locations ─────────────────────────────────────────────────


class CategoryListView(_CatalogueView):
    codenames = {"GET": READ, "POST": WRITE}

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(
            [out.category_row(c, n) for c, n in select.categories(self.tenant())]
        )

    def post(self, request: Any) -> Any:
        row = service.create_category(ctx=self.ctx(), data=request.data)
        return StandardResponse.created(out.category_row(row, 0))


class CategoryDetailView(_CatalogueView):
    codenames = {"PATCH": WRITE, "DELETE": WRITE}

    def patch(self, request: Any, category_id: Any) -> Any:
        row = service.update_category(ctx=self.ctx(), category_id=category_id, data=request.data)
        counts = dict((c.pk, n) for c, n in select.categories(self.tenant()))
        return StandardResponse.ok(out.category_row(row, counts.get(row.pk, 0)))

    def delete(self, request: Any, category_id: Any) -> Any:
        service.delete_category(ctx=self.ctx(), category_id=category_id)
        return StandardResponse.no_content()


class CategoryMergeView(_CatalogueView):
    codenames = {"POST": WRITE}

    def post(self, request: Any, category_id: Any) -> Any:
        into = service.merge_category(ctx=self.ctx(), category_id=category_id, data=request.data)
        counts = dict((c.pk, n) for c, n in select.categories(self.tenant()))
        return StandardResponse.ok(out.category_row(into, counts.get(into.pk, 0)))


class LocationListView(_CatalogueView):
    codenames = {"GET": READ, "POST": WRITE}

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(
            [out.location_row(loc, n) for loc, n in select.locations(self.tenant())]
        )

    def post(self, request: Any) -> Any:
        row = service.create_location(ctx=self.ctx(), data=request.data)
        return StandardResponse.created(out.location_row(row, 0))


class LocationDetailView(_CatalogueView):
    codenames = {"PATCH": WRITE, "DELETE": WRITE}

    def patch(self, request: Any, location_id: Any) -> Any:
        row = service.update_location(ctx=self.ctx(), location_id=location_id, data=request.data)
        counts = dict((loc.pk, n) for loc, n in select.locations(self.tenant()))
        return StandardResponse.ok(out.location_row(row, counts.get(row.pk, 0)))

    def delete(self, request: Any, location_id: Any) -> Any:
        service.delete_location(ctx=self.ctx(), location_id=location_id)
        return StandardResponse.no_content()
