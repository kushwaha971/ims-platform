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
from datetime import date
from typing import Any

from django.db import transaction
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
        sections.append({**head, "data": data})
    return sections


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
