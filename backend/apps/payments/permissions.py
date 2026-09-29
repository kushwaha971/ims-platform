"""Permission maps for the payments app (canon §0.9, Part 20 §20.5.5).

`HasPermission` is fail-closed: an action missing from a map is denied.

PAY-01 §12 / PAY-05 §12: everybody reads (the accountant included); owner,
admin and staff record; only owner and admin void — the registry grants
`payments.payment.void` to those two and nobody else.
"""

from __future__ import annotations

from apps.common.permissions import HasPermission

PaymentPermissions = HasPermission(
    {
        "list": "payments.payment.read",
        "retrieve": "payments.payment.read",
        "open_documents": "payments.payment.read",
        "create": "payments.payment.write",
        "share": "payments.payment.write",
        "void": "payments.payment.void",
        # A4a (PLT-X03 §10) — applying an advance is a payment write: owner, admin, staff.
        "allocations": "payments.payment.write",
    }
)

#: PAY-03 §12 — showing a Collect QR is a read.
UpiPermissions = HasPermission("payments.payment.read")
