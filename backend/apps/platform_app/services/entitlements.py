"""Plan entitlements (PLT-15, Part 24 §24.9.1) — as narrowed by `DEC-001`.

`DEC-001` defaulted on 2026-09-19 to option (b):

> `PLT-15` ships enforcing **module entitlement and member count**; the ledger is
> uncapped; `max_parties` and `max_invoices_per_month` are **removed from
> enforcement** on every MVP plan and `CR-124` amends Part 24 §24.9.1 to match.
> Free tier is owner plus two members.

So `LIMIT_KEYS` here is `("max_users", "storage_mb")` and nothing else, and
`max_parties` / `max_invoices_per_month` are not read, not counted and not
enforced anywhere in this repository. `storage_mb` has no enforcement point
until the `files` app exists, so it is reported by `/auth/me` and gated nowhere;
`max_users` is the only limit with a hook this sprint. The ledger is not
mentioned in this module at all, which is the structural way to keep the promise
"udhaar entries are never limited" (PLT-15 US-3, AC-3).

FR-2 is the whole of the computation:

    modules  = plan.modules ∩ partner.allowed_modules
               (+ override `modules_extra`, still ∩ partner.allowed_modules)
    limit[k] = override[k] if present else plan.limits[k]      # null = unlimited

The tenant's own `enabled_modules` is the owner's switch and is applied by the
permission class on top of this, not folded in here: the two are different
questions and PLT-15 BR-6 requires both to be true.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.common.exceptions import PlanLimitReached

# DEC-001: exactly these, and no others, at MVP.
LIMIT_KEYS: tuple[str, ...] = ("max_users", "storage_mb")

# The keys DEC-001 removed. Named so that a reintroduction is a deliberate edit
# to a list rather than a forgotten `if`.
REMOVED_AT_MVP: tuple[str, ...] = ("max_parties", "max_invoices_per_month")

_CACHE_ATTR = "_ub_entitlement"
OVERRIDE_SETTING_KEY = "plan.overrides"


@dataclass(frozen=True, slots=True)
class Entitlement:
    """The effective entitlement of one tenant. `limits[k] is None` = unlimited."""

    plan_code: str
    modules: frozenset[str]
    limits: dict[str, int | None]

    def limit(self, key: str) -> int | None:
        return self.limits.get(key)

    def allows_module(self, module: str) -> bool:
        return module in self.modules


def for_tenant(tenant: Any) -> Entitlement:
    """FR-2, cached per request on the tenant instance (§20 "cached per request").

    The cache lives on the instance rather than in a process-wide dict because a
    process-wide cache of an entitlement is a cross-tenant leak waiting for a
    key collision, and the instance is exactly as long-lived as the request.
    """
    cached = getattr(tenant, _CACHE_ATTR, None)
    if cached is not None:
        return cached

    plan = tenant.plan
    partner = tenant.partner
    allowed = set(partner.allowed_modules or [])
    overrides = _overrides_for(tenant)

    modules = set(plan.modules or []) & allowed
    modules |= set(overrides.get("modules_extra") or []) & allowed

    limits: dict[str, int | None] = {}
    plan_limits = plan.limits or {}
    override_limits = overrides.get("limits") or {}
    for key in LIMIT_KEYS:
        if key in override_limits:
            limits[key] = _as_limit(override_limits[key])
        else:
            limits[key] = _as_limit(plan_limits.get(key))

    entitlement = Entitlement(plan_code=plan.code, modules=frozenset(modules), limits=limits)
    try:
        setattr(tenant, _CACHE_ATTR, entitlement)
    except AttributeError:  # pragma: no cover - defensive, models are not slotted
        pass
    return entitlement


def effective_modules(tenant: Any) -> frozenset[str]:
    """What the tenant may actually reach: entitlement ∩ the owner's switches.

    BR-6: "Module gating is by `enabled_modules` (owner choice) ∩ effective
    modules; both must be true." `platform` is never gated, because it is the
    module through which a tenant switches the others on.
    """
    enabled = set(tenant.enabled_modules or []) | {"platform"}
    return frozenset(for_tenant(tenant).modules & enabled) | {"platform"}


# ── max_users — the one limit with an enforcement hook this sprint ───────────


def member_usage(tenant: Any) -> int:
    """PLT-15 FR-3: memberships with `status ∈ {active, invited}`.

    BR-2: the owner counts. There is no "+1 for the owner" anywhere, because the
    owner is a membership like any other and counting it twice is how a free
    tier silently becomes one seat smaller than it was sold as.
    """
    from apps.platform_app.selectors.entitlements import count_members

    return count_members(tenant=tenant)


def assert_can_add_member(*, tenant: Any, adding: int = 1, endpoint: str = "") -> None:
    """Raise 403 `plan_limit_reached` when the seat would exceed the plan.

    Called at the two points PLT-15 FR-3 names that exist in Sprint 1 —
    invitation accept and `status → active` — and exported for `PLT-05`'s invite
    endpoint to call at the third.

    BR-7 requires the tenant row to be locked for the duration of the write, so
    two devices cannot both pass the check at `limit − 1`. The lock is taken by
    the caller's service, inside whose transaction this runs;
    `lock_tenant_for_write` is the helper that does it.
    """
    cap = for_tenant(tenant).limit("max_users")
    if cap is None:
        return
    used = member_usage(tenant)
    if used + adding > cap:
        raise_plan_limit(
            tenant=tenant, limit_key="max_users", used=used, cap=cap, endpoint=endpoint
        )


def lock_tenant_for_write(tenant: Any) -> Any:
    """`SELECT … FOR UPDATE` on `platform_tenant` (PLT-15 BR-7, EC-1).

    Serialises concurrent seat consumption. Must be called inside a transaction.
    """
    from apps.platform_app.models import Tenant

    return (
        Tenant.objects.select_for_update(of=("self",))
        .select_related("plan", "partner")
        .get(pk=tenant.pk)
    )


def raise_plan_limit(
    *, tenant: Any, limit_key: str, used: int, cap: int, endpoint: str = ""
) -> None:
    """FR-4's exact envelope.

    The `plan.limit_hit` audit row of §16 is **not** written here. §16 requires
    it "even though the request failed", and this is raised from inside the
    write transaction (BR-7 locks the tenant row for the check), so a row
    written here would roll back with everything else. It is written instead by
    `record_limit_hit`, which the DRF exception handler calls once the
    transaction has unwound — which is exactly §16's "the audit write happens in
    a separate autocommit call".
    """
    support = dict(tenant.partner.support_contact or {})
    error = PlanLimitReached(
        f"You have used {used} of {cap} on the {tenant.plan.code} plan.",
        details={
            "limit_key": limit_key,
            "limit": cap,
            "used": used,
            "plan_code": tenant.plan.code,
            "support_contact": {
                "phone": support.get("phone"),
                "whatsapp": support.get("whatsapp"),
                "email": support.get("email"),
            },
        },
    )
    # Carried on the exception rather than in `details`, because `details` is the
    # user-facing body and the endpoint name is an operator's fact.
    error.ub_tenant_id = tenant.pk
    error.ub_endpoint = endpoint
    raise error


def record_limit_hit(exc: Any, *, actor: Any = None) -> None:
    """Write §16's `plan.limit_hit` row for a `PlanLimitReached` that got out.

    Called by the exception handler, after the failed transaction has unwound,
    so the row survives the request it describes. Silent on anything it cannot
    identify: an audit row is never worth turning a 403 into a 500.
    """
    from apps.common.audit import AuditAction, write_audit
    from apps.common.context import Ctx
    from apps.platform_app.models import Tenant

    tenant_id = getattr(exc, "ub_tenant_id", None)
    if tenant_id is None:
        return
    tenant = Tenant.objects.filter(pk=tenant_id).first()
    if tenant is None:  # pragma: no cover - defensive
        return
    details = getattr(exc, "details", {}) or {}
    write_audit(
        ctx=Ctx(
            tenant=tenant,
            actor=actor,
            actor_type="user" if actor is not None else "system",
        ),
        action=AuditAction.PLAN_LIMIT_HIT,
        entity_type="platform_tenant",
        entity_id=tenant.pk,
        metadata={
            "limit_key": details.get("limit_key"),
            "limit": details.get("limit"),
            "used": details.get("used"),
            "endpoint": getattr(exc, "ub_endpoint", None) or None,
        },
    )


def plan_limits_payload(tenant: Any) -> dict:
    """FR-5's `plan_limits` block for `GET /auth/me`.

    Only the keys `DEC-001` left in existence appear. A client that still draws
    a parties meter finds no `max_parties` key and draws nothing, which is the
    intended outcome: the meter measured something that is no longer enforced.
    """
    entitlement = for_tenant(tenant)
    limits: dict[str, dict] = {
        "max_users": {"limit": entitlement.limit("max_users"), "used": member_usage(tenant)},
        "storage_mb": {"limit": entitlement.limit("storage_mb"), "used": 0},
    }
    return {
        "plan_code": entitlement.plan_code,
        "limits": limits,
        "modules": sorted(effective_modules(tenant)),
    }


def _overrides_for(tenant: Any) -> dict:
    """`platform_tenant_setting['plan.overrides']` (PLT-15 §15, PLT-14)."""
    from apps.platform_app.models import TenantSetting

    row = TenantSetting.objects.filter(tenant=tenant, key=OVERRIDE_SETTING_KEY).first()
    value = (row.value if row is not None else None) or {}
    return value if isinstance(value, dict) else {}


def _as_limit(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
