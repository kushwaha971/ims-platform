"""Credit note drafts — against an invoice or standalone (SAL-04 FR-1…FR-3, FR-5, FR-7, FR-12).

The draft lifecycle is `documents.py`'s (create, PATCH with a version, delete
a draft), with the credit note's own header rules in front of it:

* AGAINST an invoice: the party, place of supply, reverse charge and round-off
  come from the invoice (FR-2); the lines are `credit_note_lines`' — invoice
  lines and quantities, priced at the invoice's snapshot. The invoice must be
  issued and not void, and have a party (a walk-in bill's return needs the
  customer made a party first, EC-7).
* STANDALONE (goodwill, a rate correction with no single bill): party required,
  lines built like an invoice's at the note's own date (FR-3).

`reason`, `restock`, `settlement` and the requested refund ride in `meta`
(no columns exist for them in §21.3.7): `meta.reason = {code, note}`,
`meta.restock`, `meta.settlement`, `meta.refund_request`.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.sales.constants import (
    CREDITABLE_STATUSES,
    INVOICE_KINDS,
    REASON_NOTE_MAX,
    CreditNoteReason,
    DocumentKind,
    DocumentStatus,
    Settlement,
)
from apps.sales.models import SalesDocument
from apps.sales.services import documents as drafts
from apps.sales.services.credit_note_lines import build_return_lines, stored_return_request
from apps.sales.services.payload import apply_payload
from apps.sales.services.refund_seam import clean_refund

CREDIT_NOTE_KINDS: tuple[str, ...] = (DocumentKind.CREDIT_NOTE,)
META_KEYS = ("reason", "reason_note", "restock", "settlement", "refund")


def invoice_for_credit(tenant: Any, against_id: Any, *, lock: bool = False) -> SalesDocument:
    """The invoice a note may be written against, or 400 on `against_id` (§10, EC-1, EC-7)."""
    rows = SalesDocument.objects.filter(tenant=tenant, pk=against_id, kind__in=INVOICE_KINDS)
    invoice = (rows.select_for_update() if lock else rows).first()
    if invoice is None:
        raise ValidationFailed({"against_id": ["Choose an invoice from your list."]})
    if invoice.status == DocumentStatus.VOID:
        raise ValidationFailed({"against_id": ["Invoice is void"]})
    if invoice.status not in CREDITABLE_STATUSES:
        raise ValidationFailed({"against_id": ["Issue the invoice first."]})
    if invoice.party_id is None:
        raise ValidationFailed(
            {"against_id": ["A walk-in bill has no party. Create the customer as a party first."]}
        )
    return invoice


def _apply_meta(document: SalesDocument, payload: dict) -> None:
    meta = dict(document.meta or {})
    reason = dict(meta.get("reason") or {})
    if "reason" in payload:
        code = payload.get("reason") or None
        if code is not None and code not in CreditNoteReason.values:
            raise ValidationFailed({"reason": ["Choose a reason"]})
        reason["code"] = code
    if "reason_note" in payload:
        reason["note"] = str(payload.get("reason_note") or "").strip()[:REASON_NOTE_MAX]
    meta["reason"] = reason
    if "restock" in payload:
        meta["restock"] = bool(payload["restock"])
    meta.setdefault("restock", True)
    if "settlement" in payload:
        if payload["settlement"] not in Settlement.values:
            raise ValidationFailed({"settlement": ["Choose hold as advance or refund now."]})
        meta["settlement"] = payload["settlement"]
    meta.setdefault("settlement", Settlement.HOLD_ADVANCE)
    if "refund" in payload:
        meta["refund_request"] = clean_refund(payload.get("refund"))
    document.meta = meta


def recompute(
    ctx: Ctx, document: SalesDocument, payload: dict, *, strict: bool, invoice: Any = None
) -> dict:
    """Header + lines + totals for either mode, onto `document`. Returns apply_payload's outcome."""
    header = {k: v for k, v in payload.items() if k not in ("lines", "against_id", *META_KEYS)}
    if document.against_id is None:
        if "party_id" in header and not header["party_id"]:
            raise ValidationFailed({"party_id": ["Choose a party"]})
        header["walk_in_name"] = header["walk_in_mobile"] = None
        if "lines" in payload:
            header["lines"] = [
                {k: v for k, v in dict(line).items() if k != "against_line_id"}
                for line in payload["lines"]
            ]
        return apply_payload(ctx, document, header, strict=strict)

    invoice = invoice or invoice_for_credit(ctx.tenant, document.against_id)
    if header.get("party_id") and str(header["party_id"]) != str(invoice.party_id):
        raise ValidationFailed({"party_id": ["The party must be the invoice's."]})
    header.update(
        party_id=invoice.party_id,
        walk_in_name=None,
        walk_in_mobile=None,
        place_of_supply_state=invoice.place_of_supply_state,
        reverse_charge=invoice.reverse_charge,
    )
    header.setdefault("round_off_enabled", invoice.round_off_enabled)
    raw = payload.get("lines")
    if raw is None:
        raw = stored_return_request(document)
    errors: dict[str, list[str]] = {}
    built, doc_discount = build_return_lines(invoice=invoice, raw_lines=list(raw), errors=errors)
    if errors:
        raise ValidationFailed(errors)
    header["discount_type"] = "amount" if doc_discount > 0 else None
    header["discount_value"] = doc_discount if doc_discount > 0 else None
    outcome = apply_payload(ctx, document, header, strict=strict, built=built)
    if document.document_date < invoice.document_date:
        raise ValidationFailed({"document_date": ["Cannot be before the invoice date"]})
    return outcome


@transaction.atomic
def create_credit_note(*, ctx: Ctx, payload: dict) -> dict:
    from apps.common.audit import write_audit
    from apps.sales.services import settings as sales_settings

    document = SalesDocument(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        kind=DocumentKind.CREDIT_NOTE,
        status=DocumentStatus.DRAFT,
        round_off_enabled=sales_settings.round_off_default(ctx.tenant),
    )
    if payload.get("against_id"):
        document.against = invoice_for_credit(ctx.tenant, payload["against_id"])
    elif not payload.get("party_id"):
        raise ValidationFailed({"party_id": ["Choose a party"]})
    _apply_meta(document, payload)
    outcome = recompute(ctx, document, payload, strict=False, invoice=document.against)
    document.save()
    drafts.replace_lines(document, outcome["rows"])
    write_audit(
        ctx=ctx,
        action=drafts.draft_actions(document.kind)[0],
        entity_type="sales_document",
        entity_id=document.id,
        after={"grand_total": str(document.grand_total), "against_id": str(document.against_id)},
    )
    return {"document": document, "warnings": outcome["warnings"]}


@transaction.atomic
def update_credit_note(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    document = drafts.lock_document(ctx.tenant, document_id, CREDIT_NOTE_KINDS)
    drafts.require_draft(document)
    drafts.check_version(document, payload.get("version"))
    if not drafts.may_edit_draft(ctx, document):
        from apps.common.exceptions import PermissionDenied

        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can change it."
        )
    if "against_id" in payload and str(payload["against_id"] or "") != str(
        document.against_id or ""
    ):
        raise ValidationFailed({"against_id": ["Start a new credit note for another invoice."]})
    _apply_meta(document, payload)
    outcome = recompute(ctx, document, payload, strict=False)
    document.version += 1
    document.save()
    # Always: the rows were rebuilt either way, and a header change (the
    # date, round-off) can move every line's figures.
    drafts.replace_lines(document, outcome["rows"])
    return {"document": document, "warnings": outcome["warnings"]}
