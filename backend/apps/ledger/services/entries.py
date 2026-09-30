"""LED-01 — posting a manual ledger entry (Part 26 §26.7 R7.1: fat service).

This is the most frequent write in the product and the one every other ledger
feature is downstream of. Everything that decides anything is here: the
validation, the lock, the credit-limit rule, the balance move and the audit row.
The viewset authenticates, authorises and delegates.

── What LED-01 deliberately does NOT do, and why ────────────────────────────
**Attachments (FR-10, AC-4).** The `files` app has a models.py containing a
docstring and nothing else — there is no `files_attachment` table and no
`POST /attachments`, which the FRD itself routes through CCR-3, a canon change
request rather than canon. A nullable `attachment_id` on the entry would be a
column that can only ever be null, and a "Save without photo" path with no
photo path beside it. The upload arrives with the `files` app; `source_id` is
not it.

**The transaction SMS (FR-9)** landed with LED-08: `post_entry` queues it
through `entry_sms.maybe_enqueue_entry_sms`, which owns the three conditions
(`sms_opt_in`, a mobile, the tenant setting) beside the handler they feed.

**The outbox replay (FR-12).** The client keeps the draft and retries with the
same idempotency key, which is what AC-6 describes and what `@idempotent` on the
view makes safe. The IndexedDB queue in `src/utils/outbox.ts` is a different
feature — a write that survives the tab closing — and shipping half of it would
leave entries in a store nothing drains.

Each of these is a seam with a named owner rather than a stub, for the reason
PTY-03 gave about its timeline: a control that opens nothing teaches a merchant
that the product is broken rather than unfinished.
"""

from __future__ import annotations

import datetime as dt
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import MONEY_PAYMENT_MODES, Direction, PaymentMode, UpiApp
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import D, q2
from apps.ledger.constants import (
    MANUAL_ENTRY_TYPE_FOR_DIRECTION,
    MAX_ENTRY_AMOUNT,
    MIN_ENTRY_DATE,
    NOTE_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    EntryStatus,
    SourceType,
)
from apps.ledger.models import LedgerEntry
from apps.ledger.services.entry_sms import maybe_enqueue_entry_sms
from apps.parties.constants import PartyStatus
from apps.parties.services.balance import apply_entry, lock_party
from apps.parties.services.credit import CREDIT_MODE_BLOCK, check_credit, credit_mode, may_override


def _clean_text(value: Any) -> str:
    """NFKC-normalise and strip control characters, as the party service does.

    The same three reasons hold here and one is sharper: a note goes into the
    LED-08 SMS and onto the shared statement PTY-09 hands a customer, so a bidi
    override in it reverses the text a customer reads about their own debt.
    Braces are left alone — the template consumer escapes its own input — and
    newlines are collapsed, because a note is one line in a timeline row.
    """
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFKC", value)
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")
    return " ".join(text.split())


def _parse_amount(raw: Any, details: dict) -> Decimal | None:
    """§10 — required, > 0, at most 2 dp, at most `MAX_ENTRY_AMOUNT`.

    Rejects more than two decimal places rather than rounding them (EC-4). The
    client rounds `0.005` to `0.01` on blur and shows the merchant what it did;
    a server that quietly rounded would be changing an amount somebody typed
    without telling them, and the difference would show up as drift between what
    they meant and what the statement says.
    """
    if raw is None or raw == "":
        details["amount"] = ["Enter an amount greater than 0."]
        return None
    # `Decimal` parses "Infinity", "NaN" and "sNaN" without complaint, and
    # "1e400" is finite but wider than the context — all four then raised
    # `InvalidOperation` from `quantize()` (or, for sNaN, from the comparison)
    # OUTSIDE this `try`, and every write taking an amount answered 500
    # (security review F-4). So finiteness is checked the moment the value
    # exists, and the quantize that can still overflow is inside the `try`.
    try:
        amount = D(raw)
        if not amount.is_finite():
            raise InvalidOperation
        has_more_than_two_places = amount != amount.quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError, ValueError):
        details["amount"] = ["Enter a valid amount."]
        return None
    if has_more_than_two_places:
        details["amount"] = ["Amounts can have at most two decimal places."]
        return None
    if amount <= 0:
        details["amount"] = ["Enter an amount greater than 0."]
        return None
    if amount > D(MAX_ENTRY_AMOUNT):
        details["amount"] = ["That amount is too large."]
        return None
    return q2(amount)


def _parse_date(raw: Any, *, tenant: Any, details: dict) -> dt.date | None:
    """§10 and EC-8 — a business date, never in the future, in the TENANT's timezone.

    The comparison is against `tenant_today(tenant)` and not against the
    server's date, which is UTC. Between 5.30 a.m. and midnight UTC those two
    agree; for the five and a half hours after midnight IST they do not, and an
    entry a merchant makes at half past midnight would be rejected as being
    tomorrow. That is the whole of EC-8, and it is the sort of bug that only
    appears in production and only at night.
    """
    if raw in (None, ""):
        details["entry_date"] = ["Choose a date."]
        return None
    value = raw
    if isinstance(value, str):
        try:
            value = dt.date.fromisoformat(value)
        except ValueError:
            details["entry_date"] = ["Enter a valid date."]
            return None
    if not isinstance(value, dt.date):
        details["entry_date"] = ["Enter a valid date."]
        return None
    if value > tenant_today(tenant):
        details["entry_date"] = ["The date cannot be in the future."]
        return None
    if value < dt.date.fromisoformat(MIN_ENTRY_DATE):
        details["entry_date"] = ["That date is too far in the past."]
        return None
    return value


def validate_entry_payload(payload: dict, *, tenant: Any, needs_mode: bool = True) -> dict:
    """Every field rule that does not need the party row. Raises `ValidationFailed`.

    Returns the cleaned values. Collected into one `details` dict and raised
    once, rather than raised at the first failure, because a merchant who typed
    two things wrong should be told both — a form that reveals its objections
    one at a time is a form somebody submits four times.

    PUBLIC, and `needs_mode` is why. LED-02's opening balance is a different
    service with a different uniqueness rule, but the amount, the date and the
    direction are the same three rules — and the first version of that service
    did not call this one, so an opening balance accepted three decimal places
    and a date in the year 202600 while an ordinary entry refused both. Two
    copies of a validation rule are two copies that will disagree; an opening
    simply has no payment mode to ask about.
    """
    details: dict[str, list[str]] = {}

    direction = payload.get("direction")
    if direction not in (Direction.DEBIT, Direction.CREDIT):
        details["direction"] = ["Choose whether you gave or got."]

    amount = _parse_amount(payload.get("amount"), details)
    entry_date = _parse_date(payload.get("entry_date"), tenant=tenant, details=details)

    # §10's cross-field rule, and the asymmetry is deliberate. A credit MUST say
    # how the money arrived, because "I got ₹500" with no mode is a cashbook
    # entry nobody can reconcile. A debit's mode is dropped SILENTLY rather than
    # refused: EC-9 has the merchant type a reference, switch direction, and
    # save — the client keeps the value in form state so switching back does not
    # lose it, and erroring on a field the merchant cannot see would be a form
    # refusing to submit for a reason it cannot show.
    mode = payload.get("payment_mode")
    if needs_mode and direction == Direction.CREDIT:
        if not mode or mode not in MONEY_PAYMENT_MODES:  # A4b / R24: never `adjustment`
            details["payment_mode"] = ["Choose how you received the money."]
    elif not needs_mode:
        # An opening balance is a statement about a date, not a transfer: there
        # is no method by which money arrived, because none did today.
        mode = None
    else:
        mode = None

    # Which UPI app, and the same asymmetry one level down. Optional even for
    # UPI — "UPI, not sure which" is a true answer — and dropped SILENTLY for
    # every other mode, including a debit, whose mode was nulled just above:
    # the client keeps the pick in form state when the merchant switches from
    # UPI to cash, and refusing a field that is no longer on screen is the
    # same form-that-cannot-say-why EC-9 describes. The CHECK constraint
    # `ck_ledger_entry_upi_app_needs_upi` is what makes the silence safe.
    upi_app = payload.get("upi_app") or None
    if mode != PaymentMode.UPI:
        upi_app = None
    elif upi_app is not None and upi_app not in UpiApp.values:
        details["upi_app"] = ["Choose a UPI app from the list."]

    note = _clean_text(payload.get("note") or "")
    if len(note) > NOTE_MAX_LENGTH:
        details["note"] = [f"Keep the note under {NOTE_MAX_LENGTH} characters."]
    reference = _clean_text(payload.get("reference") or "")
    if len(reference) > REFERENCE_MAX_LENGTH:
        details["reference"] = [f"Keep the reference under {REFERENCE_MAX_LENGTH} characters."]
    # A reference belongs to the mode that has one. Kept for a `debit` would be
    # a UTR against money that went out by no method at all.
    if direction != Direction.CREDIT:
        reference = ""

    if details:
        raise ValidationFailed(details)

    return {
        "direction": direction,
        "amount": amount,
        "entry_date": entry_date,
        "payment_mode": mode,
        "upi_app": upi_app,
        "note": note,
        "reference": reference,
    }


def _audit_snapshot(entry: LedgerEntry) -> dict:
    """§16 — the full row, which is what an append-only table's audit means.

    `before` is never written for an entry create, because there is nothing
    before it. The snapshot carries the amount as a string for the reason every
    money value on a boundary does: the audit log is JSON, and a `Decimal`
    serialised through it comes back a float.
    """
    return {
        "id": str(entry.id),
        "party_id": str(entry.party_id),
        "direction": entry.direction,
        "amount": str(entry.amount),
        "entry_date": entry.entry_date.isoformat(),
        "entry_type": entry.entry_type,
        "source_type": entry.source_type,
        "source_id": str(entry.source_id) if entry.source_id else None,
        "note": entry.note,
        "payment_mode": entry.payment_mode,
        "upi_app": entry.upi_app,
        "reference": entry.reference,
        "status": entry.status,
    }


@transaction.atomic
def post_entry(*, ctx: Ctx, payload: dict) -> dict:
    """Write one manual entry and move the party's balance. Returns a result dict.

    `{entry, balance, warnings}` — the entry row, the party's balance AFTER it,
    and any non-blocking notes. The balance travels in the result rather than
    being re-read by the caller because the number the merchant is about to be
    shown must be the one this transaction produced; a second read after commit
    can pick up somebody else's entry and tell them a figure that was never
    true of their own action.

    ── The order of operations is the safety argument ───────────────────────
    1. Validate what does not need the row, and raise everything at once.
    2. LOCK the party. Everything after this point reads a balance nobody else
       can move until this transaction ends.
    3. Refuse an archived party (BR-9) — checked after the lock, because the
       archive itself is a write and the two must not interleave.
    4. Check the credit limit against the LOCKED balance (BR-6). The pre-flight
       endpoint runs the same function outside a transaction and is advisory
       only; this is the call that can refuse.
    5. Insert the entry, then move the cache, then audit. All three commit
       together or none of them do — a balance without its entry is a number
       with no justification, and an entry without its balance move is money
       the list does not show.
    """
    cleaned = validate_entry_payload(payload, tenant=ctx.tenant)

    party = lock_party(tenant=ctx.tenant, party_id=payload.get("party_id"))
    if party is None:
        # Canon §0.11 rule 2: an id from another tenant is NOT FOUND, never
        # forbidden. A 403 would confirm the row exists.
        raise NotFound("No such party.")

    if party.status == PartyStatus.ARCHIVED:
        # BR-9. A merchant looking at an archived khata is looking at history;
        # the answer is to restore the party, which the client says.
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them to add entries.",
            details={"party_id": str(party.id), "name": party.name},
        )

    warnings: list[dict] = []
    overridden = False
    if cleaned["direction"] == Direction.DEBIT:
        # FR-6 — credit entries never trigger the check. Money coming back can
        # only reduce exposure, and a rule that stopped a merchant recording a
        # payment because the party is over their limit would be stopping the
        # one action that fixes it.
        decision = check_credit(party=party, amount=cleaned["amount"], mode=credit_mode(ctx.tenant))
        if decision["status"] == CREDIT_MODE_BLOCK:
            if not payload.get("override"):
                raise BusinessRuleViolation(
                    "credit_limit_exceeded",
                    "This entry would put them past their credit limit.",
                    details=_limit_details(decision),
                )
            # FR-7 / BR-8 — the override is a check on the ROLE, not on a
            # codename, and it is made HERE rather than trusted from the
            # pre-flight. A client that asked "may I override" a minute ago and
            # now says `override=true` is telling the server what it was told;
            # the server has to decide again, inside the transaction that writes.
            if not may_override(tenant=ctx.tenant, user=ctx.actor):
                raise BusinessRuleViolation(
                    "override_not_allowed",
                    "Only an owner or admin can go past a credit limit.",
                    details=_limit_details(decision),
                )
            overridden = True
        if decision["status"] in ("warn", CREDIT_MODE_BLOCK):
            # Alternate C — a warning rides beside a 201. The record saved; the
            # merchant is told what it means. A warning modelled as an error
            # would refuse the entry a shopkeeper has already handed over goods
            # for.
            warnings.append({"code": "credit_limit_exceeded", **_limit_details(decision)})

    entry = LedgerEntry.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None,
        party=party,
        direction=cleaned["direction"],
        amount=cleaned["amount"],
        entry_date=cleaned["entry_date"],
        entry_type=MANUAL_ENTRY_TYPE_FOR_DIRECTION[cleaned["direction"]],
        source_type=SourceType.MANUAL,
        note=cleaned["note"],
        payment_mode=cleaned["payment_mode"],
        upi_app=cleaned["upi_app"],
        reference=cleaned["reference"],
        status=EntryStatus.POSTED,
    )
    balance = apply_entry(party=party, direction=cleaned["direction"], amount=cleaned["amount"])

    write_audit(
        ctx=ctx,
        action=AuditAction.LEDGER_ENTRY_CREATED,
        entity_type="ledger_entry",
        entity_id=entry.id,
        after=_audit_snapshot(entry),
        metadata={
            "party_id": str(party.id),
            "balance_after": str(balance),
            **({"credit_limit_warning": True} if warnings else {}),
            **({"override": True} if overridden else {}),
        },
    )
    if overridden:
        # §16 — a SECOND row, and deliberately not a flag on the first. An
        # auditor asking "who has ever lent past a limit" is asking a question
        # about a rare, deliberate act; making them filter every entry create by
        # a metadata key is making the rare event as hard to find as the common
        # one.
        write_audit(
            ctx=ctx,
            action=AuditAction.CREDIT_LIMIT_OVERRIDDEN,
            entity_type="parties_party",
            entity_id=party.id,
            after={"entry_id": str(entry.id), "balance_after": str(balance)},
            metadata={"limit": str(party.credit_limit), "amount": str(cleaned["amount"])},
        )

    # LED-08 FR-2 — the customer's SMS, queued in this transaction (the outbox),
    # sent 60 s later so rapid entries coalesce into one message.
    maybe_enqueue_entry_sms(tenant=ctx.tenant, party=party, entry=entry)

    return {"entry": entry, "balance": balance, "warnings": warnings}


def _limit_details(decision: dict) -> dict:
    """The figures a refusal or a warning has to carry, as strings (canon rule 3).

    `balance_after` rather than `exposure_after` on the wire, because BR-6 names
    it that way and because the drawer's banner says "Balance after this entry
    ₹53,000" — the merchant's word for the number, not the rule's.
    """
    return {
        "limit": str(decision["limit"]) if decision["limit"] is not None else None,
        "balance_after": str(decision["exposure_after"]),
        "over_by": str(decision["over_by"]),
    }
