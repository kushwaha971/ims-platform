"""`/sales/delivery-challans` (Shop item 4, SAL-09 §14) — the order's routes, for goods
that leave before the bill.

Status moves are actions: `issue` (draft → issued, numbered, stock out), `void`
(issued → void with a reason, stock back) and `convert`, which answers 201 with
the new DRAFT invoice, as an estimate's and an order's do.
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
from apps.sales.constants import CHALLAN_TAB_STATUSES
from apps.sales.filters import InvoiceFilterSet
from apps.sales.models import SalesDocument
from apps.sales.permissions import DeliveryChallanPermissions
from apps.sales.selectors.documents import ORDERING_FIELDS, detail_queryset, list_documents
from apps.sales.serializers.document import DocumentReadSerializer, ShareLinkSerializer
from apps.sales.serializers.flows import CancelSerializer, ChallanWriteSerializer, VersionSerializer
from apps.sales.services import challans as service
from apps.sales.services import documents as drafts
from apps.sales.services.share import create_share_link, revoke_share_link
from apps.sales.views.common import created, draft_created, ok, tabbed_list

KINDS = service.CHALLAN_KINDS


class DeliveryChallanViewSet(
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
        DeliveryChallanPermissions,
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
        return tabbed_list(self, request, CHALLAN_TAB_STATUSES)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return ok(get_object_or_404(self.get_queryset(), pk=kwargs["pk"]))

    @staticmethod
    def _payload(request: Any) -> dict:
        serializer = ChallanWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return {k: v for k, v in serializer.validated_data.items() if k != "kind"}

    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        result = service.create_challan(
            ctx=Ctx.from_request(request), payload=self._payload(request)
        )
        return draft_created(result)

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        result = service.update_challan(
            ctx=Ctx.from_request(request), document_id=kwargs["pk"], payload=self._payload(request)
        )
        return ok(result["document"], warnings=result["warnings"])

    def destroy(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        drafts.delete_draft(ctx=Ctx.from_request(request), document_id=kwargs["pk"], kinds=KINDS)
        return StandardResponse.no_content()

    @action(detail=True, methods=["post"], url_path="issue")
    def issue(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = VersionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.issue(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            version=serializer.validated_data.get("version"),
        )
        return ok(result["document"], warnings=result["warnings"])

    @action(detail=True, methods=["post"], url_path="void")
    def void(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.void(
            ctx=Ctx.from_request(request),
            document_id=kwargs["pk"],
            reason=serializer.validated_data.get("reason") or "",
        )
        return ok(result["document"])

    @action(detail=True, methods=["post"], url_path="convert")
    def convert(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        result = service.convert(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        return created(
            result["document"],
            warnings=result["warnings"],
            extra={"challan": {"id": str(result["challan"].id), "status": "converted"}},
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
        get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        return StandardResponse.ok(
            revoke_share_link(ctx=Ctx.from_request(request), document_id=kwargs["pk"])
        )
