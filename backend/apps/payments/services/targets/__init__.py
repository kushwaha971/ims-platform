"""Allocation targets — what a payment can settle, as an interface (PAY-01 FR-4/FR-5).

A payment IN settles sales invoices; a payment OUT settles purchase bills
(PUR-02, next wave). `record_payment` and `void_payment` do not know either
table: they ask the target registered for a `document_type` to list, lock,
apply and un-apply, and every money rule about a payment stays in one place.

── Registering a target ──────────────────────────────────────────────────────
Implement `AllocationTarget` and call `register_target(...)` from the owning
side's start-up — `apps/payments/apps.py` registers the sales target, and
PUR-02 adds `targets/purchases.py` and one line beside it. Part 20 §20.1.4
lets `payments` import both `sales` and `purchases`, so the adapters live
here and neither document app imports payments at module level.

── The contract every target keeps ──────────────────────────────────────────
* `lock()` takes `SELECT … FOR UPDATE` in `(document_date, number, id)` order —
  the one global order both recording and voiding use (Sprint 8 exit
  criterion; Part 20 §20.11.2 L3), so two payments touching the same bills
  can never deadlock.
* `outstanding()` is what the document can still take. `apply()` and
  `unapply()` MOVE the document's paid caches by the allocated amount
  (`amount_paid ± a`, `amount_due ∓ a`) and never recompute them from scratch,
  so a credit applied by another feature (SAL-04's credit note) is preserved.
* Status is recomputed by the target's own rule after every move — never
  toggled — so a bill another payment also settled stays paid (PAY-05 EC-2).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any, Protocol


class AllocationTarget(Protocol):
    #: The `payments_allocation.document_type` value, e.g. `"sales_document"`.
    document_type: str
    #: The payment direction that may settle this target (`"in"` or `"out"`).
    direction: str

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[Any]:
        """The party's open documents in FIFO order `(document_date, number, id)`, unlocked."""

    def find(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        """The documents with these ids, UNLOCKED — the read side (receipts, details)."""

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        """The documents with these ids, LOCKED in `(document_date, number, id)` order."""

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[Any]:
        """Every open document of the party, LOCKED in FIFO order (auto allocation)."""

    def is_open(self, document: Any) -> bool:
        """Whether a payment may be allocated to it now (PAY-01 BR-3)."""

    def outstanding(self, document: Any) -> Decimal:
        """What it can still take — never negative."""

    def party_id(self, document: Any) -> Any:
        """The party it belongs to, or None for a walk-in document."""

    def apply(self, *, document: Any, amount: Decimal, today: dt.date) -> tuple[str, str]:
        """Add `amount` paid. Saves the row. Returns `(status_before, status_after)`."""

    def unapply(self, *, document: Any, amount: Decimal, today: dt.date) -> tuple[str, str]:
        """Remove `amount` paid (a void). Saves the row. Returns `(before, after)`."""

    def summary(self, document: Any) -> dict:
        """`{document_type, document_id, number, document_date, due_on, grand_total,
        amount_due, status}` — what the allocation panel and the receipt show."""

    def audit_action(self) -> str:
        """The `*.status_changed` action this target's documents are audited under."""


_TARGETS: dict[str, AllocationTarget] = {}


def register_target(target: AllocationTarget) -> None:
    """Idempotent by `document_type`; the last registration wins."""
    _TARGETS[target.document_type] = target


def target_for(document_type: str) -> AllocationTarget | None:
    return _TARGETS.get(document_type)


def targets_for_direction(direction: str) -> list[AllocationTarget]:
    """Every target a payment of this direction may settle, in registration order."""
    return [target for target in _TARGETS.values() if target.direction == direction]
