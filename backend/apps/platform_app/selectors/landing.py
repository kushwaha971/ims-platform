"""Where a session goes next — decided here, once, for every client (docs/platform/14 §4.1).

The client used to re-derive this in five places from the facts in `/auth/me`
(sign-in, the route guard, two password screens and the wizard), and they
disagreed: the set-password screen sent everyone to the wizard, and a business
made outside the wizard (step 0) counted as unfinished on the client and not
here. Now every session body carries `landing`, computed from the server's own
state, and the client only executes it.

The kinds, in precedence order:

* ``set_password``    — a temporary password; the server refuses everything else.
* ``choose_business`` — several businesses and nothing says which: the chooser.
* ``invitation``      — only invitations: the chooser lists them.
* ``admin``           — a platform operator with no business of their own.
* ``no_business``     — no business at all and nothing to accept: create one.
* ``business_setup``  — the active business is this OWNER's own unfinished
  wizard (steps 1–3). Never staff (they cannot complete it), never step 0.
* ``app``             — otherwise: the active business's app.

Onboarding is therefore scoped to (person, business) and is never a property of
the account: someone who works at one business and owns a half-made side
business is routed by whichever is active, and that is the one they used last.
"""

from __future__ import annotations

from typing import Any

from apps.platform_app.constants import MembershipStatus
from apps.platform_app.selectors.memberships import is_own_draft


def resolve_landing(*, user: Any, membership: Any, tenants: list[dict]) -> dict:
    """`landing` for a session; `tenants` is the body's own `tenants[]` (no extra query)."""
    from apps.platform_app.services.onboarding import WIZARD_LAST_STEP

    if getattr(user, "must_change_password", False):
        return {"kind": "set_password"}
    if membership is None:
        statuses = {t.get("status") for t in tenants}
        if MembershipStatus.ACTIVE in statuses:
            return {"kind": "choose_business"}
        if MembershipStatus.INVITED in statuses:
            return {"kind": "invitation"}
        if getattr(user, "is_super_admin", False):
            return {"kind": "admin"}
        return {"kind": "no_business"}
    tenant_id = str(membership.tenant_id)
    if is_own_draft(membership):
        done = int(membership.tenant.onboarding_step or 0)
        return {
            "kind": "business_setup",
            "tenant_id": tenant_id,
            "step": min(WIZARD_LAST_STEP, max(1, done + 1)),
        }
    return {"kind": "app", "tenant_id": tenant_id}
