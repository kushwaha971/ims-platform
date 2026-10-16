"""`GET /reports/dashboard` — RPT-01 FR-1: every tile, the feed and the two short lists.

One request, one response (FR-1), cached per tenant for at most sixty seconds
in `reports_snapshot` (CR-106) and dropped early by any write that could move
a figure (`apps.reports.signals`, BR-5). `?refresh=true` is the refresh icon
and pull-to-refresh (FR-8): it recomputes now and re-stores, so the next
reader in the shop gets the new figures too.

── What this view does NOT send ─────────────────────────────────────────────
Tiles the reader may not see are ABSENT, not zeroed (§10, TSK-RPT-01-04) —
`selectors.dashboard.project` decides which. The cache holds the whole
business's payload and every response is trimmed from it, so no reader can
ever be served another reader's cut.

── Module sections (A10, FRD 00 PLT-X13) ───────────────────────────────────
`sections` is what engines and verticals registered in `apps.reports.registry`,
filtered per reader: the module must be effectively on and the section's
codename held (BR-1, §10). They are computed on EVERY request and never stored
in the snapshot: the snapshot is dropped by core writes only (`signals`), so a
cached section would lag a vertical's own save by up to a minute. Each
selector runs inside a savepoint and a failure is logged and answered as
`{key, module, order, error: "unavailable"}`; one module's bug never takes the
landing screen down (T-PLT-X13-2).

`Cache-Control: private, no-store` rather than the FRD's `max-age=60`: a
browser holding the response for a minute would show the pre-sale figures
after the merchant bills and taps back — the one stale read the server-side
write-through exists to prevent, reintroduced by a header (Part 20 §20.14.5
also says no-store for everything but share pages).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import tenant_today
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports import registry
from apps.reports.constants import DASHBOARD, DASHBOARD_MAX_AGE_SECONDS, DASHBOARD_PAYLOAD_VERSION
from apps.reports.selectors.dashboard import build_dashboard, project
from apps.reports.views.export_support import granted_permissions

logger = logging.getLogger("ub.reports")


def module_sections(tenant: Any, today: date, *, granted: frozenset[str]) -> list[dict]:
    """The registered sections this reader may see, each computed now.

    With nothing registered — every tenant today — this reads nothing at all:
    the landing screen does not pay for machinery it does not use."""
    registered = registry.dashboard_sections()
    if not registered:
        return []
    from apps.platform_app.services.entitlements import effective_modules

    modules = effective_modules(tenant)
    sections: list[dict] = []
    for section in registered:
        if section.module not in modules or section.permission not in granted:
            continue
        head = {"key": section.key, "module": section.module, "order": section.order}
        try:
            with transaction.atomic():
                data = section.selector(tenant, today)
        except Exception:
            logger.exception(
                "dashboard.section_failed", extra={"section": section.key, "tenant": str(tenant.pk)}
            )
            sections.append({**head, "error": "unavailable"})
            continue
        if section.redact is not None:
            data = section.redact(data, granted)
        sections.append({**head, "data": data})
    return sections


@dataclass(frozen=True)
class _Unstored:
    """A snapshot's shape for a payload that is answered but not cached."""

    payload: dict
    computed_at: datetime


class DashboardView(TenantScopeMixin, APIView):
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        HasPermission("reports.basic.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        # Deferred: rule D4's walker refuses a module-level `.services` import
        # anywhere in `reports`, its own included.
        from apps.reports.services.snapshot import read_fresh, store

        tenant = self.get_tenant()
        today = tenant_today(tenant)
        refresh = (request.query_params.get("refresh") or "").lower() in ("1", "true")
        key = {
            "tenant": tenant,
            "report_name": DASHBOARD,
            "as_of": today,
            "params_hash": DASHBOARD_PAYLOAD_VERSION,
        }
        snapshot = None if refresh else read_fresh(**key, max_age_seconds=DASHBOARD_MAX_AGE_SECONDS)
        cached = snapshot is not None
        if snapshot is None:
            payload = build_dashboard(tenant=tenant, today=today)
            # DASH-04 — a payload with a failed part is answered, never stored:
            # the next reader, or the panel's Retry, computes it afresh.
            snapshot = (
                _Unstored(payload=payload, computed_at=timezone.now())
                if payload.get("unavailable")
                else store(**key, payload=payload)
            )

        granted = granted_permissions(tenant)
        body = project(
            snapshot.payload,
            granted=granted,
            modules=frozenset(tenant.enabled_modules or ()),
        )
        body["sections"] = module_sections(tenant, today, granted=granted)
        body["generated_at"] = snapshot.computed_at.isoformat()
        response = StandardResponse.ok(
            body, meta={"cached": cached, "max_age_seconds": DASHBOARD_MAX_AGE_SECONDS}
        )
        response["Cache-Control"] = "private, no-store"
        return response


class DashboardChartsView(TenantScopeMixin, APIView):
    """`GET /reports/dashboard/charts` — the dashboard's graphs.

    `range` is a preset (7d, 30d, month, last_month, quarter, fy, last_fy, 12m,
    all) or `custom` with `from`/`to`; `group` is day, week, month or year and
    defaults to what suits the range; `top_by` is `value` or `qty`. Every series
    is trimmed per reader by `dashboard_charts` itself: absent, never zero (§10).
    A range that would draw more than `MAX_BUCKETS` bars is a 400 that names the
    grouping control, not a thousand slivers.
    """

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.REPORTS),
        HasPermission("reports.basic.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        from apps.common.exceptions import ValidationFailed
        from apps.reports.selectors.dashboard_charts import (
            DEFAULT_RANGE,
            GROUPS,
            RANGES,
            ChartRequestError,
            dashboard_charts,
        )

        params = request.query_params
        range_ = params.get("range") or DEFAULT_RANGE
        if range_ not in RANGES:
            raise ValidationFailed({"range": [f"Choose one of {', '.join(RANGES)}."]})
        group = params.get("group") or None
        if group is not None and group not in GROUPS:
            raise ValidationFailed({"group": [f"Choose one of {', '.join(GROUPS)}."]})
        top_by = params.get("top_by") or "value"
        if top_by not in ("value", "qty"):
            raise ValidationFailed({"top_by": ["Choose value or qty."]})
        dates: dict[str, Any] = {}
        for name in ("from", "to"):
            raw = params.get(name)
            try:
                dates[name] = date.fromisoformat(raw) if raw else None
            except ValueError:
                raise ValidationFailed({name: ["Enter a date as YYYY-MM-DD."]}) from None
        tenant = self.get_tenant()
        try:
            body = dashboard_charts(
                tenant=tenant,
                today=tenant_today(tenant),
                range_=range_,
                group=group,
                granted=granted_permissions(tenant),
                modules=frozenset(tenant.enabled_modules or ()),
                date_from=dates["from"],
                date_to=dates["to"],
                top_by=top_by,
            )
        except ChartRequestError as error:
            raise ValidationFailed({error.field: [str(error)]}) from None
        response = StandardResponse.ok(body)
        response["Cache-Control"] = "private, no-store"
        return response


class ItemTradeView(TenantScopeMixin, APIView):
    """`GET /reports/items/{id}/trade?side=sales|purchases[&from=&to=]` — the item page's
    Sales and Purchases tabs: by party, the latest lines and the totals.

    Each side is the side's own read permission (a cashier who may not read
    purchase bills does not learn what the shop pays); margin is
    `reports.financial.read`'s and is absent, never zero, without it.
    """

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.INVENTORY),
        HasPermission("inventory.item.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, item_id: Any = None, *args: Any, **kwargs: Any) -> Any:
        from rest_framework.exceptions import NotFound, PermissionDenied

        from apps.common.exceptions import ValidationFailed
        from apps.inventory.models import Item
        from apps.reports.selectors.item_trade import item_trade

        side = request.query_params.get("side") or "sales"
        if side not in ("sales", "purchases"):
            raise ValidationFailed({"side": ["Choose sales or purchases."]})
        tenant = self.get_tenant()
        granted = granted_permissions(tenant)
        needed = "sales.invoice.read" if side == "sales" else "purchases.bill.read"
        if needed not in granted:
            raise PermissionDenied("You may not read these documents.")
        if not Item.objects.filter(tenant=tenant, pk=item_id).exists():
            raise NotFound("No such item.")
        dates: dict[str, Any] = {}
        for name in ("from", "to"):
            raw = request.query_params.get(name)
            try:
                dates[name] = date.fromisoformat(raw) if raw else None
            except ValueError:
                raise ValidationFailed({name: ["Enter a date as YYYY-MM-DD."]}) from None
        body = item_trade(
            tenant=tenant,
            item_id=item_id,
            side=side,
            with_margin="reports.financial.read" in granted,
            date_from=dates["from"],
            date_to=dates["to"],
        )
        response = StandardResponse.ok(body)
        response["Cache-Control"] = "private, no-store"
        return response


class ItemLastRateView(TenantScopeMixin, APIView):
    """`GET /reports/items/{id}/last-rate?side=sales|purchases&party=<id>[&exclude=<doc>]`
    — the rate on the latest bill of this item with this party, for the line
    editor's "Last sold to … at …" note. `data` is null when there is none.

    Readable by whoever may read OR write that side's documents: the cashier
    writing an invoice is the person this exists for.
    """

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.INVENTORY),
        HasPermission("inventory.item.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, item_id: Any = None, *args: Any, **kwargs: Any) -> Any:
        import uuid

        from rest_framework.exceptions import PermissionDenied

        from apps.common.exceptions import ValidationFailed
        from apps.reports.selectors.item_trade import last_rate

        side = request.query_params.get("side") or "sales"
        if side not in ("sales", "purchases"):
            raise ValidationFailed({"side": ["Choose sales or purchases."]})
        ids: dict[str, Any] = {}
        for name in ("party", "exclude"):
            raw = request.query_params.get(name)
            try:
                ids[name] = uuid.UUID(raw) if raw else None
            except ValueError:
                raise ValidationFailed({name: ["Not a valid id."]}) from None
        if ids["party"] is None:
            raise ValidationFailed({"party": ["Choose a party."]})
        tenant = self.get_tenant()
        granted = granted_permissions(tenant)
        prefix = "sales.invoice" if side == "sales" else "purchases.bill"
        if f"{prefix}.read" not in granted and f"{prefix}.write" not in granted:
            raise PermissionDenied("You may not read these documents.")
        body = last_rate(
            tenant=tenant,
            item_id=item_id,
            party_id=ids["party"],
            side=side,
            exclude=ids["exclude"],
        )
        response = StandardResponse.ok(body)
        response["Cache-Control"] = "private, no-store"
        return response
