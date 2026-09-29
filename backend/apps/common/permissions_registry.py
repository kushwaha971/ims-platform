"""The permission-codename registry and the system-role sets (Part 20 §20.5.5).

Canon §0.9 fixes the format `<module>.<resource>.<action>`. This module declares
every codename exactly once; nothing else may invent one, and a test asserts the
registry equals canon §0.9 string for string.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

from django.core.exceptions import ImproperlyConfigured

from apps.common.constants import RoleCode

# ── The closed set of permission codenames (canon §0.9) ──────────────────────
PERMISSIONS: frozenset[str] = frozenset(
    {
        "platform.tenant.manage",
        "platform.members.manage",
        "platform.branding.manage",
        "platform.audit.read",
        "parties.party.read",
        "parties.party.write",
        "parties.party.delete",
        "parties.party.export",
        "ledger.entry.read",
        "ledger.entry.write",
        "ledger.entry.correct",
        "ledger.reminder.write",
        "ledger.statement.export",
        "inventory.item.read",
        "inventory.item.write",
        "inventory.item.delete",
        "inventory.stock.adjust",
        "inventory.stock.read",
        "inventory.location.manage",
        "sales.estimate.read",
        "sales.estimate.write",
        "sales.invoice.read",
        "sales.invoice.write",
        "sales.invoice.void",
        "sales.credit_note.write",
        "purchases.bill.read",
        "purchases.bill.write",
        "purchases.bill.void",
        "purchases.order.write",
        "payments.payment.read",
        "payments.payment.write",
        "payments.payment.void",
        "payments.request.write",
        "expenses.expense.read",
        "expenses.expense.write",
        "expenses.expense.void",
        "reports.basic.read",
        "reports.financial.read",
        "reports.export",
        "notifications.settings.manage",
    }
)

# ── A12 ── engine read codenames (R25, ADR-058; contracts §3) ───────────────
# engine -> consuming module -> the codename that module names for reading the
# engine's rows. Strings only (L4): a codename here is held only once its
# module registers it in PERMISSIONS, so until then the engine read fails
# closed. RULE: a codename here is held by NO scoped module role, because an
# engine read applies no vertical scope (A13's architecture test proves it).
ENGINE_READ_PERMISSIONS: dict[str, dict[str, str]] = {
    "dues": {
        "lending": "lending.loan.read_all",
        "library": "library.member.read",
        "gym": "gym.membership.money_read",
    },
    "attendance": {"gym": "gym.member.read_all"},
    "bookings": {"hospitality": "hospitality.booking.read"},
}

# Which module each codename belongs to — used by ModuleEnabled and by the
# entitlement filter in GET /permissions/me.
MODULE_OF: dict[str, str] = {p: p.split(".", 1)[0] for p in PERMISSIONS}

# ── System roles (canon §0.9) ────────────────────────────────────────────────
_OWNER = set(PERMISSIONS)  # everything

_ADMIN = _OWNER - {"platform.tenant.manage"}  # not tenant deletion/ownership/billing

_STAFF = {
    "parties.party.read",
    "parties.party.write",
    "ledger.entry.read",
    "ledger.entry.write",
    "ledger.reminder.write",
    "inventory.item.read",
    "inventory.stock.read",
    "sales.estimate.read",
    "sales.estimate.write",
    "sales.invoice.read",
    "sales.invoice.write",
    # SAL-04 §12 / T-SAL04-10 — staff initiate returns at the counter (void stays owner/admin).
    "sales.credit_note.write",
    "purchases.bill.read",
    "purchases.bill.write",
    "payments.payment.read",
    "payments.payment.write",
    "expenses.expense.read",
    "expenses.expense.write",
    "reports.basic.read",
}
# No *.void, no ledger.entry.correct, no reports.financial.read, no platform.*.
# `inventory.stock.adjust` is OFF by default and granted per member through
# Membership.permissions_override (canon §0.9 "stock adjust off by default").

_ACCOUNTANT = {p for p in PERMISSIONS if p.endswith(".read")} | {
    "parties.party.export",
    "ledger.statement.export",
    "reports.export",
    "reports.financial.read",
    "platform.audit.read",
}  # read everything, export everything, no writes

ROLE_PERMISSIONS: MappingProxyType = MappingProxyType(
    {
        RoleCode.OWNER.value: frozenset(_OWNER),
        RoleCode.ADMIN.value: frozenset(_ADMIN),
        RoleCode.STAFF.value: frozenset(_STAFF),
        RoleCode.ACCOUNTANT.value: frozenset(_ACCOUNTANT),
    }
)


def permissions_for(membership: Any) -> frozenset[str]:
    """Effective permissions: role set, plus allows, minus denies, minus disabled modules.

    `Membership.permissions_override` is `{"allow": [...], "deny": [...]}`.
    Deny always wins. Module gating is applied last, so a member can never hold a
    permission for a module the tenant has switched off — except `platform.*`,
    which is never module-gated because it is how a tenant switches modules on.

    **Only an `active` membership holds any permission.** Every caller today is
    handed an active row — `tenancy` resolves nothing else — so this is the
    second of two locks rather than the only one. It exists because PLT-05 now
    writes `invited` memberships that carry a real `role_id` (FR-2), and a role
    is exactly what this function turns into codenames: the day somebody passes
    a membership fetched without a status filter, an invitee who never accepted
    would silently hold staff rights. An absent `status` (a hand-built object)
    is read as active so the rule is about the database state, not attributes.
    """
    if getattr(membership, "status", "active") != "active":
        return frozenset()
    role = membership.role
    if role.is_system:
        # A13: a system role is a canon role or a registered module role; an
        # unknown code grants nothing (it used to raise KeyError — a 500 on
        # every request a module role's member made).
        base = set(system_role_permissions(role.code))
    else:
        base = set(role.permissions or [])
    override = membership.permissions_override or {}
    allow = set(override.get("allow", []))
    spec = _MODULE_ROLES.get(role.code) if role.is_system else None
    if spec is not None:
        # A13 (BR-3): a module role's grants stay inside its own module and
        # never lift its scope, however the override was written — or an agent
        # allowed `parties.party.read` would read every balance via /parties.
        allow = {
            c for c in allow if MODULE_OF.get(c) == spec.module and not c.endswith(".read_all")
        }
    base |= allow
    base -= set(override.get("deny", []))
    enabled = set(membership.tenant.enabled_modules or [])
    # A1 (PLT-X11 §10): a module's codenames land with its first commit; while
    # the module is unreleased nobody holds them. Deferred import (rule D1), and
    # no database read — this runs on every permission check.
    from apps.platform_app.services.entitlements import hidden_modules

    enabled -= hidden_modules()
    return frozenset(
        p
        for p in base
        if p in PERMISSIONS and (MODULE_OF[p] in enabled or MODULE_OF[p] == "platform")
    )


# ── A13 ── module roles (ADR-052, contracts §3, FRD 00 PLT-X12) ──────────────
#
# A module role is a system `platform_role` row (`tenant` NULL, `is_system`)
# owned by ONE vertical — `lending_agent`, `gym_trainer`,
# `hospitality_housekeeping` — registered here from the vertical's
# `AppConfig.ready()`. Its codenames are only its own module's: a scope the
# vertical applies to its own tables is worthless if the scoped person also
# holds `parties.party.read` and can open every balance through `/parties`
# (ADR-052). So a module role reaches parties, reminders and receipts only
# through its vertical's endpoints, which serve a scoped projection.

#: The verticals that may own module roles. Every other module code is core or
#: shop-and-billing, and a role "owned" by `parties` would be a way around the
#: rule above.
VERTICAL_MODULES: frozenset[str] = frozenset({"lending", "library", "gym", "hospitality"})


@dataclass(frozen=True, slots=True)
class ModuleRole:
    code: str
    module: str
    codenames: frozenset[str]
    label_id: str


_MODULE_ROLES: dict[str, ModuleRole] = {}
_MODULE_ROLES_BASELINE: dict[str, ModuleRole] | None = None


def _non_vertical_modules() -> frozenset[str]:
    from apps.common.constants import ModuleCode

    return frozenset(m.value for m in ModuleCode) - VERTICAL_MODULES


def register_module_role(
    code: str, *, module: str, codenames: frozenset[str], label_id: str
) -> None:
    """Register `code` as a module role holding exactly `codenames`.

    Refused (ImproperlyConfigured, i.e. at start-up) unless:
    * `code` is `"<module>_<role>"`, fits `platform_role.code` (32) and is not
      a canon role code;
    * `module` is a vertical, never a core or shop module;
    * every codename exists in `PERMISSIONS`, belongs to `module`
      (`MODULE_OF[c] == module`) and is not a `read_all` — the codename that
      LIFTS a scope (BR-3). No core codename, not even `ledger.reminder.write`.

    Idempotent for an equal spec (ADR-042); a different spec under a used code
    raises, because two definitions of one role is a bug, not an update.
    The role's `platform_role` row is written by the vertical's own data
    migration (`platform_app.services.memberships.module_role_migration`).
    """
    codenames = frozenset(codenames)
    problems: list[str] = []
    if (
        not code.startswith(f"{module}_")
        or len(code) <= len(module) + 1
        or len(code) > 32
        or code in {r.value for r in RoleCode}
    ):
        problems.append(f"code {code!r} must be '<module>_<role>', at most 32 characters")
    if module in _non_vertical_modules():
        problems.append(f"module {module!r} is not a vertical")
    for codename in sorted(codenames):
        if codename not in PERMISSIONS:
            problems.append(f"unknown codename {codename!r}")
        elif MODULE_OF.get(codename) != module:
            problems.append(f"{codename!r} is not a {module} codename")
        elif codename.endswith(".read_all"):
            problems.append(f"{codename!r}: a scoped role may not hold a read_all")
    if problems:
        raise ImproperlyConfigured(f"Module role {code!r}: " + "; ".join(problems))
    spec = ModuleRole(code=code, module=module, codenames=codenames, label_id=label_id)
    existing = _MODULE_ROLES.get(code)
    if existing is not None and existing != spec:
        raise ImproperlyConfigured(f"Module role {code!r} is already registered differently.")
    _MODULE_ROLES[code] = spec


def module_role(code: str) -> ModuleRole | None:
    return _MODULE_ROLES.get(code)


def module_roles() -> tuple[ModuleRole, ...]:
    """Every registered module role, in registration order."""
    return tuple(_MODULE_ROLES.values())


def system_role_permissions(code: str) -> frozenset[str]:
    """A system role's codenames: canon (`ROLE_PERMISSIONS`) or module role.

    Unknown → empty (fail closed): a system row whose module never registered
    it grants nothing, whatever its `permissions` column says.
    """
    if code in ROLE_PERMISSIONS:
        return ROLE_PERMISSIONS[code]
    spec = _MODULE_ROLES.get(code)
    return spec.codenames if spec is not None else frozenset()


def _reset_module_roles_for_tests() -> None:  # pragma: no cover - test helper
    """Back to what the apps' `ready()` registered (the guards.py pattern)."""
    global _MODULE_ROLES_BASELINE
    if _MODULE_ROLES_BASELINE is None:
        _MODULE_ROLES_BASELINE = dict(_MODULE_ROLES)
    _MODULE_ROLES.clear()
    _MODULE_ROLES.update(_MODULE_ROLES_BASELINE)
