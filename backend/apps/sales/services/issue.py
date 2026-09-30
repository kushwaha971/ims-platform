"""`issue_invoice()` — SAL-02 FR-7 / BR-16, every side effect in one transaction.

── The order is the safety argument ─────────────────────────────────────────
1. Lock the draft; it must still be a draft at the version the client read.
2. Validate everything that needs no other row: lines, dates (current or
   previous FY only — FR-14), party xor walk-in, Rule 46 hard checks, rates by
   the document date (FR-17). Totals are recomputed from the inputs (step 6
   of BR-16 — a draft's stored totals are never trusted).
3. Lock the party (L1) — the credit check must read a balance nobody else can
   move until this commits.
4. Stock: `inventory.post_movements` writes `sale_out` for every tracked goods
   line (L2, item order) and refuses with 409 `insufficient_stock` naming every
   short line unless `inventory.allow_negative_stock` (FR-8).
5. Credit limit on the amount going on credit (BR-13): warn → `warnings[]`;
   block → 409 unless an owner/admin sent `override`.
6. Allocate the number LAST of the locks (L4) — a failure anywhere above rolls
   the number back with everything else, so the series never gaps.
7. Snapshot the party and supplier GSTIN, set amounts and status (BR-17).
8. Ledger debit for a party sale with a non-zero total (BR-18, EC-5).
9. Audit `invoice.issued`, and the override as its own row.

── A5 ── the document port's keywords (FRD 00 PLT-X05 §6; all default to the counter's
behaviour): `credit_check="skip"` (ADR-048) warns and never refuses; `apply_credit_note_ids`,
`apply_payment_ids` and `apply_open_advances` are LOCKED between step 5 and the number (R61:
party → documents → payments → sequence) and applied after the payment taken at issue
(`issue_apply.py`).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import fy_bounds, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import B2C_LARGE_THRESHOLD, DocumentStatus
from apps.sales.services import settings as sales_settings
from apps.sales.services.documents import check_version, lock_document, replace_lines
from apps.sales.services.issue_parts import credit_check as check_party_credit
from apps.sales.services.issue_parts import party_snapshot, post_stock, rule46_for
from apps.sales.services.ledger_link import post_invoice_debit
from apps.sales.services.payload import apply_payload
from apps.sales.services.payment_seam import paid_at_issue, record_issue_payment, validate_payment


def _validate_issuable(ctx: Ctx, document: Any, rows: list[dict]) -> None:
    errors: dict[str, list[str]] = {}
    current_start = fy_bounds(ctx.tenant, tenant_today(ctx.tenant))[0]
    previous_start = fy_bounds(ctx.tenant, current_start - dt.timedelta(days=1))[0]
    if document.document_date < previous_start:
        # FR-14 — back-dated bills after year end are fine; older ones are not.
        errors["document_date"] = ["Date is too old for a new invoice."]
    if not rows:
        errors["lines"] = ["Add at least one item"]
    if errors:
        raise ValidationFailed(errors)


@transaction.atomic
def issue_invoice(
    *,
    ctx: Ctx,
    document_id: Any,
    payment: dict | None = None,
    override: bool = False,
    version: Any = None,
    credit_check: str = "enforce",
    apply_credit_note_ids: Any = (),
    apply_payment_ids: Any = (),
    apply_open_advances: bool = False,
) -> dict:
    """Issue a draft. Returns `{document, warnings, ledger_entry_id, party_balance, applied}`."""
    from apps.parties.services.balance import lock_party_of, relock_if_moved
    from apps.platform_app.services.sequences import allocate_number
    from apps.sales.models import SalesDocument
    from apps.sales.services.issue_apply import apply_held_money, lock_held_money

    if credit_check not in ("enforce", "skip"):
        raise ValueError(f"credit_check must be 'enforce' or 'skip', not {credit_check!r}")
    tenant = ctx.tenant
    # L1 before the draft (`parties.services.balance.lock_party_of`), the order
    # every money path follows.
    early_party = lock_party_of(
        tenant=tenant, rows=SalesDocument.objects.filter(tenant=tenant), pk=document_id
    )
    document = lock_document(tenant, document_id)
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This invoice has already been issued.",
            details={"status": document.status, "number": document.number},
        )
    if version is not None:
        check_version(document, version)

    outcome = apply_payload(ctx, document, {}, strict=True)
    rows = outcome["rows"]
    _validate_issuable(ctx, document, rows)
    rule46 = rule46_for(tenant, document, rows)
    hard = [issue for issue in rule46["issues"] if issue["severity"] == "hard"]
    if hard:
        supplier_gstin = any(issue["code"] == "supplier_gstin_missing" for issue in hard)
        raise BusinessRuleViolation(
            "rule46_failed",
            (
                "Add your GSTIN in Business profile"
                if supplier_gstin
                else "This invoice is missing required details."
            ),
            details={"issues": hard},
        )
    walk_in = document.party_id is None
    cleaned_payment = validate_payment(
        payment=payment, grand_total=document.grand_total, walk_in=walk_in
    )

    party = None
    if not walk_in:
        party = relock_if_moved(tenant=tenant, party=early_party, party_id=document.party_id)
        if party is None or party.status == "archived":
            raise BusinessRuleViolation(
                "party_archived",
                "This party is archived. Restore them or choose another party.",
                details={"party_id": str(document.party_id)},
            )

    unit_costs = post_stock(ctx, document, rows)

    # What the invoice will have received once the payment below is recorded.
    # The credit check reads the part going on CREDIT (BR-13), so it is decided
    # now, before anything is written; the payment itself is recorded after the
    # invoice exists, through PAY-01 (see `payment_seam`).
    amount_paid = paid_at_issue(cleaned_payment, document.grand_total)
    amount_due = document.grand_total - amount_paid
    warnings = list(outcome["warnings"])
    overridden = False
    if party is not None and amount_due > 0:
        warning, overridden = check_party_credit(
            ctx, party, amount_due, override=override, enforce=credit_check == "enforce"
        )
        if warning:
            warnings.append(warning)
    if walk_in and document.is_inter_state and document.grand_total > _dec(B2C_LARGE_THRESHOLD):
        warnings.append(
            {
                "code": "b2c_large_needs_party",
                "message": "Enter customer name and address (use a party) for inter-state sales above ₹2.5 lakh.",
                "details": {},
            }
        )

    # R61 — every credit note and payment applied below is locked BEFORE the sequence row.
    held = lock_held_money(
        ctx,
        document,
        credit_note_ids=apply_credit_note_ids,
        payment_ids=apply_payment_ids,
        open_advances=apply_open_advances,
    )

    document.number = allocate_number(
        tenant=tenant, kind=document.kind, on_date=document.document_date
    )
    document.party_snapshot = party_snapshot(party, document)
    document.party_gstin_snapshot = (party.gstin if party is not None else None) or None
    document.supplier_gstin_snapshot = tenant.gstin or None
    # Written as issued-with-nothing-paid; `record_issue_payment` below moves it
    # to partially paid / paid through the payment's allocation. A walk-in
    # bill's due is held at zero (`ck_sales_document_walk_in_paid`) — see the
    # sales allocation target in `apps/sales/services/payment_target.py`.
    document.amount_paid = 0
    document.amount_due = document.grand_total if not walk_in else 0
    document.status = DocumentStatus.PAID if document.grand_total == 0 else DocumentStatus.ISSUED
    if amount_due == 0:
        document.due_on = None  # FR-11 / EC-12
    elif document.due_on is None and party is not None:
        days = (
            party.credit_days
            if party.credit_days is not None
            else sales_settings.default_due_days(tenant)
        )
        document.due_on = document.document_date + dt.timedelta(days=days)
    document.issued_at = timezone.now()
    document.version += 1
    document.save()
    for row in rows:
        row["unit_cost_snapshot"] = unit_costs.get(row["line_no"])
    replace_lines(document, rows)

    ledger_entry_id = None
    balance = None
    if party is not None and document.grand_total > 0:
        entry, balance = post_invoice_debit(ctx=ctx, document=document, party=party)
        ledger_entry_id = str(entry.id)

    receipt = record_issue_payment(ctx=ctx, document=document, payment=cleaned_payment)
    if receipt is not None:
        document.refresh_from_db()
        if receipt["party_balance"] is not None:
            balance = receipt["party_balance"]
    applied = apply_held_money(ctx, document, held)

    write_audit(
        ctx=ctx,
        action=AuditAction.INVOICE_ISSUED,
        entity_type="sales_document",
        entity_id=document.id,
        after={
            "number": document.number,
            "status": document.status,
            "grand_total": str(document.grand_total),
            "amount_paid": str(amount_paid),
            "amount_due": str(amount_due),
            "credit_limit_override": overridden,
            "payment_id": receipt["payment_id"] if receipt else None,
            "warnings": [w["code"] for w in warnings],
            **({"applied": applied} if applied else {}),
        },
        metadata={
            "idempotency_key": ctx.idempotency_key,
            **({"walk_in": True} if walk_in else {}),
            **({"zero_value": True} if document.grand_total == 0 else {}),
        },
    )
    if overridden:
        write_audit(
            ctx=ctx,
            action=AuditAction.CREDIT_LIMIT_OVERRIDDEN,
            entity_type="parties_party",
            entity_id=party.id,  # type: ignore[union-attr]
            after={"document_id": str(document.id), "balance_after": str(balance)},
            metadata={"limit": str(party.credit_limit), "amount": str(amount_due)},  # type: ignore[union-attr]
        )
    return {
        "document": document,
        "warnings": warnings,
        "ledger_entry_id": ledger_entry_id,
        "party_balance": balance,
        "applied": applied,
    }


def _dec(value: str) -> Any:
    from decimal import Decimal

    return Decimal(value)
