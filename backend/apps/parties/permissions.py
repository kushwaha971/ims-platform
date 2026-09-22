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
    }
)
