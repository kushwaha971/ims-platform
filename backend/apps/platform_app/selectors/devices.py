"""PLT-09 — reading a person's devices (rule D8: never writes).

`user_agent_summary` and `ip_masked` are computed here rather than stored: a
label is cosmetic (EC-3, the UA is the client's claim) and a mask is a display
rule, so neither earns a column. No geolocation is looked up (§19: no external
calls), which is why the row carries a masked IP and never a city.
"""

from __future__ import annotations

import ipaddress
import re
from typing import Any

from django.db.models import F, QuerySet
from django.utils import timezone

#: FR-1 / §5: "UI lists ≤ 50 sessions".
MAX_SESSIONS_LISTED = 50

_BROWSERS: tuple[tuple[str, str], ...] = (
    # Order matters: Edge and Opera say "Chrome" too, Chrome says "Safari".
    (r"Edg(?:e|A|iOS)?/", "Edge"),
    (r"OPR/|Opera", "Opera"),
    (r"SamsungBrowser/", "Samsung Internet"),
    (r"Firefox/|FxiOS/", "Firefox"),
    (r"Chrome/|CriOS/", "Chrome"),
    (r"Safari/", "Safari"),
)
_SYSTEMS: tuple[tuple[str, str], ...] = (
    (r"Android", "Android"),
    (r"iPhone|iPod", "iOS"),
    (r"iPad", "iPadOS"),
    (r"Windows", "Windows"),
    (r"Mac OS X|Macintosh", "macOS"),
    (r"CrOS", "ChromeOS"),
    (r"Linux", "Linux"),
)


def user_agent_summary(user_agent: str | None) -> dict:
    """`{browser, os, device}` for a UA string — T-PLT-09-5.

    `device` is `phone`, `tablet` or `desktop`, which is what picks the card's
    icon. Anything unrecognised is `None` rather than a guess.
    """
    ua = user_agent or ""
    browser = next((name for pattern, name in _BROWSERS if re.search(pattern, ua)), None)
    system = next((name for pattern, name in _SYSTEMS if re.search(pattern, ua)), None)
    if re.search(r"iPad|Tablet", ua) or (system == "Android" and "Mobile" not in ua and ua):
        device = "tablet"
    elif re.search(r"Mobile|iPhone|iPod", ua):
        device = "phone"
    elif ua:
        device = "desktop"
    else:
        device = None
    return {"browser": browser, "os": system, "device": device}


def mask_ip(ip: str | None) -> str | None:
    """§19: "IP masked to /24 in UI" — `203.0.113.x`; IPv6 keeps its /48."""
    if not ip:
        return None
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if address.version == 4:
        head = str(address).rsplit(".", 1)[0]
        return f"{head}.x"
    network = ipaddress.ip_network(f"{address}/48", strict=False)
    return f"{network.network_address}/48"


def live_sessions(*, user: Any) -> QuerySet:
    """FR-1: the caller's sessions across tenants, live only, most recent first."""
    from apps.platform_app.models import Session

    return (
        Session.objects.select_related("tenant")
        .filter(user=user, revoked_at__isnull=True, expires_at__gt=timezone.now())
        .order_by(F("last_used_at").desc(nulls_last=True), "-created_at")[:MAX_SESSIONS_LISTED]
    )


def own_live_session(*, user: Any, session_id: Any) -> Any:
    """One live session of the caller's, or `None` (§10: "else 404")."""
    from apps.platform_app.models import Session

    return (
        Session.objects.filter(
            pk=session_id, user=user, revoked_at__isnull=True, expires_at__gt=timezone.now()
        )
        .select_related("tenant")
        .first()
    )


def session_row(session: Any, *, current_session_id: Any) -> dict:
    """FR-1's row shape."""
    return {
        "id": str(session.id),
        "family_id": str(session.family_id),
        "device_label": session.device_label,
        "user_agent_summary": user_agent_summary(session.user_agent),
        "ip_masked": mask_ip(session.ip),
        "tenant": (
            {"id": str(session.tenant_id), "name": session.tenant.name}
            if session.tenant_id
            else None
        ),
        "created_at": session.created_at,
        "last_used_at": session.last_used_at,
        "expires_at": session.expires_at,
        "is_current": current_session_id is not None and str(session.id) == str(current_session_id),
    }


def member_session_count(*, user: Any, tenant: Any) -> int:
    """How many live sessions a member holds in THIS tenant (the team drawer's count)."""
    from apps.platform_app.models import Session

    return Session.objects.filter(
        user=user, tenant=tenant, revoked_at__isnull=True, expires_at__gt=timezone.now()
    ).count()
