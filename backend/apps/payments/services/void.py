"""PAY-05 — `void_payment()`, and releasing a voided document's allocations.

── void_payment(*, ctx, payment_id, reason) -> dict ─────────────────────────
One transaction (FR-4): lock the payment; refuse a second void (409
`payment_already_void`); lock its party (L1) and its documents (L3, the same
`(document_date, number, id)` order `record_payment` uses, so a void and a new
payment on one bill serialise instead of deadlocking); un-apply each
allocation and DELETE it (BR-2 — the audit row keeps them); mark the payment
void with `unallocated_amount = 0`; reverse its ledger line through LED-10
(`reversal`, opposite direction, dated today, sourced to the payment — BR-3).
Returns `{payment, party_balance, documents: [summary…], reversal_entry_id}`.

An archived party does NOT block a void (EC-5): `party_archived` guards new
entries, and refusing to undo a wrong payment because the khata was filed away
would leave the wrong balance standing.

── release_document_allocations(*, ctx, document_type, document_id) ─────────
For SAL-05 / PUR-04 (a DOCUMENT void, LED-10 BR-7): the payments stay, their
allocations to that document are deleted, and each payment's
`unallocated_amount` grows by what it had put there — the money is now an
advance on the khata, which the ledger already shows. The document's own paid
caches are the voiding feature's business (the document is void). Returns
`[{payment_id, number, amount}]` for the "₹500 payment stays as advance"
snackbar. Call it inside the document void's transaction, AFTER locking the
document.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound
from apps.ledger.constants import SourceType
from apps.ledger.services.corrections import _validate_reason
from apps.ledger.services.postings import reverse_source_entries
from apps.parties.services.balance import lock_party_of
from apps.payments.constants import PaymentStatus
from apps.payments.models import Allocation, Payment
from apps.payments.services.record import payment_snapshot
from apps.payments.services.targets import target_for
from apps.sales.services.refund_seam import release_refund


def _lock_payment(ctx: Ctx, payment_id: Any) -> Payment:
    try:
        payment = (
            Payment.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=payment_id).first()
        )
    except (ValueError, TypeError):
        payment = None
    if payment is None:
        raise NotFound("No such payment.")
    return payment


def _lock_allocated_documents(ctx: Ctx, payment_id: Any) -> dict[str, dict[str, Any]]:
    """L2 — the documents this payment settles, locked BEFORE the payment row (L3).

    Read from the allocations without a lock: under the party lock they cannot
    change, and for a walk-in payment (no party) the one thing that can move
    them — voiding that walk-in bill — takes the bill's lock first too, so this
    waits for it rather than crossing it.
    """
    wanted: dict[str, set[Any]] = {}
    for document_type, document_id in Allocation.objects.filter(
        tenant=ctx.tenant, payment_id=payment_id
    ).values_list("document_type", "document_id"):
        wanted.setdefault(document_type, set()).add(document_id)
    locked: dict[str, dict[str, Any]] = {}
    for document_type in sorted(wanted):
        target = target_for(document_type)
        if target is None:  # pragma: no cover - a target unregistered after use
            continue
        locked[document_type] = {
            str(document.id): document
            for document in target.lock(tenant=ctx.tenant, ids=list(wanted[document_type]))
        }
    return locked


@transaction.atomic
def void_payment(*, ctx: Ctx, payment_id: Any, reason: Any) -> dict:
    """Void one payment.

    ── Lock order (`parties.services.balance.lock_party_of`) ──────────────────
    party → the documents it settles → the payment → its allocations. This took
    the PAYMENT first and the invoice last, while `void_invoice` took the
    invoice first and the payment last (releasing its allocation): voiding an
    invoice and its own payment at the same moment was a deadlock.
    """
    clean_reason = _validate_reason(reason)
    lock_party_of(tenant=ctx.tenant, rows=Payment.objects.for_tenant(ctx.tenant), pk=payment_id)
    locked = _lock_allocated_documents(ctx, payment_id)
    payment = _lock_payment(ctx, payment_id)
    if payment.status == PaymentStatus.VOID:
        raise BusinessRuleViolation(
            "payment_already_void",
            "This payment has already been voided.",
            details={"payment_id": str(payment.id), "number": payment.number},
        )

    rows = list(payment.allocations.all())
    before = payment_snapshot(payment)
    today = tenant_today(ctx.tenant)
    documents: list[dict] = []
    by_type: dict[str, dict[str, Allocation]] = {}
    for row in rows:
        by_type.setdefault(row.document_type, {})[str(row.document_id)] = row
    for document_type, allocations in by_type.items():
        target = target_for(document_type)
        if target is None:  # pragma: no cover - a target unregistered after use
            continue
        held = locked.get(document_type, {})
        missing = [pk for pk in allocations if pk not in held]
        if missing:  # pragma: no cover - only a walk-in race can add one
            held.update({str(d.id): d for d in target.lock(tenant=ctx.tenant, ids=missing)})
        # `held` is in the target's lock order, `(document_date, number, id)`.
        for document in [d for pk, d in held.items() if pk in allocations]:
            row = allocations[str(document.id)]
            was, now = target.unapply(document=document, amount=row.amount, today=today)
            summary = target.summary(document)
            documents.append(summary)
            if was != now:
                write_audit(
                    ctx=ctx,
                    action=target.audit_action(),
                    entity_type=document_type,
                    entity_id=document.id,
                    before={"status": was},
                    after={"status": now, "amount_due": summary["amount_due"]},
                    metadata={"payment_id": str(payment.id), "number": payment.number},
                )
    Allocation.objects.filter(payment=payment).delete()

    # SAL-04 FR-10 — a credit note's refund voucher: voiding it gives the
    # amount back to the note as open credit, which is what lets the note
    # itself be voided afterwards ("Void the refund payment first").
    credit_note_id = (payment.meta or {}).get("credit_note_id")
    if credit_note_id:
        note = release_refund(
            ctx=ctx, credit_note_id=credit_note_id, payment_id=payment.id, amount=payment.amount
        )
        if note is not None:
            documents.append(
                {
                    "document_type": "sales_document",
                    "document_id": str(note.id),
                    "kind": note.kind,
                    "number": note.number,
                    "document_date": note.document_date.isoformat(),
                    "due_on": None,
                    "grand_total": str(note.grand_total),
                    "amount_due": str(note.amount_due),
                    "status": note.status,
                }
            )

    payment.status = PaymentStatus.VOID
    payment.voided_at = timezone.now()
    payment.voided_by = ctx.actor if ctx.actor_type == "user" else None
    payment.void_reason = clean_reason
    payment.unallocated_amount = Decimal("0.00")
    payment.save(
        update_fields=[
            "status",
            "voided_at",
            "voided_by",
            "void_reason",
            "unallocated_amount",
            "updated_at",
        ]
    )

    reversals, balance = reverse_source_entries(
        ctx=ctx, source_type=SourceType.PAYMENT, source_id=payment.id, reason=clean_reason
    )
    reversal_id = str(reversals[0].id) if reversals else None
    write_audit(
        ctx=ctx,
        action=AuditAction.PAYMENT_VOIDED,
        entity_type="payments_payment",
        entity_id=payment.id,
        before=before,
        after={"status": payment.status, "void_reason": clean_reason, "unallocated_amount": "0.00"},
        metadata={
            "reason": clean_reason,
            **({"reversal_entry_id": reversal_id} if reversal_id else {}),
        },
    )
    return {
        "payment": payment,
        "party_balance": balance,
        "documents": documents,
        "reversal_entry_id": reversal_id,
    }


def release_document_allocations(*, ctx: Ctx, document_type: str, document_id: Any) -> list[dict]:
    """See the module docstring. Must run inside the caller's transaction."""
    rows = list(
        Allocation.objects.select_for_update()
        .filter(tenant=ctx.tenant, document_type=document_type, document_id=document_id)
        .select_related("payment")
        .order_by("payment_id")
    )
    released: list[dict] = []
    for row in rows:
        Payment.objects.filter(pk=row.payment_id).update(
            unallocated_amount=F("unallocated_amount") + row.amount
        )
        released.append(
            {
                "payment_id": str(row.payment_id),
                "number": row.payment.number,
                "amount": str(row.amount),
            }
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.PAYMENT_ALLOCATION_RELEASED,
            entity_type="payments_payment",
            entity_id=row.payment_id,
            before={
                "document_type": document_type,
                "document_id": str(document_id),
                "amount": str(row.amount),
            },
            after=None,
            metadata={"reason": "document_void"},
        )
    Allocation.objects.filter(pk__in=[row.pk for row in rows]).delete()
    return released


def release_purchase_bill(ctx: Ctx, document: Any) -> list[dict]:
    """PUR-02 BR-4 / PUR-04 FR-2d — the void listener `PaymentsConfig.ready()` registers.

    `void_bill` calls it inside its transaction after locking the bill; the
    supplier payments stay `recorded` and what they had put on this bill
    becomes advance on the supplier's khata, which the ledger already shows
    (the payment's debit stands; only the bill's credit is reversed). Returns
    `[{payment_id, number, amount}]` for the void's follow-up.
    """
    return release_document_allocations(
        ctx=ctx, document_type="purchase_document", document_id=document.id
    )
