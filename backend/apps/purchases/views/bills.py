"""`/purchases/bills` (PUR-01, PUR-03, PUR-04).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, coerce,
delegate to one service or selector, wrap in the envelope — the shape of
`apps/sales/views/invoices.py`, with `record` for `issue` and a `void`.
"""

from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.purchases.constants import TAB_STATUSES
from apps.purchases.filters import PurchaseBillFilterSet
from apps.purchases.models import PurchaseDocument
from apps.purchases.permissions import PurchaseBillPermissions
from apps.purchases.selectors.bills import (
    ORDERING_FIELDS,
    apply_tab,
    detail_queryset,
    list_bills,
    list_totals,
    tab_counts,
)
from apps.purchases.serializers.bill import (
    BillListSerializer,
    BillReadSerializer,
    BillWriteSerializer,
    RecordSerializer,
    VoidSerializer,
)
from apps.purchases.services import drafts
from apps.purchases.services.record import record_bill
from apps.purchases.services.void import void_bill


def _require_key(request: Any) -> None:
    """BR-13 — `Idempotency-Key` is mandatory on both recording calls."""
    if not request.headers.get("Idempotency-Key"):
        raise ValidationFailed(
            {"idempotency_key": ["Idempotency-Key header is required to record."]}
        )


def _envelope(
    document: PurchaseDocument, *, warnings: list | None = None, extra: dict | None = None
) -> dict:
    document = detail_queryset(tenant=document.tenant).get(pk=document.pk)
    meta = {"warnings": warnings or [], **(extra or {})}
    return {"data": BillReadSerializer(document).data, "meta": meta}


class PurchaseBillViewSet(
    TenantScopeMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = PurchaseDocument.objects.all()
    serializer_class = BillReadSerializer
    filterset_class = PurchaseBillFilterSet
    ordering_fields = ORDERING_FIELDS
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.PURCHASES),
        PurchaseBillPermissions,
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_bills(tenant=self.get_tenant())
        return detail_queryset(tenant=self.get_tenant())

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tab = request.query_params.get("tab") or "all"
        if tab not in TAB_STATUSES:
            raise ValidationFailed({"tab": ["Choose all, unpaid, overdue, paid, draft or void."]})
        ordering = (request.query_params.get("ordering") or "").strip()
        if ordering and ordering.lstrip("-") not in ORDERING_FIELDS:
            raise ValidationFailed({"ordering": [f"Sort by one of {', '.join(ORDERING_FIELDS)}."]})
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise ValidationFailed({"date_to": ["End date is before the start date."]})
        filtered = self.filter_queryset(self.get_queryset())
        counts = tab_counts(filtered)
        queryset = apply_tab(filtered, tab)
        totals = list_totals(queryset)
        page = self.paginate_queryset(queryset)
        data = BillListSerializer(
            page, many=True, context={"today": tenant_today(self.get_tenant())}
        ).data
        meta = {
            **self.paginator.get_meta(),
            "totals": {
                "count": totals["count"],
                "grand_total": str(totals["grand_total"]),
                "amount_due": str(totals["amount_due"]),
            },
            "counts": counts,
        }
        return StandardResponse.ok(data, meta=meta)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        document = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        body = _envelope(document)
        return StandardResponse.ok(body["data"], meta=body["meta"])

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        if request.query_params.get("record") == "true":
            _require_key(request)
            return self._create_and_record(request)
        serializer = BillWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = drafts.create_draft(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        body = _envelope(result["document"], warnings=result["warnings"])
        return StandardResponse.created(body["data"], meta=body["meta"])

    @idempotent("purchase_bill_record")
    def _create_and_record(self, request: Any) -> Any:
        from django.db import transaction

        serializer = BillWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ctx = Ctx.from_request(request)
        with transaction.atomic():
            draft = drafts.create_draft(ctx=ctx, payload=dict(serializer.validated_data))
            result = record_bill(ctx=ctx, document_id=draft["document"].id)
        return self._recorded_response(result, created=True)

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = BillWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        result = drafts.update_draft(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            payload=dict(serializer.validated_data),
        )
        body = _envelope(result["document"], warnings=result["warnings"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    def destroy(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        drafts.delete_draft(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        return StandardResponse.no_content()

    # `@action` OUTERMOST — wrapped the other way the router never sees the route.
    @action(detail=True, methods=["post"], url_path="record")
    def record(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        _require_key(request)
        return self._record(request, kwargs["pk"])

    @idempotent("purchase_bill_record")
    def _record(self, request: Any, pk: Any) -> Any:
        serializer = RecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = record_bill(
            ctx=Ctx.from_request(request),
            document_id=pk,
            version=serializer.validated_data.get("version"),
        )
        return self._recorded_response(result, created=False)

    def _recorded_response(self, result: dict, *, created: bool) -> Any:
        extra: dict[str, Any] = {"movement_ids": result["movement_ids"]}
        if result["party_balance"] is not None:
            extra["party_balance"] = str(result["party_balance"])
        if result["ledger_entry_id"]:
            extra["ledger_entry_id"] = result["ledger_entry_id"]
        body = _envelope(result["document"], warnings=result["warnings"], extra=extra)
        if created:
            return StandardResponse.created(body["data"], meta=body["meta"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return self._void(request, kwargs["pk"])

    @idempotent("purchase_bill_void")
    def _void(self, request: Any, pk: Any) -> Any:
        serializer = VoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = void_bill(
            ctx=Ctx.from_request(request),
            document_id=pk,
            reason=serializer.validated_data.get("reason"),
        )
        extra: dict[str, Any] = {
            "reversal_movements": result["reversal_movement_ids"],
            "released_payments": result["released_payments"],
        }
        if result["reversal_entry_id"]:
            extra["reversal_ledger_entry_id"] = result["reversal_entry_id"]
        if result["party_balance"] is not None:
            extra["party_balance"] = str(result["party_balance"])
        body = _envelope(result["document"], extra=extra)
        return StandardResponse.ok(body["data"], meta=body["meta"])
