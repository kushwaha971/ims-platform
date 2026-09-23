"""What every ledger CSV export does before it streams a byte (LED-04, LED-09).

Two exports so far — a party's statement and the tenant's aging report — and
both are a query parameter (`?format=csv`) on a URL that everybody with read
access may open. That shape is why both of these live in the handler rather than
on the view class: a throttle scope or a permission map on the class sees the
URL, and the URL is the same for the read and for the export.
"""

from __future__ import annotations

from typing import Any, Mapping

from rest_framework.exceptions import Throttled

from apps.common.audit import write_audit
from apps.common.context import Ctx
from apps.common.throttling import ScopedUserRateThrottle


def charge_export_budget(request: Any, view: Any) -> None:
    """Spend one unit of `UB_RATE_LIMIT_EXPORT` or answer 429.

    Reading is on the 600/min user budget; exporting streams the whole period
    and is on the 10/hour export one. LED-04's first version put the whole view
    on the export scope and a merchant arguing over a bill at the counter ran
    out of statement views in ten taps.
    """
    throttle = ScopedUserRateThrottle()
    throttle.scope = "export"
    throttle.rate = throttle.get_rate()
    throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
    if not throttle.allow_request(request, view):
        raise Throttled(wait=throttle.wait())


def audit_export(
    *,
    request: Any,
    tenant: Any,
    action: str,
    entity_type: str,
    entity_id: Any,
    params: Mapping[str, Any],
    row_count: int,
) -> None:
    """§16's row: who, which export, with what parameters, and how much.

    Written BEFORE the stream starts rather than after it ends. A streamed
    response has no reliable end on the server — the client can hang up half
    way — and an audit row that depends on the last byte is an audit row that
    goes missing for exactly the downloads somebody abandoned and retried.
    The row count is known up front because both exports count before they
    stream, to enforce the synchronous ceiling.
    """
    ctx = Ctx(
        tenant=tenant,
        actor=request.user,
        actor_type="user",
        request_id=getattr(request, "request_id", "") or "",
        ip=getattr(request, "client_ip", None),
        user_agent=request.META.get("HTTP_USER_AGENT"),
    )
    write_audit(
        ctx=ctx,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata={"params": dict(params), "row_count": row_count},
    )
