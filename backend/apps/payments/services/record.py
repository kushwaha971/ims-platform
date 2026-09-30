"""PAY-01 / PAY-02 — `record_payment()`, the one writer of `payments_payment`.

Fat service (Part 26 §26.7 R7.1): the viewset, the sales issue seam (SAL-02
FR-10, SAL-07 FR-4) and — next wave — PUR-02 and SAL-04's refund all call this,
and nothing else writes a payment.

── The order of operations is the safety argument (Part 20 §20.11.2) ─────────
1. Validate everything that needs no row, and raise it all at once.
2. LOCK the party (L1) — its balance moves below.
3. LOCK the documents (L3) in `(document_date, number, id)` order through the
   allocation target, then decide the allocations against what is now
   committed: FIFO for `"auto"`, the merchant's rows for a manual list, each
   capped by what the document can still take (EC-1: a second payment racing
   on the same bill sees the reduced due, and a row over it is a 400 carrying
   the current figure).
4. Allocate the receipt number LAST (L4) — a failure above rolls it back with
   everything else, so the RCT series never gaps.
5. Insert the payment, its allocations, move each document, post ONE ledger
   line through LED-10 (`payment_in` credit / `payment_out` debit), audit.

── The public signature (other tracks call this) ────────────────────────────
    record_payment(*, ctx, payload, walk_in_document_id=None) -> dict

`payload`: `direction` ("in"|"out"), `party_id` (required except for the
walk-in seam), `payment_date` (ISO date, ≤ today; defaults to today),
`mode_breakup` [{mode, amount, reference?, upi_app?}] (1–4 lines, modes
unique), `amount` (optional; must equal Σ modes when sent), `reference`
(optional; defaults to the first line's), `note`, `allocations` — `"auto"`
(default), `"none"`/`[]` (all advance, e.g. SAL-04's refund voucher), or
`[{document_type, document_id, amount}]` — and `context`/`meta` (stored in
`payments_payment.meta`, e.g. `{"credit_note_id": …}`).

Returns `{payment, party_balance, documents: [summary…], ledger_entry_id,
allocation_mode}`.

── One bucket per payment (A4a, R5, ADR-043) ─────────────────────────────────
A payment settles ONE kind of balance. Its allocations' targets must share a
bucket, or the request is 400 `validation_error` (`allocations: One payment
settles one kind of balance.`) before any row or receipt number exists; the
payment's one khata line posts in that bucket and `payments_payment.bucket`
records it, once. A payment that settles nothing is `main`.

── `"auto"` is global oldest-first (R6) ──────────────────────────────────────
Across every `auto=True` target of the direction in the `main` bucket: each
target's open documents are locked in its canonical order, target by target in
registration order, then MERGED by `(document_date, number, id, document_type)`
(`merge_oldest_first`). A merge keeps each target's own FIFO — PUR-02 FR-3's
due-date order for a supplier's bills is exactly what it was — while an older
document of one target is settled before a newer one of another.

── Earmarks (R61) ────────────────────────────────────────────────────────────
A service caller may pass `meta.earmark = {module, subject_type, subject_id}`:
the money is reserved for one subject (a booking's advance). An earmarked
payment recorded with `"auto"` stays unallocated, and no automatic use
(`open_advances`, the dues run) ever reaches it; only an explicit allocation
does. The public API accepts no `meta`.
"""

from __future__ import annotations

import heapq
import uuid
from collections import OrderedDict
from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import MONEY_PAYMENT_MODES, LedgerBucket, PaymentMode, UpiApp
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.services.entries import _clean_text, _parse_amount, _parse_date
from apps.ledger.services.postings import post_source_entry
from apps.parties.constants import PartyStatus
from apps.parties.services.balance import lock_party
from apps.payments.constants import (
    MAX_MODE_LINES,
    NOTE_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    SEQUENCE_KIND_FOR_DIRECTION,
    AllocationMode,
    PaymentDirection,
    PaymentStatus,
)
from apps.payments.models import Allocation, Payment
from apps.payments.services.targets import AllocationTarget, target_for, targets_for_direction
from apps.platform_app.services.sequences import allocate_number

# ── Validation that needs no row ────────────────────────────────────────────


def validate_mode_breakup(
    raw: Any, *, prefix: str = "mode_breakup", allow_adjustment: bool = False
) -> list[dict]:
    """PAY-02 §10 — 1–4 lines, known modes, amounts > 0 at 2 dp, each mode once.

    Public, because SAL-02's payment at issue validates the same lines before
    the invoice exists (and the error keys carry that form's `prefix`).
    Returns clean lines with amounts as 2-dp strings and only the whitelisted
    keys (§19): `mode`, `amount`, and `reference` / `upi_app` when present.
    """
    details: dict[str, list[str]] = {}
    if not isinstance(raw, list) or not raw:
        raise ValidationFailed({prefix: ["Add how the money was paid."]})
    if len(raw) > MAX_MODE_LINES:
        raise ValidationFailed({prefix: [f"Use at most {MAX_MODE_LINES} modes."]})
    cleaned: list[dict] = []
    seen: set[str] = set()
    for index, row in enumerate(raw):
        row = row if isinstance(row, dict) else {}
        key = f"{prefix}.{index}"
        mode = row.get("mode")
        # A4b / R24: `adjustment` only when the deposits module asks for it.
        if mode not in (PaymentMode.values if allow_adjustment else MONEY_PAYMENT_MODES):
            details[f"{key}.mode"] = ["Choose a payment mode."]
            continue
        if mode in seen:
            details[prefix] = ["Each mode once — combine the two lines."]
        seen.add(mode)
        line_errors: dict[str, list[str]] = {}
        amount = _parse_amount(row.get("amount"), line_errors)
        if line_errors:
            details[f"{key}.amount"] = line_errors["amount"]
            continue
        reference = _clean_text(row.get("reference") or "")
        if len(reference) > REFERENCE_MAX_LENGTH:
            details[f"{key}.reference"] = [
                f"Keep the reference under {REFERENCE_MAX_LENGTH} characters."
            ]
        line: dict[str, str] = {"mode": mode, "amount": str(amount)}
        # A UTR on a cash line is a leftover from a mode the merchant switched away from.
        if reference and mode != PaymentMode.CASH:
            line["reference"] = reference
        upi_app = row.get("upi_app") or None
        if mode == PaymentMode.UPI and upi_app is not None:
            if upi_app not in UpiApp.values:
                details[f"{key}.upi_app"] = ["Choose a UPI app from the list."]
            else:
                line["upi_app"] = upi_app
        cleaned.append(line)
    if details:
        raise ValidationFailed(details)
    return cleaned


def mode_total(lines: list[dict]) -> Decimal:
    return sum((Decimal(line["amount"]) for line in lines), ZERO)


def primary_line(lines: list[dict]) -> dict:
    """PAY-02 BR-2 — the largest share; a tie goes to the line listed first."""
    best = lines[0]
    for line in lines[1:]:
        if Decimal(line["amount"]) > Decimal(best["amount"]):
            best = line
    return best


def _validate(payload: dict, *, tenant: Any, allow_adjustment: bool = False) -> dict:
    details: dict[str, list[str]] = {}
    direction = payload.get("direction") or PaymentDirection.IN
    if direction not in PaymentDirection.values:
        details["direction"] = ["Choose received or paid out."]

    raw_date = payload.get("payment_date") or tenant_today(tenant)
    date_errors: dict[str, list[str]] = {}
    payment_date = _parse_date(raw_date, tenant=tenant, details=date_errors)
    if date_errors:
        details["payment_date"] = date_errors["entry_date"]

    lines: list[dict] = []
    try:
        lines = validate_mode_breakup(
            payload.get("mode_breakup"), allow_adjustment=allow_adjustment
        )
    except ValidationFailed as exc:
        details.update(exc.details or {})

    amount = mode_total(lines) if lines else None
    if lines and payload.get("amount") not in (None, ""):
        sent: dict[str, list[str]] = {}
        declared = _parse_amount(payload.get("amount"), sent)
        if sent:
            details["amount"] = sent["amount"]
        elif declared != amount:
            details["mode_breakup"] = [f"Modes must add up to ₹{declared}."]

    note = _clean_text(payload.get("note") or "")
    if len(note) > NOTE_MAX_LENGTH:
        details["note"] = [f"Keep the note under {NOTE_MAX_LENGTH} characters."]
    reference = _clean_text(payload.get("reference") or "")
    if len(reference) > REFERENCE_MAX_LENGTH:
        details["reference"] = [f"Keep the reference under {REFERENCE_MAX_LENGTH} characters."]

    allocations = payload.get("allocations", "auto")
    if allocations in (None, ""):
        allocations = "auto"
    if allocations not in ("auto", "none") and not isinstance(allocations, list):
        details["allocations"] = ['Send "auto" or a list of allocations.']

    earmark = None
    try:
        earmark = clean_earmark((payload.get("meta") or {}).get("earmark"))
    except ValidationFailed as exc:
        details.update(exc.details or {})

    if details:
        raise ValidationFailed(details)

    if not reference:
        reference = next((line["reference"] for line in lines if line.get("reference")), "")
    return {
        "direction": direction,
        "payment_date": payment_date,
        "lines": lines,
        "amount": amount,
        "note": note,
        "reference": reference,
        "allocations": allocations,
        "earmark": earmark,
    }


# ── Earmarks (R61) ──────────────────────────────────────────────────────────

EARMARK_KEYS: tuple[str, ...] = ("module", "subject_type", "subject_id")


def clean_earmark(raw: Any) -> dict | None:
    """`{module, subject_type, subject_id}` or None; half an earmark is refused.

    Half of one would hide a payment from every automatic use while naming nothing it is
    reserved for. `subject_id` is a UUID, `module` ≤ 32 and `subject_type` ≤ 48 characters —
    the widths every engine row uses for the same pair (10-architecture §5 rule 3).
    """
    if raw in (None, {}):
        return None
    if not isinstance(raw, dict) or set(raw) != set(EARMARK_KEYS):
        raise ValidationFailed({"meta.earmark": ["Name the module, subject type and subject."]})
    module, subject_type = str(raw["module"] or ""), str(raw["subject_type"] or "")
    try:
        subject_id = str(uuid.UUID(str(raw["subject_id"])))
    except (TypeError, ValueError):
        raise ValidationFailed({"meta.earmark": ["The subject id is not valid."]}) from None
    if not module or len(module) > 32 or not subject_type or len(subject_type) > 48:
        raise ValidationFailed({"meta.earmark": ["Name the module, subject type and subject."]})
    return {"module": module, "subject_type": subject_type, "subject_id": subject_id}


def earmark_of(payment: Any) -> dict | None:
    """The payment's earmark, or None — what every automatic allocation checks first."""
    earmark = (getattr(payment, "meta", None) or {}).get("earmark")
    return earmark if isinstance(earmark, dict) and earmark else None


# ── Allocation ──────────────────────────────────────────────────────────────


class _Chosen:
    """One allocation decided under the lock."""

    __slots__ = ("amount", "document", "target")

    def __init__(self, target: AllocationTarget, document: Any, amount: Decimal) -> None:
        self.target = target
        self.document = document
        self.amount = amount


def _lock_party_for(ctx: Ctx, party_id: Any) -> Any:
    try:
        party = lock_party(tenant=ctx.tenant, party_id=party_id)
    except (ValueError, TypeError):
        party = None
    if party is None:
        # Canon §0.11 rule 2 — another tenant's party is NOT FOUND.
        raise NotFound("No such party.")
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them to record a payment.",
            details={"party_id": str(party.id), "name": party.name},
        )
    return party


def _oldest_first_key(pair: tuple[Any, Any]) -> tuple:
    target, document = pair
    return (document.document_date, document.number or "", str(document.id), target.document_type)


def merge_oldest_first(
    per_target: Iterable[list[tuple[Any, Any]]],
) -> list[tuple[Any, Any]]:
    """R6 — the candidates of several targets, globally oldest first, each target's order kept.

    Each list is one target's open documents in ITS canonical order; the lists are merged by
    `(document_date, number, id, document_type)`. One list comes back exactly as given.
    """
    return list(heapq.merge(*per_target, key=_oldest_first_key))


def auto_candidates(
    ctx: Ctx, *, direction: str, party_id: Any, bucket: str = LedgerBucket.MAIN
) -> list[tuple[Any, Any]]:
    """Every open document FIFO may settle for this party, LOCKED, globally oldest first.

    Locked target by target in registration order, each in its canonical order (the lock order
    record and void share), and only then merged — so two payments take the same locks in the
    same order whatever they end up choosing.
    """
    per_target = [
        [
            (target, document)
            for document in target.lock_open_for_party(tenant=ctx.tenant, party_id=party_id)
        ]
        for target in targets_for_direction(direction, auto_only=True, bucket=bucket)
    ]
    return merge_oldest_first(per_target)


def choose_oldest_first(candidates: list[tuple[Any, Any]], amount: Decimal) -> list[_Chosen]:
    """Take from each candidate in turn until `amount` is used up; the remainder is advance."""
    remaining = amount
    chosen: list[_Chosen] = []
    for target, document in candidates:
        if remaining <= ZERO:
            break
        due = target.outstanding(document)
        if due <= ZERO:
            continue
        take = min(remaining, due)
        chosen.append(_Chosen(target, document, take))
        remaining -= take
    return chosen


def _auto(ctx: Ctx, *, direction: str, party_id: Any, amount: Decimal) -> list[_Chosen]:
    """FR-5, R6 — globally oldest first across the auto targets; the remainder is the advance.

    `main` only: an unallocated payment is a shop advance (R5), and every `auto=True` target the
    contracts register is in the `main` bucket.
    """
    candidates = auto_candidates(ctx, direction=direction, party_id=party_id)
    return choose_oldest_first(candidates, amount)


ONE_BUCKET_MESSAGE = "One payment settles one kind of balance."


def single_bucket(targets: Iterable[Any]) -> str:
    """The one bucket these targets share (`main` for none), or 400 (R5)."""
    buckets = {target.bucket for target in targets}
    if len(buckets) > 1:
        raise ValidationFailed({"allocations": [ONE_BUCKET_MESSAGE]})
    return next(iter(buckets), LedgerBucket.MAIN.value)


def _manual(
    ctx: Ctx, *, direction: str, party_id: Any, amount: Decimal, rows: list
) -> list[_Chosen]:
    """FR-6 — each row ≤ what its document can still take, Σ ≤ the payment."""
    details: dict[str, list[str]] = {}
    wanted: OrderedDict[tuple[str, str], tuple[int, Decimal]] = OrderedDict()
    for index, row in enumerate(rows):
        row = row if isinstance(row, dict) else {}
        key = f"allocations.{index}"
        document_type = row.get("document_type") or "sales_document"
        target = target_for(document_type)
        if target is None or target.direction != direction:
            details[f"{key}.document_type"] = ["This document cannot take this payment."]
            continue
        errors: dict[str, list[str]] = {}
        value = _parse_amount(row.get("amount"), errors)
        if errors:
            # FR-6 — a row of 0 is omitted rather than refused.
            if row.get("amount") in (0, "0", "0.00", "0.0"):
                continue
            details[f"{key}.amount"] = errors["amount"]
            continue
        pair = (document_type, str(row.get("document_id") or ""))
        if pair in wanted:
            details[f"{key}.document_id"] = ["This bill is listed twice."]
            continue
        wanted[pair] = (index, value)
    if details:
        raise ValidationFailed(details)
    # R5 — before any lock: a request naming two buckets is refused on its face.
    single_bucket(target_for(document_type) for document_type, _ in wanted)
    if sum((value for _, value in wanted.values()), ZERO) > amount:
        raise ValidationFailed({"allocations": ["Allocations exceed the payment."]})

    chosen: list[_Chosen] = []
    by_type: OrderedDict[str, list[str]] = OrderedDict()
    for document_type, document_id in wanted:
        by_type.setdefault(document_type, []).append(document_id)
    for document_type, ids in by_type.items():
        target = target_for(document_type)
        assert target is not None  # checked above
        try:
            locked = {str(d.id): d for d in target.lock(tenant=ctx.tenant, ids=ids)}
        except (ValueError, TypeError):
            locked = {}
        for document_id in ids:
            index, value = wanted[(document_type, document_id)]
            document = locked.get(document_id)
            if document is None or str(target.party_id(document) or "") != str(party_id or ""):
                # Another tenant's bill, or another party's: not found, never forbidden.
                raise NotFound("No such bill.")
            if not target.is_open(document):
                raise BusinessRuleViolation(
                    "document_not_open",
                    f"{document.number} is no longer open.",
                    details={"document": target.summary(document)},
                )
            due = target.outstanding(document)
            if value > due:
                details[f"allocations.{index}.amount"] = [f"Max ₹{due}"]
                continue
            chosen.append(_Chosen(target, document, value))
    if details:
        raise ValidationFailed(details, message="An allocation is more than the bill's due.")
    return chosen


def _walk_in(ctx: Ctx, *, document_id: Any, amount: Decimal) -> list[_Chosen]:
    """FR-9 / BR-8 — the walk-in bill's own payment settles it exactly, and only it."""
    target = target_for("sales_document")
    assert target is not None
    documents = target.lock(tenant=ctx.tenant, ids=[document_id])
    if not documents or target.party_id(documents[0]) is not None:
        raise NotFound("No such bill.")
    document = documents[0]
    if target.outstanding(document) != amount:
        raise ValidationFailed({"payment": ["Walk-in sale must be paid in full"]})
    return [_Chosen(target, document, amount)]


# ── Snapshots ───────────────────────────────────────────────────────────────


def payment_snapshot(payment: Payment, allocations: list[dict] | None = None) -> dict:
    """§16 — the full row plus its allocations, money as strings."""
    return {
        "id": str(payment.id),
        "number": payment.number,
        "direction": payment.direction,
        "party_id": str(payment.party_id) if payment.party_id else None,
        "payment_date": payment.payment_date.isoformat(),
        "amount": str(payment.amount),
        "mode_breakup": payment.mode_breakup,
        "primary_mode": payment.primary_mode,
        "reference": payment.reference,
        "note": payment.note,
        "status": payment.status,
        "unallocated_amount": str(payment.unallocated_amount),
        "allocations": (
            allocations
            if allocations is not None
            else [
                {
                    "document_type": row.document_type,
                    "document_id": str(row.document_id),
                    "amount": str(row.amount),
                }
                for row in payment.allocations.all()
            ]
        ),
    }


def _ledger_note(payment: Payment) -> str:
    return (
        f"{'Receipt' if payment.direction == PaymentDirection.IN else 'Payment'} {payment.number}"
    )


# ── The service ─────────────────────────────────────────────────────────────


@transaction.atomic
def record_payment(*, ctx: Ctx, payload: dict, walk_in_document_id: Any = None) -> dict:
    """Record one payment. See the module docstring for the contract.

    Refuses `adjustment` in `mode_breakup` (A4b, R24): money that did not move is
    written only by `payments.services.deposits`, through `record_adjustment`.
    """
    return _record(ctx=ctx, payload=payload, walk_in_document_id=walk_in_document_id)


def record_adjustment(*, ctx: Ctx, payload: dict) -> dict:
    """A4b (ADR-044, contracts §1.4) — `record_payment` for an `adjustment` payment.

    The same validation, locks, allocation, numbering, ledger posting and audit as
    any payment; the one difference is that `mode_breakup` may be one
    `adjustment` line. Called ONLY by `payments.services.deposits` — the two halves
    of applying a held deposit and an opening deposit (R37). Runs inside the
    caller's transaction.
    """
    lines = payload.get("mode_breakup") or []
    if len(lines) != 1 or (lines[0] or {}).get("mode") != PaymentMode.ADJUSTMENT:
        raise ValueError("record_adjustment writes exactly one adjustment line")
    return _record(ctx=ctx, payload=payload, allow_adjustment=True)


def _record(
    *, ctx: Ctx, payload: dict, walk_in_document_id: Any = None, allow_adjustment: bool = False
) -> dict:
    cleaned = _validate(payload, tenant=ctx.tenant, allow_adjustment=allow_adjustment)
    direction = cleaned["direction"]
    amount: Decimal = cleaned["amount"]
    today = tenant_today(ctx.tenant)

    party = None
    if walk_in_document_id is not None:
        if direction != PaymentDirection.IN:
            raise ValidationFailed({"direction": ["A walk-in sale is money received."]})
        chosen = _walk_in(ctx, document_id=walk_in_document_id, amount=amount)
        mode = AllocationMode.MANUAL
    else:
        if not payload.get("party_id"):
            raise ValidationFailed({"party_id": ["Choose who paid."]})
        party = _lock_party_for(ctx, payload.get("party_id"))
        allocations = cleaned["allocations"]
        if allocations == "auto" and cleaned["earmark"] is not None:
            # R61 — reserved money is never applied by FIFO; it waits for its subject.
            chosen, mode = [], AllocationMode.NONE
        elif allocations == "auto":
            chosen = _auto(ctx, direction=direction, party_id=party.id, amount=amount)
            mode = AllocationMode.AUTO
        elif allocations == "none" or allocations == []:
            chosen, mode = [], AllocationMode.NONE
        else:
            chosen = _manual(
                ctx, direction=direction, party_id=party.id, amount=amount, rows=allocations
            )
            mode = AllocationMode.MANUAL

    allocated = sum((c.amount for c in chosen), ZERO)
    bucket = single_bucket(c.target for c in chosen)
    number = allocate_number(
        tenant=ctx.tenant,
        kind=SEQUENCE_KIND_FOR_DIRECTION[direction],
        on_date=cleaned["payment_date"],
    )
    primary = primary_line(cleaned["lines"])
    meta = dict(payload.get("meta") or {})
    if cleaned["earmark"] is not None:
        meta["earmark"] = cleaned["earmark"]
    else:
        meta.pop("earmark", None)
    if payload.get("context"):
        meta["context"] = str(payload["context"])[:24]
    payment = Payment.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        number=number,
        direction=direction,
        party=party,
        payment_date=cleaned["payment_date"],
        amount=amount,
        mode_breakup=cleaned["lines"],
        primary_mode=primary["mode"],
        reference=cleaned["reference"],
        note=cleaned["note"],
        status=PaymentStatus.RECORDED,
        unallocated_amount=amount - allocated,
        meta=meta,
        bucket=bucket,
    )

    documents: list[dict] = []
    allocation_rows: list[dict] = []
    for pick in chosen:
        Allocation.objects.create(
            tenant=ctx.tenant,
            created_by=payment.created_by,
            payment=payment,
            document_type=pick.target.document_type,
            document_id=pick.document.id,
            amount=pick.amount,
        )
        before, after = pick.target.apply(
            document=pick.document,
            amount=pick.amount,
            today=today,
            payment_id=payment.id,
            ctx=ctx,
        )
        summary = pick.target.summary(pick.document)
        documents.append(summary)
        allocation_rows.append(
            {
                "document_type": pick.target.document_type,
                "document_id": str(pick.document.id),
                "number": pick.document.number,
                "amount": str(pick.amount),
            }
        )
        if before != after:
            write_audit(
                ctx=ctx,
                action=pick.target.audit_action(),
                entity_type=pick.target.document_type,
                entity_id=pick.document.id,
                before={"status": before},
                after={"status": after, "amount_due": summary["amount_due"]},
                metadata={"payment_id": str(payment.id), "number": payment.number},
            )

    balance = None
    entry_id = None
    if party is not None:
        entry, balance = post_source_entry(
            ctx=ctx,
            party=party,
            amount=amount,
            entry_date=payment.payment_date,
            entry_type=(
                EntryType.PAYMENT_IN if direction == PaymentDirection.IN else EntryType.PAYMENT_OUT
            ),
            source_type=SourceType.PAYMENT,
            source_id=payment.id,
            note=_ledger_note(payment),
            payment_mode=primary["mode"],
            upi_app=primary.get("upi_app"),
            reference=payment.reference,
            source_number=payment.number,
            bucket=bucket,
        )
        entry_id = str(entry.id)

    write_audit(
        ctx=ctx,
        action=AuditAction.PAYMENT_RECORDED,
        entity_type="payments_payment",
        entity_id=payment.id,
        after=payment_snapshot(payment, allocation_rows),
        metadata={
            "idempotency_key": ctx.idempotency_key,
            "allocation": mode,
            **({"ledger_entry_id": entry_id} if entry_id else {}),
            **({"walk_in": True} if walk_in_document_id is not None else {}),
        },
    )
    return {
        "payment": payment,
        "party_balance": balance,
        "documents": documents,
        "ledger_entry_id": entry_id,
        "allocation_mode": mode,
    }
