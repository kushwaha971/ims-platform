"""Does the acting member hold a codename? — one Membership read (ATT-02 BR-2, ATT-03 BR-3).

The engine checks exactly two codenames itself, both named by somebody else:
the override codename a vertical's policy returns, and the module's
`<module>.attendance.edit_closed`. Everything else (may this person check
anybody in at all) is the vertical endpoint's permission class.

Through `permissions_for`, so module gating, the release gate, overrides and
inactive memberships apply exactly as for every other check. A system context
(a job) holds nothing: no job overrides a block or edits a closed mark.
"""

from __future__ import annotations

from typing import Any


def actor_holds(ctx: Any, codename: str | None) -> bool:
    if not codename:
        return False
    user = getattr(ctx, "actor", None)
    if user is None:
        return False
    from apps.common.permissions_registry import permissions_for
    from apps.platform_app.models import Membership

    membership = (
        Membership.objects.select_related("role", "tenant")
        .filter(tenant=ctx.tenant, user=user, status="active")
        .first()
    )
    return membership is not None and codename in permissions_for(membership)
