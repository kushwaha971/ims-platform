"""`/api/v1/lending/today`, collections, visits and routes (FRD lending LEN-06 … LEN-08)."""

from __future__ import annotations

from typing import Any

from django.db.models import Count, Q

from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.lending.models import LendingRoute
from apps.lending.services import collections, routes
from apps.lending.services.loans import get_loan
from apps.lending.views.loans import _LendingView


class TodayView(_LendingView):
    read = "lending.today.read"

    def get(self, request: Any) -> Any:
        result = collections.today_round(
            get_effective_tenant(request), request.query_params.get("route") or None
        )
        return StandardResponse.ok(result["stops"], meta={"on": result["on"], **result["totals"]})


class CollectionPreviewView(_LendingView):
    read = "lending.collection.create"
    write = "lending.collection.create"

    def post(self, request: Any, loan_id: Any) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        return StandardResponse.ok(
            collections.preview(
                ctx=Ctx.from_request(request), loan_id=loan_id, amount=data.get("amount")
            )
        )


class CollectionView(_LendingView):
    read = "lending.collection.read"
    write = "lending.collection.create"

    def get(self, request: Any, loan_id: Any) -> Any:
        loan = get_loan(get_effective_tenant(request), loan_id)
        return StandardResponse.ok(
            collections.loan_collections(loan), meta={"visits": collections.loan_visits(loan)}
        )

    @idempotent("lending.collection.create")
    def post(self, request: Any, loan_id: Any) -> Any:
        return StandardResponse.created(
            collections.collect(ctx=Ctx.from_request(request), loan_id=loan_id, data=request.data)
        )


class CollectionVoidView(_LendingView):
    write = "lending.collection.void"

    def post(self, request: Any, collection_id: Any) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        return StandardResponse.ok(
            collections.void_collection(
                ctx=Ctx.from_request(request),
                collection_id=collection_id,
                reason=data.get("reason"),
            )
        )


class VisitView(_LendingView):
    write = "lending.visit.write"

    def post(self, request: Any, loan_id: Any) -> Any:
        visit = collections.record_visit(
            ctx=Ctx.from_request(request), loan_id=loan_id, data=request.data
        )
        return StandardResponse.created({"id": str(visit.id), "outcome": visit.outcome})


class RouteListView(_LendingView):
    read = "lending.route.read"
    write = "lending.route.manage"

    def get(self, request: Any) -> Any:
        rows = (
            LendingRoute.objects.filter(tenant=get_effective_tenant(request))
            .select_related("agent")
            .annotate(loan_count=Count("loans", filter=Q(loans__status="active")))
            .order_by("sort_order", "name")
        )
        return StandardResponse.ok([routes.route_json(r) for r in rows])

    def post(self, request: Any) -> Any:
        route = routes.save_route(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(routes.route_json(route))


class RouteDetailView(_LendingView):
    read = "lending.route.read"
    write = "lending.route.manage"

    def patch(self, request: Any, route_id: Any) -> Any:
        route = routes.save_route(
            ctx=Ctx.from_request(request), data=request.data, route_id=route_id
        )
        return StandardResponse.ok(routes.route_json(route))


class RouteStopsView(_LendingView):
    write = "lending.route.manage"

    def put(self, request: Any, route_id: Any) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        routes.order_stops(
            ctx=Ctx.from_request(request), route_id=route_id, loan_ids=data.get("loan_ids")
        )
        return StandardResponse.ok({"route_id": str(route_id)})
