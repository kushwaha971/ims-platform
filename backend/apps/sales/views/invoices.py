"""`/sales/invoices` (SAL-02, SAL-03, SAL-05, SAL-06, SAL-07, SAL-08).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, coerce,
delegate to one service or selector, wrap in the envelope. Only the tax kinds
(`invoice`, `bill_of_supply`) are reachable here: an estimate's or a credit
note's id is a 404 on every action, so no invoice write can land on either.
"""

from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
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
from apps.sales.selectors.documents import ORDERING_FIELDS, detail_queryset, list_invoices
from apps.sales.serializers.document import (
    DocumentReadSerializer,
    InvoiceWriteSerializer,
    IssueSerializer,
    ShareLinkSerializer,
)
from apps.sales.serializers.flows import VoidSerializer
from apps.sales.services import documents as drafts
from apps.sales.services.issue import issue_invoice
from apps.sales.services.share import create_share_link, upi_intent
from apps.sales.services.void import void_invoice
from apps.sales.views.common import created, envelope, ok, tabbed_list


def _require_key(request: Any) -> None:
    """FR-13 — `Idempotency-Key` is mandatory on both issuing calls (EC-8)."""
    if not request.headers.get("Idempotency-Key"):
        raise ValidationFailed(
            {"idempotency_key": ["Idempotency-Key header is required to issue."]}
        )


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
        return tabbed_list(self, request, TAB_STATUSES)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return ok(get_object_or_404(self.get_queryset(), pk=kwargs["pk"]))

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        if request.query_params.get("issue") == "true":
            _require_key(request)
            return self._create_and_issue(request)
        serializer = InvoiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = drafts.create_draft(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        return created(result["document"], warnings=result["warnings"])

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
        return ok(result["document"], warnings=result["warnings"])

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
        body = envelope(result["document"], warnings=result["warnings"], extra=extra)
        if created:
            return StandardResponse.created(body["data"], meta=body["meta"])
        return StandardResponse.ok(body["data"], meta=body["meta"])

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """SAL-05 — `{reason}` → the void document, its reversals and the payments left over."""
        serializer = VoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = void_invoice(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason"),
        )
        extra: dict[str, Any] = {
            "reversals": result["reversals"],
            "unallocated_payments": result["unallocated_payments"],
            "released_credit": result["released_credit"],
        }
        if result["party_balance"] is not None:
            extra["party_balance"] = str(result["party_balance"])
        return ok(result["document"], extra=extra)

    @action(detail=True, methods=["post"], url_path="share-links")
    def share_links(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
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
