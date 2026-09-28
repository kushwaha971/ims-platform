"""Estimates — the kachha bill (SAL-01 FR-1…FR-5, FR-8, FR-11, FR-12).

An estimate is a `sales_document` of kind `estimate` built by the SAME draft
lifecycle and totals engine as an invoice (FR-1), so a line priced on a quote
is priced identically on the bill it becomes. What differs is all here:

* `valid_until` (FR-4) — defaults to the date + `sales.estimate_validity_days`
  (15), and may not be before the date.
* The status walk (FR-3, §9): `draft → sent` takes the number (FR-2, BR-2),
  then `sent → accepted | rejected`; `expired` is the nightly job's
  (`services/expiry.py`) and `converted` is `estimate_convert.py`'s.
* No stock, no ledger, no payment, ever (FR-8, BR-1): nothing in this module
  imports inventory or the ledger, and `amount_due` stays 0 so no receivable
  report can ever count one.

Tax: the engine forces every rate to 0 for composition and unregistered
tenants (BR-3), so their estimates carry a priced preview with no tax rows;
a regular tenant's carry the "Estimated GST" the print labels as such.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.sales.constants import DocumentKind, DocumentStatus
from apps.sales.services import documents as drafts
from apps.sales.services import settings as sales_settings
from apps.sales.services.issue_parts import party_snapshot
from apps.sales.services.payload import apply_payload

ESTIMATE_KINDS: tuple[str, ...] = (DocumentKind.ESTIMATE,)
REJECT_NOTE_MAX = 255


def _parse(raw: Any) -> dt.date | None:
    if raw in (None, ""):
        return None
    if isinstance(raw, dt.date):
        return raw
    try:
        return dt.date.fromisoformat(str(raw))
    except ValueError:
        raise ValidationFailed({"valid_until": ["Enter a date as YYYY-MM-DD."]}) from None


def apply_validity(document: Any, payload: dict) -> None:
    """FR-4 — an explicit `valid_until`, or the default counted from the document date."""
    if "valid_until" in payload and payload["valid_until"] not in (None, ""):
        document.valid_until = _parse(payload["valid_until"])
    elif document.valid_until is None or "valid_until" in payload:
        days = sales_settings.estimate_validity_days(document.tenant)
        document.valid_until = document.document_date + dt.timedelta(days=days)
    if document.valid_until < document.document_date:
        raise ValidationFailed(
            {"valid_until": ["Valid-until must be on or after the document date."]}
        )
    document.due_on = None  # an estimate is never a receivable (BR-1)


@transaction.atomic
def create_estimate(*, ctx: Ctx, payload: dict) -> dict:
    result = drafts.create_draft(ctx=ctx, payload=payload, kind=DocumentKind.ESTIMATE)
    document = result["document"]
    apply_validity(document, payload)
    document.save(update_fields=["valid_until", "due_on", "updated_at"])
    return result


@transaction.atomic
def update_estimate(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    result = drafts.update_draft(
        ctx=ctx, document_id=document_id, payload=payload, kinds=ESTIMATE_KINDS
    )
    document = result["document"]
    apply_validity(document, payload)
    document.save(update_fields=["valid_until", "due_on", "updated_at"])
    return result


def _refuse_status(document: Any, allowed: tuple[str, ...], message: str) -> None:
    """409 `document_not_open` for a status the transition does not start from."""
    if document.status not in allowed:
        raise BusinessRuleViolation(
            "document_not_open",
            "Send the estimate first." if document.status == DocumentStatus.DRAFT else message,
            details={"status": document.status, "number": document.number},
        )


@transaction.atomic
def mark_sent(*, ctx: Ctx, document_id: Any, version: Any = None) -> dict:
    """`draft → sent`: validate as strictly as an issue would, then take the number (FR-2)."""
    from apps.platform_app.services.sequences import allocate_number

    document = drafts.lock_document(ctx.tenant, document_id, ESTIMATE_KINDS)
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This estimate has already been sent.",
            details={"status": document.status, "number": document.number},
        )
    if version is not None:
        drafts.check_version(document, version)
    outcome = apply_payload(ctx, document, {}, strict=True)
    errors: dict[str, list[str]] = {}
    if not outcome["rows"]:
        errors["lines"] = ["Add at least one item"]
    if document.party_id is None and not document.walk_in_name:
        errors["party_id"] = ["Choose a party or enter a name"]
    if errors:
        raise ValidationFailed(errors)
    apply_validity(document, {})
    party = document.party
    if party is not None and party.status == "archived":
        raise ValidationFailed({"party_id": ["Party is archived; restore first"]})

    document.number = allocate_number(
        tenant=ctx.tenant, kind=DocumentKind.ESTIMATE, on_date=document.document_date
    )
    document.party_snapshot = party_snapshot(party, document)
    document.party_gstin_snapshot = (party.gstin if party is not None else None) or None
    document.supplier_gstin_snapshot = ctx.tenant.gstin or None
    document.status = DocumentStatus.SENT
    document.issued_at = timezone.now()
    document.amount_paid = document.amount_due = 0
    document.version += 1
    document.save()
    drafts.replace_lines(document, outcome["rows"])
    warnings = list(outcome["warnings"])
    if document.valid_until and document.valid_until < tenant_today(ctx.tenant):
        # EC-8 — allowed; the nightly job will mark it expired.
        warnings.append(
            {"code": "validity_passed", "message": "Validity already passed", "details": {}}
        )
    write_audit(
        ctx=ctx,
        action=AuditAction.ESTIMATE_SENT,
        entity_type="sales_document",
        entity_id=document.id,
        after=_snapshot(document),
    )
    return {"document": document, "warnings": warnings}


def _snapshot(document: Any) -> dict:
    return {
        "number": document.number,
        "status": document.status,
        "grand_total": str(document.grand_total),
        "valid_until": document.valid_until.isoformat() if document.valid_until else None,
    }


@transaction.atomic
def mark_status(*, ctx: Ctx, document_id: Any, to: str, note: str | None = None) -> dict:
    """`sent → accepted` or `sent → rejected` (§9). `rejected` is terminal (FR-11)."""
    document = drafts.lock_document(ctx.tenant, document_id, ESTIMATE_KINDS)
    _refuse_status(
        document,
        (DocumentStatus.SENT,),
        f"This estimate is {document.status} and cannot be marked {to}.",
    )
    before = _snapshot(document)
    document.status = to
    if to == DocumentStatus.REJECTED and note:
        document.meta = {**(document.meta or {}), "rejected_note": str(note)[:REJECT_NOTE_MAX]}
    document.version += 1
    document.save(update_fields=["status", "meta", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=(
            AuditAction.ESTIMATE_ACCEPTED
            if to == DocumentStatus.ACCEPTED
            else AuditAction.ESTIMATE_REJECTED
        ),
        entity_type="sales_document",
        entity_id=document.id,
        before=before,
        after=_snapshot(document),
        metadata={"note": note} if note else None,
    )
    return {"document": document, "warnings": []}
