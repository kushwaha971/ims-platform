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

# ── A4b ── held deposits (FRD 00 PLT-X02 §10) ──────────────────────────────────
#: Read like payments; receive, apply and return are payment writes (owner,
#: admin, staff). Voiding a deposit payment is `payments.payment.void`, on
#: `/payments/{id}/void`. A vertical's own screens call the same services from
#: its own endpoints under its own codename.
DepositPermissions = HasPermission(
    {
        "list": "payments.payment.read",
        "retrieve": "payments.payment.read",
        "receive": "payments.payment.write",
        "apply": "payments.payment.write",
        "refund": "payments.payment.write",
    }
)
