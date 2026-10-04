"""`/api/v1/library/charges` (LIB-07 §6; task B10).

Lost, found, replace, damage and the fine preview need loans and land with
B10b after B09 (G19). Collecting a charge is the core `POST /payments` with a
`library_charge` allocation; there is no library payment endpoint.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import Sum
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.views import APIView

from apps.common.context import Ctx
from apps.common.exceptions import NotFound, ValidationFailed
from apps.common.idempotency import idempotent
from apps.common.money import ZERO
from apps.common.pagination import PagePagination
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.library.constants import ChargeKind, ChargeStatus
from apps.library.models import LibraryCharge
from apps.library.services import charges
from apps.library.services.fields import uuid_or_none

READ = "library.member.read"
WRITE = "library.charge.write"
WAIVE = "library.charge.waive"
EXEMPT = "The library has no row scoping (LIB-14 §1, ADR-052)."


class _ChargeView(APIView):
    scope_exempt = EXEMPT
    codenames: dict[str, str] = {"GET": READ}

    def get_permissions(self) -> list:
        method = "GET" if self.request.method in SAFE_METHODS else self.request.method
        codename = self.codenames.get(method, WRITE)
        return [IsAuthenticated(), ModuleEnabled("library")(), HasPermission(codename)()]


def _filtered(tenant: Any, params: Any) -> Any:
    errors: dict[str, list[str]] = {}
    qs = LibraryCharge.objects.filter(tenant=tenant)
    for name, field in (("membership", "membership_id"), ("party", "party_id")):
        raw = params.get(name)
        if raw:
            pk = uuid_or_none(raw)
            if pk is None:
                errors[name] = ["Not a valid id."]
            else:
                qs = qs.filter(**{field: pk})
    kind = params.get("kind")
    if kind:
        if kind not in ChargeKind.values:
            errors["kind"] = ["Choose one of the charge kinds."]
        qs = qs.filter(kind=kind)
    status = params.get("status")
    if status:
        if status not in ChargeStatus.values:
            errors["status"] = ["Choose one of the statuses."]
        elif status == ChargeStatus.OPEN:
            qs = qs.open()  # what still owes, part-paid included (G20)
        else:
            qs = qs.filter(status=status)
    for name, lookup in (("from", "charge_date__gte"), ("to", "charge_date__lte")):
        raw = params.get(name)
        if raw:
            try:
                qs = qs.filter(**{lookup: dt.date.fromisoformat(raw)})
            except ValueError:
                errors[name] = ["Use a date like 2026-10-01."]
    if errors:
        raise ValidationFailed(errors)
    return qs


class ChargeListView(_ChargeView):
    codenames = {"GET": READ, "POST": WRITE}

    def get(self, request: Any) -> Any:
        qs = _filtered(get_effective_tenant(request), request.query_params)
        sums = qs.filter(reversed_at__isnull=True).aggregate(
            amount=Sum("amount"),
            paid=Sum("amount_paid"),
            waived=Sum("waived_amount"),
            due=Sum("amount_due"),
        )
        paginator = PagePagination()
        rows = paginator.paginate_queryset(
            qs.order_by("-charge_date", "-number", "-id"), request, view=self
        )
        response = paginator.get_paginated_response([charges.charge_json(r) for r in rows])
        response.data["meta"]["totals"] = {
            key: f"{Decimal(value or ZERO):.2f}" for key, value in sums.items()
        }
        return response

    @idempotent("library.charge.create")
    def post(self, request: Any) -> Any:
        row = charges.create_manual_charge(ctx=Ctx.from_request(request), data=request.data)
        return StandardResponse.created(charges.charge_json(row))


class ChargeDetailView(_ChargeView):
    def get(self, request: Any, charge_id: Any) -> Any:
        from apps.payments.models import Allocation

        tenant = get_effective_tenant(request)
        row = LibraryCharge.objects.filter(tenant=tenant, pk=charge_id).first()
        if row is None:
            raise NotFound()
        allocations = (
            Allocation.objects.filter(
                tenant=tenant, document_type=charges.CHARGE_KIND, document_id=row.id
            )
            .select_related("payment")
            .order_by("created_at")
        )
        return StandardResponse.ok(
            {
                **charges.charge_json(row),
                "ledger_entry_id": str(row.ledger_entry_id),
                "waivers": [charges.waiver_json(w) for w in row.waivers.order_by("created_at")],
                "allocations": [
                    {
                        "payment_id": str(a.payment_id),
                        "number": a.payment.number,
                        "amount": f"{Decimal(a.amount):.2f}",
                        "payment_date": a.payment.payment_date.isoformat(),
                    }
                    for a in allocations
                ],
            }
        )


class ChargeWaiveView(_ChargeView):
    codenames = {"POST": WAIVE}

    def post(self, request: Any, charge_id: Any) -> Any:
        row, waiver = charges.waive(
            ctx=Ctx.from_request(request), charge_id=charge_id, data=request.data
        )
        return StandardResponse.ok(
            charges.charge_json(row), meta={"waiver": charges.waiver_json(waiver)}
        )


class ChargeReverseView(_ChargeView):
    codenames = {"POST": WRITE}

    def post(self, request: Any, charge_id: Any) -> Any:
        row = charges.reverse(ctx=Ctx.from_request(request), charge_id=charge_id, data=request.data)
        return StandardResponse.ok(charges.charge_json(row))
