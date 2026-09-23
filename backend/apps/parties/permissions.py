"""Permission maps for the parties app (canon §0.9)."""

from __future__ import annotations

from apps.common.permissions import HasPermission

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
