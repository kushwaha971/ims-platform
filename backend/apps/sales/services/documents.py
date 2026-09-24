"""Draft create / update / delete (SAL-02 FR-13, SAL-06 FR-2, FR-9, FR-10).

A draft is stored with every figure the engine computes, so the list, the
detail and a reload all show the same preview the editor showed. The figures
are recomputed from scratch at issue (BR-16 step 6) — a draft's totals are a
cache of its inputs, never an input themselves.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, PermissionDenied, StaleVersion
from apps.sales.constants import DocumentStatus
from apps.sales.models import SalesDocument, SalesDocumentLine
from apps.sales.services import settings as sales_settings
from apps.sales.services.payload import apply_payload, kind_for

DRAFT_AUDIT_THROTTLE = timedelta(minutes=10)


def _actor(ctx: Ctx) -> Any:
    return ctx.actor if ctx.actor_type == "user" else None


def replace_lines(document: SalesDocument, rows: list[dict]) -> None:
    """SAL-06 §15 — replace-all inside the caller's transaction."""
    SalesDocumentLine.objects.filter(document=document).delete()
    SalesDocumentLine.objects.bulk_create(
        [SalesDocumentLine(document=document, **row) for row in rows]
    )


def _snapshot(document: SalesDocument) -> dict:
    return {
        "grand_total": str(document.grand_total),
        "lines": document.lines.count(),
        "version": document.version,
    }


@transaction.atomic
def create_draft(*, ctx: Ctx, payload: dict) -> dict:
    tenant = ctx.tenant
    document = SalesDocument(
        tenant=tenant,
        created_by=_actor(ctx),
        kind=kind_for(tenant, payload.get("kind")),
        status=DocumentStatus.DRAFT,
        round_off_enabled=sales_settings.round_off_default(tenant),
        terms=sales_settings.default_terms(tenant),
    )
    outcome = apply_payload(ctx, document, payload, strict=False)
    document.save()
    replace_lines(document, outcome["rows"])
    write_audit(
        ctx=ctx,
        action=AuditAction.INVOICE_DRAFT_CREATED,
        entity_type="sales_document",
        entity_id=document.id,
        after=_snapshot(document),
    )
    return {"document": document, "warnings": outcome["warnings"]}


def lock_document(tenant: Any, document_id: Any) -> SalesDocument:
    document = (
        SalesDocument.objects.select_for_update().filter(tenant=tenant, pk=document_id).first()
    )
    if document is None:
        raise NotFound("No such invoice.")
    return document


def require_draft(document: SalesDocument) -> None:
    if document.status != DocumentStatus.DRAFT:
        raise BusinessRuleViolation(
            "document_not_draft",
            "This invoice has been issued and can no longer be changed.",
            details={"status": document.status, "number": document.number},
        )


def check_version(document: SalesDocument, version: Any) -> None:
    """Part 22 §22.1 — the version the client read; 409 with the current one (SAL-06 FR-9)."""
    if version is None or int(version) != document.version:
        raise StaleVersion(current_version=document.version)


def may_edit_draft(ctx: Ctx, document: SalesDocument) -> bool:
    """SAL-02 §12 — the creator, or an owner/admin."""
    from apps.parties.services.credit import may_override

    if document.created_by_id is None or ctx.actor is None:
        return True
    return document.created_by_id == ctx.actor.id or may_override(tenant=ctx.tenant, user=ctx.actor)


@transaction.atomic
def update_draft(*, ctx: Ctx, document_id: Any, payload: dict) -> dict:
    document = lock_document(ctx.tenant, document_id)
    require_draft(document)
    check_version(document, payload.get("version"))
    if not may_edit_draft(ctx, document):
        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can change it."
        )
    if payload.get("kind"):
        kind_for(ctx.tenant, payload["kind"])
    outcome = apply_payload(ctx, document, payload, strict=False)
    document.version += 1
    document.save()
    if "lines" in payload:
        replace_lines(document, outcome["rows"])
    _throttled_update_audit(ctx, document)
    return {"document": document, "warnings": outcome["warnings"]}


def _throttled_update_audit(ctx: Ctx, document: SalesDocument) -> None:
    from apps.platform_app.models import AuditLog

    since = timezone.now() - DRAFT_AUDIT_THROTTLE
    recent = AuditLog.objects.filter(
        tenant=ctx.tenant,
        entity_type="sales_document",
        entity_id=document.id,
        action=AuditAction.INVOICE_DRAFT_UPDATED,
        created_at__gte=since,
    ).exists()
    if not recent:
        write_audit(
            ctx=ctx,
            action=AuditAction.INVOICE_DRAFT_UPDATED,
            entity_type="sales_document",
            entity_id=document.id,
            after=_snapshot(document),
            metadata={"changes_count": document.version - 1},
        )


@transaction.atomic
def delete_draft(*, ctx: Ctx, document_id: Any) -> None:
    document = lock_document(ctx.tenant, document_id)
    require_draft(document)
    if not may_edit_draft(ctx, document):
        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can delete it."
        )
    before = _snapshot(document)
    document_pk = document.id
    document.delete()
    write_audit(
        ctx=ctx,
        action=AuditAction.INVOICE_DRAFT_DELETED,
        entity_type="sales_document",
        entity_id=document_pk,
        before=before,
    )
