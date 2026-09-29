"""Allocation targets — what a payment can settle, as an interface (PAY-01 FR-4/FR-5).

A payment IN settles sales invoices; a payment OUT settles purchase bills
(PUR-02, next wave). `record_payment` and `void_payment` do not know either
table: they ask the target registered for a `document_type` to list, lock,
apply and un-apply, and every money rule about a payment stays in one place.

── Registering a target ──────────────────────────────────────────────────────
Implement `AllocationTarget` in the app that OWNS the documents and call
`register_target(...)` from that app's `AppConfig.ready()`, importing this
registry there (a deferred import, rule D5's pattern): sales registers
`sales/services/payment_target.py`, purchases `purchases/services/payment_target.py`
(A14, ADR-056). This package holds the protocol and the registry only; core
`payments` imports no document app, and every new target (dues, library,
lending, deposits) is registered the same way by its owner.

── The contract every target keeps ──────────────────────────────────────────
* `lock()` takes `SELECT … FOR UPDATE` in `(document_date, number, id)` order —
  the one global order both recording and voiding use (Sprint 8 exit
  criterion; Part 20 §20.11.2 L3), so two payments touching the same bills
  can never deadlock.
* `outstanding()` is what the document can still take. `apply()` and
  `unapply()` MOVE the document's `amount_paid` by the allocated amount and
  then derive `amount_due` with the owning app's one formula (sales:
  `refresh_invoice_amounts`, `grand_total − amount_paid − Σ credit
  applications`), so a credit applied by another feature (SAL-04's credit
  note) is preserved and no two writers keep their own arithmetic.
* Status is recomputed by the target's own rule after every move — never
  toggled — so a bill another payment also settled stays paid (PAY-05 EC-2).

── Protocol v2 (A4a, contracts §1.4) ─────────────────────────────────────────
Two attributes and two keywords:

* `bucket` — the ledger bucket a payment allocated here posts in (`main`,
  `loan`, `deposit`; ADR-043). A payment settles ONE kind of balance, so its
  allocations must share a bucket (R5).
* `auto` — may FIFO choose it? `False` means explicit only: a loan disbursal
  or a deposit must never be settled by an ordinary payment's `"auto"`.
* `apply` / `unapply` take `payment_id` (which payment moved the document —
  the dues engine's settlement split needs it) and the caller's `ctx` (R1:
  every caller passes its own; `None` is for job handlers only).
* `summary` may carry `label` (≤ 120), printed under the number (R30).

`register_target` refuses a `document_type` longer than 32 characters (R7), a
bucket or direction outside the vocabulary, and a second registration of a
document type with a different direction, bucket or `auto`.

The contract is proved for every registered target by one shared suite,
`tests/contracts/test_allocation_targets.py`.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any, Protocol

from django.core.exceptions import ImproperlyConfigured

#: `payments_allocation.document_type varchar(32)` (R7).
DOCUMENT_TYPE_MAX_LENGTH = 32
#: The ledger's buckets (`apps.common.constants.LedgerBucket`), as the protocol's vocabulary.
TARGET_BUCKETS: frozenset[str] = frozenset({"main", "loan", "deposit"})
TARGET_DIRECTIONS: frozenset[str] = frozenset({"in", "out"})


class AllocationTarget(Protocol):
    #: The `payments_allocation.document_type` value, e.g. `"sales_document"`.
    document_type: str
    #: The payment direction that may settle this target (`"in"` or `"out"`).
    direction: str
    #: The ledger bucket of a payment allocated here (`main`, `loan`, `deposit`).
    bucket: str
    #: May FIFO (`"auto"`) choose it? `False`: explicit allocations only.
    auto: bool

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

    def apply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        """Add `amount` paid. Saves the row. Returns `(status_before, status_after)`."""

    def unapply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        """Remove `amount` paid (a void). Saves the row. Returns `(before, after)`."""

    def summary(self, document: Any) -> dict:
        """`{document_type, document_id, number, document_date, due_on, grand_total,
        amount_due, status}` — what the allocation panel and the receipt show — and
        optionally `label` (≤ 120), printed under the number (R30)."""

    def audit_action(self) -> str:
        """The `*.status_changed` action this target's documents are audited under."""


_TARGETS: dict[str, AllocationTarget] = {}
_BASELINE: dict[str, AllocationTarget] | None = None


def _shape(target: Any) -> tuple:
    return (target.direction, target.bucket, target.auto)


def register_target(target: AllocationTarget) -> None:
    """Register what a payment can settle, from the owner's `ready()` (ADR-042, ADR-056).

    Idempotent by `document_type`: registering it again with the same direction, bucket and
    `auto` is a no-op (the instance is replaced, which a re-`ready()` does); a different shape is
    `ImproperlyConfigured`, a start-up error rather than whichever app imported last. Refused
    too: a name longer than `payments_allocation.document_type` (R7), and a bucket, direction or
    `auto` outside the protocol.
    """
    name = getattr(target, "document_type", "") or ""
    if not name or len(name) > DOCUMENT_TYPE_MAX_LENGTH:
        raise ImproperlyConfigured(
            f"allocation target {name!r} must be 1–{DOCUMENT_TYPE_MAX_LENGTH} characters (R7)"
        )
    if getattr(target, "direction", None) not in TARGET_DIRECTIONS:
        raise ImproperlyConfigured(f"allocation target {name!r} has no valid direction")
    if getattr(target, "bucket", None) not in TARGET_BUCKETS:
        raise ImproperlyConfigured(f"allocation target {name!r} has no valid bucket")
    if not isinstance(getattr(target, "auto", None), bool):
        raise ImproperlyConfigured(f"allocation target {name!r} must declare auto as a bool")
    existing = _TARGETS.get(name)
    if existing is not None and _shape(existing) != _shape(target):
        raise ImproperlyConfigured(
            f"allocation target {name!r} is already registered as {_shape(existing)}"
        )
    _TARGETS[name] = target


def target_for(document_type: str) -> AllocationTarget | None:
    return _TARGETS.get(document_type)


def registered_targets() -> dict[str, AllocationTarget]:
    """Every registered target by `document_type`, in registration order (a copy)."""
    return dict(_TARGETS)


def targets_for_direction(
    direction: str, *, auto_only: bool = False, bucket: str | None = None
) -> list[AllocationTarget]:
    """The targets a payment of this direction may settle, in registration order.

    `auto_only` keeps the ones FIFO may choose (R6); `bucket` keeps one bucket's.
    """
    return [
        target
        for target in _TARGETS.values()
        if target.direction == direction
        and (not auto_only or target.auto)
        and (bucket is None or target.bucket == bucket)
    ]


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to what the apps' `ready()` registered — `guards._reset_for_tests`' rule.

    Call before AND after a test that registers a fake target: the first call snapshots the
    start-up registrations, later calls restore them.
    """
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = dict(_TARGETS)
    _TARGETS.clear()
    _TARGETS.update(_BASELINE)
