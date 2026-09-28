"""`/sales/credit-notes` (SAL-04 §14).

Create (draft), PATCH, DELETE a draft; `issue` (Idempotency-Key required, as
for an invoice), `apply {invoice_id, amount}`, `void {reason}`, share links.
`?issue=true` on create issues in the same request.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
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
from apps.sales.constants import CREDIT_NOTE_TAB_STATUSES
from apps.sales.filters import InvoiceFilterSet
from apps.sales.models import SalesDocument
from apps.sales.permissions import CreditNotePermissions
from apps.sales.selectors.documents import ORDERING_FIELDS, detail_queryset, list_documents
from apps.sales.serializers.document import DocumentReadSerializer, ShareLinkSerializer
from apps.sales.serializers.flows import (
    ApplyCreditSerializer,
    CreditNoteIssueSerializer,
    CreditNoteWriteSerializer,
    VoidSerializer,
)
from apps.sales.services import credit_notes as service
from apps.sales.services import documents as drafts
from apps.sales.services.credit_note_apply import apply_credit_note, void_credit_note
from apps.sales.services.credit_note_issue import issue_credit_note
from apps.sales.services.share import create_share_link
from apps.sales.views.common import created, ok, tabbed_list

KINDS = service.CREDIT_NOTE_KINDS


def _require_key(request: Any) -> None:
    if not request.headers.get("Idempotency-Key"):
        raise ValidationFailed(
            {"idempotency_key": ["Idempotency-Key header is required to issue."]}
        )


def _issued_extra(result: dict) -> dict:
    extra: dict[str, Any] = {}
    if result["party_balance"] is not None:
        extra["party_balance"] = str(result["party_balance"])
    if result["ledger_entry_id"]:
        extra["ledger_entry_id"] = result["ledger_entry_id"]
    invoice = result.get("invoice")
    if invoice is not None:
        extra["invoice"] = {
            "id": str(invoice.id),
            "amount_due": str(invoice.amount_due),
            "status": invoice.status,
        }
    return extra


class CreditNoteViewSet(
    TenantScopeMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = SalesDocument.objects.all()
    serializer_class = DocumentReadSerializer
    filterset_class = InvoiceFilterSet
    ordering_fields = ORDERING_FIELDS
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.SALES), CreditNotePermissions]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_documents(tenant=self.get_tenant(), kinds=KINDS)
        return detail_queryset(tenant=self.get_tenant(), kinds=KINDS)

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return tabbed_list(self, request, CREDIT_NOTE_TAB_STATUSES)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return ok(get_object_or_404(self.get_queryset(), pk=kwargs["pk"]))

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        if request.query_params.get("issue") == "true":
            _require_key(request)
            return self._create_and_issue(request)
        serializer = CreditNoteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.create_credit_note(
            ctx=Ctx.from_request(request), payload=dict(serializer.validated_data)
        )
        return created(result["document"], warnings=result["warnings"])

    @idempotent("sales_credit_note_issue")
    def _create_and_issue(self, request: Any) -> Any:
        serializer = CreditNoteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ctx = Ctx.from_request(request)
        with transaction.atomic():
            draft = service.create_credit_note(ctx=ctx, payload=dict(serializer.validated_data))
            result = issue_credit_note(ctx=ctx, document_id=draft["document"].id)
        return created(result["document"], warnings=result["warnings"], extra=_issued_extra(result))

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = CreditNoteWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.update_credit_note(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            payload=dict(serializer.validated_data),
        )
        return ok(result["document"], warnings=result["warnings"])

    def destroy(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        drafts.delete_draft(ctx=Ctx.from_request(request), document_id=kwargs["pk"], kinds=KINDS)
        return StandardResponse.no_content()

    @action(detail=True, methods=["post"], url_path="issue")
    def issue(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        _require_key(request)
        return self._issue(request, kwargs["pk"])

    @idempotent("sales_credit_note_issue")
    def _issue(self, request: Any, pk: Any) -> Any:
        serializer = CreditNoteIssueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = issue_credit_note(
            ctx=Ctx.from_request(request),
            document_id=pk,
            version=data.get("version"),
            refund=data.get("refund"),
        )
        return ok(result["document"], warnings=result["warnings"], extra=_issued_extra(result))

    @action(detail=True, methods=["post"], url_path="apply")
    def apply(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = ApplyCreditSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = apply_credit_note(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            invoice_id=serializer.validated_data["invoice_id"],
            amount=serializer.validated_data["amount"],
        )
        invoice = result["invoice"]
        extra = {
            "invoice": {
                "id": str(invoice.id),
                "amount_due": str(invoice.amount_due),
                "status": invoice.status,
            }
        }
        return ok(result["document"], extra=extra)

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = VoidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = void_credit_note(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason"),
        )
        return ok(
            result["document"],
            extra={"reversals": result["reversals"], "released": result["released"]},
        )

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
