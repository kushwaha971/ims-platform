"""Permission maps for the purchases app (canon §0.9; PUR-01 §12, PUR-03 §12, PUR-04 §12).

`HasPermission` is fail-closed: an action missing from the map is denied.
The accountant reads, never writes; staff record bills and never void them;
deleting somebody else's draft is a ROLE check inside the service (BR-11).
"""

from __future__ import annotations

from apps.common.permissions import HasPermission

PurchaseBillPermissions = HasPermission(
    {
        "list": "purchases.bill.read",
        "retrieve": "purchases.bill.read",
        "create": "purchases.bill.write",
        "partial_update": "purchases.bill.write",
        "destroy": "purchases.bill.write",
        "record": "purchases.bill.write",
        "void": "purchases.bill.void",
    }
)

#: Shop item 3 — whoever may write a bill may order the goods for it; reading is the bill's.
PurchaseOrderPermissions = HasPermission(
    {
        "list": "purchases.bill.read",
        "retrieve": "purchases.bill.read",
        "create": "purchases.bill.write",
        "partial_update": "purchases.bill.write",
        "destroy": "purchases.bill.write",
        "send": "purchases.bill.write",
        "cancel": "purchases.bill.write",
        "create_bill": "purchases.bill.write",
    }
)

#: Shop P0 — a debit note is written by whoever writes bills, and voided by whoever
#: voids them (PUR-07 §12).
DebitNotePermissions = HasPermission(
    {
        "list": "purchases.bill.read",
        "retrieve": "purchases.bill.read",
        "create": "purchases.bill.write",
        "void": "purchases.bill.void",
    }
)
