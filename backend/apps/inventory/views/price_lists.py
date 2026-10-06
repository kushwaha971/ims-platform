"""Shop gap §1.6 — `/price-lists`: rate cards for groups of parties."""

from __future__ import annotations

from typing import Any

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.exceptions import ValidationFailed
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.inventory.permissions import PriceListPermissions
from apps.inventory.services import price_lists as svc
from apps.inventory.views.items import _body, _InventoryView

#: A bill has at most 100 lines (SAL-02); the editor asks for what it holds.
MAX_ITEMS = 100


class PriceListViewSet(_InventoryView, viewsets.ViewSet):
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.INVENTORY),
        PriceListPermissions,
    ]

    def list(self, request: Any) -> Any:
        return StandardResponse.ok(svc.price_lists(tenant=self.get_tenant()))

    def create(self, request: Any) -> Any:
        created = svc.create_price_list(ctx=self.ctx(), body=_body(request))
        return StandardResponse.created(svc.list_dict(created))

    def partial_update(self, request: Any, pk: Any = None) -> Any:
        updated = svc.update_price_list(ctx=self.ctx(), list_id=pk, body=_body(request))
        return StandardResponse.ok(svc.list_dict(updated))

    def destroy(self, request: Any, pk: Any = None) -> Any:
        svc.delete_price_list(ctx=self.ctx(), list_id=pk)
        return StandardResponse.ok({"id": str(pk)})

    @action(detail=True, methods=["get"])
    def rates(self, request: Any, pk: Any = None) -> Any:
        return StandardResponse.ok(svc.list_rates(tenant=self.get_tenant(), list_id=pk))

    @action(detail=True, methods=["put"], url_path="rate")
    def set_rate(self, request: Any, pk: Any = None) -> Any:
        return StandardResponse.ok(svc.set_rate(ctx=self.ctx(), list_id=pk, body=_body(request)))

    @action(detail=False, methods=["put"])
    def assign(self, request: Any) -> Any:
        body = _body(request)
        return StandardResponse.ok(
            svc.assign_party(
                ctx=self.ctx(), party_id=body.get("party_id"), list_id=body.get("price_list_id")
            )
        )

    @action(detail=False, methods=["get"], url_path="for-party")
    def for_party(self, request: Any) -> Any:
        import uuid

        def ids(raw: str) -> list[uuid.UUID]:
            out = []
            for part in [p for p in raw.split(",") if p][:MAX_ITEMS]:
                try:
                    out.append(uuid.UUID(part))
                except ValueError:
                    raise ValidationFailed({"items": ["Not a valid id."]}) from None
            return out

        party = ids(request.query_params.get("party") or "")
        if not party:
            raise ValidationFailed({"party": ["Choose a party."]})
        return StandardResponse.ok(
            svc.rates_for_party(
                tenant=self.get_tenant(),
                party_id=party[0],
                item_ids=ids(request.query_params.get("items") or ""),
            )
        )
