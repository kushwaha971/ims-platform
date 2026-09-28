"""PTY-04 FR-3 — writing a party's balance off so they can be archived.

This is the ADAPTER behind `parties/services/write_off.py`'s port. It is
registered from `LedgerConfig.ready()` and called by `parties`' `archive_party`
inside that service's transaction, with the party row already locked. That
module's docstring explains why the call runs this way round; this one is about
what a write-off IS.

── One ordinary ledger entry, through the ledger's own machinery ────────────
A write-off is `entry_type='write_off'`, `source_type='manual'`, in the
direction opposite to the balance's sign (a `credit` retires a receivable, a
`debit` retires a payable), for `|balance|`, with the merchant's reason as both
the `note` and the `reason`. It is inserted like every other entry and the
balance moves through `apply_entry` — the one function that writes the cache —
so `receivable_total`, `payable_total` and `last_activity_at` move with it and
`recalc_balances` replays it like any other row. It is immutable and it is
correctable through LED-03 (`PRESERVED_ENTRY_TYPES` keeps its type).

── The same validator as every other write path ─────────────────────────────
LED-02's opening balance first shipped with its own validation and accepted a
date in the year 202600 while an ordinary entry refused it. So the date and the
confirmed amount go through `_parse_date` and `_parse_amount` — the functions
`validate_entry_payload` itself calls — and the row that is finally written goes
through `validate_entry_payload` whole, exactly as an opening does. The reason
goes through LED-03's `_validate_reason`, which is the same 3–160 rule the FRD
states for `write_off.reason`. Nothing here restates a rule.

── The amount is the LOCKED balance, and the client may pin it ──────────────
What is written off is the balance read under `SELECT … FOR UPDATE`, never a
figure the client sent or the view read earlier: an entry posted on another
device between the dialog opening and Confirm must not leave a residue behind
an archived party. But the merchant ticked "I understand ₹2,300 is written
off", and silently writing off ₹2,800 instead would be forgiving ₹500 they never
agreed to. So `write_off.amount`, when sent, is the amount the merchant
CONFIRMED, and a locked balance that differs answers `409 balance_changed` with
the current figure — the dialog re-renders with the new amount and asks again.
This is a deliberate departure from FRD EC-2, which accepts an over-credited
archived party as the outcome of that race; with the lock and the pin, the race
cannot produce one.

── What is deliberately not here ────────────────────────────────────────────
The credit-limit check (PTY-06 BR-7 / FRD EC-14): a write-off only ever moves
the balance TO zero, so it cannot take a party past any limit, and the block
mode must not stop a merchant closing a khata.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Min

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import Direction
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import ZERO
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.services.corrections import _validate_reason
from apps.ledger.services.entries import (
    _audit_snapshot,
    _parse_amount,
    _parse_date,
    validate_entry_payload,
)
from apps.parties.services.balance import apply_entry

#: The key every field error is nested under, so the client finds it where FRD
#: §10 says it is — `details.write_off.reason`, `details.write_off.entry_date`.
FIELD = "write_off"


def _refuse(details: dict) -> None:
    if details:
        raise ValidationFailed({FIELD: details})


def _clean_request(*, ctx: Ctx, party: Any, request: dict) -> dict:
    """Every field rule, collected and raised once (the LED-01 convention).

    `entry_date` defaults to today in the TENANT's timezone — `tenant_today`,
    never the server's UTC date, which is EC-8 of LED-01 at half past midnight.

    The floor is the party's earliest entry (FRD §10): backdating inside the
    khata is legal (EC-13), but a write-off dated before the first thing that
    ever happened with this person would sit above their opening balance in the
    statement and retire a debt before it existed.
    """
    details: dict[str, list[str]] = {}
    if not isinstance(request, dict):
        _refuse({"non_field_errors": ["Send the write-off as an object."]})

    reason = ""
    try:
        reason = _validate_reason(request.get("reason"))
    except ValidationFailed as exc:
        details.update(exc.details)

    confirmed: Decimal | None = None
    if request.get("amount") not in (None, ""):
        confirmed = _parse_amount(request.get("amount"), details)

    raw_date = request.get("entry_date") or tenant_today(ctx.tenant)
    entry_date = _parse_date(raw_date, tenant=ctx.tenant, details=details)
    if entry_date is not None:
        earliest = LedgerEntry.objects.filter(tenant=ctx.tenant, party_id=party.id).aggregate(
            first=Min("entry_date")
        )["first"]
        if earliest is not None and entry_date < earliest:
            details["entry_date"] = [
                f"Choose {earliest.isoformat()} or later — the first entry in this khata."
            ]

    _refuse(details)
    return {"reason": reason, "confirmed": confirmed, "entry_date": entry_date}


def write_off_party_balance(*, ctx: Ctx, party: Any, request: dict) -> dict:
    """Post the write-off against `party`, which the caller has LOCKED. Returns ids.

    Runs inside `archive_party`'s transaction and opens none of its own: the
    entry, the balance move, both audit rows and the status change commit
    together or not at all. Order:

    1. Field rules → 400 `validation_error` under `details.write_off`.
    2. A zero balance → 400 `nothing_to_write_off`. Refused rather than ignored:
       a client that sends a write-off for a party who owes nothing has lost
       track of the balance it is showing, and archiving quietly would hide the
       bug that will next write off the wrong figure.
    3. A confirmed amount that is not `|balance|` → 409 `balance_changed`.
    4. The row, through `validate_entry_payload`, `apply_entry`, and the same
       `ledger.entry.created` audit snapshot `post_entry` writes.
    """
    cleaned = _clean_request(ctx=ctx, party=party, request=request)

    balance = party.balance or ZERO
    if balance == ZERO:
        raise BusinessRuleViolation(
            "nothing_to_write_off",
            "This party's balance is already zero — there is nothing to write off.",
            details={"balance": str(balance)},
        )

    amount = abs(balance)
    label = "receivable" if balance > ZERO else "payable"
    if cleaned["confirmed"] is not None and cleaned["confirmed"] != amount:
        raise BusinessRuleViolation(
            "balance_changed",
            "The balance changed since you confirmed the write-off. Check the new amount.",
            details={
                "balance": str(balance),
                "balance_label": label,
                "amount": str(amount),
                "confirmed_amount": str(cleaned["confirmed"]),
            },
        )

    direction = Direction.CREDIT if balance > ZERO else Direction.DEBIT
    try:
        row = validate_entry_payload(
            {
                "direction": direction,
                "amount": amount,
                "entry_date": cleaned["entry_date"],
                "note": cleaned["reason"],
            },
            tenant=ctx.tenant,
            needs_mode=False,
        )
    except ValidationFailed as exc:
        # Reachable only for a balance above `MAX_ENTRY_AMOUNT`, which no single
        # entry may carry. Re-keyed so the client still finds it under
        # `write_off`, which is the object it sent.
        raise ValidationFailed({FIELD: exc.details}) from exc

    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None,
        party=party,
        direction=row["direction"],
        amount=row["amount"],
        entry_date=row["entry_date"],
        entry_type=EntryType.WRITE_OFF,
        source_type=SourceType.MANUAL,
        note=row["note"],
        reason=cleaned["reason"],
        status=EntryStatus.POSTED,
    )
    balance_after = apply_entry(party=party, direction=row["direction"], amount=row["amount"])

    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after={**_audit_snapshot(entry), "reason": entry.reason},
        # FRD §16 — `via` and `write_off` say which surface produced it, so an
        # auditor listing entry creates can tell a forgiven debt from a typed
        # one without joining to the archive row.
        metadata={
            "via": "party_archive",
            "write_off": True,
            "party_id": str(party.id),
            "balance_before": str(balance),
            "balance_after": str(balance_after),
        },
    )
    # LED-08 BR-1 — a write-off is written in the customer's khata too.
    from apps.ledger.services.entry_sms import maybe_enqueue_entry_sms

    maybe_enqueue_entry_sms(tenant=ctx.tenant, party=party, entry=entry)
    return {"entry_id": str(entry.id), "amount": str(entry.amount), "direction": entry.direction}
