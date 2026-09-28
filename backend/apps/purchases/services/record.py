"""`record_bill()` — PUR-01 FR-6, every side effect in one transaction.

── The order is the safety argument ─────────────────────────────────────────
It is `issue_invoice`'s order with the direction flipped (Part 32 §32.12.2),
and it takes the same locks in the same sequence, so a bill and an invoice
touching the same items and the same party serialise instead of deadlocking.

1. Lock the draft; it must still be a draft (409 `document_not_draft`) at the
   version the client read (409 `stale_version`).
2. Validate strictly and RECOMPUTE — a draft's stored totals are never trusted
   (§0.11 rule 3): supplier, lines, dates, rates by the bill's date.
3. Lock the supplier (L1). Archived → 409 `party_archived` (EC-7).
4. Duplicate supplier invoice → 409 `duplicate_supplier_invoice` naming the
   bill it duplicates (FR-7). This read is the friendly path; the partial
   unique index is the guarantee, and a concurrent record that slips past the
   read is turned into the same 409 at step 7.
5. Stock: `purchase_in` through `inventory.post_movements` (L2, item order)
   for every tracked goods line, each carrying its §17.7.0 inbound unit cost,
   which is what drives the weighted-average blend (BR-9: services, untracked
   goods and free-text lines move nothing). Then the item's last cost (BR-6).
6. Allocate the number LAST of the locks (L4), so a failure anywhere above
   rolls the number back with everything else and the series never gaps
   (T-PUR-01-14).
7. Snapshot the supplier, set amounts, due date and status, save.
8. Ledger credit for the grand total (BR-3) — none for a ₹0 bill.
9. Audit `purchase_bill.recorded` with the movement ids and the ledger id.

10. FR-6h "Paid now" (PUR-02): when the request carries `payment`, a real
    `PAYOUT` payment through PAY-01's `record_payment`, allocated to this bill
    up to its total (anything above is advance), in the SAME transaction —
    see `payment_seam.record_bill_payment`. Its mode lines are validated at
    step 2, before anything is written.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models.functions import Upper
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import fy_bounds, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.common.money import ZERO
from apps.purchases.constants import BACKDATE_YEARS, DocumentStatus
from apps.purchases.models import PurchaseDocument
from apps.purchases.services import settings as purchase_settings
from apps.purchases.services.costing import inbound_unit_cost
from apps.purchases.services.drafts import ENTITY, check_version, lock_document, replace_lines
from apps.purchases.services.ledger_link import post_bill_credit
from apps.purchases.services.payload import apply_payload
from apps.purchases.services.payment_seam import record_bill_payment, validate_payment

DUPLICATE_INDEX = "uq_purchases_supplier_invoice"


def _validate_recordable(ctx: Ctx, document: PurchaseDocument, rows: list[dict]) -> None:
    errors: dict[str, list[str]] = {}
    fy_start = fy_bounds(ctx.tenant, tenant_today(ctx.tenant))[0]
    floor = fy_start.replace(year=fy_start.year - BACKDATE_YEARS)
    if document.document_date < floor:
        errors["document_date"] = ["Date is too old for a new bill."]
    if not rows:
        errors["lines"] = ["Add at least one item"]
    if errors:
        raise ValidationFailed(errors)


def existing_duplicate(document: PurchaseDocument) -> PurchaseDocument | None:
    """A recorded, non-void bill of the same supplier with the same invoice number (FR-7)."""
    if not document.supplier_invoice_number or document.party_id is None:
        return None
    return (
        PurchaseDocument.objects.annotate(_inv=Upper("supplier_invoice_number"))
        .filter(
            tenant_id=document.tenant_id,
            party_id=document.party_id,
            _inv=document.supplier_invoice_number.upper(),
        )
        .exclude(status__in=[DocumentStatus.VOID, DocumentStatus.DRAFT])
        .exclude(pk=document.pk)
        .order_by("document_date")
        .first()
    )


def duplicate_error(existing: PurchaseDocument) -> BusinessRuleViolation:
    return BusinessRuleViolation(
        "duplicate_supplier_invoice",
        f"Already recorded as {existing.number} on {existing.document_date.strftime('%d/%m/%Y')}.",
        details={
            "existing": {
                "id": str(existing.id),
                "number": existing.number,
                "document_date": existing.document_date.isoformat(),
            }
        },
    )


def _post_stock(ctx: Ctx, document: PurchaseDocument, rows: list[dict]) -> list[Any]:
    """FR-6e — `purchase_in` for tracked goods at the inbound unit cost; returns PostedLines."""
    from apps.inventory.constants import ItemType, MovementSource, MovementType
    from apps.inventory.services.stock import MovementLine, post_movements

    movement_lines = []
    for row in rows:
        item = row.get("item")
        if item is None or item.item_type != ItemType.GOODS or not item.track_stock:
            continue
        movement_lines.append(
            MovementLine(
                item=item,
                qty=row["qty"],
                movement_type=MovementType.PURCHASE_IN,
                movement_date=document.document_date,
                source_type=MovementSource.PURCHASE_DOCUMENT,
                source_id=document.id,
                unit_cost=row["inbound_unit_cost"],
                index=row["line_no"] - 1,
            )
        )
    # Inbound only: the negative-stock policy cannot refuse it, so pass False
    # rather than read the setting.
    return post_movements(ctx=ctx, lines=movement_lines, allow_negative=False)


def _save_recorded(document: PurchaseDocument) -> None:
    """The status write, where the partial unique index bites a concurrent duplicate."""
    try:
        with transaction.atomic():
            document.save()
    except IntegrityError as error:
        if DUPLICATE_INDEX not in str(error):
            raise
        existing = existing_duplicate(document)
        if existing is None:  # pragma: no cover - the index fired, so a row exists
            raise
        raise duplicate_error(existing) from error


@transaction.atomic
def record_bill(
    *, ctx: Ctx, document_id: Any, version: Any = None, payment: dict | None = None
) -> dict:
    """Record a draft. Returns `{document, warnings, ledger_entry_id, party_balance, movement_ids,
    payment}` — `payment` is `{payment_id, number, amount}` when "Paid now" was sent."""
    from apps.inventory.services.last_cost import set_last_purchase_cost
    from apps.parties.constants import PartyStatus
    from apps.parties.services.balance import lock_party_of, relock_if_moved
    from apps.platform_app.services.sequences import allocate_number
    from apps.purchases.models import PurchaseDocument

    tenant = ctx.tenant
    # L1 before the draft (`parties.services.balance.lock_party_of`).
    early_party = lock_party_of(
        tenant=tenant, rows=PurchaseDocument.objects.filter(tenant=tenant), pk=document_id
    )
    document = lock_document(tenant, document_id)
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This bill has already been recorded.",
            details={"status": document.status, "number": document.number},
        )
    if version is not None:
        check_version(document, version)

    outcome = apply_payload(ctx, document, {}, strict=True)
    rows = outcome["rows"]
    _validate_recordable(ctx, document, rows)
    cleaned_payment = validate_payment(payment=payment)

    party = relock_if_moved(tenant=tenant, party=early_party, party_id=document.party_id)
    if party is None or party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This supplier is archived. Restore them or choose another supplier.",
            details={"party_id": str(document.party_id)},
        )
    existing = existing_duplicate(document)
    if existing is not None:
        raise duplicate_error(existing)

    claimable = purchase_settings.itc_claimable(tenant, document.itc_eligible)
    last_costs: dict[Any, Any] = {}
    for row in rows:
        row["inbound_unit_cost"] = inbound_unit_cost(
            taxable_value=row["taxable_value"],
            line_total=row["line_total"],
            qty=row["qty"],
            itc_claimable=claimable,
        )
        if row.get("item") is not None:
            last_costs[row["item"].id] = row["inbound_unit_cost"]
        else:
            row["inbound_unit_cost"] = None
    posted = _post_stock(ctx, document, rows)
    set_last_purchase_cost(tenant=tenant, costs=last_costs)

    document.number = allocate_number(
        tenant=tenant, kind=document.kind, on_date=document.document_date
    )
    document.party_snapshot = party_snapshot(party)
    document.supplier_gstin_snapshot = party.gstin or None
    document.amount_paid = ZERO
    document.amount_due = document.grand_total
    if document.due_on is None:
        # FR-2 / BR-10 — the supplier's credit days, else the bill date itself.
        days = party.credit_days if party.credit_days is not None else 0
        document.due_on = document.document_date + dt.timedelta(days=days)
    document.status = DocumentStatus.PAID if document.grand_total == 0 else DocumentStatus.RECORDED
    document.recorded_at = timezone.now()
    document.version += 1
    _save_recorded(document)
    replace_lines(document, rows)

    ledger_entry_id = None
    balance = None
    if document.grand_total > 0:
        entry, balance = post_bill_credit(ctx=ctx, document=document, party=party)
        ledger_entry_id = str(entry.id)

    paid = record_bill_payment(ctx=ctx, document=document, payment=cleaned_payment)
    if paid is not None:
        document.refresh_from_db()
        paid_balance = paid.pop("party_balance")
        if paid_balance is not None:
            balance = paid_balance

    movement_ids = [str(p.movement.id) for p in posted]
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_BILL_RECORDED,
        entity_type=ENTITY,
        entity_id=document.id,
        before={"status": DocumentStatus.DRAFT},
        after={
            "number": document.number,
            "status": document.status,
            "grand_total": str(document.grand_total),
            "taxable_total": str(document.taxable_total),
            "amount_due": str(document.amount_due),
            "itc_eligible": document.itc_eligible,
            "movement_ids": movement_ids,
            "ledger_entry_id": ledger_entry_id,
            "payment_id": paid["payment_id"] if paid else None,
        },
        metadata={"idempotency_key": ctx.idempotency_key},
    )
    return {
        "document": document,
        "warnings": outcome["warnings"],
        "ledger_entry_id": ledger_entry_id,
        "party_balance": balance,
        "movement_ids": movement_ids,
        "payment": paid,
    }


def party_snapshot(party: Any) -> dict:
    """FR-6c — what the bill must keep saying when the supplier is edited later (PUR-03 EC-1)."""
    from apps.purchases.services.payload import supplier_state

    address = dict(party.billing_address or {})
    return {
        "name": party.name,
        "gstin": party.gstin or None,
        "state_code": supplier_state(party),
        "mobile": party.mobile,
        "address": {k: address.get(k, "") for k in ("line1", "line2", "city", "state", "pincode")},
    }
