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


def borrower_json(b: LendingBorrower, summary: dict | None = None) -> dict:
    return {
        # Their loans, added up (`loans.borrower_summaries`): how many, how much
        # was given, how much has come back, how much is left and how much is late.
        **({"summary": summary} if summary is not None else {}),
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
        totals = loans.borrower_summaries(tenant, [b.id for b in rows], tenant_today(tenant))
        return paginator.get_paginated_response([borrower_json(b, totals.get(b.id)) for b in rows])


class BorrowerDetailView(_LendingView):
    """`GET /lending/borrowers/{id}` — one person and their loans added up.

    The loans themselves are `GET /lending/loans?borrower={id}`, each with its
    own figures: this is the line above them.
    """

    read = "lending.borrower.read"

    def get(self, request: Any, borrower_id: Any) -> Any:
        from django.core.exceptions import ValidationError

        from apps.common.exceptions import NotFound

        tenant = get_effective_tenant(request)
        try:
            borrower = (
                LendingBorrower.objects.filter(tenant=tenant)
                .select_related("party", "route")
                .get(pk=borrower_id)
            )
        except (LendingBorrower.DoesNotExist, ValidationError, ValueError, TypeError) as exc:
            raise NotFound("Borrower not found.") from exc
        totals = loans.borrower_summaries(tenant, [borrower.id], tenant_today(tenant))
        return StandardResponse.ok(borrower_json(borrower, totals.get(borrower.id)))


class LoanDueFiguresView(_LendingView):
    """`GET /lending/loans/{id}/dues/{due_id}` — the late-fee and waiver dialogs' read."""

    def get(self, request: Any, loan_id: Any, due_id: Any) -> Any:
        from apps.lending.services import late_fees

        ctx = Ctx.from_request(request)
        loan = loans.get_loan(ctx.tenant, loan_id)
        return StandardResponse.ok(
            late_fees.due_figures(ctx=ctx, loan=loan, due_id=due_id, on=tenant_today(ctx.tenant))
        )


def _detail(ctx: Any, loan_id: Any) -> dict:
    fresh = loans.get_loan(ctx.tenant, loan_id)
    return loans.loan_json(fresh, tenant_today(ctx.tenant), with_schedule=True)


class LateFeeView(_LendingView):
    """`POST /lending/loans/{id}/late-fees {due_id, amount, reason}` (LEN-09 FR-3, FR-4)."""

    write = "lending.charge.create"

    @idempotent("lending.late_fee.add")
    def post(self, request: Any, loan_id: Any) -> Any:
        from apps.lending.services import late_fees

        ctx = Ctx.from_request(request)
        data = request.data if isinstance(request.data, dict) else {}
        result = late_fees.add_late_fee(
            ctx=ctx,
            loan_id=loan_id,
            due_id=data.get("due_id"),
            amount=data.get("amount"),
            reason=data.get("reason"),
        )
        return StandardResponse.created({**result, "loan": _detail(ctx, loan_id)})


class WaiverView(_LendingView):
    """`POST /lending/loans/{id}/waivers {due_id, component, amount, reason}` (LEN-09 FR-5)."""

    write = "lending.waiver.create"

    @idempotent("lending.waiver.create")
    def post(self, request: Any, loan_id: Any) -> Any:
        from apps.lending.services import late_fees

        ctx = Ctx.from_request(request)
        data = request.data if isinstance(request.data, dict) else {}
        result = late_fees.waive_due(
            ctx=ctx,
            loan_id=loan_id,
            due_id=data.get("due_id"),
            component=str(data.get("component") or ""),
            amount=data.get("amount"),
            reason=data.get("reason"),
        )
        return StandardResponse.created({**result, "loan": _detail(ctx, loan_id)})


class WriteOffView(_LendingView):
    """`POST /lending/loans/{id}/write-off {amount, reason_code, reason}` — owner only (LEN-10)."""

    write = "lending.loan.close"

    def post(self, request: Any, loan_id: Any) -> Any:
        from apps.lending.services import closing

        ctx = Ctx.from_request(request)
        data = request.data if isinstance(request.data, dict) else {}
        closing.write_off(
            ctx=ctx,
            loan_id=loan_id,
            amount=data.get("amount"),
            reason_code=data.get("reason_code"),
            reason=data.get("reason"),
        )
        return StandardResponse.ok({"loan": _detail(ctx, loan_id)})


class CancelLoanView(_LendingView):
    """`POST /lending/loans/{id}/cancel {reason}` — a loan with no collection (LEN-10 FR-4)."""

    write = "lending.loan.close"

    def post(self, request: Any, loan_id: Any) -> Any:
        from apps.lending.services import closing

        ctx = Ctx.from_request(request)
        data = request.data if isinstance(request.data, dict) else {}
        closing.cancel(ctx=ctx, loan_id=loan_id, reason=data.get("reason"))
        return StandardResponse.ok({"loan": _detail(ctx, loan_id)})
