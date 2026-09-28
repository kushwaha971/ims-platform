"""The sales invoice as an allocation target (PAY-01 BR-3/BR-4, PAY-05 FR-4/FR-5).

── Status after a move (BR-4) ───────────────────────────────────────────────
`amount_due = 0` → `paid`; still due and `due_on` before the tenant's today →
`overdue` (recomputed immediately, not left for the nightly job); still due and
something paid or credited → `partially_paid`; otherwise `issued`.

── Walk-in documents hold `amount_due` at zero ──────────────────────────────
`ck_sales_document_walk_in_paid` says an issued walk-in bill is never a
receivable, and that CHECK cannot be deferred. So for a walk-in document the
column stays 0 and what it can still take is `grand_total − amount_paid`. The
two moments that matters: the issue transaction writes the document before its
payment (issued, nothing paid, due held at 0) and the payment then settles it;
and PAY-05 FR-5's walk-in void reopens it to `issued` with nothing paid and
nothing "due" to collect from anybody — which is exactly the situation that
FR-5's warning describes.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import F

from apps.common.audit import AuditAction
from apps.common.money import ZERO
from apps.sales.models import SalesDocument

#: The kinds a payment may settle. Estimates and credit notes (SAL-01/SAL-04)
#: share the table and are never allocation targets.
PAYABLE_KINDS: tuple[str, ...] = ("invoice", "bill_of_supply")
OPEN: tuple[str, ...] = ("issued", "partially_paid", "overdue")
LOCK_ORDER: tuple[str, ...] = ("document_date", "number", "id")


class SalesInvoiceTarget:
    document_type = "sales_document"
    direction = "in"

    def _base(self, tenant: Any) -> Any:
        return SalesDocument.objects.filter(tenant=tenant, kind__in=PAYABLE_KINDS)

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[SalesDocument]:
        return list(
            self._base(tenant).filter(party_id=party_id, status__in=OPEN).order_by(*LOCK_ORDER)
        )

    def find(self, *, tenant: Any, ids: list[Any]) -> list[SalesDocument]:
        return list(self._base(tenant).filter(pk__in=ids)) if ids else []

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[SalesDocument]:
        if not ids:
            return []
        return list(self._base(tenant).filter(pk__in=ids).select_for_update().order_by(*LOCK_ORDER))

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[SalesDocument]:
        return list(
            self._base(tenant)
            .filter(party_id=party_id, status__in=OPEN)
            .select_for_update()
            .order_by(*LOCK_ORDER)
        )

    def is_open(self, document: SalesDocument) -> bool:
        return document.status in OPEN

    def outstanding(self, document: SalesDocument) -> Decimal:
        if document.party_id is None:
            return max(document.grand_total - document.amount_paid, ZERO)
        return max(document.amount_due, ZERO)

    def party_id(self, document: SalesDocument) -> Any:
        return document.party_id

    def _status(self, document: SalesDocument, today: dt.date) -> str:
        if document.party_id is None:
            return "paid" if document.amount_paid >= document.grand_total else "issued"
        if document.amount_due == ZERO:
            return "paid"
        if document.due_on is not None and document.due_on < today:
            return "overdue"
        if document.amount_due < document.grand_total:
            return "partially_paid"
        return "issued"

    def _move(self, document: SalesDocument, delta: Decimal, today: dt.date) -> tuple[str, str]:
        before = document.status
        document.amount_paid = document.amount_paid + delta
        if document.party_id is not None:
            document.amount_due = document.amount_due - delta
        document.status = self._status(document, today)
        SalesDocument.objects.filter(pk=document.pk).update(
            amount_paid=document.amount_paid,
            amount_due=document.amount_due,
            status=document.status,
            version=F("version") + 1,
        )
        return before, document.status

    def apply(self, *, document: SalesDocument, amount: Decimal, today: dt.date) -> tuple[str, str]:
        return self._move(document, amount, today)

    def unapply(
        self, *, document: SalesDocument, amount: Decimal, today: dt.date
    ) -> tuple[str, str]:
        return self._move(document, -amount, today)

    def summary(self, document: SalesDocument) -> dict:
        return {
            "document_type": self.document_type,
            "document_id": str(document.id),
            "kind": document.kind,
            "number": document.number,
            "document_date": document.document_date.isoformat(),
            "due_on": document.due_on.isoformat() if document.due_on else None,
            "grand_total": str(document.grand_total),
            "amount_due": str(self.outstanding(document)),
            "status": document.status,
        }

    def audit_action(self) -> str:
        return AuditAction.INVOICE_STATUS_CHANGED
