"""LED-03 — correcting a mistake without deleting history (Part 26 §26.7 R7.1).

A shopkeeper writes ₹500 twice, or types 5000 for 500, or picks the wrong
customer. On paper they would scratch it out; here they cannot, because canon
§0.11 rule 1 makes a ledger line immutable and a database trigger enforces it.
So a correction is two new rows and one permitted change to the old one, and the
mistake stays visible for ever — which is the point rather than a constraint.
This is the feature that makes the append-only ledger usable by a human.

── The shape, once, so the two entry points cannot drift ────────────────────
A REVERSE is: mark the original `reversed`, insert an opposite entry that points
back at it. A CORRECT is the same two steps plus a third: insert a replacement
carrying the new values and pointing at the original with `supersedes_id`. So
`correct_entry` calls `reverse_entry`'s own machinery rather than repeating it,
and the balance arithmetic below runs once per row written.

── Why the reversal carries the ORIGINAL's date ─────────────────────────────
BR-7. A reversal dated today against an entry dated last Tuesday leaves last
Tuesday's day-book total wrong for ever — the money is out of the period it was
in and into a period it never touched. Dating it with the original makes the two
rows net to zero on the day the mistake was made, which is where it was made.

There is a real inconsistency in the specification here, and it is recorded
rather than resolved: LED-10 BR-6 and PAY-05 BR-3 require `entry_date = today`
for reversals driven by VOIDING A DOCUMENT, on the argument that voiding an
invoice is an event that happens today. Both shapes use `entry_type='reversal'`
and `reverses_id`, so nothing reading a chain can assume one dating rule.
`source_type` is the discriminator — `ledger_entry` here, the document there —
and a reader traversing provenance has to branch on it. Neither app has tables
yet; this is written down so the next author does not discover it by disagreeing
with themselves.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO
from apps.ledger.constants import (
    MANUAL_ENTRY_TYPE_FOR_DIRECTION,
    REASON_MAX_LENGTH,
    EntryStatus,
    EntryType,
    SourceType,
)
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entries import _clean_text, validate_entry_payload
from apps.parties.services.balance import clear_collection_date_if_settled, lock_party

REASON_MIN_LENGTH = 3

#: BR-6 — what may be corrected HERE.
#:
#: Everything else came from a document, and reversing the ledger line without
#: touching the document would leave the invoice saying one thing and the khata
#: another — and, once INV exists, the stock behind it a third. The document's
#: own void is the operation that undoes all of them together, which is why the
#: refusal names it rather than just declining.
CORRECTABLE_SOURCE_TYPES = frozenset({SourceType.MANUAL})

#: The entry types a REPLACEMENT may carry, by what the original was (BR-3).
#:
#: `opening` stays `opening` — LED-02's single-opening invariant survives because
#: the original becomes `reversed` first, so exactly one posted opening remains
#: (BR-9). `write_off` stays `write_off`. A manual entry follows the NEW
#: direction, which is EC-1: correcting a "You got" into a "You gave" is not a
#: `manual_got` with a different sign, it is a `manual_gave`.
PRESERVED_ENTRY_TYPES = frozenset({EntryType.OPENING, EntryType.WRITE_OFF})


def signed(direction: str, amount: Decimal) -> Decimal:
    """`+amount` for a debit, `−amount` for a credit (BR-4)."""
    return amount if direction == Direction.DEBIT else -amount


def opposite(direction: str) -> str:
    return Direction.CREDIT if direction == Direction.DEBIT else Direction.DEBIT


def _validate_reason(raw: Any) -> str:
    """§10 — 3 to 160 characters, and it is required on both operations.

    Required because the reason is the whole point of the feature: the row that
    survives says WHAT was changed, and without a reason it does not say why.
    Three characters is a low bar deliberately — "dup" is a real reason a
    shopkeeper gives — but an empty string is somebody clicking through a dialog.
    """
    reason = _clean_text(raw or "")
    if len(reason) < REASON_MIN_LENGTH or len(reason) > REASON_MAX_LENGTH:
        raise ValidationFailed(
            {
                "reason": [
                    f"Give a short reason ({REASON_MIN_LENGTH}–{REASON_MAX_LENGTH} characters)."
                ]
            }
        )
    return reason


def _lock_entry(*, ctx: Ctx, entry_id: Any) -> LedgerEntry:
    """The original, locked, with its party locked too.

    Both locks, and in this order. The entry's lock is EC-2: two admins
    correcting the same row at once must not produce two reversals, and the
    status check below is only meaningful while nobody else can change it. The
    party's lock is BR-2 of LED-01: the balance moves here, and it moves
    correctly only if this transaction is the only one moving it.

    Locking the entry first and the party second is the same order every other
    write in this app takes — `post_entry` locks only the party — so a reversal
    and an ordinary entry racing on one party cannot deadlock each other.
    """
    if ctx.tenant is None:
        raise NotFound("No such entry.")
    entry = (
        LedgerEntry.objects.filter(tenant=ctx.tenant, pk=entry_id)
        .select_for_update()
        .select_related("party")
        .first()
    )
    if entry is None:
        # Canon §0.11 rule 2 — another tenant's id is NOT FOUND, never forbidden.
        raise NotFound("No such entry.")
    return entry


def _refuse_if_not_correctable(entry: LedgerEntry) -> None:
    """FR-5 and FR-6, in the order a merchant hits them."""
    if entry.status != EntryStatus.POSTED:
        # EC-2 and Alternate C. The chain is allowed to grow — a REPLACEMENT can
        # be corrected again — but the row that has already been undone cannot
        # be undone twice.
        raise BusinessRuleViolation(
            "entry_already_reversed",
            "This entry has already been reversed.",
            details={"entry_id": str(entry.id), "reversed_by_id": str(entry.reversed_by_id or "")},
        )
    if entry.source_type not in CORRECTABLE_SOURCE_TYPES:
        raise BusinessRuleViolation(
            "use_document_void",
            "This entry came from a document. Void that document to reverse it.",
            # The client deep-links from these two. Nothing has a document yet,
            # so nothing can link — but the ids are what the link will be built
            # from, and sending them now means the client changes and the server
            # does not.
            details={"source_type": entry.source_type, "source_id": str(entry.source_id or "")},
        )


def _locked_open_party(*, tenant: Any, party_id: Any) -> Any:
    """The party, locked, and refused if they are archived.

    An archived party's khata is closed, and PTY-04 only allows the archive at a
    zero balance — so a correction here would move a balance the archive
    decision was made against, silently, on somebody who appears in no list. The
    merchant restores them first, which is one tap and puts the khata back on
    screen where the change is visible.
    """
    from apps.parties.constants import PartyStatus

    party = lock_party(tenant=tenant, party_id=party_id)
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them to correct an entry.",
        )
    return party


def _apply_delta(*, party: Any, delta: Decimal) -> Decimal:
    """Move the party's caches by a signed amount, in the caller's transaction.

    Not `apply_entry`, and the difference is the sign: that function takes a
    direction and an amount because an ENTRY has both. A correction's net effect
    is `−signed(original) + signed(replacement)`, which can be zero, negative or
    positive regardless of either row's direction — so what moves the cache here
    is the arithmetic itself.
    """
    from django.utils import timezone

    party.balance = (party.balance or ZERO) + delta
    party.receivable_total = max(party.balance, ZERO)
    party.payable_total = max(-party.balance, ZERO)
    # BR-4 of LED-01 — correcting an entry is something happening on this khata.
    party.last_activity_at = timezone.now()
    party.save(
        update_fields=[
            "balance",
            "receivable_total",
            "payable_total",
            "last_activity_at",
            "updated_at",
        ]
    )
    # LED-05 BR-2 — "after any posting (…, correction)": a correction that
    # takes the balance to zero clears the date exactly as a payment would.
    clear_collection_date_if_settled(party=party)
    return party.balance


def _write_reversal(*, ctx: Ctx, original: LedgerEntry, reason: str) -> LedgerEntry:
    """The reversal row, and the one permitted change to the original (BR-1/BR-2).

    The ORDER is load-bearing twice over. The original is marked `reversed`
    BEFORE the reversal is inserted, so `reversed_by_id` can point at a row that
    exists — and so LED-02's partial unique index on posted openings is free by
    the time a replacement opening is written (BR-9).

    `save(update_fields=…)` rather than `QuerySet.update()`, because
    `ImmutableModel` checks the field list against `MUTABLE_FIELDS` and the
    trigger checks it again in the database. Two guards on the only write in the
    product that is allowed to touch a posted line.

    `updated_at` is NOT in that list, although the trigger permits it. The
    model's own docstring explains why the column is declared and never read:
    on a row that cannot be updated it would equal `created_at`, and on these
    two permitted writes it would record the moment of a REVERSAL and thereby
    look like an edit to the original line. `reversed_by.created_at` is where
    "when was this undone" lives, and it is a row rather than a timestamp
    because a reversal has a reason and an author.
    """
    reversal = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None,
        party=original.party,
        direction=opposite(original.direction),
        amount=original.amount,
        # BR-7 — the ORIGINAL's date, so the two net to zero in the period the
        # mistake was made. See the module docstring on LED-10's divergence.
        entry_date=original.entry_date,
        entry_type=EntryType.REVERSAL,
        source_type=SourceType.LEDGER_ENTRY,
        source_id=original.id,
        reverses=original,
        # No `payment_mode` and no `upi_app`, deliberately — and not because
        # nobody thought of it. A reversal runs in the OPPOSITE direction, so
        # the reversal of a "You got" by PhonePe is a DEBIT, and
        # `ck_ledger_entry_debit_has_no_mode` forbids a debit a mode (and
        # `ck_ledger_entry_upi_app_needs_upi` an app without one). Copying them
        # would make every UPI receipt impossible to reverse. How the money
        # moved is still one hop away: `reverses` points at the original, which
        # keeps both columns for ever.
        reason=reason,
        status=EntryStatus.POSTED,
    )
    original.status = EntryStatus.REVERSED
    original.reversed_by = reversal
    original.save(update_fields=["status", "reversed_by"])
    return reversal


def _snapshot(entry: LedgerEntry) -> dict:
    return {
        "id": str(entry.id),
        "party_id": str(entry.party_id),
        "direction": entry.direction,
        "amount": str(entry.amount),
        "entry_date": entry.entry_date.isoformat(),
        "entry_type": entry.entry_type,
        "source_type": entry.source_type,
        "note": entry.note,
        "payment_mode": entry.payment_mode,
        "upi_app": entry.upi_app,
        "reference": entry.reference,
        "status": entry.status,
        "reason": entry.reason,
    }


@transaction.atomic
def reverse_entry(*, ctx: Ctx, entry_id: Any, reason: Any) -> dict:
    """Undo one entry. Returns `{reversal, original, balance}`.

    AC-1: a ₹500 "You gave" reversed on a ₹2,800 balance leaves ₹2,300, the
    original struck through, and a reversal row that says which entry it undoes
    and why.
    """
    clean_reason = _validate_reason(reason)
    original = _lock_entry(ctx=ctx, entry_id=entry_id)
    _refuse_if_not_correctable(original)

    party = _locked_open_party(tenant=ctx.tenant, party_id=original.party_id)
    before = _snapshot(original)
    reversal = _write_reversal(ctx=ctx, original=original, reason=clean_reason)
    balance = _apply_delta(party=party, delta=-signed(original.direction, original.amount))

    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_REVERSED,
        entity_type="ledger_entry",
        entity_id=original.id,
        before=before,
        after=_snapshot(original),
        metadata={
            "reason": clean_reason,
            "reversal_id": str(reversal.id),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return {"reversal": reversal, "original": original, "balance": balance}


@transaction.atomic
def correct_entry(*, ctx: Ctx, entry_id: Any, payload: dict) -> dict:
    """Fix one entry in place. Returns `{reversal, replacement, original, balance}`.

    AC-2: ₹500 corrected to ₹550 on a ₹2,800 balance leaves ₹2,850, one reversal
    and one replacement, and a timeline that shows only the ₹550 row until the
    merchant asks to see corrections.

    ── Why "nothing changed" is a refusal rather than a no-op ───────────────
    §10's cross-field rule. A correction that changes nothing writes two rows,
    moves no money and leaves the merchant looking at a struck-through entry and
    an identical one beneath it, wondering what they did. The message says what
    they probably meant instead: if the entry should not exist, reverse it.
    """
    clean_reason = _validate_reason(payload.get("reason"))
    original = _lock_entry(ctx=ctx, entry_id=entry_id)
    _refuse_if_not_correctable(original)

    # The SAME validator every other write uses — an opening had to be taught
    # this lesson once already. A correction is a new entry in every respect
    # except that it points at an old one.
    cleaned = validate_entry_payload(
        {
            "direction": payload.get("direction", original.direction),
            "amount": payload.get("amount", original.amount),
            "entry_date": payload.get("entry_date", original.entry_date),
            # Omitted means "as it was" for the mode too (FB-2). It used to be
            # `payload.get("payment_mode")` — None when absent — so correcting
            # only the amount, or only the UPI app, of a "You got" was refused
            # "Choose how you received the money" for a field the merchant never
            # touched. An explicit `null` is still a CLEAR, which the validator
            # refuses on a credit; and a mode kept onto a corrected DEBIT is
            # dropped by the validator, as a debit's always is.
            "payment_mode": payload.get("payment_mode", original.payment_mode),
            # Omitted means "as it was", the contract `EntryCorrectSerializer`
            # states — so a client that sends only `{amount, payment_mode}`
            # keeps the PhonePe it did not mention, rather than losing it to a
            # key it did not know about. An explicit `null` clears it, and the
            # validator drops it anyway if the corrected mode is not UPI.
            "upi_app": payload.get("upi_app", original.upi_app),
            "note": payload.get("note", original.note),
            "reference": payload.get("reference", original.reference),
        },
        tenant=ctx.tenant,
        # An opening has no payment mode to insist on; a corrected manual credit
        # does, for the same reason the original did.
        needs_mode=original.entry_type not in PRESERVED_ENTRY_TYPES,
    )

    changed = {
        field
        for field, value in (
            ("direction", cleaned["direction"]),
            ("amount", cleaned["amount"]),
            ("entry_date", cleaned["entry_date"]),
            ("note", cleaned["note"]),
            ("payment_mode", cleaned["payment_mode"]),
            # PhonePe corrected to Google Pay moves no money and is still a
            # correction: the app is what the merchant checks a dispute against.
            ("upi_app", cleaned["upi_app"]),
            ("reference", cleaned["reference"]),
        )
        if getattr(original, field) != value
    }
    if not changed:
        raise ValidationFailed(
            {"non_field_errors": ["Nothing changed — use Reverse if the entry should not exist."]}
        )

    party = _locked_open_party(tenant=ctx.tenant, party_id=original.party_id)
    before = _snapshot(original)
    reversal = _write_reversal(ctx=ctx, original=original, reason=clean_reason)

    replacement = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None,
        party=original.party,
        direction=cleaned["direction"],
        amount=cleaned["amount"],
        entry_date=cleaned["entry_date"],
        # BR-3 — `opening` stays `opening` and `write_off` stays `write_off`; a
        # manual entry follows the NEW direction, because correcting a "You got"
        # into a "You gave" is not a `manual_got` with the sign flipped (EC-1).
        entry_type=(
            original.entry_type
            if original.entry_type in PRESERVED_ENTRY_TYPES
            else MANUAL_ENTRY_TYPE_FOR_DIRECTION[cleaned["direction"]]
        ),
        source_type=SourceType.MANUAL,
        note=cleaned["note"] if original.entry_type not in PRESERVED_ENTRY_TYPES else original.note,
        payment_mode=cleaned["payment_mode"],
        upi_app=cleaned["upi_app"],
        reference=cleaned["reference"],
        supersedes=original,
        reason=clean_reason,
        status=EntryStatus.POSTED,
    )

    balance = _apply_delta(
        party=party,
        delta=(
            -signed(original.direction, original.amount)
            + signed(replacement.direction, replacement.amount)
        ),
    )

    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CORRECTED,
        entity_type="ledger_entry",
        entity_id=original.id,
        before=before,
        # §16 — `after` is the REPLACEMENT, not the struck-through original.
        # "What is this entry now" is the question, and the answer is the row
        # that is standing.
        after=_snapshot(replacement),
        metadata={
            "reason": clean_reason,
            "reversal_id": str(reversal.id),
            "replacement_id": str(replacement.id),
            "changed_fields": sorted(changed),
            "party_id": str(party.id),
            "balance_after": str(balance),
        },
    )
    return {
        "reversal": reversal,
        "replacement": replacement,
        "original": original,
        "balance": balance,
    }


def entry_history(*, tenant: Any, entry: LedgerEntry) -> list[LedgerEntry]:
    """FR-8 — the whole chain this entry belongs to, oldest first.

    Walks BACK to the first original through `supersedes`, then forward through
    `reversed_by` and the replacement that superseded each row. Each hop is a
    primary-key lookup, and a chain is three rows long in the common case and
    five in EC-3's.

    Bounded, and the bound is not defensiveness: `supersedes` and `reversed_by`
    are self-referencing foreign keys, and a cycle in them — which only a bug or
    a hand-written UPDATE could create — would otherwise be an infinite loop
    inside a request. The cap is high enough that no real chain reaches it.
    """
    MAX_HOPS = 50

    # TWO visited sets, not one, and the bug that taught the difference is worth
    # keeping in view: a single set seeded with the entry we started from meant
    # that walking BACK from a replacement put its own id in the set, and the
    # forward walk then refused to re-append it. "View history" opened from the
    # corrected row — the row a merchant actually taps, because it is the one
    # still on the timeline — showed the mistake and the reversal and stopped,
    # hiding the very entry they were looking at. Opened from the struck-through
    # original it was complete, which is why every direct test of it passed.
    root = entry
    walked_back: set = {root.id}
    for _ in range(MAX_HOPS):
        if root.supersedes_id is None:
            break
        parent = LedgerEntry.objects.filter(tenant=tenant, pk=root.supersedes_id).first()
        if parent is None or parent.id in walked_back:
            break
        walked_back.add(parent.id)
        root = parent

    chain: list[LedgerEntry] = [root]
    seen: set = {root.id}
    current = root
    for _ in range(MAX_HOPS):
        reversal = (
            LedgerEntry.objects.filter(tenant=tenant, pk=current.reversed_by_id).first()
            if current.reversed_by_id
            else None
        )
        if reversal is not None and reversal.id not in seen:
            seen.add(reversal.id)
            chain.append(reversal)
        replacement = (
            LedgerEntry.objects.filter(tenant=tenant, supersedes=current)
            .order_by("created_at")
            .first()
        )
        if replacement is None or replacement.id in seen:
            break
        seen.add(replacement.id)
        chain.append(replacement)
        current = replacement
    return chain
