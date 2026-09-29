"""LED-10 — the one service every document posts its khata line through.

FR-1 and FR-2: an invoice, a credit note, a purchase bill, a payment and an
unpaid party expense each post ONE ledger entry inside the caller's
transaction, and each void reverses it the same way. Before this module the
sales and expenses apps each carried a stand-in built from the ledger's parts
(`ledger_link.py`); both now call here, so the matrix below is enforced once.

── What the caller owns and what this owns ──────────────────────────────────
The CALLER holds the transaction and has LOCKED the party (`lock_party`) —
its own lock order (party L1, documents L3, sequence L4) is the deadlock
argument, and this module must not take a lock out of turn. This module
validates the posting (§10), writes the row, moves the balance through
`apply_entry` (the one writer of the cache, which `recalc_balances` replays)
and writes the ledger's own audit row with `metadata.via='document'`.

── Idempotent by (source_type, source_id, entry_type) (BR-1) ────────────────
A second call for a source that already has a POSTED entry of that type
returns the standing one and moves nothing. That is what makes a retried
issue call behind an idempotency key harmless even if the handler re-ran
(EC-5), and it is the reason the lookup uses `ix_ledger_source`.

── Reversals are dated TODAY and point at the DOCUMENT (BR-5, BR-6, C6) ──────
LED-03's manual reversal keeps the original's date and names the entry it
undoes (`source_type='ledger_entry'`). A document void is a new business event:
the reversal carries the void date in the tenant's timezone and the document's
own `(source_type, source_id)`, so `reverse_source_entries` and the statement
can group a document's rows, and a closed period is never re-opened by a void.

── The posting registry (A2, ADR-042, contracts §1.2) ────────────────────────
FR-3's matrix was a literal dict here, which core would have had to edit for
every engine and vertical. It is `register_posting_source` now: each OWNER
registers its source from its own `AppConfig.ready()` — sales
`sales_document`, purchases `purchase_document`, payments `payment` (in all
three buckets), expenses `expense`, and later dues, library and lending theirs.
A source declares its entry types (each with the one direction that type always
carries, `POSTABLE_ENTRY_DIRECTIONS`) and the buckets it may post in; a posting
outside its registration is `LedgerPostingError` before anything is written.
Registration is idempotent by `source_type`, and a second owner disagreeing
about one is a start-up error rather than whichever imported last (BR-10).

── Buckets (ADR-043) ─────────────────────────────────────────────────────────
`post_source_entry(bucket=…)` writes the line in that bucket and moves the
party's caches for it (`apply_entry(bucket=…)`); `reverse_source_entries`
writes each reversal in its original's bucket, so a void of a loan collection
restores the loan and not the shop balance.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal
from types import MappingProxyType
from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db import connection

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction, LedgerBucket, PaymentMode, UpiApp
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.ledger.constants import (
    NOTE_MAX_LENGTH,
    POSTABLE_ENTRY_DIRECTIONS,
    SOURCE_TYPE_MAX_LENGTH,
    EntryStatus,
    EntryType,
)
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entries import _audit_snapshot
from apps.parties.services.balance import apply_entry, lock_party


class LedgerPostingError(RuntimeError):
    """§10 — a programming error, not user input. The handler maps it to a 500."""


@dataclass(frozen=True)
class PostingSource:
    """One registered source: who owns it, what it posts, and in which buckets."""

    source_type: str
    module: str
    #: entry_type -> the direction it always carries (read-only).
    entry_types: Mapping[str, str]
    buckets: frozenset[str]


_SOURCES: dict[str, PostingSource] = {}
_BASELINE: dict[str, PostingSource] | None = None


def register_posting_source(
    source_type: str,
    *,
    module: str,
    entry_types: Mapping[str, str],
    buckets: frozenset[str] = frozenset({LedgerBucket.MAIN.value}),
) -> None:
    """Register what `source_type` may post (contracts §1.2). Called from the owner's `ready()`.

    Refused with `ImproperlyConfigured` — a start-up error, never a request's — when the name
    does not fit `ledger_entry.source_type` (32), when an entry type is not a postable one or
    is declared with a direction other than the one it always carries (BR-8: `charge` is a
    debit), when a bucket is not one of the three, and when the source is already registered
    with a different shape (BR-10). The same registration twice is a no-op.
    """
    if not source_type or len(source_type) > SOURCE_TYPE_MAX_LENGTH:
        raise ImproperlyConfigured(
            f"posting source {source_type!r} must be 1–{SOURCE_TYPE_MAX_LENGTH} characters"
        )
    if not entry_types:
        raise ImproperlyConfigured(f"posting source {source_type!r} posts no entry type")
    for entry_type, direction in entry_types.items():
        fixed = POSTABLE_ENTRY_DIRECTIONS.get(entry_type)
        if fixed is None:
            raise ImproperlyConfigured(
                f"{entry_type!r} is not an entry type a source may post ({source_type!r})"
            )
        if direction != fixed:
            raise ImproperlyConfigured(
                f"{entry_type!r} is always a {fixed}; {source_type!r} declared {direction!r}"
            )
    wanted = frozenset(str(bucket) for bucket in buckets)
    if not wanted or not wanted <= frozenset(LedgerBucket.values):
        raise ImproperlyConfigured(
            f"posting source {source_type!r} buckets must be a non-empty subset of "
            f"{sorted(LedgerBucket.values)}, not {sorted(wanted)}"
        )
    source = PostingSource(
        source_type=source_type,
        module=module,
        entry_types=MappingProxyType({str(k): str(v) for k, v in entry_types.items()}),
        buckets=wanted,
    )
    existing = _SOURCES.get(source_type)
    if existing is not None:
        if (existing.module, dict(existing.entry_types), existing.buckets) != (
            source.module,
            dict(source.entry_types),
            source.buckets,
        ):
            raise ImproperlyConfigured(
                f"posting source {source_type!r} is already registered differently "
                f"(by {existing.module!r})"
            )
        return
    _SOURCES[source_type] = source


def posting_source(source_type: str) -> PostingSource | None:
    """The registration for `source_type`, or None."""
    return _SOURCES.get(source_type)


def registered_posting_sources() -> dict[str, PostingSource]:
    """Every registered source, by `source_type` (a copy)."""
    return dict(_SOURCES)


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to what the apps' `ready()` registered — `guards._reset_for_tests`' rule.

    Call it before AND after a test that registers a fake source. The first call snapshots
    the start-up registrations; later calls restore them, so a test's `test_charge` source
    never outlives the test and the real four are never stripped.
    """
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = dict(_SOURCES)
    _SOURCES.clear()
    _SOURCES.update(_BASELINE)


def _actor(ctx: Ctx) -> Any:
    return ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None


def _opposite(direction: str) -> str:
    return Direction.DEBIT if direction == Direction.CREDIT else Direction.CREDIT


def _assert_atomic() -> None:
    """FR-1 — a posting outside the caller's transaction is a half-written document."""
    if not connection.in_atomic_block:
        raise LedgerPostingError("post_source_entry must run inside the caller's transaction")


def standing_source_entry(
    *, tenant: Any, source_type: str, source_id: Any, entry_type: str
) -> LedgerEntry | None:
    """The POSTED entry this source produced of `entry_type`, or None (BR-1)."""
    return LedgerEntry.objects.filter(
        tenant=tenant,
        source_type=source_type,
        source_id=source_id,
        entry_type=entry_type,
        status=EntryStatus.POSTED,
    ).first()


def post_source_entry(
    *,
    ctx: Ctx,
    party: Any,
    amount: Decimal,
    entry_date: dt.date,
    entry_type: str,
    source_type: str,
    source_id: Any,
    note: str = "",
    payment_mode: str | None = None,
    upi_app: str | None = None,
    reference: str = "",
    source_number: str | None = None,
    bucket: str = LedgerBucket.MAIN,
) -> tuple[LedgerEntry, Decimal]:
    """Write one document's ledger line against `party` (LOCKED by the caller).

    Returns `(entry, balance_after)`. The direction is not a parameter: it is
    a function of `entry_type` (BR-2), and a caller that could pass it could
    pass the wrong one. `bucket` must be one the source registered (BR-7).
    """
    _assert_atomic()
    source = _SOURCES.get(source_type)
    if source is None or entry_type not in source.entry_types:
        raise LedgerPostingError(f"{entry_type!r} is not posted by {source_type!r}")
    if bucket not in source.buckets:
        raise LedgerPostingError(f"{source_type!r} does not post in the {bucket!r} bucket")
    if source_id is None:
        raise LedgerPostingError("a document posting needs its source_id")
    if party is None or party.tenant_id != ctx.tenant.id:
        raise LedgerPostingError("the party does not belong to this tenant")
    if amount is None or Decimal(amount) <= 0:
        raise LedgerPostingError("a posting amount must be greater than zero")

    existing = standing_source_entry(
        tenant=ctx.tenant, source_type=source_type, source_id=source_id, entry_type=entry_type
    )
    if existing is not None:
        return existing, party.balance

    direction = source.entry_types[entry_type]
    # A debit carries no mode (`ck_ledger_entry_debit_has_no_mode`): a payment
    # OUT keeps its modes on the payment row, not on the khata line.
    if direction != Direction.CREDIT or payment_mode not in PaymentMode.values:
        payment_mode = None
    if payment_mode != PaymentMode.UPI or upi_app not in UpiApp.values:
        upi_app = None
    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=_actor(ctx),
        party=party,
        direction=direction,
        amount=amount,
        entry_date=entry_date,
        entry_type=entry_type,
        source_type=source_type,
        source_id=source_id,
        note=(note or "")[:NOTE_MAX_LENGTH],
        payment_mode=payment_mode,
        upi_app=upi_app,
        reference=(reference or "")[:64] if payment_mode else "",
        status=EntryStatus.POSTED,
        bucket=bucket,
    )
    balance = apply_entry(party=party, direction=direction, amount=entry.amount, bucket=bucket)
    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after=_audit_snapshot(entry),
        metadata={
            "via": "document",
            "source": {"type": source_type, "id": str(source_id), "number": source_number},
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return entry, balance


def reverse_source_entries(
    *,
    ctx: Ctx,
    source_type: str,
    source_id: Any,
    reason: str,
    entry_date: dt.date | None = None,
) -> tuple[list[LedgerEntry], Decimal | None]:
    """FR-2 — reverse every POSTED line this source wrote. Returns `(reversals, balance)`.

    `balance` is the last touched party's balance after the reversals, or
    None when the source had nothing standing (a walk-in document, or a second
    void — which is therefore harmless here, and refused by the caller's own
    status check before it gets this far).

    Locks the standing rows, then their party, then writes: the same order
    LED-03 uses, so a correction and a void racing on one party serialise.
    """
    _assert_atomic()
    standing = list(
        LedgerEntry.objects.filter(
            tenant=ctx.tenant,
            source_type=source_type,
            source_id=source_id,
            status=EntryStatus.POSTED,
        )
        .exclude(entry_type=EntryType.REVERSAL)
        .select_for_update()
        .order_by("created_at", "id")
    )
    when = entry_date or tenant_today(ctx.tenant)
    reversals: list[LedgerEntry] = []
    balance: Decimal | None = None
    for original in standing:
        party = lock_party(tenant=ctx.tenant, party_id=original.party_id)
        before = _audit_snapshot(original)
        direction = _opposite(original.direction)
        reversal = LedgerEntry.objects.create(
            tenant=ctx.tenant,
            created_by=_actor(ctx),
            party=party,
            direction=direction,
            amount=original.amount,
            entry_date=when,
            entry_type=EntryType.REVERSAL,
            source_type=source_type,
            source_id=source_id,
            reverses=original,
            note=f"Reversal of {original.note}"[:NOTE_MAX_LENGTH] if original.note else "",
            reason=reason,
            status=EntryStatus.POSTED,
            # In the ORIGINAL's bucket: a void of a loan collection restores the loan.
            bucket=original.bucket,
        )
        original.status = EntryStatus.REVERSED
        original.reversed_by = reversal
        original.save(update_fields=["status", "reversed_by"])
        balance = apply_entry(
            party=party, direction=direction, amount=original.amount, bucket=original.bucket
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.LEDGER_ENTRY_REVERSED,
            entity_type="ledger_entry",
            entity_id=original.id,
            before=before,
            after=_audit_snapshot(original),
            metadata={
                "via": "document_void",
                "source": {"type": source_type, "id": str(source_id)},
                "void_reason": reason,
                "reversal_id": str(reversal.id),
                "party_id": str(party.id),
                "balance_after": str(balance),
            },
        )
        reversals.append(reversal)
    return reversals, balance
