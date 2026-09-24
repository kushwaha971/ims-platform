"""`/items`, `/categories`, `/units`, `/stock-adjustments`, `/stock/*` (INV-01…INV-08).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, delegate to
a selector or a service, wrap the result in the envelope.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db.models import F
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import NotFound, ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.pagination import CursorPagination, PagePagination
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.inventory.constants import (
    ITEM_ORDERINGS,
    MOVEMENTS_PAGE_DEFAULT,
    SUMMARY_ORDERINGS,
    ItemStatus,
    MovementType,
)
from apps.inventory.models import StockAdjustment, StockMovement, Unit
from apps.inventory.permissions import (
    AdjustmentPermissions,
    ItemPermissions,
    MasterPermissions,
    StockReadPermissions,
)
from apps.inventory.selectors import items as item_selectors
from apps.inventory.selectors import stock as stock_selectors
from apps.inventory.serializers.output import (
    adjustment_dict,
    item_detail_dict,
    item_row,
    movement_dict,
    unit_dict,
)
from apps.inventory.services.adjustments import post_adjustment
from apps.inventory.services.items import archive_item, create_item, restore_item, update_item
from apps.inventory.services.masters import create_category, create_unit
from apps.inventory.services.stock import default_location


def _has(request: Any, codename: str) -> bool:
    """The actor's effective permissions, through the resolver the gates use."""
    from apps.common.permissions_registry import permissions_for

    tenant = get_effective_tenant(request)
    membership = getattr(tenant, "_ub_membership", None) if tenant else None
    return bool(membership) and codename in permissions_for(membership)


def _date_param(request: Any, name: str, errors: dict) -> dt.date | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        errors[name] = ["Enter a valid date."]
        return None


def _body(request: Any) -> dict:
    data = request.data
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Send a JSON object."]})
    return dict(data)


class _InventoryView:
    permission_classes: list = []

    def get_tenant(self) -> Any:
        return get_effective_tenant(self.request)

    def ctx(self) -> Ctx:
        return Ctx.from_request(self.request)

    def location_id(self) -> Any:
        return default_location(self.get_tenant()).id


class ItemViewSet(_InventoryView, viewsets.ViewSet):
    """No PUT and no DELETE: an item is edited by PATCH and archived, never deleted."""

    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.INVENTORY), ItemPermissions]

    def list(self, request: Any) -> Any:
        params = request.query_params
        ordering = params.get("ordering") or "name"
        if ordering not in ITEM_ORDERINGS:
            raise ValidationFailed({"ordering": [f"Choose one of {', '.join(ITEM_ORDERINGS)}."]})
        status = params.get("status") or ItemStatus.ACTIVE
        base = item_selectors.item_list(
            tenant=self.get_tenant(),
            location_id=self.location_id(),
            q=params.get("q", ""),
            item_type=params.get("type"),
            category_id=params.get("category_id") or None,
            status=None if status == "all" else status,
        )
        filtered = item_selectors.filter_stock(base, params.get("stock"))
        field = ordering.lstrip("-")
        expr = (
            F(field).desc(nulls_last=True)
            if ordering.startswith("-")
            else F(field).asc(nulls_last=True)
        )
        rows_qs = filtered.order_by(expr, "name", "id")
        paginator = PagePagination()
        page = paginator.paginate_queryset(rows_qs, request, view=self)
        meta = {**paginator.get_meta(), **item_selectors.list_meta(base, filtered)}
        return StandardResponse.ok([item_row(item) for item in page], meta=meta)

    def _detail(self, item_id: Any) -> dict:
        from apps.tax.selectors.rates import latest_rate, rate_for, rate_summary

        tenant = self.get_tenant()
        item = item_selectors.item_detail(
            tenant=tenant, location_id=self.location_id(), item_id=item_id
        )
        if item is None:
            raise NotFound("No such item.")
        today = tenant_today(tenant)
        current = rate_for(tenant=tenant, code=item.tax_code, on_date=today)
        tax_rate = (
            rate_summary(current, is_current=True)
            if current
            else rate_summary(latest_rate(tenant=tenant, code=item.tax_code), is_current=False)
        )
        recent_rows = item_selectors.recent_movements(tenant=tenant, item=item)
        item_selectors.annotate_backdated(recent_rows)
        numbers = item_selectors.resolve_sources(recent_rows)
        return item_detail_dict(
            item,
            tax_rate=tax_rate,
            stock=item_selectors.stock_rows(item=item),
            opening=item_selectors.opening_movement(item=item),
            recent=[movement_dict(m, numbers=numbers) for m in recent_rows],
            has_movements=bool(recent_rows),
        )

    def retrieve(self, request: Any, pk: Any = None) -> Any:
        return StandardResponse.ok(self._detail(pk))

    @idempotent("item_create")
    def create(self, request: Any) -> Any:
        result = create_item(ctx=self.ctx(), payload=_body(request))
        return StandardResponse.created(
            self._detail(result["item"].id), meta={"warnings": result["warnings"]}
        )

    def partial_update(self, request: Any, pk: Any = None) -> Any:
        result = update_item(
            ctx=self.ctx(),
            item_id=pk,
            payload=_body(request),
            can_adjust_stock=_has(request, "inventory.stock.adjust"),
        )
        return StandardResponse.ok(
            self._detail(result["item"].id), meta={"warnings": result["warnings"]}
        )

    @action(detail=True, methods=["post"], url_path="archive")
    def archive(self, request: Any, pk: Any = None) -> Any:
        item = archive_item(ctx=self.ctx(), item_id=pk)
        return StandardResponse.ok(self._detail(item.id))

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request: Any, pk: Any = None) -> Any:
        item = restore_item(ctx=self.ctx(), item_id=pk)
        return StandardResponse.ok(self._detail(item.id))

    @action(detail=False, methods=["get"], url_path="lookup")
    def lookup(self, request: Any) -> Any:
        """FR-6/FR-7 — the scanner's fast path: one exact match or 404."""
        code = (request.query_params.get("barcode") or "").strip()
        if not (4 <= len(code) <= 48):
            raise ValidationFailed({"barcode": ["A barcode is 4–48 characters."]})
        include_archived = request.query_params.get("include_archived", "").lower() == "true"
        item = item_selectors.lookup_by_barcode(
            tenant=self.get_tenant(),
            location_id=self.location_id(),
            code=code,
            include_archived=include_archived,
        )
        if item is None:
            raise NotFound(f"No item with barcode {code}.")
        return StandardResponse.ok(item_row(item))

    @action(detail=True, methods=["get"], url_path="movements")
    def movements(self, request: Any, pk: Any = None) -> Any:
        """INV-03 FR-2 — cursor-paged, newest arrival first; filters by date and type."""
        tenant = self.get_tenant()
        item = item_selectors.item_detail(tenant=tenant, location_id=self.location_id(), item_id=pk)
        if item is None:
            raise NotFound("No such item.")
        errors: dict = {}
        date_from = _date_param(request, "date_from", errors)
        date_to = _date_param(request, "date_to", errors)
        if date_from and date_to and date_from > date_to:
            errors["date_to"] = ["The end date must be on or after the start date."]
        types = [t for t in (request.query_params.get("type") or "").split(",") if t]
        bad = [t for t in types if t not in MovementType.values]
        if bad:
            errors["type"] = [f"Unknown movement type: {', '.join(bad)}."]
        if errors:
            raise ValidationFailed(errors)
        qs = item_selectors.movements(
            tenant=tenant, item=item, date_from=date_from, date_to=date_to, types=types or None
        )
        paginator = CursorPagination()
        paginator.default_limit = MOVEMENTS_PAGE_DEFAULT
        self.cursor_ordering = ("-sequence_no",)
        rows = paginator.paginate_queryset(qs, request, view=self)
        item_selectors.annotate_backdated(rows)
        numbers = item_selectors.resolve_sources(rows)
        return StandardResponse.ok(
            [movement_dict(m, numbers=numbers) for m in rows], meta=paginator.get_meta()
        )


class CategoryViewSet(_InventoryView, viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.INVENTORY), MasterPermissions]

    def list(self, request: Any) -> Any:
        return StandardResponse.ok(item_selectors.category_tree(tenant=self.get_tenant()))

    def create(self, request: Any) -> Any:
        body = _body(request)
        category, created = create_category(
            ctx=self.ctx(), name=body.get("name"), parent_id=body.get("parent_id")
        )
        data = {
            "id": str(category.id),
            "name": category.name,
            "parent_id": str(category.parent_id) if category.parent_id else None,
            "item_count": 0,
            "children": [],
        }
        if created:
            return StandardResponse.created(data, meta={"created": True})
        return StandardResponse.ok(data, meta={"created": False})


class UnitViewSet(_InventoryView, viewsets.ViewSet):
    permission_classes = [IsAuthenticated, ModuleEnabled(ModuleCode.INVENTORY), MasterPermissions]

    def list(self, request: Any) -> Any:
        from django.db.models import Q

        units = Unit.objects.filter(Q(tenant__isnull=True) | Q(tenant=self.get_tenant())).order_by(
            F("tenant_id").asc(nulls_first=True), "code"
        )
        return StandardResponse.ok([unit_dict(u) for u in units])

    def create(self, request: Any) -> Any:
        body = _body(request)
        unit, warnings = create_unit(
            ctx=self.ctx(),
            code=body.get("code"),
            name=body.get("name"),
            allow_decimal=body.get("allow_decimal"),
        )
        return StandardResponse.created(unit_dict(unit), meta={"warnings": warnings})


class StockAdjustmentViewSet(_InventoryView, viewsets.ViewSet):
    """Create and retrieve only (FR-9: immutable; no list in canon — CCR-04)."""

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.INVENTORY),
        AdjustmentPermissions,
    ]

    def _detail(self, adjustment_id: Any) -> dict:
        try:
            adjustment = (
                StockAdjustment.objects.select_related("location", "created_by")
                .filter(tenant=self.get_tenant(), pk=adjustment_id)
                .first()
            )
        except (ValueError, TypeError):
            adjustment = None
        if adjustment is None:
            raise NotFound("No such adjustment.")
        movements = list(
            StockMovement.objects.filter(
                tenant=self.get_tenant(), source_type="stock_adjustment", source_id=adjustment.id
            ).select_related("item", "item__unit")
        )
        return adjustment_dict(adjustment, movements)

    def retrieve(self, request: Any, pk: Any = None) -> Any:
        return StandardResponse.ok(self._detail(pk))

    def create(self, request: Any) -> Any:
        # EC-8 / §14 — the key is REQUIRED here: a lost response on a retried
        # post would otherwise move the stock twice.
        if not request.headers.get("Idempotency-Key"):
            raise ValidationFailed(
                {
                    "idempotency_key": ["Send an Idempotency-Key header."],
                    "field_codes": {"idempotency_key": "required"},
                }
            )
        return self._create(request)

    @idempotent("stock_adjustment_create")
    def _create(self, request: Any) -> Any:
        adjustment = post_adjustment(ctx=self.ctx(), payload=_body(request))
        data = self._detail(adjustment.id)
        return StandardResponse.created(
            data, meta={"movements": [line["movement_id"] for line in data["lines"]]}
        )


class StockSummaryView(_InventoryView, APIView):
    """INV-08 — valuation at weighted-average cost; valuation needs `reports.financial.read`."""

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.INVENTORY),
        StockReadPermissions,
    ]

    def get(self, request: Any) -> Any:
        params = request.query_params
        errors: dict = {}
        as_of = _date_param(request, "as_of", errors)
        today = tenant_today(self.get_tenant())
        if as_of and as_of > today:
            errors["as_of"] = ["The date cannot be in the future."]
        if as_of and as_of < dt.date(2000, 1, 1):
            errors["as_of"] = ["That date is too far in the past."]
        ordering = params.get("ordering") or "name"
        if ordering not in SUMMARY_ORDERINGS:
            errors["ordering"] = [f"Choose one of {', '.join(SUMMARY_ORDERINGS)}."]
        if errors:
            raise ValidationFailed(errors)
        historical = as_of is not None and as_of < today
        qs = stock_selectors.summary_queryset(
            tenant=self.get_tenant(),
            location_id=self.location_id(),
            as_of=as_of if historical else None,
            q=params.get("q", ""),
            category_id=params.get("category_id") or None,
        )
        status = params.get("status")
        if status in stock_selectors.SUMMARY_STATUS:
            qs = qs.filter(stock_selectors.SUMMARY_STATUS[status])
        if params.get("hide_zero", "true").lower() != "false":
            qs = qs.exclude(on_hand=0)
        field = {"value": "stock_value"}.get(ordering.lstrip("-"), ordering.lstrip("-"))
        expr = (
            F(field).desc(nulls_last=True)
            if ordering.startswith("-")
            else F(field).asc(nulls_last=True)
        )
        qs = qs.order_by(expr, "name", "id")
        valuation = _has(request, "reports.financial.read")
        totals = stock_selectors.summary_totals(qs)
        paginator = PagePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        rows = []
        for item in page:
            row = {
                "item": {
                    "id": str(item.id),
                    "name": item.name,
                    "sku": item.sku,
                    "unit_code": item.unit.code,
                },
                "category": (
                    {"id": str(item.category.id), "name": item.category.name}
                    if item.category
                    else None
                ),
                "on_hand": str(item.on_hand),
                "reorder_point": (
                    str(item.reorder_point) if item.reorder_point is not None else None
                ),
                "stock_status": item.stock_status,
                "last_movement_at": (
                    item.last_movement_at.isoformat() if item.last_movement_at else None
                ),
            }
            if valuation:
                row["avg_cost"] = str(item.avg_cost)
                row["value"] = str(item.stock_value)
            rows.append(row)
        meta = {
            **paginator.get_meta(),
            "totals": {"items": totals["items"], "value": totals["value"] if valuation else None},
            "as_of": as_of.isoformat() if as_of else None,
            "historical": historical,
            "valuation_visible": valuation,
        }
        return StandardResponse.ok(rows, meta=meta)


class LowStockView(_InventoryView, APIView):
    """INV-07 FR-6 — low and out items, out first."""

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.INVENTORY),
        StockReadPermissions,
    ]

    def get(self, request: Any) -> Any:
        from django.db.models import Count, Q

        from apps.inventory.constants import StockStatus

        qs = stock_selectors.low_stock_queryset(
            tenant=self.get_tenant(), location_id=self.location_id()
        )
        counts = qs.aggregate(
            low=Count("id", filter=Q(stock_status=StockStatus.LOW)),
            out=Count("id", filter=Q(stock_status=StockStatus.OUT)),
        )
        paginator = PagePagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        rows = [
            {
                "item": {
                    "id": str(i.id),
                    "name": i.name,
                    "sku": i.sku,
                    "unit_code": i.unit.code,
                    # The "Adjust stock" action preselects this item; a
                    # whole-number unit must refuse "1.5" at the keyboard.
                    "allow_decimal": i.unit.allow_decimal,
                },
                "on_hand": str(i.on_hand),
                "reorder_point": str(i.reorder_point) if i.reorder_point is not None else None,
                "stock_status": i.stock_status,
                "avg_cost": str(i.avg_cost),
                "last_purchase_cost": str(i.purchase_price),
                "suggested_qty": str(
                    stock_selectors.suggested_qty(on_hand=i.on_hand, reorder_point=i.reorder_point)
                ),
            }
            for i in page
        ]
        return StandardResponse.ok(rows, meta={**paginator.get_meta(), "totals": counts})
