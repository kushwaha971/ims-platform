"""An app's setup checklist, for one person (docs/platform/14 step 5).

Onboarding is scoped three ways and never global (§4.1): business setup is the
owner's wizard, app setup is per business per app, a checklist on that app's
home, and it NEVER blocks. Each app registers its steps from its own
`AppConfig.ready()` (`apps_registry.register_app_setup`); the platform knows
them only through the registry.
"""

from __future__ import annotations

from typing import Any

from apps.common.permissions_registry import permissions_for


def setup_payload(*, membership: Any, code: str) -> dict:
    """`GET /apps/{code}/setup` — the steps this person could do, and whether to show them."""
    from apps.platform_app import apps_registry

    held = permissions_for(membership)
    opens = {a.code for a in apps_registry.accessible_apps(membership, held)}
    steps_of = apps_registry.app_setup(code)
    tenant = membership.tenant
    if code not in opens or steps_of is None:
        return {"app": code, "steps": [], "complete": True, "hidden": False, "can_hide": False}
    steps = [step for step in steps_of(tenant) if step.permission in held]
    complete = all(step.done for step in steps)
    return {
        "app": code,
        "steps": [
            {"key": s.key, "label_id": s.label_id, "path": s.path, "done": s.done} for s in steps
        ],
        "complete": complete,
        "hidden": code in (tenant.setup_hidden_apps or []),
        "can_hide": getattr(membership.role, "code", None) in {"owner", "admin"},
    }
