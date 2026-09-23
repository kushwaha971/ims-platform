"""LED-02 — the balance a merchant carries over from paper (Part 26 §26.7 R7.1).

Day one of this product is somebody typing in what forty customers already owe
them. Until that number is in the book, every statement starts from zero and
every aging figure is a lie, so this is the service that makes migrating from a
paper khata possible at all.

── Why it is a ledger entry and not a column ────────────────────────────────
PTY-01 stores `opening_balance_amount`, `_direction` and `_as_of` on the party
and posts nothing; that was the honest shape while `ledger_entry` did not exist.
It is not the right shape now. An opening balance is a fact about a DATE — "they
owed me ₹2,300 on 1 April" — and a column has no date, no audit row, no place in
a statement and no way to be corrected without overwriting what it used to say.
As an entry it is the first row of the khata, it ages from its own date (LED-09
FR-7), and LED-03 corrects it the way it corrects everything else: a reversal and
a replacement, with both rows kept.

The three columns stay. They are what the merchant TYPED, they are in
`PartyDetail` on the wire, and PTY-01's rule that they cannot be edited
afterwards (BR-5) still holds — the entry is the money, the columns are the
record of the request that made it.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entries import validate_entry_payload
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.services.balance import apply_entry, lock_party

#: BR-1. Stored in ENGLISH and translated on display.
#:
#: The alternative — storing the merchant's own locale's words — would make the
#: row unfindable by anything that reads the ledger rather than renders it: a
#: report, an export, a support query, the correction path. The client knows an
#: opening entry by its `entry_type` and prints its own label, which is why this
#: string never reaches a screen.
OPENING_NOTE = "Opening balance"


def opening_entry(*, tenant: Any, party_id: Any) -> LedgerEntry | None:
    """The party's posted opening entry, or None.

    `status='posted'` and not merely `entry_type='opening'`, which is BR-5: a
    reversal alone leaves the party with no opening, and the "Add opening
    balance" action comes back. A reversed opening is history, not an opening.
    """
    if tenant is None:
        return None
    return (
        LedgerEntry.objects.filter(
            tenant=tenant,
            party_id=party_id,
            entry_type=EntryType.OPENING,
            status=EntryStatus.POSTED,
        )
        .order_by("created_at")
        .first()
    )


def default_direction(party: Party) -> str:
    """FR-9 / §8 — which way the toggle starts.

    A supplier-only party is somebody this business BUYS from, so the balance
    carried over is what the business owes them. Everyone else — a customer, or
    a party that is both — starts on "they owe me", because that is what a
    shopkeeper is carrying over in the overwhelming majority of rows and EC-5
    says the both-flag case defaults that way too.
    """
    return (
        Direction.CREDIT
        if party.is_supplier and not party.is_customer
        else Direction.DEBIT
    )


@transaction.atomic
def post_opening_balance(
    *,
    ctx: Ctx,
    party: Party | None = None,
    party_id: Any = None,
    amount: Decimal | str,
    direction: str,
    as_of: dt.date | str,
    via: str = "drawer",
) -> dict:
    """Post the opening entry. Returns `{entry, balance}`.

    Takes either a party that the CALLER has already locked (the party-create
    path, which is inside its own transaction and holds the row) or an id to
    lock here (the drawer and the future import). Both, rather than one, because
    forcing the create path to release and re-take the lock would open exactly
    the window BR-2 exists to close.

    ── BR-2, and why it is checked twice ────────────────────────────────────
    At most one posted opening per party. The `SELECT … FOR UPDATE` on the party
    plus the `EXISTS` below is the check the spec asks for, and it is correct
    for every caller that goes through this function. The partial unique index
    (migration 0003) is the one that is correct for callers that do not — a
    management command, a psql session, a future import that batches inserts.
    The `IntegrityError` branch turns the index's refusal into the same 409 the
    check produces, so the two paths are indistinguishable to a client.

    ── Why the amount carries no sign ───────────────────────────────────────
    `direction` decides it, the same way it does for every other entry. "They
    owe me ₹2,300" is what a merchant knows; "−2300" is something they would
    have to decode, and canon §0.3 says whose problem the sign is.
    """
    # The SAME three rules an ordinary entry obeys — amount > 0 and at most two
    # decimal places, a date that is not in the future in the TENANT's timezone
    # and not before 2000, a direction from the two that exist.
    #
    # Imported rather than restated, and that is not tidiness: the first version
    # of this service validated nothing, so an opening balance accepted three
    # decimal places and a date in the year 202600 while an ordinary entry
    # refused both — on the same endpoint, in the same request shape, decided by
    # one field in the body.
    cleaned = validate_entry_payload(
        {"direction": direction, "amount": amount, "entry_date": as_of},
        tenant=ctx.tenant,
        needs_mode=False,
    )
    amount, direction, as_of = cleaned["amount"], cleaned["direction"], cleaned["entry_date"]

    if party is None:
        party = lock_party(tenant=ctx.tenant, party_id=party_id)
        if party is None:
            raise NotFound("No such party.")

    # EC-4 — an archived party may still be given an opening once restored, and
    # not before: the khata is closed while it is archived, and this is a write.
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them to add an opening balance.",
            details={"party_id": str(party.id), "name": party.name},
        )

    existing = opening_entry(tenant=ctx.tenant, party_id=party.id)
    if existing is not None:
        raise BusinessRuleViolation(
            "opening_balance_exists",
            "This party already has an opening balance. Correct it from the entry instead.",
            details={"entry_id": str(existing.id)},
        )

    try:
        with transaction.atomic():
            entry = LedgerEntry.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None,
                party=party,
                direction=direction,
                amount=amount,
                entry_date=as_of,
                entry_type=EntryType.OPENING,
                source_type=SourceType.MANUAL,
                note=OPENING_NOTE,
                status=EntryStatus.POSTED,
            )
    except IntegrityError as exc:
        # The index caught a race the check above lost. Same answer either way —
        # see the docstring. The savepoint is what keeps the outer transaction
        # usable afterwards, the lesson `create_party` wrote down first.
        if "uq_ledger_one_opening_per_party" in str(exc):
            raise BusinessRuleViolation(
                "opening_balance_exists",
                "This party already has an opening balance. Correct it from the entry instead.",
            ) from exc
        raise

    balance = apply_entry(party=party, direction=direction, amount=amount)

    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after={
            "id": str(entry.id),
            "party_id": str(party.id),
            "direction": entry.direction,
            "amount": str(entry.amount),
            "entry_date": entry.entry_date.isoformat(),
            "entry_type": entry.entry_type,
            "source_type": entry.source_type,
            "note": entry.note,
            "status": entry.status,
        },
        # §16 — `via` says which surface produced it, and the three values are
        # not decoration: an opening posted by an import is the one a support
        # query starts from when a merchant says their book is wrong after a
        # migration, and it has to be distinguishable from one they typed.
        metadata={"via": via, "party_id": str(party.id), "balance_after": str(balance)},
    )
    return {"entry": entry, "balance": balance}
