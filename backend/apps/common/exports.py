"""What every CSV export does before it streams a byte (LED-04, LED-09, PLT-08).

Moved here from `apps.ledger.views.exports` when the audit log (PLT-08 FR-7)
became the first export outside the ledger: `platform_app` may not import
`ledger`, and two copies of a cross-site check are two places for it to drift.
`apps.ledger.views.exports` re-exports every name, so its callers are unchanged.
"""

from __future__ import annotations

from typing import Any

from rest_framework.exceptions import Throttled

from apps.common.exceptions import PermissionDenied
from apps.common.throttling import ScopedUserRateThrottle

#: The one `Sec-Fetch-Site` value an export refuses. `same-origin` and
#: `same-site` are our own pages (the SPA and the API are one site, which the
#: session cookie already requires); `none` is a URL typed or bookmarked; and a
#: missing header is an older browser, curl or a script with a token.
CROSS_SITE = "cross-site"


def request_has(request: Any, codename: str) -> bool:
    """The actor's effective permission set, through the SAME resolver the
    permission classes use.

    `permissions_for` applies the role set, the member's allow and deny
    overrides, and the tenant's module gating, in that order. Reading the role's
    codenames directly here would be a second implementation of that resolution
    — and the one place it would first differ is a member with a `deny`
    override, which is to say the exact member somebody set the override FOR.
    """
    from apps.common.permissions_registry import permissions_for
    from apps.common.tenancy import get_effective_tenant

    tenant = get_effective_tenant(request)
    membership = getattr(tenant, "_ub_membership", None) if tenant else None
    return bool(membership) and codename in permissions_for(membership)


def refuse_cross_site(request: Any) -> None:
    """403 for an export another site started (security review F-3).

    The session cookies are `SameSite=Lax`, which a top-level GET navigation
    from ANY site still carries — and both exports are GETs. So a link or a
    redirect on a hostile page could make a signed-in merchant's browser
    download their book, spend their export budget and leave an audit row
    saying they chose to. Browsers mark such a request `Sec-Fetch-Site:
    cross-site`, which a page cannot forge or suppress.

    Only the exact value is refused. Absent means a client that does not send
    the header, and refusing those would break curl and older browsers for no
    gain: the attack needs a browser, and every browser that sends cookies
    under `SameSite=Lax` sends this header too.
    """
    site = (request.META.get("HTTP_SEC_FETCH_SITE") or "").strip().lower()
    if site == CROSS_SITE:
        raise PermissionDenied("Start the export from inside the app, not from a link elsewhere.")


def charge_export_budget(request: Any, view: Any) -> None:
    """Spend one unit of `UB_RATE_LIMIT_EXPORT` or answer 429.

    Reading is on the 600/min user budget; exporting streams the whole period
    and is on the 10/hour export one. LED-04's first version put the whole view
    on the export scope and a merchant arguing over a bill at the counter ran
    out of statement views in ten taps.

    The scope goes to the CONSTRUCTOR. This used to build the throttle bare and
    assign `.scope = "export"` afterwards, and `get_cache_key` then replaced it
    with the statement view's `throttle_scope = "user"` — so statement exports
    ran on 600/min (F-1). Aging escaped only because its view has no scope.
    """
    throttle = ScopedUserRateThrottle("export")
    if not throttle.allow_request(request, view):
        raise Throttled(wait=throttle.wait())
