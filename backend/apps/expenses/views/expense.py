"""`/expenses`, `/expense-categories` and `/cashbook` (EXP-01, EXP-02, EXP-03).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, delegate to
one selector or one service, wrap the result in the envelope.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import PermissionDenied, ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.permissions import ModuleEnabled
from apps.common.permissions_registry import permissions_for
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.expenses.constants import BUCKETS, CASH_BUCKET, CASHBOOK_MAX_DAYS
from apps.expenses.filters import ExpenseFilterSet
from apps.expenses.models import Expense
from apps.expenses.permissions import (
    FINANCIAL_READ,
    CashbookPermissions,
    ExpenseCategoryPermissions,
    ExpensePermissions,
)
from apps.expenses.selectors.cashbook import build_cashbook
from apps.expenses.selectors.expense import (
    default_to_recorded,
    expense_detail_queryset,
    expense_totals,
    list_categories,
    list_expenses,
)
from apps.expenses.serializers.expense import (
    ExpenseCategorySerializer,
    ExpenseCategoryWriteSerializer,
    ExpenseSerializer,
    ExpenseTotalsSerializer,
    ExpenseVoidSerializer,
    ExpenseWriteSerializer,
)
from apps.expenses.services.categories import create_category
from apps.expenses.services.record import record_expense
from apps.expenses.services.void import void_expense


def _write_throttles(request: Any) -> list[Any]:
    """Reads on the user budget; writes on `ledger_write`.

    An expense write is a money write of the same shape and frequency as a
    ledger entry — often it IS one, when it is unpaid — so it shares that
    ceiling (120/min per user) rather than adding a scope to settings for the
    same number. What it stops is a loop, not a shopkeeper.
    """
    if request.method in SAFE_METHODS:
        return [ScopedUserRateThrottle("user")]
    return [ScopedUserRateThrottle("ledger_write")]


class ExpenseViewSet(
    TenantScopeMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """List, record, read and void. **No update and no destroy in this wave.**

    FR-11's 24-hour edit window is not built, so PATCH is not routed: 405 is
    the truthful answer where a permission check would say "ask for rights".
    DELETE never will be — BR-8, void is how an expense is withdrawn.
    """

    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    filterset_class = ExpenseFilterSet
    ordering_fields = ("expense_date", "amount", "created_at")
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.EXPENSES), ExpensePermissions]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        return _write_throttles(self.request)

    def get_serializer_class(self) -> Any:
        if self.action == "create":
            return ExpenseWriteSerializer
        if self.action == "void":
            return ExpenseVoidSerializer
        return ExpenseSerializer

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_expenses(tenant=self.get_tenant())
        return expense_detail_queryset(tenant=self.get_tenant())

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """A page of expenses and `meta.totals` over the FILTERED set (FR-9, T-EXP-01-9).

        The totals run before the paginator slices, so "Total ₹41,230 · 62
        expenses" is the whole filtered set, not the 25 rows on screen.
        """
        queryset = default_to_recorded(
            self.filter_queryset(self.get_queryset()), request.query_params
        )
        totals = expense_totals(queryset)
        page = self.paginate_queryset(queryset)
        data = ExpenseSerializer(page, many=True).data
        meta = {**self.paginator.get_meta(), "totals": ExpenseTotalsSerializer(totals).data}
        return StandardResponse.ok(data, meta=meta)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        expense = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        return StandardResponse.ok(ExpenseSerializer(expense).data)

    @idempotent("expense_create")
    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """201 with the expense and, when unpaid, the party's new balance (FR-8).

        Idempotent because a lost response on a counter's 2G connection is
        otherwise two ₹500 expenses and a cashbook short by ₹500 at closing.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = record_expense(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        meta: dict[str, Any] = {}
        if result["party_balance"] is not None:
            meta["party_balance"] = str(result["party_balance"])
        if result["ledger_entry_id"]:
            meta["ledger_entry_id"] = result["ledger_entry_id"]
        return StandardResponse.created(
            ExpenseSerializer(result["expense"]).data, meta=meta or None
        )

    # `@action` OUTERMOST — the ledger's views record why: wrapped the other
    # way round, the router never sees the route and the button 404s.
    @action(detail=True, methods=["post"], url_path="void")
    @idempotent("expense_void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """FR-12 — withdraw an expense with a reason, reversing its ledger line."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = void_expense(
            ctx=Ctx.from_request(request),
            expense_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason"),
        )
        meta: dict[str, Any] = {}
        if result["party_balance"] is not None:
            meta["party_balance"] = str(result["party_balance"])
        if result["reversal_entry_id"]:
            meta["reversal_entry_id"] = result["reversal_entry_id"]
        return StandardResponse.ok(ExpenseSerializer(result["expense"]).data, meta=meta or None)


class ExpenseCategoryViewSet(
    TenantScopeMixin, mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet
):
    """`GET /expense-categories` (unpaginated, ≤ 40 + archived) and inline create."""

    serializer_class = ExpenseCategorySerializer
    pagination_class = None
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.EXPENSES),
        ExpenseCategoryPermissions,
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        return _write_throttles(self.request)

    def get_serializer_class(self) -> Any:
        return (
            ExpenseCategoryWriteSerializer if self.action == "create" else ExpenseCategorySerializer
        )

    def get_queryset(self) -> Any:
        """`?status=all` includes archived rows — the list screen needs them to
        label historical expenses "(archived)" (EC-5); the picker filters them."""
        include_archived = self.request.query_params.get("status") == "all"
        return list_categories(tenant=self.get_tenant(), include_archived=include_archived)

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return StandardResponse.ok(ExpenseCategorySerializer(self.get_queryset(), many=True).data)

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """201 for a new category; 200 with the existing one for a duplicate name (EC-1).

        Not idempotency-keyed, and it does not need to be: a replay of the
        same name answers with the row the first call created.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = create_category(
            ctx=Ctx.from_request(request), name=serializer.validated_data["name"]
        )
        body = ExpenseCategorySerializer(result["category"]).data
        if result["created"]:
            return StandardResponse.created(body)
        return StandardResponse.ok(body, meta={"existing": True})


def _parse_query_date(raw: str | None, field: str, details: dict) -> dt.date | None:
    if not raw:
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        details[field] = ["Enter a date as YYYY-MM-DD."]
        return None


class CashbookView(APIView):
    """`GET /cashbook?date_from&date_to&bucket` — EXP-03 FR-3.

    ── The staff scope is enforced HERE, not in the client (FR-13, BR-12) ─────
    §19 calls it the feature's main authorisation risk: the cashbook is the
    business's whole cash position. Without `reports.financial.read` a member
    may ask for today and the cash bucket and nothing else — a range that is
    not exactly today, or a bucket that is not cash, is a 403. Omitting the
    parameters is asking for exactly that scope, so the till screen needs no
    special request.
    """

    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.EXPENSES), CashbookPermissions]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        membership = getattr(tenant, "_ub_membership", None)
        financial = membership is not None and FINANCIAL_READ in permissions_for(membership)
        today = tenant_today(tenant)

        details: dict[str, list[str]] = {}
        params = request.query_params
        date_from = _parse_query_date(params.get("date_from"), "date_from", details)
        date_to = _parse_query_date(params.get("date_to"), "date_to", details)
        bucket = (params.get("bucket") or ("all" if financial else CASH_BUCKET)).strip()
        if bucket not in ("all", *BUCKETS):
            details["bucket"] = ["Choose all, cash or bank."]
        if details:
            raise ValidationFailed(details)

        date_from = date_from or today
        date_to = date_to or date_from
        if date_from > date_to:
            raise ValidationFailed({"date_to": ["The end date cannot be before the start date."]})
        if (date_to - date_from).days + 1 > CASHBOOK_MAX_DAYS:
            raise ValidationFailed({"date_to": ["Choose a range of one year or less."]})
        if date_to > today:
            raise ValidationFailed({"date_to": ["The date cannot be in the future."]})

        if not financial and (date_from != today or date_to != today or bucket != CASH_BUCKET):
            raise PermissionDenied(
                "You can see today's cash only.", details={"scope": "today_cash"}
            )

        buckets = BUCKETS if bucket == "all" else (bucket,)
        data = build_cashbook(tenant=tenant, date_from=date_from, date_to=date_to, buckets=buckets)
        rows_total = data.pop("rows_total")
        data["scope"] = "full" if financial else "today_cash"
        return StandardResponse.ok(
            data,
            meta={"rows_total": rows_total, "generated_at": dt.datetime.now(dt.UTC).isoformat()},
        )
