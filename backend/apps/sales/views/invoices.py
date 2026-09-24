"""`/sales/invoices` (SAL-02, SAL-03, SAL-06, SAL-07, SAL-08).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, coerce,
delegate to one service or selector, wrap in the envelope.
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
from apps.sales.constants import TAB_STATUSES
from apps.sales.filters import InvoiceFilterSet
from apps.sales.models import SalesDocument
from apps.sales.permissions import InvoicePermissions
from apps.sales.selectors.documents import (
    ORDERING_FIELDS,
    apply_tab,
    detail_queryset,
    list_invoices,
    list_totals,
    tab_counts,
)
from apps.sales.serializers.document import (
    DocumentReadSerializer,
    InvoiceListSerializer,
    InvoiceWriteSerializer,
    IssueSerializer,
    ShareLinkSerializer,
)
from apps.sales.services import documents as drafts
from apps.sales.services.issue import issue_invoice
from apps.sales.services.issue_parts import rule46_for
from apps.sales.services.share import create_share_link, upi_intent


def _require_key(request: Any) -> None:
    """FR-13 — `Idempotency-Key` is mandatory on both issuing calls (EC-8)."""
    if not request.headers.get("Idempotency-Key"):
        raise ValidationFailed(
            {"idempotency_key": ["Idempotency-Key header is required to issue."]}
        )


def _rule46(document: SalesDocument) -> dict:
    rows = [
        {"hsn_sac": line.hsn_sac, "description": line.description} for line in document.lines.all()
    ]
    return rule46_for(document.tenant, document, rows)


def _envelope(
    document: SalesDocument, *, warnings: list | None = None, extra: dict | None = None
) -> dict:
    document = detail_queryset(tenant=document.tenant).get(pk=document.pk)
    meta = {"warnings": warnings or [], "rule46": _rule46(document), **(extra or {})}
    return {"data": DocumentReadSerializer(document).data, "meta": meta}


class InvoiceViewSet(
    TenantScopeMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = SalesDocument.objects.all()
    serializer_class = DocumentReadSerializer
    filterset_class = InvoiceFilterSet
    ordering_fields = ORDERING_FIELDS
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.SALES), InvoicePermissions]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_invoices(tenant=self.get_tenant())
        return detail_queryset(tenant=self.get_tenant())

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        tab = request.query_params.get("tab") or "all"
        if tab not in TAB_STATUSES:
            raise ValidationFailed({"tab": ["Choose all, unpaid, overdue, paid, draft or void."]})
        ordering = (request.query_params.get("ordering") or "").strip()
        if ordering and ordering.lstrip("-") not in ORDERING_FIELDS:
            raise ValidationFailed({"ordering": [f"Sort by one of {', '.join(ORDERING_FIELDS)}."]})
        filtered = self.filter_queryset(self.get_queryset())
        tabs = tab_counts(filtered)
        queryset = apply_tab(filtered, tab)
        totals = list_totals(queryset)
        page = self.paginate_queryset(queryset)
        data = InvoiceListSerializer(
            page, many=True, context={"today": tenant_today(self.get_tenant())}
        ).data
        meta = {
            **self.paginator.get_meta(),
            "totals": {
                "count": totals["count"],
                "grand_total": str(totals["grand_total"]),
                "amount_due": str(totals["amount_due"]),
            },
            "tabs": tabs,
        }
        return StandardResponse.ok(data, meta=meta)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        document = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        body = _envelope(document)
        return StandardResponse.ok(body["data"], meta=body["meta"])

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        if request.query_params.get("issue") == "true":
            _require_key(request)
            return self._create_and_issue(request)
        serializer = InvoiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = drafts.create_draft(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        body = _envelope(result["document"], warnings=result["warnings"])
        return StandardResponse.created(body["data"], meta=body["meta"])

    @idempotent("sales_invoice_issue")
    def _create_and_issue(self, request: Any) -> Any:
        from django.db import transaction

        serializer = InvoiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        ctx = Ctx.from_request(request)
        with transaction.atomic():
            draft = drafts.create_draft(ctx=ctx, payload=payload)["document"]
            result = issue_invoice(
                ctx=ctx,
                document_id=draft.id,
                payment=payload.get("payment"),
                override=bool(payload.get("override")),
            )
        return self._issued_response(result, created=True)

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = InvoiceWriteSerializer(data=request.data)
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
    @action(detail=True, methods=["post"], url_path="issue")
    def issue(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        _require_key(request)
        return self._issue(request, kwargs["pk"])

    @idempotent("sales_invoice_issue")
    def _issue(self, request: Any, pk: Any) -> Any:
        serializer = IssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = issue_invoice(
            ctx=Ctx.from_request(request),
            document_id=pk,
            payment=data.get("payment"),
            override=bool(data.get("override")),
            version=data.get("version"),
        )
        return self._issued_response(result, created=False)

    def _issued_response(self, result: dict, *, created: bool) -> Any:
        extra: dict[str, Any] = {}
        if result["party_balance"] is not None:
            extra["party_balance"] = str(result["party_balance"])
        if result["ledger_entry_id"]:
            extra["ledger_entry_id"] = result["ledger_entry_id"]
        body = _envelope(result["document"], warnings=result["warnings"], extra=extra)
        if created:
            return StandardResponse.created(body["data"], meta=body["meta"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    @action(detail=True, methods=["post"], url_path="share-links")
    def share_links(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = ShareLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        link = create_share_link(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            expires_in_days=serializer.validated_data.get("expires_in_days"),
            channel=serializer.validated_data.get("channel"),
        )
        return StandardResponse.created(link)

    @action(detail=True, methods=["get"], url_path="upi-intent")
    def upi_intent(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        document = get_object_or_404(detail_queryset(tenant=self.get_tenant()), pk=kwargs["pk"])
        return StandardResponse.ok(upi_intent(document))
