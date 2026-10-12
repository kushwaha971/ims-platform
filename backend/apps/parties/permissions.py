"""Permission maps for the parties app (canon §0.9)."""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import BasePermission

from apps.common.permissions import HasPermission, OwnerOrAdmin

# `HasPermission` is fail-closed: an action missing from this map is denied,
# not allowed (`common/permissions.py` — `codename = required.get(action)`,
# then `if codename is None: return False`). So forgetting a write action here
# locks everybody out rather than letting everybody in, which is the right way
# round for the mistake to fail.
#
# The accountant role holds every `.read` codename and no `.write` one
# (`permissions_registry.py`), so it reads the party book and cannot touch it —
# which is what an accountant is.
PartyPermissions = HasPermission(
    {
        "list": "parties.party.read",
        "retrieve": "parties.party.read",
        "create": "parties.party.write",
        "update": "parties.party.write",
        "partial_update": "parties.party.write",
        # PTY-04 §12 — archiving IS the delete capability: the product has no
        # hard delete, so `parties.party.delete` is what the codename means
        # here. Staff and accountants hold neither, which is why a clean-up is
        # an owner's job and a staff member who hits the endpoint directly gets
        # 403 rather than a hidden button they can guess at.
        "archive": "parties.party.delete",
        "restore": "parties.party.delete",
        "bulk_archive": "parties.party.delete",
        # PTY-06 §12 — seeing a limit and its usage is the party READ right, and
        # that includes the accountant: limits appear in exports and in the
        # aging report, so a role that reads the book reads the control on it.
        #
        # The pre-flight is a read for the same reason the bar is: it answers a
        # question and refuses nothing. What it does NOT grant is the override,
        # which is a check on the ROLE rather than on any codename (BR-8) and
        # lives in `services/credit.py` — the one place in this product where a
        # role is checked directly, recorded there so the pattern is not copied.
        "credit_check": "parties.party.read",
        # ── A6 ── PLT-X04 §10: roles and relations are read with the party book and
        # changed with the party WRITE right (staff yes, accountant no). Unlinking a
        # guardian is not archiving anybody, so it is not `.delete`.
        "roles": "parties.party.read",
        "relations": "parties.party.read",
        "create_relation": "parties.party.write",
        "delete_relation": "parties.party.write",
    }
)


# PTY-04 §12 / T-PTY-04-12 — archive WITH a write-off needs `parties.party.delete`
# (the route's own entry above) AND `ledger.entry.write`, because it posts a
# ledger entry. Checked by the archive view only when the body carries a
# `write_off`, through the same class — and therefore the same resolver, with a
# member's allow and deny overrides and the tenant's module switches — that
# guards `/ledger-entries`. A second implementation of that resolution would
# first disagree for a member with a `deny` override, which is to say the exact
# member somebody set the override FOR.
WriteOffPermissions = HasPermission("ledger.entry.write")


# ── Owner, 12 Oct 2026 — editing and filing away a PERSON is a manager's act ──
#
# Who may edit a customer's or supplier's details, archive them, bring them back
# or clear a batch of them out of the book: the owner or an admin, and nobody
# else, whatever codenames a custom role was ticked. `PartyPermissions` above
# still decides the codename; this decides the actor's standing, and both must
# pass.
#
# The PATCH is split by BODY rather than refused whole, because the same route
# carries one thing that is not "editing the person": the khata page's promise
# date (`collection_date`, PTY-03), which the counter sets every day while a
# customer says "Friday, bhaiya". A PATCH that touches only the keys below keeps
# working for whoever holds `parties.party.write`; any other key — name, mobile,
# type, GST, addresses, notes, credit limit and days, SMS consent, tags — needs
# the owner or an admin. A mixed body is refused whole rather than applied in
# part, so a client is never told "saved" about a change that was dropped.
#
# Not covered here, deliberately: creating a party (staff add customers at the
# counter), the relation routes (a guardian link is the A6 write right), and
# bulk tagging (`/parties/tags/bulk`, PTY-05) — none of them edits or blocks
# the person.
STAFF_PATCH_KEYS: frozenset[str] = frozenset({"collection_date"})

_MANAGER_ACTIONS: frozenset[str] = frozenset({"archive", "restore", "bulk_archive"})
_EDIT_ACTIONS: frozenset[str] = frozenset({"update", "partial_update"})


def _body_keys(request: Any) -> set[str]:
    data = getattr(request, "data", None)
    return set(data.keys()) if hasattr(data, "keys") else set()


class PartyManagerActions(BasePermission):
    """Archive, restore, bulk-archive and an identity PATCH: owner or admin only."""

    message = OwnerOrAdmin.message

    def has_permission(self, request: Any, view: Any) -> bool:
        action = getattr(view, "action", None)
        if action in _MANAGER_ACTIONS:
            return OwnerOrAdmin().has_permission(request, view)
        if action in _EDIT_ACTIONS:
            keys = _body_keys(request)
            # An empty body edits nothing, but it is still an edit request and
            # there is no reason to answer it for somebody who may not edit.
            if keys and keys <= STAFF_PATCH_KEYS:
                return True
            return OwnerOrAdmin().has_permission(request, view)
        return True
