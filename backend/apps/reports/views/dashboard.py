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

`Cache-Control: private, no-store` rather than the FRD's `max-age=60`: a
browser holding the response for a minute would show the pre-sale figures
after the merchant bills and taps back — the one stale read the server-side
write-through exists to prevent, reintroduced by a header (Part 20 §20.14.5
also says no-store for everything but share pages).
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.constants import ModuleCode
from apps.common.dates import tenant_today
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.reports.constants import DASHBOARD, DASHBOARD_MAX_AGE_SECONDS, DASHBOARD_PAYLOAD_VERSION
from apps.reports.selectors.dashboard import build_dashboard, project
from apps.reports.views.export_support import granted_permissions


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
            snapshot = store(**key, payload=build_dashboard(tenant=tenant, today=today))

        body = project(
            snapshot.payload,
            granted=granted_permissions(tenant),
            modules=frozenset(tenant.enabled_modules or ()),
        )
        body["generated_at"] = snapshot.computed_at.isoformat()
        response = StandardResponse.ok(
            body, meta={"cached": cached, "max_age_seconds": DASHBOARD_MAX_AGE_SECONDS}
        )
        response["Cache-Control"] = "private, no-store"
        return response
