"""`/taxes/rates` and `/taxes/hsn` (Part 22 §22.12, INV-01 FR-4/FR-6).

Reference reads, open to any member who can read items: the item form, the
invoice editor and the purchase editor all need them.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.permissions import HasPermission
from apps.common.responses import StandardResponse
from apps.common.tenancy import get_effective_tenant
from apps.tax.selectors.rates import rates_on, search_hsn

TaxReadPermission = HasPermission("inventory.item.read")


class TaxRateListView(APIView):
    permission_classes = [IsAuthenticated, TaxReadPermission]

    def get(self, request: Any) -> Any:
        tenant = get_effective_tenant(request)
        raw = request.query_params.get("as_of")
        if raw:
            try:
                on_date = dt.date.fromisoformat(raw)
            except ValueError:
                raise ValidationFailed({"as_of": ["Enter a valid date."]}) from None
        else:
            on_date = tenant_today(tenant)
        include = tuple(c for c in (request.query_params.get("include") or "").split(",") if c)
        return StandardResponse.ok(rates_on(tenant=tenant, on_date=on_date, include=include))


HSN_PAGE_SIZE = 20


class HsnSearchView(APIView):
    permission_classes = [IsAuthenticated, TaxReadPermission]

    def get(self, request: Any) -> Any:
        q = (request.query_params.get("q") or "")[:60]
        try:
            page = max(1, int(request.query_params.get("page") or 1))
        except ValueError:
            page = 1
        # One row past the page says whether there is another, without a COUNT
        # over the schedule on every keystroke.
        rows = list(search_hsn(q, limit=HSN_PAGE_SIZE + 1, offset=(page - 1) * HSN_PAGE_SIZE))
        return StandardResponse.ok(
            [
                {
                    "code": row.code,
                    "description": row.description,
                    "default_tax_code": row.default_tax_code or None,
                    "is_service": row.is_service,
                }
                for row in rows[:HSN_PAGE_SIZE]
            ],
            meta={"page": page, "has_more": len(rows) > HSN_PAGE_SIZE},
        )
