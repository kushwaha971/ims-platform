"""A4a / PLT-X03 — `allocate_existing()`: apply money already received to later documents.

`record_payment` takes allocations once (`record.py`), so an advance received on 3 Sep could never
settle the invoice raised on 12 Oct (hospitality §6.7). ADR-047 adds this service; its callers are
`POST /payments/{id}/allocations` (Apply to bills), the document port's `apply_payment_ids` /
`apply_open_advances` (A5), hospitality check-out and the dues run's advance auto-apply.

── allocate_existing(*, ctx, payment_id, allocations, reason="") -> dict ─────
`allocations` is `[{document_type, document_id, amount}]` or `"auto"` (oldest first across the
payment's direction's and bucket's `auto` targets, up to what is unallocated).

Rules (FRD 00 PLT-X03 §9):
* BR-1 a target must match the payment's direction AND `payments_payment.bucket` (R5);
* BR-2 at most `unallocated_amount` (409 `over_allocated`, D `unallocated_amount`); each row ≤
  the document's outstanding (400, "Max ₹…"); a row of 0 is dropped;
* BR-3 NO ledger line and NO party balance move: the money was on the khata as an advance
  already, so only the document side moves and `unallocated_amount` drops;
* BR-4 the rows are ordinary allocations, which a payment void releases like any other;
* BR-6 an existing `(payment, document)` row is INCREASED (`uq_allocation_target`);
* EC-1 a walk-in receipt cannot be applied later (it has no khata); EC-5 a credit note's refund
  voucher cannot either (its money went back). A voided payment is 409 `payment_already_void`.
An earmarked payment (R61) may be applied here: this IS the explicit allocation it waits for.

── Locks (the global order, `parties.services.balance.lock_party_of`) ────────
party → the target documents (each target's `lock`, targets in `document_type` order) → the
payment row. A racing `void_payment` takes the party first too, so the two serialise; two
applications of one advance serialise the same way, and the deferred Σ-allocations trigger
(`payments/0002`) is the database's own refusal if anything slipped through.

The application is remembered in `payment.meta.applied_later` — which document, and the tenant's
date — so the receipt can say "Applied later: INV/26-27/0311 on 12 Oct". The ALLOCATION row stays
the only record of the money.
"""

from __future__ import annotations

from collections import OrderedDict
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import F

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO
from apps.ledger.services.entries import _parse_amount
from apps.parties.services.balance import lock_party_of
from apps.payments.constants import PaymentStatus
from apps.payments.models import Allocation, Payment
from apps.payments.services.record import (
    _Chosen,
    auto_candidates,
    choose_oldest_first,
    payment_snapshot,
)
from apps.payments.services.targets import target_for

REASON_MAX_LENGTH = 160


def _load_payment(ctx: Ctx, payment_id: Any, *, lock: bool) -> Payment:
    queryset = Payment.objects.for_tenant(ctx.tenant)
    if lock:
        queryset = queryset.select_for_update()
    try:
        payment = queryset.filter(pk=payment_id).first()
    except (ValueError, TypeError):
        payment = None
    if payment is None:
        raise NotFound("No such payment.")
    return payment


def _refuse_unusable(payment: Payment) -> None:
    """The payment states that can never take a later allocation, whatever is asked."""
    if payment.status == PaymentStatus.VOID:
        raise BusinessRuleViolation(
            "payment_already_void",
            "This payment has been voided.",
            details={"payment_id": str(payment.id), "number": payment.number},
        )
    if payment.party_id is None:
        raise ValidationFailed({"payment": ["A walk-in receipt cannot be applied later."]})
    if (payment.meta or {}).get("credit_note_id"):
        raise ValidationFailed(
            {"payment": ["A credit note's refund went back to the customer; it cannot be applied."]}
        )


def _wanted_rows(payment: Payment, rows: Any) -> OrderedDict[tuple[str, str], tuple[int, Decimal]]:
    """Every row's shape (BR-1, BR-2), refused all at once — before any document is locked."""
    if not isinstance(rows, list) or not rows:
        raise ValidationFailed(
            {"allocations": ['Choose the bills to apply it to, or send "auto".']}
        )
    details: dict[str, list[str]] = {}
    wanted: OrderedDict[tuple[str, str], tuple[int, Decimal]] = OrderedDict()
    for index, row in enumerate(rows):
        row = row if isinstance(row, dict) else {}
        key = f"allocations.{index}"
        document_type = row.get("document_type") or "sales_document"
        target = target_for(document_type)
        if target is None or target.direction != payment.direction:
            details[f"{key}.document_type"] = ["This document cannot take this payment."]
            continue
        if target.bucket != payment.bucket:
            details[f"{key}.document_type"] = ["One payment settles one kind of balance."]
            continue
        if row.get("amount") in (0, "0", "0.0", "0.00"):
            continue  # BR-2 — a row of 0 is dropped
        errors: dict[str, list[str]] = {}
        value = _parse_amount(row.get("amount"), errors)
        if errors:
            details[f"{key}.amount"] = errors["amount"]
            continue
        pair = (document_type, str(row.get("document_id") or ""))
        if pair in wanted:
            details[f"{key}.document_id"] = ["This bill is listed twice."]
            continue
        wanted[pair] = (index, value)
    if details:
        raise ValidationFailed(details)
    if not wanted:
        raise ValidationFailed({"allocations": ["Enter an amount for at least one bill."]})
    return wanted


def _lock_chosen(
    ctx: Ctx, payment: Payment, wanted: OrderedDict[tuple[str, str], tuple[int, Decimal]]
) -> list[_Chosen]:
    """Lock the named documents, targets in `document_type` order, and check each row."""
    by_type: dict[str, list[str]] = {}
    for document_type, document_id in wanted:
        by_type.setdefault(document_type, []).append(document_id)
    chosen: list[_Chosen] = []
    details: dict[str, list[str]] = {}
    for document_type in sorted(by_type):
        target = target_for(document_type)
        assert target is not None  # checked by `_wanted_rows`
        try:
            locked = {
                str(d.id): d for d in target.lock(tenant=ctx.tenant, ids=by_type[document_type])
            }
        except (ValueError, TypeError):
            locked = {}
        for document_id in by_type[document_type]:
            index, value = wanted[(document_type, document_id)]
            document = locked.get(document_id)
            if document is None or str(target.party_id(document) or "") != str(payment.party_id):
                # Another tenant's document, or another party's: not found, never forbidden.
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


def _clean_reason(reason: Any) -> str:
    text = " ".join(str(reason or "").split())
    if len(text) > REASON_MAX_LENGTH:
        raise ValidationFailed(
            {"reason": [f"Keep the reason under {REASON_MAX_LENGTH} characters."]}
        )
    return text


@transaction.atomic
def allocate_existing(*, ctx: Ctx, payment_id: Any, allocations: Any, reason: str = "") -> dict:
    """Apply part or all of a payment's unallocated amount to open documents (module docstring).

    Returns `{payment, allocations: [{document_type, document_id, number, amount}], documents:
    [summary…], party_balance, unallocated_amount}`.
    """
    clean_reason = _clean_reason(reason)
    # Shape first, from an unlocked read: a request that can never succeed takes no lock.
    peek = _load_payment(ctx, payment_id, lock=False)
    _refuse_unusable(peek)
    wanted = None if allocations == "auto" else _wanted_rows(peek, allocations)

    party = lock_party_of(
        tenant=ctx.tenant, rows=Payment.objects.for_tenant(ctx.tenant), pk=peek.pk
    )
    if wanted is None:
        candidates = auto_candidates(
            ctx, direction=peek.direction, party_id=peek.party_id, bucket=peek.bucket
        )
        chosen = None
    else:
        candidates = None
        chosen = _lock_chosen(ctx, peek, wanted)

    payment = _load_payment(ctx, payment_id, lock=True)
    _refuse_unusable(payment)  # re-read under the lock: a racing void wins cleanly here
    if chosen is None:
        chosen = choose_oldest_first(candidates or [], payment.unallocated_amount)
        if not chosen:
            raise ValidationFailed({"allocations": ["There is no open bill to apply it to."]})
    total = sum((pick.amount for pick in chosen), ZERO)
    if total > payment.unallocated_amount:
        raise BusinessRuleViolation(
            "over_allocated",
            f"Only ₹{payment.unallocated_amount} of this payment is not yet applied.",
            details={"unallocated_amount": str(payment.unallocated_amount)},
        )

    before = payment_snapshot(payment)
    today = tenant_today(ctx.tenant)
    existing = {
        (row.document_type, str(row.document_id)): row
        for row in Allocation.objects.select_for_update().filter(
            payment=payment, document_id__in=[pick.document.id for pick in chosen]
        )
    }
    documents: list[dict] = []
    applied: list[dict] = []
    later = list((payment.meta or {}).get("applied_later") or [])
    for pick in chosen:
        key = (pick.target.document_type, str(pick.document.id))
        row = existing.get(key)
        if row is None:
            Allocation.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if ctx.actor_type == "user" else None,
                payment=payment,
                document_type=pick.target.document_type,
                document_id=pick.document.id,
                amount=pick.amount,
            )
        else:
            # BR-6 — one row per (payment, document): grow it, and the audit says so.
            Allocation.objects.filter(pk=row.pk).update(amount=F("amount") + pick.amount)
        was, now = pick.target.apply(
            document=pick.document,
            amount=pick.amount,
            today=today,
            payment_id=payment.id,
            ctx=ctx,
        )
        summary = pick.target.summary(pick.document)
        documents.append(summary)
        applied.append(
            {
                "document_type": pick.target.document_type,
                "document_id": str(pick.document.id),
                "number": pick.document.number,
                "amount": str(pick.amount),
            }
        )
        later = [
            entry
            for entry in later
            if (entry.get("document_type"), entry.get("document_id")) != key
        ]
        later.append({"document_type": key[0], "document_id": key[1], "on": today.isoformat()})
        if was != now:
            write_audit(
                ctx=ctx,
                action=pick.target.audit_action(),
                entity_type=pick.target.document_type,
                entity_id=pick.document.id,
                before={"status": was},
                after={"status": now, "amount_due": summary["amount_due"]},
                metadata={"payment_id": str(payment.id), "number": payment.number},
            )

    payment.unallocated_amount = payment.unallocated_amount - total
    payment.meta = {**(payment.meta or {}), "applied_later": later}
    payment.save(update_fields=["unallocated_amount", "meta", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PAYMENT_ALLOCATED,
        entity_type="payments_payment",
        entity_id=payment.id,
        before={
            "allocations": before["allocations"],
            "unallocated_amount": before["unallocated_amount"],
        },
        after={
            "allocations": payment_snapshot(payment)["allocations"],
            "unallocated_amount": str(payment.unallocated_amount),
        },
        metadata={
            "reason": clean_reason,
            "applied": applied,
            "increased": [a for a in applied if (a["document_type"], a["document_id"]) in existing],
            "idempotency_key": ctx.idempotency_key,
        },
    )
    return {
        "payment": payment,
        "allocations": applied,
        "documents": documents,
        "party_balance": party.balance if party is not None else None,
        "unallocated_amount": payment.unallocated_amount,
    }
