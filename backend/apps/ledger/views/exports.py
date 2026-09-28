"""What every ledger CSV export does before it streams a byte (LED-04, LED-09).

Two exports so far — a party's statement and the tenant's aging report — and
both are a query parameter (`?format=csv`) on a URL that everybody with read
access may open. That shape is why both of these live in the handler rather than
on the view class: a throttle scope or a permission map on the class sees the
URL, and the URL is the same for the read and for the export.
"""

from __future__ import annotations

from typing import Any, Mapping

from apps.common.audit import write_audit
from apps.common.context import Ctx

# The cross-site refusal, the export budget and the permission probe moved to
# `apps.common.exports` when PLT-08's audit export became the first CSV outside
# the ledger; the names are re-exported so every caller here is unchanged.
# `authorise_export` followed them there with IMP-02, when every list became
# exportable and `parties`, `inventory` and `expenses` needed the same gate.
from apps.common.exports import (  # noqa: F401
    CROSS_SITE,
    authorise_export,
    charge_export_budget,
    refuse_cross_site,
    request_has,
)


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
