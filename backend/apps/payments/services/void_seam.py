"""Listeners a payment void calls — how an owner hears that one of its payments was voided.

A14 (ADR-056, R72): `payments` is core and imports no Shop & billing app. SAL-04 FR-10 still
needs a payment void to reach sales — voiding a credit note's refund voucher gives the amount back
to the note as open credit — so the call goes through this registry instead of an import, the
pattern of `purchases.services.payment_seam.register_void_listener` and ADR-042.

── The contract ──────────────────────────────────────────────────────────────
`listener(*, ctx, payment) -> list[dict]` is called by `void_payment` inside its transaction, after
the payment's allocations are un-applied and deleted and before the payment is marked void, with
the party, the allocated documents and the payment already locked (so a listener locks only rows
that sit after those in the global order). It returns document summary rows
(`{document_type, document_id, kind, number, document_date, due_on, grand_total, amount_due,
status}`) to add to the void's response, or `[]` when the payment is none of its business. It may
refuse by raising, which rolls the whole void back.

Registration is keyed and idempotent: the same listener under the same key is a no-op, a different
listener under a used key is a start-up error. Listeners run in registration order.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from django.core.exceptions import ImproperlyConfigured

PaymentVoidListener = Callable[..., list]

_LISTENERS: dict[str, PaymentVoidListener] = {}
_SNAPSHOT: dict[str, PaymentVoidListener] | None = None


def register_payment_void_listener(key: str, listener: PaymentVoidListener) -> None:
    """Register `listener` under `key` (e.g. `"sales.credit_note_refund"`), from `ready()`."""
    existing = _LISTENERS.get(key)
    if existing is not None and existing is not listener:
        raise ImproperlyConfigured(f"A different payment void listener is registered as {key!r}.")
    _LISTENERS[key] = listener


def payment_void_listeners() -> list[tuple[str, PaymentVoidListener]]:
    """The registered listeners, in registration order."""
    return list(_LISTENERS.items())


def notify_payment_voided(*, ctx: Any, payment: Any) -> list[dict]:
    """Call every listener; the document rows they return, in order."""
    rows: list[dict] = []
    for _key, listener in payment_void_listeners():
        rows.extend(listener(ctx=ctx, payment=payment) or [])
    return rows


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to what the apps' `ready()` registered — not to empty.

    `guards._reset_for_tests`' rule: call it before AND after a test that registers a fake. The
    first call snapshots the start-up registrations (every `ready()` has run by then) and later
    calls restore that snapshot, so clearing can never strip sales' real listener from the tests
    that run afterwards.
    """
    global _SNAPSHOT
    if _SNAPSHOT is None:
        _SNAPSHOT = dict(_LISTENERS)
    _LISTENERS.clear()
    _LISTENERS.update(_SNAPSHOT)
