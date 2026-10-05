"""Collection routes and their stops (FRD lending LEN-07), kept small: a route
is a named round with an optional agent, and a loan's place on it is its
`route_seq`. Agent scoping (an agent sees only their route) is LEN-07's next step."""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import write_audit
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion, ValidationFailed
from apps.lending.constants import NAME_MAX, LoanStatus
from apps.lending.models import LendingLoan, LendingRoute


def route_json(route: LendingRoute) -> dict:
    return {
        "id": str(route.id),
        "name": route.name,
        "agent": (
            {"id": str(route.agent_id), "name": route.agent.full_name or route.agent.email}
            if route.agent_id
            else None
        ),
        "is_active": route.is_active,
        "loans": getattr(route, "loan_count", None),
        "version": route.version,
    }


def _agent(ctx: Any, raw: Any) -> Any:
    if not raw:
        return None
    from apps.platform_app.models import Membership

    member = (
        Membership.objects.filter(tenant=ctx.tenant, user_id=raw, status="active")
        .select_related("user")
        .first()
    )
    if member is None:
        raise ValidationFailed({"agent_id": ["Choose someone from your team."]})
    return member.user


def save_route(*, ctx: Any, data: Any, route_id: Any = None) -> LendingRoute:
    data = data if isinstance(data, dict) else {}
    name = str(data.get("name") or "").strip()
    if route_id is None and not name:
        raise ValidationFailed({"name": ["Name the route."]})
    if len(name) > NAME_MAX:
        raise ValidationFailed({"name": [f"At most {NAME_MAX} characters."]})
    with transaction.atomic():
        if route_id is None:
            route = LendingRoute(tenant=ctx.tenant, created_by=getattr(ctx, "actor", None))
        else:
            route = (
                LendingRoute.objects.select_for_update()
                .filter(tenant=ctx.tenant, pk=route_id)
                .first()
            )
            if route is None:
                raise NotFound()
            if data.get("version") != route.version:
                raise StaleVersion(route.version)
            route.version += 1
        if name:
            route.name = name
        if "agent_id" in data:
            route.agent = _agent(ctx, data.get("agent_id"))
        if "is_active" in data:
            if data["is_active"] is False:
                running = LendingLoan.objects.filter(route=route, status=LoanStatus.ACTIVE).count()
                if running:
                    raise BusinessRuleViolation(
                        "route_has_loans",
                        f"{running} running loans are on this route. Move them first.",
                        details={"count": running},
                    )
            route.is_active = bool(data["is_active"])
        try:
            with transaction.atomic():
                route.save()
        except IntegrityError:
            raise ValidationFailed({"name": ["A route with this name exists."]}) from None
    write_audit(
        ctx=ctx,
        action="lending.route.created" if route_id is None else "lending.route.updated",
        entity_type="lending_route",
        entity_id=route.id,
        after={"name": route.name, "agent": str(route.agent_id) if route.agent_id else None},
    )
    return route


@transaction.atomic
def order_stops(*, ctx: Any, route_id: Any, loan_ids: Any) -> None:
    """The round in the order the agent walks it: `loan_ids` first to last.
    A loan not on the route is moved onto it at that place."""
    route = LendingRoute.objects.filter(tenant=ctx.tenant, pk=route_id).first()
    if route is None:
        raise NotFound()
    if not isinstance(loan_ids, list) or not loan_ids:
        raise ValidationFailed({"loan_ids": ["Send the loans in order."]})
    loans = {
        str(loan.id): loan
        for loan in LendingLoan.objects.select_for_update().filter(
            tenant=ctx.tenant, pk__in=loan_ids
        )
    }
    if len(loans) != len(set(map(str, loan_ids))):
        raise ValidationFailed({"loan_ids": ["One of these is not a loan of this business."]})
    for seq, loan_id in enumerate(loan_ids, start=1):
        loan = loans[str(loan_id)]
        loan.route, loan.route_seq = route, seq
        loan.save(update_fields=["route", "route_seq", "updated_at"])
    write_audit(
        ctx=ctx,
        action="lending.route.stops_reordered",
        entity_type="lending_route",
        entity_id=route.id,
        after={"loans": [loans[str(i)].number for i in loan_ids]},
    )
