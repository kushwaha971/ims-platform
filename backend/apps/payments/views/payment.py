"""`/payments` (PAY-01 … PAY-05) — thin by construction (Part 26 §26.7 R7.1).

Authenticate, authorise, coerce, delegate to one service or selector, wrap the
result in the envelope.
"""

from __future__ import annotations

import uuid
from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.payments.constants import PaymentDirection
from apps.payments.filters import PaymentFilterSet
from apps.payments.models import Payment
from apps.payments.permissions import PaymentPermissions, UpiPermissions
from apps.payments.selectors.payments import (
    detail_queryset,
    list_payments,
    open_documents,
    payment_totals,
)
from apps.payments.serializers.payment import (
    PaymentAllocateSerializer,
    PaymentDetailSerializer,
    PaymentListSerializer,
    PaymentVoidSerializer,
    PaymentWriteSerializer,
    UpiIntentSerializer,
)
from apps.payments.services.allocate import allocate_existing
from apps.payments.services.receipt import receipt_share_text, record_receipt_share
from apps.payments.services.record import record_payment
from apps.payments.services.upi import upi_intent
from apps.payments.services.void import void_payment

UUID_RE = r"[0-9a-fA-F-]{36}"


def _money_meta(result: dict) -> dict:
    """The figures a write answers with: the khata's new balance and each moved document."""
    meta: dict[str, Any] = {"documents": result.get("documents") or []}
    if result.get("party_balance") is not None:
        meta["party_balance"] = str(result["party_balance"])
    return meta


class PaymentViewSet(
    TenantScopeMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """List, record, read and void. **No update and no destroy** — a payment is
    voided and recorded again (PAY-05 FR-7), never edited."""

    queryset = Payment.objects.all()
    serializer_class = PaymentDetailSerializer
    filterset_class = PaymentFilterSet
    ordering_fields = ("payment_date", "amount", "created_at", "number")
    lookup_value_regex = UUID_RE
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.PAYMENTS), PaymentPermissions]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        # A payment write is a money write of the ledger's shape and frequency.
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_payments(tenant=self.get_tenant())
        return detail_queryset(tenant=self.get_tenant())

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """A page and `meta.totals` over the FILTERED set (FR-10) — voids never counted."""
        queryset = self.filter_queryset(self.get_queryset())
        totals = payment_totals(queryset)
        page = self.paginate_queryset(queryset)
        data = PaymentListSerializer(page, many=True).data
        return StandardResponse.ok(data, meta={**self.paginator.get_meta(), "totals": totals})

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        payment = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        return StandardResponse.ok(PaymentDetailSerializer(payment).data)

    @idempotent("payment_create")
    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """FR-3 — 201 with the payment, the party's new balance and each moved document."""
        serializer = PaymentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = record_payment(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        payment = detail_queryset(tenant=self.get_tenant()).get(pk=result["payment"].pk)
        return StandardResponse.created(
            PaymentDetailSerializer(payment).data, meta=_money_meta(result)
        )

    # `@action` OUTERMOST — wrapped the other way round the router never sees it.
    @action(detail=True, methods=["post"], url_path="void")
    @idempotent("payment_void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """PAY-05 FR-3 — void with a reason; bills reopen, the khata line is reversed."""
        serializer = PaymentVoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = void_payment(
            ctx=Ctx.from_request(request),
            payment_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason"),
        )
        payment = detail_queryset(tenant=self.get_tenant()).get(pk=result["payment"].pk)
        meta = _money_meta(result)
        if result["reversal_entry_id"]:
            meta["reversal_entry_id"] = result["reversal_entry_id"]
        return StandardResponse.ok(PaymentDetailSerializer(payment).data, meta=meta)

    @action(detail=True, methods=["post"], url_path="allocations")
    @idempotent("payment_allocate")
    def allocations(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """A4a (PLT-X03 §6) — apply what is not yet applied to open documents.

        Posts no ledger line: the money was on the khata as an advance already (BR-3). 200 with
        the payment, the rows applied and each moved document; `meta.party_balance` unchanged.
        """
        serializer = PaymentAllocateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = allocate_existing(
            ctx=Ctx.from_request(request),
            payment_id=kwargs["pk"],
            allocations=serializer.validated_data.get("allocations"),
            reason=serializer.validated_data.get("reason") or "",
        )
        payment = detail_queryset(tenant=self.get_tenant()).get(pk=result["payment"].pk)
        meta: dict[str, Any] = {}
        if result["party_balance"] is not None:
            meta["party_balance"] = str(result["party_balance"])
        return StandardResponse.ok(
            {
                "payment": PaymentDetailSerializer(payment).data,
                "allocations": result["allocations"],
                "documents": result["documents"],
            },
            meta=meta,
        )

    @action(detail=False, methods=["get"], url_path="open-documents")
    def open_documents(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """FR-2 — the allocation panel's rows for one party, oldest first."""
        party_id = request.query_params.get("party_id")
        direction = request.query_params.get("direction") or PaymentDirection.IN
        if direction not in PaymentDirection.values:
            raise ValidationFailed({"direction": ["Choose in or out."]})
        if not party_id:
            raise ValidationFailed({"party_id": ["Choose a party."]})
        try:
            uuid.UUID(str(party_id))
        except ValueError:
            raise ValidationFailed({"party_id": ["Choose a party."]}) from None
        # A4a — Apply to bills asks for the payment's bucket; the record panel sends none.
        bucket = request.query_params.get("bucket") or None
        if bucket is not None and bucket not in ("main", "loan", "deposit"):
            raise ValidationFailed({"bucket": ["Choose main, loan or deposit."]})
        rows = open_documents(
            tenant=self.get_tenant(), party_id=party_id, direction=direction, bucket=bucket
        )
        return StandardResponse.ok(rows)

    @action(detail=True, methods=["post"], url_path="share")
    def share(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """PAY-04 BR-4 — the WhatsApp text, rendered here so the client composes no money.

        A POST under `payments.payment.write` (§12: the accountant prints, and
        does not hand receipts to customers), audited as `payment.receipt_shared`.
        """
        payment = get_object_or_404(detail_queryset(tenant=self.get_tenant()), pk=kwargs["pk"])
        text = receipt_share_text(payment, locale=request.data.get("locale"))
        record_receipt_share(
            ctx=Ctx.from_request(request),
            payment=payment,
            channel=str(request.data.get("channel") or "whatsapp")[:16],
        )
        mobile = payment.party.mobile if payment.party_id and payment.party else None
        return StandardResponse.ok({"text": text, "mobile": mobile})


class UpiIntentView(TenantScopeMixin, APIView):
    """`POST /payments/upi-intent` — the Collect sheet's dynamic QR (PAY-03 FR-5)."""

    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.PAYMENTS), UpiPermissions]
    throttle_classes = [ScopedUserRateThrottle]

    def post(self, request: Any) -> Any:
        serializer = UpiIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return StandardResponse.ok(
            upi_intent(
                tenant=self.get_tenant(),
                amount=data.get("amount"),
                note=data.get("note") or "",
                party_id=data.get("party_id"),
            )
        )
