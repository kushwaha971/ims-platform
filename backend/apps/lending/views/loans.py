"""`/api/v1/lending/borrowers`, `/loans`, `/loans/preview` (FRD lending LEN-02 … LEN-05)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.idempotency import idempotent
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.lending.models import LendingBorrower
from apps.lending.services import loans

EXEMPT = "Lending's agent scoping arrives with routes (FRD LEN-07); every reader sees the book."


class _LendingView(APIView):
    scope_exempt = EXEMPT
    read: str = "lending.loan.read"
    write: str = "lending.loan.create"

    def get_permissions(self) -> list:
        codename = self.read if self.request.method in SAFE_METHODS else self.write
        return [IsAuthenticated(), ModuleEnabled("lending")(), HasPermission(codename)()]


class LoanPreviewView(_LendingView):
    def post(self, request: Any) -> Any:
        result = loans.preview(tenant=get_effective_tenant(request), data=request.data)
        return StandardResponse.ok(result["data"], meta={"warnings": result["warnings"]})


class LoanListView(_LendingView):
    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        today = tenant_today(tenant)
        qs = loans.list_loans(tenant, request.query_params)
        paginator = PagePagination()
        rows = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([loans.loan_json(r, today) for r in rows])

    @idempotent("lending.loan.create")
    def post(self, request: Any) -> Any:
        ctx = Ctx.from_request(request)
        loan = loans.create_loan(ctx=ctx, data=request.data)
        fresh = loans.get_loan(ctx.tenant, loan.id)
        return StandardResponse.created(
            loans.loan_json(fresh, tenant_today(ctx.tenant), with_schedule=True)
        )


class LoanDetailView(_LendingView):
    def get(self, request: Any, loan_id: Any) -> Any:
        tenant = get_effective_tenant(request)
        loan = loans.get_loan(tenant, loan_id)
        return StandardResponse.ok(loans.loan_json(loan, tenant_today(tenant), with_schedule=True))


def borrower_json(b: LendingBorrower) -> dict:
    return {
        "id": str(b.id),
        "number": b.borrower_number,
        "party_id": str(b.party_id),
        "name": b.party.name,
        "mobile": b.party.mobile,
        "area": b.area,
        "route": {"id": str(b.route_id), "name": b.route.name} if b.route_id else None,
        "notes": b.notes,
    }


class BorrowerListView(_LendingView):
    read = "lending.borrower.read"
    write = "lending.borrower.write"

    def get(self, request: Any) -> Any:
        from django.db.models import Q

        tenant = get_effective_tenant(request)
        qs = LendingBorrower.objects.filter(tenant=tenant).select_related("party", "route")
        term = (request.query_params.get("q") or "").strip()
        if term:
            qs = qs.filter(
                Q(party__name__icontains=term)
                | Q(party__mobile__contains=term)
                | Q(borrower_number__iexact=term)
            )
        paginator = PagePagination()
        rows = paginator.paginate_queryset(qs.order_by("party__name", "id"), request, view=self)
        return paginator.get_paginated_response([borrower_json(b) for b in rows])
