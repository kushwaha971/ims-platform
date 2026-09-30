"""`/deposits` (A4b, FRD 00 PLT-X02 §6) — thin by construction (Part 26 §26.7 R7.1).

There is no `POST /deposits`: opening a deposit is always the vertical's act, from
its own endpoint with its own codename (contracts §1.4). The core screens read
deposits and move money through them: receive, apply against what the party
owes, and return.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.pagination import CursorPagination
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.payments.constants import DepositStatus
from apps.payments.models import HeldDeposit
from apps.payments.permissions import DepositPermissions
from apps.payments.selectors.payments import detail_queryset
from apps.payments.serializers.deposits import (
    DepositApplySerializer,
    DepositDetailSerializer,
    DepositReceiveSerializer,
    DepositRefundSerializer,
    DepositSerializer,
)
from apps.payments.serializers.payment import PaymentDetailSerializer
from apps.payments.services import deposits

UUID_RE = r"[0-9a-fA-F-]{36}"
FILTERS = ("party_id", "module", "status", "subject_type", "subject_id")


class DepositPagination(CursorPagination):
    ordering = ("-created_at", "-id")


class DepositViewSet(
    TenantScopeMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    queryset = HeldDeposit.objects.all()
    serializer_class = DepositSerializer
    pagination_class = DepositPagination
    lookup_value_regex = UUID_RE
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.PAYMENTS), DepositPermissions]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def _filters(self) -> dict[str, Any]:
        params = self.request.query_params
        wanted = {name: params.get(name) for name in FILTERS if params.get(name)}
        status = wanted.get("status")
        if status and status not in DepositStatus.values:
            raise ValidationFailed({"status": ["Choose expected, held or released."]})
        for name in ("party_id", "subject_id"):
            if name in wanted:
                try:
                    wanted[name] = uuid.UUID(str(wanted[name]))
                except ValueError:
                    raise ValidationFailed({name: ["Not a valid id."]}) from None
        return wanted

    def get_queryset(self) -> Any:
        return deposits.deposits_for(tenant=self.get_tenant(), **self._filters())

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """`meta.totals.held` over the FILTERED set, beside the page."""
        queryset = self.get_queryset()
        held = queryset.order_by().aggregate(total=Sum("held_amount"))["total"]
        page = self.paginate_queryset(queryset)
        data = DepositSerializer(page, many=True).data
        return StandardResponse.ok(
            data, meta={**self.paginator.get_meta(), "totals": {"held": str(held or "0.00")}}
        )

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        deposit = get_object_or_404(
            HeldDeposit.objects.for_tenant(self.get_tenant()).select_related("party"),
            pk=kwargs["pk"],
        )
        return StandardResponse.ok(DepositDetailSerializer(deposit).data)

    def _payment(self, payment: Any) -> dict:
        return PaymentDetailSerializer(
            detail_queryset(tenant=self.get_tenant()).get(pk=payment.pk)
        ).data

    def _deposit(self, deposit: Any) -> dict:
        return DepositDetailSerializer(
            HeldDeposit.objects.select_related("party").get(pk=deposit.pk)
        ).data

    @action(detail=True, methods=["post"], url_path="receive")
    @idempotent("deposit_receive")
    def receive(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = DepositReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data
        result = deposits.receive_deposit(
            ctx=Ctx.from_request(request),
            deposit_id=kwargs["pk"],
            amount=body["amount"],
            mode_breakup=body["mode_breakup"],
            payment_date=body.get("payment_date") or None,
            reference=body.get("reference") or "",
            note=body.get("note") or "",
            version=body.get("version"),
        )
        return StandardResponse.created(
            {
                "deposit": self._deposit(result["deposit"]),
                "payment": self._payment(result["payment"]),
            }
        )

    @action(detail=True, methods=["post"], url_path="apply")
    @idempotent("deposit_apply")
    def apply(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = DepositApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data
        result = deposits.apply_deposit(
            ctx=Ctx.from_request(request),
            deposit_id=kwargs["pk"],
            allocations=body["allocations"],
            reason=body["reason"],
            version=body.get("version"),
        )
        application = result["application"]
        return StandardResponse.created(
            {
                "deposit": self._deposit(result["deposit"]),
                "application": {
                    "id": str(application.id),
                    "amount": str(application.amount),
                    "reason": application.reason,
                },
                "refund_payment": self._payment(result["refund_payment"]),
                "settle_payment": self._payment(result["settle_payment"]),
                "documents": result["documents"],
            }
        )

    @action(detail=True, methods=["post"], url_path="refund")
    @idempotent("deposit_refund")
    def refund(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = DepositRefundSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data
        result = deposits.refund_deposit(
            ctx=Ctx.from_request(request),
            deposit_id=kwargs["pk"],
            amount=body["amount"],
            mode_breakup=body["mode_breakup"],
            payment_date=body.get("payment_date") or None,
            reason=body["reason"],
            version=body.get("version"),
        )
        return StandardResponse.created(
            {
                "deposit": self._deposit(result["deposit"]),
                "payment": self._payment(result["payment"]),
            }
        )
