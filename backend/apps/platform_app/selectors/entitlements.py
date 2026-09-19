"""Entitlement counters (PLT-15 §5, §20 — one indexed COUNT per hooked write).

Read-only, no transaction, tenant taken explicitly (rule D8).
"""

from __future__ import annotations

from typing import Any

from apps.platform_app.models import Membership, MembershipStatus

COUNTED_MEMBER_STATUSES = (MembershipStatus.ACTIVE, MembershipStatus.INVITED)


def count_members(*, tenant: Any) -> int:
    """`max_users` usage: memberships with `status ∈ {active, invited}` (FR-3).

    Uses `IX(tenant_id, status)` (Part 21 §21.3.1), so this is an index-only
    scan rather than a table walk.
    """
    if tenant is None:
        return 0
    return Membership.objects.filter(tenant=tenant, status__in=COUNTED_MEMBER_STATUSES).count()
