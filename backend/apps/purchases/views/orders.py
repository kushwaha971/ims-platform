"""`/purchases/orders` (Shop item 3) — the bill's routes, for what was ordered.

Status moves are actions: `send` (draft → sent, numbered), `cancel` (sent →
cancelled, with a reason) and `create-bill`, which answers 201 with the new
DRAFT purchase bill, ready for the supplier's own number.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.purchases.constants import ORDER_KINDS, ORDER_TAB_STATUSES
from apps.purchases.filters import PurchaseBillFilterSet
from apps.purchases.models import PurchaseDocument
from apps.purchases.permissions import PurchaseOrderPermissions
from apps.purchases.selectors.bills import (
    ORDERING_FIELDS,
    apply_tab,
    detail_queryset,
    list_bills,
    tab_counts,
)
from apps.purchases.serializers.bill import (
    BillListSerializer,
    BillReadSerializer,
    BillWriteSerializer,
)
from apps.purchases.services import purchase_orders as service
from apps.purchases.views.bills import _envelope

#: Not on order any more: a draft, or one called off.
Q_NOT_COUNTED = Q(status__in=("draft", "cancelled"))


class _VersionSerializer(serializers.Serializer):
    version = serializers.IntegerField(required=False)


class _CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=160, allow_blank=True)


def _order_envelope(document: PurchaseDocument, *, warnings: list | None = None) -> dict:
    document = detail_queryset(tenant=document.tenant, kinds=ORDER_KINDS).get(pk=document.pk)
    return {"data": BillReadSerializer(document).data, "meta": {"warnings": warnings or []}}


class PurchaseOrderViewSet(
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
        PurchaseOrderPermissions,
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_bills(tenant=self.get_tenant(), kinds=ORDER_KINDS)
        return detail_queryset(tenant=self.get_tenant(), kinds=ORDER_KINDS)

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        from django.db.models import Count, Sum, Value
        from django.db.models.functions import Coalesce

        from apps.common.money import ZERO

        tab = request.query_params.get("tab") or "all"
        if tab not in ORDER_TAB_STATUSES:
            raise ValidationFailed({"tab": [f"Choose one of {', '.join(ORDER_TAB_STATUSES)}."]})
        ordering = (request.query_params.get("ordering") or "").strip()
        if ordering and ordering.lstrip("-") not in ORDERING_FIELDS:
            raise ValidationFailed({"ordering": [f"Sort by one of {', '.join(ORDERING_FIELDS)}."]})
        filtered = self.filter_queryset(self.get_queryset())
        counts = tab_counts(filtered, ORDER_TAB_STATUSES)
        queryset = apply_tab(filtered, tab, ORDER_TAB_STATUSES)
        # What is still to arrive: sent orders' estimated value; drafts and cancels are not.
        totals = queryset.order_by().aggregate(
            count=Count("id"),
            grand_total=Coalesce(Sum("grand_total", filter=~Q_NOT_COUNTED), Value(ZERO)),
        )
        page = self.paginate_queryset(queryset)
        data = BillListSerializer(
            page, many=True, context={"today": tenant_today(self.get_tenant())}
        ).data
        meta = {
            **self.paginator.get_meta(),
            "totals": {
                "count": totals["count"],
                "grand_total": str(totals["grand_total"]),
                "amount_due": "0.00",
            },
            "counts": counts,
        }
        return StandardResponse.ok(data, meta=meta)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        body = _order_envelope(get_object_or_404(self.get_queryset(), pk=kwargs["pk"]))
        return StandardResponse.ok(body["data"], meta=body["meta"])

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = BillWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {k: v for k, v in serializer.validated_data.items() if k != "payment"}
        result = service.create_order(ctx=Ctx.from_request(request), payload=payload)
        body = _order_envelope(result["document"], warnings=result["warnings"])
        return StandardResponse.created(body["data"], meta=body["meta"])

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = BillWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        payload = {k: v for k, v in serializer.validated_data.items() if k != "payment"}
        result = service.update_order(
            ctx=Ctx.from_request(request), document_id=kwargs["pk"], payload=payload
        )
        body = _order_envelope(result["document"], warnings=result["warnings"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    def destroy(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        service.delete_order(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        return StandardResponse.no_content()

    @action(detail=True, methods=["post"], url_path="send")
    def send(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = _VersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.send(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            version=serializer.validated_data.get("version"),
        )
        body = _order_envelope(result["document"], warnings=result["warnings"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = _CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.cancel(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason") or "",
        )
        body = _order_envelope(result["document"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    @action(detail=True, methods=["post"], url_path="create-bill")
    def create_bill(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        result = service.create_bill(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        body = _envelope(
            result["document"],
            warnings=result["warnings"],
            extra={"order": {"id": str(result["order"].id), "status": "billed"}},
        )
        return StandardResponse.created(body["data"], meta=body["meta"])
