"""WLB-02 — the partner record's rules, enforced for the Django admin.

At MVP the super admin edits partners in Django admin (the `/admin/partners`
API and the PLT-14 console are later work), so the admin form is the ONLY
writer, and these rules are what stop it writing a partner that breaks every
tenant under it: a colour white text cannot sit on, a module set without the
ledger, a code that silently changes under a hostname.

`validate_partner` returns field errors rather than raising, because a Django
form reports all of them at once; `record_partner_change` writes the audit row
(§16, `actor_type='super_admin'`, `tenant_id NULL`).
"""

from __future__ import annotations

import re
from typing import Any

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.context import Ctx
from apps.platform_app import branding as branding_rules

CODE_RE = re.compile(r"^[a-z0-9_]{2,32}$")
E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
#: WLB-02 §10: every partner must allow these — a khata product is parties and
#: a ledger, and `platform` is how everything else is switched on.
REQUIRED_MODULES: frozenset[str] = frozenset({"platform", "parties", "ledger"})
DEFAULT_PARTNER_CODE = "metis"
SUPPORT_HOURS_MAX = 80

AUDITED_FIELDS: tuple[str, ...] = (
    "name",
    "status",
    "branding",
    "allowed_modules",
    "default_plan_id",
    "support_contact",
    "settings",
)


def validate_partner(data: dict, *, instance: Any = None) -> dict[str, list[str]]:
    """§10's rules over the admin form's cleaned data."""
    from apps.common.constants import ModuleCode

    errors: dict[str, list[str]] = {}
    code = data.get("code")
    if instance is None or instance._state.adding:
        if not code or not CODE_RE.match(code):
            errors["code"] = ["Lowercase letters, numbers, underscore; 2–32 characters."]
    elif code is not None and code != instance.code:
        errors["code"] = ["The code cannot change after the partner is created."]

    name = (data.get("name") or "").strip()
    if not 2 <= len(name) <= 120:
        errors["name"] = ["Use 2–120 characters."]

    modules = set(data.get("allowed_modules") or [])
    known = {m.value for m in ModuleCode}
    if not modules <= known:
        errors["allowed_modules"] = [f"Unknown module {sorted(modules - known)[0]!r}."]
    elif not REQUIRED_MODULES <= modules:
        errors["allowed_modules"] = ["Must include platform, parties and ledger."]

    plan = data.get("default_plan")
    if plan is not None and not getattr(plan, "is_active", True):
        errors["default_plan"] = ["Choose an active plan."]

    support = data.get("support_contact") or {}
    if not isinstance(support, dict):
        errors["support_contact"] = ["Support contact must be a JSON object."]
    else:
        problems = []
        for key in ("phone", "whatsapp"):
            if support.get(key) and not E164_RE.match(str(support[key])):
                problems.append(f"{key} must be in +91XXXXXXXXXX form.")
        if support.get("email") and not EMAIL_RE.match(str(support["email"])):
            problems.append("email is not a valid address.")
        if support.get("hours") and len(str(support["hours"])) > SUPPORT_HOURS_MAX:
            problems.append(f"hours must be under {SUPPORT_HOURS_MAX} characters.")
        if problems:
            errors["support_contact"] = problems

    branding_errors = branding_rules.validate_partner_branding(data.get("branding") or {})
    if branding_errors:
        errors["branding"] = [f"{k}: {'; '.join(v)}" for k, v in sorted(branding_errors.items())]

    status = data.get("status")
    target_code = code if code else getattr(instance, "code", None)
    if target_code == DEFAULT_PARTNER_CODE and status == "suspended":
        errors["status"] = ["The default partner cannot be suspended."]
    return errors


def _snapshot(partner: Any) -> dict:
    return {
        "name": partner.name,
        "status": partner.status,
        "branding": partner.branding,
        "allowed_modules": sorted(partner.allowed_modules or []),
        "default_plan_id": str(partner.default_plan_id) if partner.default_plan_id else None,
        "support_contact": partner.support_contact,
        "settings": partner.settings,
    }


def record_partner_change(*, partner: Any, before: dict | None, actor: Any) -> None:
    """§16: created / updated / suspended / reactivated, as the super admin."""
    after = _snapshot(partner)
    ctx = Ctx(tenant=None, actor=actor, actor_type="super_admin", request_id="")
    if before is None:
        write_audit(
            ctx=ctx,
            action=AuditAction.PARTNER_CREATED,
            entity_type="platform_partner",
            entity_id=partner.id,
            after={"code": partner.code, **after},
        )
        return
    changed_before, changed_after = diff_fields(before, after, fields=AUDITED_FIELDS)
    if not changed_after and not changed_before:
        return
    if before.get("status") != after["status"]:
        action = (
            AuditAction.PARTNER_SUSPENDED
            if after["status"] == "suspended"
            else AuditAction.PARTNER_REACTIVATED
        )
    else:
        action = AuditAction.PARTNER_UPDATED
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="platform_partner",
        entity_id=partner.id,
        before=changed_before,
        after=changed_after,
    )


def snapshot(partner: Any) -> dict:
    return _snapshot(partner)
