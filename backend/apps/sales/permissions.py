"""Permission maps for the sales app (canon §0.9; SAL-01/02/03/04/05 §12).

`HasPermission` is fail-closed: an action missing from the map is denied.
The accountant reads and shares, never writes; staff write and issue; only an
owner or admin voids (`sales.invoice.void` — credit notes are sales documents
and there is no separate void codename, SAL-04 §12). The credit-limit override
and deleting somebody else's draft are ROLE checks made inside the service
(they are not delegable codenames — LED-01's rule).
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
        "void": "sales.invoice.void",
        "share_links": "sales.invoice.read",
        "upi_intent": "sales.invoice.read",
    }
)

_ESTIMATE_ACTIONS = {
    "list": "sales.estimate.read",
    "retrieve": "sales.estimate.read",
    "create": "sales.estimate.write",
    "partial_update": "sales.estimate.write",
    "destroy": "sales.estimate.write",
    "mark_sent": "sales.estimate.write",
    "mark_accepted": "sales.estimate.write",
    "mark_rejected": "sales.estimate.write",
    "convert": "sales.estimate.write",
    "share_links": "sales.estimate.read",
}
EstimatePermissions = HasPermission(_ESTIMATE_ACTIONS)
#: SAL-01 §12 — converting also writes an invoice, so it needs both codenames.
EstimateConvertPermissions = HasPermission({**_ESTIMATE_ACTIONS, "convert": "sales.invoice.write"})

#: SAL-04 §12 — reading is `sales.invoice.read` (no separate read codename exists).
CreditNotePermissions = HasPermission(
    {
        "list": "sales.invoice.read",
        "retrieve": "sales.invoice.read",
        "create": "sales.credit_note.write",
        "partial_update": "sales.credit_note.write",
        "destroy": "sales.credit_note.write",
        "issue": "sales.credit_note.write",
        "apply": "sales.credit_note.write",
        "void": "sales.invoice.void",
        "share_links": "sales.invoice.read",
    }
)
