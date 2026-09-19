"""Permission maps for the parties app (canon §0.9)."""

from __future__ import annotations

from apps.common.permissions import HasPermission

PartyPermissions = HasPermission(
    {
        "list": "parties.party.read",
        "retrieve": "parties.party.read",
    }
)
