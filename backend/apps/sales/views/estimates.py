"""`/sales/estimates` (SAL-01 §14; the action paths are CR-SAL-1).

Status moves are actions, never `PATCH status` (Part 22 §22.1): `mark-sent`,
`mark-accepted`, `mark-rejected`, and `convert`, which answers 201 with the
new DRAFT invoice and the conversion's `warnings[]`.
"""

from __future__ import annotations

from typing import Any

from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.sales.constants import ESTIMATE_TAB_STATUSES, DocumentStatus
from apps.sales.filters import InvoiceFilterSet
from apps.sales.models import SalesDocument
from apps.sales.permissions import EstimateConvertPermissions, EstimatePermissions
from apps.sales.selectors.documents import ORDERING_FIELDS, detail_queryset, list_documents
from apps.sales.serializers.document import DocumentReadSerializer, ShareLinkSerializer
from apps.sales.serializers.flows import (
    EstimateWriteSerializer,
    RejectSerializer,
    VersionSerializer,
)
from apps.sales.services import documents as drafts
from apps.sales.services import estimates as service
from apps.sales.services.estimate_convert import convert_estimate
from apps.sales.services.share import create_share_link, revoke_share_link
from apps.sales.views.common import created, ok, tabbed_list

KINDS = service.ESTIMATE_KINDS


class EstimateViewSet(
    TenantScopeMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = SalesDocument.objects.all()
    serializer_class = DocumentReadSerializer
    filterset_class = InvoiceFilterSet
    ordering_fields = ORDERING_FIELDS
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.SALES),
        EstimatePermissions,
        EstimateConvertPermissions,
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get_throttles(self) -> list[Any]:
        scope = "user" if self.request.method in SAFE_METHODS else "ledger_write"
        return [ScopedUserRateThrottle(scope)]

    def get_queryset(self) -> Any:
        if self.action == "list":
            return list_documents(tenant=self.get_tenant(), kinds=KINDS)
        return detail_queryset(tenant=self.get_tenant(), kinds=KINDS)

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return tabbed_list(self, request, ESTIMATE_TAB_STATUSES)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return ok(get_object_or_404(self.get_queryset(), pk=kwargs["pk"]))

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = EstimateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {k: v for k, v in serializer.validated_data.items() if k != "kind"}
        result = service.create_estimate(ctx=Ctx.from_request(request), payload=payload)
        return created(result["document"], warnings=result["warnings"])

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = EstimateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {k: v for k, v in serializer.validated_data.items() if k != "kind"}
        result = service.update_estimate(
            ctx=Ctx.from_request(request), document_id=kwargs["pk"], payload=payload
        )
        return ok(result["document"], warnings=result["warnings"])

    def destroy(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        drafts.delete_draft(ctx=Ctx.from_request(request), document_id=kwargs["pk"], kinds=KINDS)
        return StandardResponse.no_content()

    @action(detail=True, methods=["post"], url_path="mark-sent")
    def mark_sent(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = VersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.mark_sent(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            version=serializer.validated_data.get("version"),
        )
        return ok(result["document"], warnings=result["warnings"])

    @action(detail=True, methods=["post"], url_path="mark-accepted")
    def mark_accepted(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        result = service.mark_status(
            ctx=Ctx.from_request(request), document_id=kwargs["pk"], to=DocumentStatus.ACCEPTED
        )
        return ok(result["document"])

    @action(detail=True, methods=["post"], url_path="mark-rejected")
    def mark_rejected(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.mark_status(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            to=DocumentStatus.REJECTED,
            note=serializer.validated_data.get("note") or None,
        )
        return ok(result["document"])

    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        result = convert_estimate(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        return created(
            result["document"],
            warnings=result["warnings"],
            extra={"estimate": {"id": str(result["estimate"].id), "status": "converted"}},
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

    @action(detail=True, methods=["post"], url_path="share-links/revoke")
    def revoke_share_link(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """Part 27 §27.12 — the live link stops working now (404 like any unknown token)."""
        get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        return StandardResponse.ok(
            revoke_share_link(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        )
