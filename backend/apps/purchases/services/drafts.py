"""Draft create / update / delete for purchase bills (PUR-01 FR-1, FR-8, BR-11).

A draft is stored with every figure the engine computes, so the list, the
detail and a reload all show what the editor showed. The figures are
recomputed from scratch at record — a draft's totals are a cache of its
inputs, never an input themselves (§0.11 rule 3).
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, PermissionDenied, StaleVersion
from apps.purchases.constants import DocumentKind, DocumentStatus
from apps.purchases.models import PurchaseDocument, PurchaseDocumentLine
from apps.purchases.services import settings as purchase_settings
from apps.purchases.services.payload import apply_payload

DRAFT_AUDIT_THROTTLE = timedelta(minutes=10)
ENTITY = "purchases_document"


def actor_of(ctx: Ctx) -> Any:
    return ctx.actor if ctx.actor_type == "user" else None


def replace_lines(document: PurchaseDocument, rows: list[dict]) -> None:
    """Replace-all inside the caller's transaction (drafts only; a recorded bill is immutable)."""
    PurchaseDocumentLine.objects.filter(document=document).delete()
    PurchaseDocumentLine.objects.bulk_create(
        [PurchaseDocumentLine(document=document, **row) for row in rows]
    )


def snapshot(document: PurchaseDocument) -> dict:
    """§21.7 — totals and status, the before/after a document audit row carries."""
    return {
        "number": document.number,
        "status": document.status,
        "grand_total": str(document.grand_total),
        "amount_due": str(document.amount_due),
        "version": document.version,
    }


def lock_document(tenant: Any, document_id: Any) -> PurchaseDocument:
    document = (
        PurchaseDocument.objects.select_for_update().filter(tenant=tenant, pk=document_id).first()
    )
    if document is None:
        raise NotFound("No such bill.")
    return document


def require_draft(document: PurchaseDocument) -> None:
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This bill has been recorded and can no longer be changed.",
            details={"status": document.status, "number": document.number},
        )


def check_version(document: PurchaseDocument, version: Any) -> None:
    """Part 22 §22.1 — the version the client read; 409 with the current one."""
    if version is None or int(version) != document.version:
        raise StaleVersion(current_version=document.version)


def may_edit_draft(ctx: Ctx, document: PurchaseDocument) -> bool:
    """BR-11 — the creator, or an owner/admin (a ROLE check, as sales' draft rule)."""
    from apps.parties.services.credit import may_override

    if document.created_by_id is None or ctx.actor is None:
        return True
    return document.created_by_id == ctx.actor.id or may_override(tenant=ctx.tenant, user=ctx.actor)


@transaction.atomic
def create_draft(*, ctx: Ctx, payload: dict) -> dict:
    tenant = ctx.tenant
    document = PurchaseDocument(
        tenant=tenant,
        created_by=actor_of(ctx),
        kind=DocumentKind.PURCHASE_BILL,
        status=DocumentStatus.DRAFT,
        round_off_enabled=purchase_settings.round_off_default(tenant),
        itc_eligible=tenant.gst_type == "regular",
    )
    outcome = apply_payload(ctx, document, payload, strict=False)
    document.amount_due = document.grand_total
    document.save()
    replace_lines(document, outcome["rows"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_BILL_DRAFT_CREATED,
        entity_type=ENTITY,
        entity_id=document.id,
        after=snapshot(document),
    )
    return {"document": document, "warnings": outcome["warnings"]}


#: BR-7 — the two fields a RECORDED bill may still change.
POST_RECORD_FIELDS = ("notes",)


@transaction.atomic
def update_draft(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    """PATCH a draft (`version` required); on a recorded bill only `notes` (BR-7, T-PUR-01-10)."""
    document = lock_document(ctx.tenant, document_id)
    if document.status != DocumentStatus.DRAFT:
        return _update_recorded(ctx, document, payload)
    check_version(document, payload.get("version"))
    if not may_edit_draft(ctx, document):
        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can change it."
        )
    outcome = apply_payload(ctx, document, payload, strict=False)
    document.amount_due = document.grand_total
    document.version += 1
    document.save()
    if "lines" in payload:
        replace_lines(document, outcome["rows"])
    _throttled_update_audit(ctx, document)
    return {"document": document, "warnings": outcome["warnings"]}


def _update_recorded(ctx: Ctx, document: PurchaseDocument, payload: dict) -> dict:
    changing = set(payload) - {"version"}
    if document.status == DocumentStatus.VOID or not changing <= set(POST_RECORD_FIELDS):
        require_draft(document)  # raises document_not_draft
    check_version(document, payload.get("version"))
    before = {"notes": document.notes}
    document.notes = str(payload.get("notes") or "")[:2000]
    document.version += 1
    document.save(update_fields=["notes", "version", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_BILL_UPDATED,
        entity_type=ENTITY,
        entity_id=document.id,
        before=before,
        after={"notes": document.notes},
    )
    return {"document": document, "warnings": []}


def _throttled_update_audit(ctx: Ctx, document: PurchaseDocument) -> None:
    from apps.platform_app.models import AuditLog

    since = timezone.now() - DRAFT_AUDIT_THROTTLE
    recent = AuditLog.objects.filter(
        tenant=ctx.tenant,
        entity_type=ENTITY,
        entity_id=document.id,
        action=AuditAction.PURCHASE_BILL_UPDATED,
        created_at__gte=since,
    ).exists()
    if not recent:
        write_audit(
            ctx=ctx,
            action=AuditAction.PURCHASE_BILL_UPDATED,
            entity_type=ENTITY,
            entity_id=document.id,
            after=snapshot(document),
            metadata={"changes_count": document.version - 1},
        )


@transaction.atomic
def delete_draft(*, ctx: Ctx, document_id: Any) -> None:
    """FR-8 — drafts only; anything recorded is voided, never deleted (§21.6)."""
    document = lock_document(ctx.tenant, document_id)
    require_draft(document)
    if not may_edit_draft(ctx, document):
        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can delete it."
        )
    before = snapshot(document)
    document_pk = document.id
    document.delete()
    write_audit(
        ctx=ctx,
        action=AuditAction.PURCHASE_BILL_DELETED,
        entity_type=ENTITY,
        entity_id=document_pk,
        before=before,
    )
