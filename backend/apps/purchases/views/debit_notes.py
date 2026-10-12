"""`/purchases/debit-notes` (Shop P0, PUR-07) — goods sent back to a supplier.

`POST` writes AND issues a note against one bill (there is no draft); `void`
undoes it. The list has the bill list's shape with its own tabs, and its totals
are the issued notes' value and the credit still open with suppliers.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.money import ZERO
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.purchases.constants import (
    DEBIT_NOTE_KINDS,
    DEBIT_NOTE_REASONS,
    DEBIT_NOTE_TAB_STATUSES,
)
from apps.purchases.filters import PurchaseBillFilterSet
from apps.purchases.models import PurchaseDocument
from apps.purchases.permissions import DebitNotePermissions
from apps.purchases.selectors.bills import (
    ORDERING_FIELDS,
    apply_tab,
    detail_queryset,
    list_bills,
    tab_counts,
)
from apps.purchases.serializers.bill import BillListSerializer, BillReadSerializer, VoidSerializer
from apps.purchases.services import debit_notes as service


class _ReturnLineSerializer(serializers.Serializer):
    bill_line_no = serializers.IntegerField(min_value=1)
    qty = serializers.DecimalField(max_digits=14, decimal_places=3)


class DebitNoteWriteSerializer(serializers.Serializer):
    against_id = serializers.UUIDField()
    document_date = serializers.DateField(required=False, allow_null=True)
    reason = serializers.ChoiceField(choices=DEBIT_NOTE_REASONS)
    reason_note = serializers.CharField(required=False, allow_blank=True, max_length=400)
    restock = serializers.BooleanField(required=False, default=True)
    lines = _ReturnLineSerializer(many=True)


def _note_envelope(document: PurchaseDocument, *, extra: dict | None = None) -> dict:
    document = detail_queryset(tenant=document.tenant, kinds=DEBIT_NOTE_KINDS).get(pk=document.pk)
    return {"data": BillReadSerializer(document).data, "meta": {"warnings": [], **(extra or {})}}


class DebitNoteViewSet(
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
        DebitNotePermissions,
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_bills(tenant=self.get_tenant(), kinds=DEBIT_NOTE_KINDS)
        return detail_queryset(tenant=self.get_tenant(), kinds=DEBIT_NOTE_KINDS)

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tab = request.query_params.get("tab") or "all"
        if tab not in DEBIT_NOTE_TAB_STATUSES:
            raise ValidationFailed(
                {"tab": [f"Choose one of {', '.join(DEBIT_NOTE_TAB_STATUSES)}."]}
            )
        ordering = (request.query_params.get("ordering") or "").strip()
        if ordering and ordering.lstrip("-") not in ORDERING_FIELDS:
            raise ValidationFailed({"ordering": [f"Sort by one of {', '.join(ORDERING_FIELDS)}."]})
        filtered = self.filter_queryset(self.get_queryset())
        counts = tab_counts(filtered, DEBIT_NOTE_TAB_STATUSES)
        queryset = apply_tab(filtered, tab, DEBIT_NOTE_TAB_STATUSES)
        standing = Q(status="issued")
        totals = queryset.order_by().aggregate(
            count=Count("id"),
            grand_total=Coalesce(Sum("grand_total", filter=standing), Value(ZERO)),
            amount_due=Coalesce(Sum("amount_due", filter=standing), Value(ZERO)),
        )
        page = self.paginate_queryset(queryset)
        data = BillListSerializer(
            page, many=True, context={"today": tenant_today(self.get_tenant())}
        ).data
        meta = {
            **self.paginator.get_meta(),
            # Approved designs (12 Oct 2026): does this kind exist at all, whatever
            # the filters? An empty book hides its search, tabs and ₹0 totals.
            "has_any": self.get_queryset().exists(),
            "totals": {
                "count": totals["count"],
                "grand_total": str(totals["grand_total"]),
                # The credit still open with suppliers — what no bill could take.
                "amount_due": str(totals["amount_due"]),
            },
            "counts": counts,
        }
        return StandardResponse.ok(data, meta=meta)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        body = _note_envelope(get_object_or_404(self.get_queryset(), pk=kwargs["pk"]))
        return StandardResponse.ok(body["data"], meta=body["meta"])

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = DebitNoteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.issue_debit_note(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        body = _note_envelope(
            result["document"],
            extra={
                "applied": str(result["applied"]),
                "party_balance": (
                    str(result["party_balance"]) if result["party_balance"] is not None else None
                ),
            },
        )
        return StandardResponse.created(body["data"], meta=body["meta"])

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = VoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.void_debit_note(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason") or "",
        )
        body = _note_envelope(result["document"])
        return StandardResponse.ok(body["data"], meta=body["meta"])
