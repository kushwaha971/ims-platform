"""The seam PUR-02 / PAY-01 plug into — supplier payments are NOT built in this app.

PUR-02 (supplier payment) reuses `payments.services.payment_service.record_payment`
with `direction='out'` — "no second implementation" (Part 32 §32.12.3). The
import matrix points one way: `payments` may import `purchases`, never the
reverse (Part 20 §20.1.4). So this module offers the payments app exactly two
doors and owns nothing about money itself:

1. `apply_payment(document=…, amount=±x, today=…)` — the ONE function that moves
   `amount_paid` / `amount_due` / `status` on a bill. `record_payment` calls it
   with a positive amount for each allocation (after locking the bills with
   `lock_payable_bills`, in `(document_date, number, id)` order — Part 32
   §32.11.4); a payment VOID calls it with the negative. The status rule lives
   here once (PUR-01 BR-5): `paid` at zero due, `partially_paid` above zero
   paid, else `recorded` — or `overdue` when un-paying a bill whose due date
   has already gone, rather than waiting for tonight's job.

2. `register_void_listener(fn)` — PUR-04 FR-2d: voiding a bill deletes its
   `payments_allocation` rows so the payments become unallocated advances. The
   payments app registers `fn(ctx, document) -> [released payment ids]` from
   its `AppConfig.ready()`; `void_bill` calls every listener inside its own
   transaction. With no listener registered — today — there is nothing to
   release, because no payment can have been allocated to a bill.

The client side of the seam: the bill detail's "Pay supplier" action and the
editor's "Paid now" section are not rendered until `payments` ships them
(owner's rule: no unbuilt feature on screen).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any
from collections.abc import Callable

from apps.common.exceptions import BusinessRuleViolation
from apps.common.money import ZERO
from apps.purchases.constants import DocumentStatus

VoidListener = Callable[[Any, Any], list]

_VOID_LISTENERS: list[VoidListener] = []

PAYABLE_STATUSES = (
    DocumentStatus.RECORDED,
    DocumentStatus.PARTIALLY_PAID,
    DocumentStatus.OVERDUE,
    DocumentStatus.PAID,
)


def register_void_listener(listener: VoidListener) -> None:
    """Idempotent: a module imported twice registers once."""
    if listener not in _VOID_LISTENERS:
        _VOID_LISTENERS.append(listener)


def release_payments_on_void(ctx: Any, document: Any) -> list[str]:
    """PUR-04 FR-2d — every listener's released payment ids, in the caller's transaction."""
    released: list[str] = []
    for listener in _VOID_LISTENERS:
        released.extend(str(pid) for pid in (listener(ctx, document) or []))
    return released


def lock_payable_bills(*, tenant: Any, ids: list[Any]) -> list[Any]:
    """The bills a payment allocates to, locked in the canonical order (no deadlock)."""
    from apps.purchases.models import PurchaseDocument

    return list(
        PurchaseDocument.objects.select_for_update()
        .filter(tenant=tenant, pk__in=ids)
        .order_by("document_date", "number", "id")
    )


def status_for(*, amount_paid: Decimal, amount_due: Decimal, due_on: Any, today: dt.date) -> str:
    """PUR-01 BR-5 (with overdue derived at once when un-paying a late bill)."""
    if amount_due == ZERO:
        return DocumentStatus.PAID
    if due_on is not None and due_on < today:
        return DocumentStatus.OVERDUE
    if amount_paid > ZERO:
        return DocumentStatus.PARTIALLY_PAID
    return DocumentStatus.RECORDED


def apply_payment(*, document: Any, amount: Decimal, today: dt.date) -> Any:
    """Move a LOCKED bill's paid/due by `amount` (negative to undo). Saves and returns it."""
    if document.status not in PAYABLE_STATUSES:
        raise BusinessRuleViolation(
            "document_not_open",
            "This bill cannot take a payment.",
            details={"document_id": str(document.id), "status": document.status},
        )
    paid = document.amount_paid + amount
    due = document.grand_total - paid
    if paid < ZERO or due < ZERO:
        raise BusinessRuleViolation(
            "over_allocated",
            "That is more than this bill has left to pay.",
            details={"document_id": str(document.id), "amount_due": str(document.amount_due)},
        )
    document.amount_paid = paid
    document.amount_due = due
    document.status = status_for(
        amount_paid=paid, amount_due=due, due_on=document.due_on, today=today
    )
    document.version += 1
    document.save(update_fields=["amount_paid", "amount_due", "status", "version", "updated_at"])
    return document


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    _VOID_LISTENERS.clear()
