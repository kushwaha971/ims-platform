"""`/api/v1/library/loans`, `/returns`, and the member's counter summary (LIB-06 §6, LIB-05 §6; B09).

`library.loan.write` opens the counter. An `override_reason` asks for
`library.loan.override`, and a past `returned_on` for `library.loan.adjust`; the
service checks those, because the codename depends on a body field.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import NotFound, ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.models import LibraryLoan, LibraryMembership
from apps.library.services import loans
from apps.library.services.charges import charge_json
from apps.library.services.members import member_summary

READ = "library.loan.read"
WRITE = "library.loan.write"
ADJUST = "library.loan.adjust"
MANAGE = "library.settings.manage"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _LoanView(APIView):
    scope_exempt = EXEMPT
    codename = WRITE

    def get_permissions(self) -> list:
        codename = READ if self.request.method in SAFE_METHODS else self.codename
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(codename)()]

    def ctx(self) -> Ctx:
        return Ctx.from_request(self.request)


def _member(tenant: Any, m: LibraryMembership) -> dict:
    fresh = LibraryMembership.objects.select_related("party", "membership_type").get(pk=m.pk)
    return member_summary(fresh, tenant_today(tenant))


class LoanListView(_LoanView):
    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        today = tenant_today(tenant)
        qs = loans.loans_filtered(tenant, request.query_params, today)
        paginator = PagePagination()
        rows = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([loans.loan_json(r, today) for r in rows])

    @idempotent("library.loan.issue")
    def post(self, request: Any) -> Any:
        ctx = self.ctx()
        result = loans.issue(ctx=ctx, data=request.data)
        meta: dict[str, Any] = {
            "member": _member(ctx.tenant, result["member"]),
            "warnings": result["warnings"],
        }
        if result["due_moved_from"] is not None:
            meta["due_moved_from"] = result["due_moved_from"].isoformat()
        return StandardResponse.created(
            loans.loan_json(result["loan"], tenant_today(ctx.tenant)), meta=meta
        )


class LoanDetailView(_LoanView):
    def get(self, request: Any, loan_id: Any) -> Any:
        tenant = get_effective_tenant(request)
        loan = (
            LibraryLoan.objects.filter(tenant=tenant, pk=loan_id)
            .select_related("copy__title", "membership__party")
            .first()
        )
        if loan is None:
            raise NotFound()
        return StandardResponse.ok(
            {
                **loans.loan_json(loan, tenant_today(tenant)),
                "events": [
                    {
                        "kind": e.kind,
                        "on_date": e.on_date.isoformat(),
                        "from_due": e.from_due.isoformat() if e.from_due else None,
                        "to_due": e.to_due.isoformat() if e.to_due else None,
                        "reason": e.reason,
                        "charge_id": str(e.charge_id) if e.charge_id else None,
                        "blocks_overridden": e.blocks_overridden,
                    }
                    for e in loan.events.order_by("created_at", "id")
                ],
                "charges": [charge_json(c) for c in loan.charges.order_by("charge_date", "number")],
            }
        )


class ReturnView(_LoanView):
    @idempotent("library.loan.return")
    def post(self, request: Any) -> Any:
        ctx = self.ctx()
        result = loans.return_copy(ctx=ctx, data=request.data)
        return StandardResponse.ok(
            loans.loan_json(result["loan"], tenant_today(ctx.tenant)),
            meta={
                "fine": result["fine"].as_json() if result["fine"] else None,
                "charges": [charge_json(c) for c in result["charges"]],
                "hold_ready": None,
                "copy_status": result["copy_status"],
                "member": _member(ctx.tenant, result["member"]),
            },
        )


def _loan_action(service: Any, codename: str, scope: str | None = None) -> type:
    class _Action(_LoanView):
        def post(self, request: Any, loan_id: Any) -> Any:
            ctx = self.ctx()
            result = service(ctx=ctx, loan_id=loan_id, data=request.data)
            meta: dict[str, Any] = {"member": _member(ctx.tenant, result["member"])}
            if result.get("fine_charge") is not None:
                meta["fine_charge"] = charge_json(result["fine_charge"])
            if result.get("due_moved_from") is not None:
                meta["due_moved_from"] = result["due_moved_from"].isoformat()
            return StandardResponse.ok(
                loans.loan_json(result["loan"], tenant_today(ctx.tenant)), meta=meta
            )

    _Action.codename = codename
    if scope:
        _Action.post = idempotent(scope)(_Action.post)  # type: ignore[method-assign]
    _Action.__name__ = f"Loan{service.__name__.title().replace('_', '')}View"
    return _Action


LoanRenewView = _loan_action(loans.renew, WRITE, "library.loan.renew")
LoanCancelView = _loan_action(loans.cancel, WRITE)
LoanChangeDueView = _loan_action(loans.change_due, ADJUST)


class MemberRenewAllView(_LoanView):
    def post(self, request: Any, membership_id: Any) -> Any:
        ctx = self.ctx()
        result = loans.renew_all(ctx=ctx, membership_id=membership_id)
        today = tenant_today(ctx.tenant)
        return StandardResponse.ok(
            {
                "renewed": [loans.loan_json(r, today) for r in result["renewed"]],
                "refused": result["refused"],
            }
        )


class MemberCounterSummaryView(_LoanView):
    """`GET /library/members/{id}/summary`: the counter's panel with the open loans."""

    def get(self, request: Any, membership_id: Any) -> Any:
        tenant = get_effective_tenant(request)
        m = (
            LibraryMembership.objects.filter(tenant=tenant, pk=membership_id)
            .select_related("party", "membership_type")
            .first()
        )
        if m is None:
            raise NotFound()
        today = tenant_today(tenant)
        open_rows = (
            loans.open_loans(m)
            .select_related("copy__title", "membership__party")
            .order_by("due_on", "id")
        )
        return StandardResponse.ok(
            {**member_summary(m, today), "loans": [loans.loan_json(r, today) for r in open_rows]}
        )


def _dates(params: Any, *names: str) -> list[dt.date]:
    out, errors = [], {}
    for name in names:
        try:
            out.append(dt.date.fromisoformat(params.get(name) or ""))
        except ValueError:
            errors[name] = ["Use a date like 2026-10-01."]
    if errors:
        raise ValidationFailed(errors)
    return out


class DueOnView(_LoanView):
    def get(self, request: Any) -> Any:
        start, end = _dates(request.query_params, "from", "to")
        return StandardResponse.ok(loans.due_on_between(get_effective_tenant(request), start, end))


class ShiftDueView(_LoanView):
    codename = MANAGE

    def post(self, request: Any) -> Any:
        return StandardResponse.ok(loans.shift_due(ctx=self.ctx(), data=request.data))


class DueDatePreviewView(_LoanView):
    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        params = request.query_params
        on = _dates(params, "on")[0] if params.get("on") else tenant_today(tenant)
        return StandardResponse.ok(
            loans.due_date_preview(tenant, params.get("membership_id"), params.get("copy_id"), on)
        )
