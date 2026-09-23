"""PTY-04 FR-3 — the write-off PORT: how archive reaches the ledger without importing it.

── The problem this module solves ───────────────────────────────────────────
The write-off escape lives on `POST /parties/{id}/archive`, so the view and the
archive service are in `parties`. What it does is post a `ledger_entry`, which
is `ledger`'s table, validated by `ledger`'s rules and audited by `ledger`'s
snapshot. Part 20 §20.1.4 lets `ledger` import `parties` and forbids the
reverse (`tests/architecture/test_import_rules.py` enforces it), and that rule
is not a formality here: `parties/services/balance.py` already records that the
ledger calls `lock_party` and `apply_entry` and "nothing here calls the ledger".
Inverting that for one feature would make the two apps mutually dependent for
ever, and the next convenience would inherit the cycle.

── The shape: a port here, the adapter in the ledger ───────────────────────
`parties` declares WHAT it needs — "given this locked party and this request,
write the balance off and tell me the entry" — as one callable slot. `ledger`
fills the slot from `LedgerConfig.ready()`, which is the same moment and the
same mechanism `common/jobs.py` uses for job handlers: an app's `ready()`
registers into a registry owned by an app it is allowed to import, so the
registry is complete before the first request.

A signal was the other candidate and is wrong for this: rule D9 says a signal
may only do things that are safe to lose, a signal with no receiver is silently
a no-op, and a write-off is a financial write whose entry id the caller must
get back inside the same transaction. A port with exactly one registered
implementation fails loudly when it is missing and returns a value when it is
not.

── When nothing is registered ───────────────────────────────────────────────
`get_write_off_handler()` raises `ModuleDisabled` rather than returning None,
so a deployment without the ledger answers `403 module_disabled` with
`details.module = "ledger"` — the same answer a tenant with the ledger switched
off gets — and never a 500 from calling None.
"""

from __future__ import annotations

from typing import Any, Protocol

from django.core.exceptions import ImproperlyConfigured

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.exceptions import ModuleDisabled


class WriteOffHandler(Protocol):
    """What `archive_party` calls, inside its transaction, with the row locked.

    `party` is the LOCKED instance — the handler must move the balance on that
    object (the ledger does it through `apply_entry`), because the archive that
    follows re-checks `party.balance` on the same instance and saves it.
    `request` is the client's `write_off` object as received; every rule about
    its fields belongs to the implementation, because they are ledger rules.

    Returns `{"entry_id": str, "amount": str, "direction": str}` — ids and
    strings only, so nothing about `ledger_entry` leaks back into `parties`.
    """

    def __call__(self, *, ctx: Ctx, party: Any, request: dict) -> dict: ...


_handler: WriteOffHandler | None = None


def register_write_off_handler(handler: WriteOffHandler) -> None:
    """Fill the slot. Called once, from `LedgerConfig.ready()`.

    Re-registering the SAME callable is a no-op, because `ready()` can run more
    than once in one process (the test runner does it). Registering a DIFFERENT
    one is a configuration error and is refused, for the reason `job_handler`
    refuses a duplicate job type: two apps each believing they own the
    write-off is a bug that should surface at start-up, not as whichever
    happened to import last.
    """
    global _handler
    if _handler is not None and _handler is not handler:
        raise ImproperlyConfigured("A write-off handler is already registered.")
    _handler = handler


def get_write_off_handler() -> WriteOffHandler:
    """The registered handler, or `403 module_disabled` when there is none."""
    if _handler is None:
        raise ModuleDisabled(
            "Writing off a balance needs the ledger, which is not available.",
            details={"module": ModuleCode.LEDGER.value},
        )
    return _handler
