"""Permission maps for the sales app (canon §0.9; SAL-02 §12, SAL-03 §12).

`HasPermission` is fail-closed: an action missing from the map is denied.
The accountant reads and shares, never writes; staff write and issue; the
credit-limit override and deleting somebody else's draft are ROLE checks made
inside the service (they are not delegable codenames — LED-01's rule).
"""

from __future__ import annotations

from apps.common.permissions import HasPermission

InvoicePermissions = HasPermission(
    {
        "list": "sales.invoice.read",
        "retrieve": "sales.invoice.read",
        "create": "sales.invoice.write",
        "partial_update": "sales.invoice.write",
        "destroy": "sales.invoice.write",
        "issue": "sales.invoice.write",
        "share_links": "sales.invoice.read",
        "upi_intent": "sales.invoice.read",
    }
)
