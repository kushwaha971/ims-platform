"""Money already held, applied to an invoice as it is issued (A5; R50, R61; FRD 00 PLT-X05 §6).

The document port's `IssueRequest` may name open credit notes (`apply_credit_note_ids`, R50),
payments (`apply_payment_ids`, R61 — a booking's earmarked advances) and ask for the party's
open advances (`apply_open_advances`, PLT-X03). `issue_invoice` uses this module in two halves:

1. `lock_held_money` — BEFORE the number is allocated. Every credit note and payment that will
   be applied is locked and checked here, so the lock order stays party → documents → payments
   → sequence (R61), and a request that cannot be honoured is refused before a number is used.
2. `apply_held_money` — after the invoice is saved as issued. The applications are ordinary
   ones — `apply_credit_note` and `allocate_existing` — because a draft cannot take either (both
   want an open, numbered document). Credit notes first, then the named payments in the order
   given, then open advances oldest first; each capped at what is still due, and a payment or
   note left over stays open.

No ledger line moves here: a credit note's credit and an advance were on the khata already.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.sales.constants import DocumentKind, DocumentStatus

ZERO = Decimal("0.00")


@dataclass
class HeldMoney:
    credit_notes: list[Any] = field(default_factory=list)
    payments: list[Any] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.credit_notes or self.payments)


def _ordered_unique(ids: Any) -> list[str]:
    seen: list[str] = []
    for raw in ids or ():
        text = str(raw)
        if text not in seen:
            seen.append(text)
    return seen


def _lock_credit_notes(ctx: Ctx, document: Any, ids: list[str]) -> list[Any]:
    from apps.sales.models import SalesDocument

    if not ids:
        return []
    try:
        locked = {
            str(n.id): n
            for n in SalesDocument.objects.select_for_update()
            .filter(tenant=ctx.tenant, pk__in=ids, kind=DocumentKind.CREDIT_NOTE)
            .order_by("id")
        }
    except (ValueError, TypeError):
        locked = {}
    errors: dict[str, list[str]] = {}
    notes = []
    for index, note_id in enumerate(ids):
        note = locked.get(note_id)
        if (
            note is None
            or note.party_id != document.party_id
            or note.status != DocumentStatus.ISSUED
            or note.amount_due <= ZERO
        ):
            errors[f"apply_credit_note_ids.{index}"] = ["Choose an open credit note of this party."]
            continue
        notes.append(note)
    if errors:
        raise ValidationFailed(errors)
    return notes


def _usable(payment: Any, party_id: Any) -> bool:
    return (
        payment.party_id == party_id
        and payment.direction == "in"
        and payment.bucket == "main"
        and payment.status == "recorded"
        and payment.unallocated_amount > ZERO
        and not (payment.meta or {}).get("credit_note_id")
    )


def _lock_payments(ctx: Ctx, document: Any, ids: list[str], open_advances: bool) -> list[Any]:
    from apps.payments.models import Payment
    from apps.payments.selectors.payments import open_advances as advances_of

    named: list[Any] = []
    if ids:
        try:
            locked = {
                str(p.id): p
                for p in Payment.objects.select_for_update()
                .filter(tenant=ctx.tenant, pk__in=ids)
                .order_by("id")
            }
        except (ValueError, TypeError):
            locked = {}
        errors: dict[str, list[str]] = {}
        for index, payment_id in enumerate(ids):
            payment = locked.get(payment_id)
            if payment is None or not _usable(payment, document.party_id):
                errors[f"apply_payment_ids.{index}"] = [
                    "Choose a payment of this party with money left to apply."
                ]
                continue
            named.append(payment)
        if errors:
            raise ValidationFailed(errors)
    oldest_first: list[Any] = []
    if open_advances:
        oldest_first = list(
            advances_of(tenant=ctx.tenant, party_id=document.party_id)
            .exclude(pk__in=[p.id for p in named])
            .select_for_update()
        )
    return named + oldest_first


def lock_held_money(
    ctx: Ctx,
    document: Any,
    *,
    credit_note_ids: Any = (),
    payment_ids: Any = (),
    open_advances: bool = False,
) -> HeldMoney:
    """Lock and check everything `apply_held_money` will use (step 1 of the module docstring)."""
    note_ids = _ordered_unique(credit_note_ids)
    pay_ids = _ordered_unique(payment_ids)
    if not (note_ids or pay_ids or open_advances):
        return HeldMoney()
    if document.party_id is None:
        raise ValidationFailed(
            {"party_id": ["Credit notes and advances apply to a party's invoice."]}
        )
    return HeldMoney(
        credit_notes=_lock_credit_notes(ctx, document, note_ids),
        payments=_lock_payments(ctx, document, pay_ids, open_advances),
    )


def apply_held_money(ctx: Ctx, document: Any, held: HeldMoney) -> list[dict]:
    """Apply what `lock_held_money` locked, each capped at what is still due (step 2)."""
    from apps.payments.services.allocate import allocate_existing
    from apps.sales.services.credit_note_apply import apply_credit_note

    applied: list[dict] = []
    if not held:
        return applied
    document.refresh_from_db()
    for note in held.credit_notes:
        amount = min(note.amount_due, document.amount_due)
        if amount <= ZERO:
            break
        apply_credit_note(ctx=ctx, document_id=note.id, invoice_id=document.id, amount=amount)
        applied.append({"credit_note_id": str(note.id), "amount": str(amount)})
        document.refresh_from_db()
    for payment in held.payments:
        amount = min(payment.unallocated_amount, document.amount_due)
        if amount <= ZERO:
            break
        allocate_existing(
            ctx=ctx,
            payment_id=payment.id,
            allocations=[
                {
                    "document_type": "sales_document",
                    "document_id": str(document.id),
                    "amount": str(amount),
                }
            ],
            reason=f"Applied when {document.number} was issued",
        )
        applied.append({"payment_id": str(payment.id), "amount": str(amount)})
        document.refresh_from_db()
    return applied
