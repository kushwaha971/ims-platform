"""`/api/v1/library/members` (LIB-04 §6; task B07).

Codenames per LIB-04 §10: read `library.member.read`; enrol, edit, renew, change
type, re-join, receive a deposit `library.member.write`; suspend, reactivate,
close and apply a deposit `library.member.close`; a refund also needs the owner or
admin ROLE, which the service checks (D28).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Sum
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import NotFound
from apps.common.idempotency import idempotent
from apps.common.money import ZERO
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled, OwnerOrAdmin
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.models import LibraryMembership
from apps.library.selectors.members import list_members, member_status_counts
from apps.library.services import members
from apps.library.services.charges import charge_json

READ = "library.member.read"
WRITE = "library.member.write"
CLOSE = "library.member.close"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."

#: Owner, 12 Oct 2026 — editing a student's record and suspending, reactivating,
#: closing or re-admitting them is the owner's or an admin's act only, on top of
#: the codename. What a PATCH may still carry for anybody holding
#: `library.member.write` is PLACEMENT: the desk moves students between seats,
#: shifts and lockers on the seat board every day (W02, `SeatDialog`), and that
#: moves a chair rather than editing the person. `version` rides along with
#: every PATCH. Anything else — member number, group, end date, notes, guardian
#: — needs the owner or an admin, and a mixed body is refused whole.
STAFF_PATCH_KEYS: frozenset[str] = frozenset({"seat_id", "shift_id", "locker_label", "version"})


def _body_keys(request: Any) -> set[str]:
    data = getattr(request, "data", None)
    return set(data.keys()) if hasattr(data, "keys") else set()


class _MemberView(APIView):
    scope_exempt = EXEMPT
    codename: str = WRITE
    #: True on the acts that block or unblock a person (see `STAFF_PATCH_KEYS`).
    manager_only: bool = False

    def get_permissions(self) -> list:
        safe = self.request.method in SAFE_METHODS
        codename = READ if safe else self.codename
        checks = [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(codename)()]
        if not safe and self._needs_manager():
            checks.append(OwnerOrAdmin())
        return checks

    def _needs_manager(self) -> bool:
        if self.manager_only:
            return True
        if self.request.method == "PATCH":
            return not _body_keys(self.request) <= STAFF_PATCH_KEYS
        return False

    def ctx(self) -> Ctx:
        return Ctx.from_request(self.request)


def _payments(rows: list) -> list[dict]:
    return [
        {"id": str(p.id), "number": p.number, "amount": f"{Decimal(p.amount):.2f}"} for p in rows
    ]


def _detail(tenant: Any, membership: LibraryMembership) -> dict:
    fresh = LibraryMembership.objects.select_related("party", "membership_type").get(
        pk=membership.pk
    )
    return members.member_detail(fresh, tenant_today(tenant))


class MemberListView(_MemberView):
    @idempotent("library.member.enrol")
    def post(self, request: Any) -> Any:
        ctx = self.ctx()
        result = members.enrol(ctx=ctx, data=request.data)
        deposit = result["deposit"]
        return StandardResponse.created(
            _detail(ctx.tenant, result["membership"]),
            meta={
                "charges": [charge_json(c) for c in result["charges"]],
                "payments": _payments(result["payments"]),
                "deposit": (
                    {
                        "id": str(deposit.id),
                        "expected": f"{Decimal(deposit.expected_amount):.2f}",
                        "held": f"{Decimal(deposit.held_amount):.2f}",
                        # QA B4 — what is still to take; owed, but never fee dues or income.
                        "due": f"{Decimal(deposit.expected_amount) - Decimal(deposit.received_amount):.2f}",
                    }
                    if deposit is not None
                    else None
                ),
            },
        )

    def get(self, request: Any) -> Any:
        from apps.payments.models import HeldDeposit

        tenant = get_effective_tenant(request)
        today = tenant_today(tenant)
        qs = list_members(tenant, request.query_params, today)
        held = HeldDeposit.objects.filter(
            tenant=tenant,
            module=members.MODULE,
            subject_type=members.SUBJECT_TYPE,
            subject_id__in=qs.values("pk"),
        ).aggregate(total=Sum("held_amount"))["total"]
        totals = {
            "members": qs.count(),
            **member_status_counts(qs, today),
            "dues": f"{Decimal(qs.aggregate(total=Sum('dues'))['total'] or ZERO):.2f}",
            "deposits_held": f"{Decimal(held or ZERO):.2f}",
        }
        paginator = PagePagination()
        rows = paginator.paginate_queryset(qs, request, view=self)
        response = paginator.get_paginated_response(
            [members.member_summary(m, today) for m in rows]
        )
        response.data["meta"]["totals"] = totals
        # Whether the library has ever admitted anybody, whatever the filters:
        # an empty list hides its search and filters (approved designs, 12 Oct
        # 2026); a filter that found nobody keeps them.
        response.data["meta"]["has_any"] = (
            bool(rows) or LibraryMembership.objects.filter(tenant=tenant).exists()
        )
        return response


class MemberDetailView(_MemberView):
    def get(self, request: Any, membership_id: Any) -> Any:
        tenant = get_effective_tenant(request)
        row = LibraryMembership.objects.filter(tenant=tenant, pk=membership_id).first()
        if row is None:
            raise NotFound()
        return StandardResponse.ok(_detail(tenant, row))

    def patch(self, request: Any, membership_id: Any) -> Any:
        ctx = self.ctx()
        row = members.patch(ctx=ctx, membership_id=membership_id, data=request.data)
        return StandardResponse.ok(_detail(ctx.tenant, row))


def _action(
    service: Any,
    codename: str,
    *,
    idempotent_scope: str | None = None,
    manager_only: bool = False,
) -> type:
    """One POST endpoint per membership act; each answers with the member as it now is."""

    class _Action(_MemberView):
        def post(self, request: Any, membership_id: Any) -> Any:
            ctx = self.ctx()
            result = service(ctx=ctx, membership_id=membership_id, data=request.data)
            meta: dict[str, Any] = {}
            membership_obj = result
            if isinstance(result, dict):
                membership_obj = result["membership"]
                meta = {
                    key: value
                    for key, value in result.items()
                    if key in ("applied", "refunded", "still_owed")
                }
                if "charges" in result:
                    meta["charges"] = [charge_json(c) for c in result["charges"]]
                if "payments" in result:
                    meta["payments"] = _payments(result["payments"])
            return StandardResponse.ok(_detail(ctx.tenant, membership_obj), meta=meta)

    _Action.codename = codename
    _Action.manager_only = manager_only
    if idempotent_scope:
        _Action.post = idempotent(idempotent_scope)(_Action.post)  # type: ignore[method-assign]
    _Action.__name__ = f"Member{service.__name__.title().replace('_', '')}View"
    return _Action


def _deposit_action(service: Any, codename: str) -> type:
    class _Deposit(_MemberView):
        def post(self, request: Any, membership_id: Any) -> Any:
            ctx = self.ctx()
            result = service(ctx=ctx, membership_id=membership_id, data=request.data)
            row = LibraryMembership.objects.get(tenant=ctx.tenant, pk=membership_id)
            meta = (
                {"applied": f"{result:.2f}"}
                if isinstance(result, Decimal)
                else {"payment": _payments([result])[0]}
            )
            return StandardResponse.ok(_detail(ctx.tenant, row), meta=meta)

    _Deposit.codename = codename
    _Deposit.__name__ = f"MemberDeposit{service.__name__.title()}View"
    return _Deposit


MemberRenewView = _action(members.renew, WRITE, idempotent_scope="library.member.renew")
MemberChangeTypeView = _action(members.change_type, WRITE)
# Renew and change-type stay with the codename: taking a month's fee and moving a
# student to another plan is counter work, not blocking or editing the person.
MemberSuspendView = _action(members.suspend, CLOSE, manager_only=True)
MemberReactivateView = _action(members.reactivate, CLOSE, manager_only=True)
MemberCloseView = _action(
    members.close, CLOSE, idempotent_scope="library.member.close", manager_only=True
)
MemberRejoinView = _action(
    members.rejoin, WRITE, idempotent_scope="library.member.rejoin", manager_only=True
)
MemberDepositReceiveView = _deposit_action(members.receive, WRITE)
MemberDepositApplyView = _deposit_action(members.apply, CLOSE)
MemberDepositRefundView = _deposit_action(members.refund, CLOSE)
