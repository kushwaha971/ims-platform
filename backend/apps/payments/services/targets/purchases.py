"""The purchase bill as an allocation target — PUR-02, a payment OUT settling supplier bills.

PUR-02 FR-1 says supplier payments are PAY-01's `record_payment` with
`direction='out'`: no second payment service. This adapter is the whole of
PUR-02's server side inside payments. Everything that moves a bill's money
lives in `apps/purchases/services/payment_seam.py`, which purchases owns:

* `lock_payable_bills` takes `SELECT … FOR UPDATE` in `(document_date, number,
  id)` order — the one global lock order recording and voiding both use, so a
  payment and a payment void touching the same bills serialise instead of
  deadlocking (Part 20 §20.11.2 L3);
* `apply_payment(document, ±amount, today)` is the ONE writer of a bill's
  `amount_paid` / `amount_due` / `status` (PUR-01 BR-5). `apply` passes the
  allocated amount, `unapply` (a payment void) its negative, and the status is
  re-derived every time rather than toggled, so a bill another payment also
  settled stays paid (PAY-05 EC-2).

── FIFO order (PUR-02 FR-3) ─────────────────────────────────────────────────
Auto allocation settles the supplier's open bills "by `due_on` then
`document_date`". That is NOT the lock order, so the two are kept apart: the
rows are LOCKED in the canonical order, then SORTED for allocation by
`(due_on, document_date, number, id)` in Python. `open_documents` returns the
same order, so the drawer's FIFO preview and the server's allocation agree
row for row. A bill without a due date (never, once recorded — PUR-01 BR-10
sets one) sorts by its bill date.

── Only purchase bills (CR-2026-09-28-INT-A) ────────────────────────────────
This is the only target registered for `direction='out'`. SAL-04's refund
voucher is a payment out with `allocations='none'` precisely so that FIFO for
money out never reaches a customer's credit note: a supplier payment must
settle supplier bills and nothing else. `test_supplier_fifo_never_touches_*`
holds the line if somebody registers a second out-target later.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from apps.common.audit import AuditAction
from apps.common.money import ZERO
from apps.purchases.constants import DocumentKind, DocumentStatus
from apps.purchases.models import PurchaseDocument
from apps.purchases.services.payment_seam import apply_payment, lock_payable_bills

#: PUR-02 FR-3 — the statuses a supplier payment may be allocated to.
OPEN: tuple[str, ...] = (
    DocumentStatus.RECORDED,
    DocumentStatus.PARTIALLY_PAID,
    DocumentStatus.OVERDUE,
)
LOCK_ORDER: tuple[str, ...] = ("document_date", "number", "id")


def fifo_key(document: PurchaseDocument) -> tuple:
    """FR-3 — earliest due first, then the older bill, then the series."""
    return (
        document.due_on or document.document_date,
        document.document_date,
        document.number or "",
        str(document.id),
    )


class PurchaseBillTarget:
    document_type = "purchase_document"
    direction = "out"

    def _base(self, tenant: Any) -> Any:
        return PurchaseDocument.objects.filter(tenant=tenant, kind=DocumentKind.PURCHASE_BILL)

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[PurchaseDocument]:
        rows = list(
            self._base(tenant).filter(party_id=party_id, status__in=OPEN).order_by(*LOCK_ORDER)
        )
        return sorted(rows, key=fifo_key)

    def find(self, *, tenant: Any, ids: list[Any]) -> list[PurchaseDocument]:
        return list(self._base(tenant).filter(pk__in=ids)) if ids else []

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[PurchaseDocument]:
        if not ids:
            return []
        return [
            bill
            for bill in lock_payable_bills(tenant=tenant, ids=ids)
            if bill.kind == DocumentKind.PURCHASE_BILL
        ]

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[PurchaseDocument]:
        locked = list(
            self._base(tenant)
            .filter(party_id=party_id, status__in=OPEN)
            .select_for_update()
            .order_by(*LOCK_ORDER)
        )
        return sorted(locked, key=fifo_key)

    def is_open(self, document: PurchaseDocument) -> bool:
        return document.status in OPEN

    def outstanding(self, document: PurchaseDocument) -> Decimal:
        return max(document.amount_due, ZERO)

    def party_id(self, document: PurchaseDocument) -> Any:
        return document.party_id

    def _move(self, document: PurchaseDocument, delta: Decimal, today: dt.date) -> tuple[str, str]:
        before = document.status
        apply_payment(document=document, amount=delta, today=today)
        return before, document.status

    def apply(
        self, *, document: PurchaseDocument, amount: Decimal, today: dt.date
    ) -> tuple[str, str]:
        return self._move(document, amount, today)

    def unapply(
        self, *, document: PurchaseDocument, amount: Decimal, today: dt.date
    ) -> tuple[str, str]:
        return self._move(document, -amount, today)

    def summary(self, document: PurchaseDocument) -> dict:
        return {
            "document_type": self.document_type,
            "document_id": str(document.id),
            "kind": document.kind,
            "number": document.number,
            "supplier_invoice_number": document.supplier_invoice_number,
            "document_date": document.document_date.isoformat(),
            "due_on": document.due_on.isoformat() if document.due_on else None,
            "grand_total": str(document.grand_total),
            "amount_due": str(self.outstanding(document)),
            "status": document.status,
        }

    def audit_action(self) -> str:
        return AuditAction.PURCHASE_BILL_STATUS_CHANGED
