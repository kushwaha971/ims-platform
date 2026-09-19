"""The permission-codename registry and the system-role sets (Part 20 §20.5.5).

Canon §0.9 fixes the format `<module>.<resource>.<action>`. This module declares
every codename exactly once; nothing else may invent one, and a test asserts the
registry equals canon §0.9 string for string.
"""

from __future__ import annotations

from types import MappingProxyType
from typing import Any

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
    """
    role = membership.role
    if role.is_system:
        base = set(ROLE_PERMISSIONS[role.code])
    else:
        base = set(role.permissions or [])
    override = membership.permissions_override or {}
    base |= set(override.get("allow", []))
    base -= set(override.get("deny", []))
    enabled = set(membership.tenant.enabled_modules or [])
    return frozenset(
        p
        for p in base
        if p in PERMISSIONS and (MODULE_OF[p] in enabled or MODULE_OF[p] == "platform")
    )
