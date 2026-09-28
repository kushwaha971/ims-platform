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
from apps.sales.constants import INVOICE_KINDS, DocumentKind, DocumentStatus
from apps.sales.models import SalesDocument, SalesDocumentLine
from apps.sales.services import settings as sales_settings
from apps.sales.services.payload import apply_payload, kind_for

DRAFT_AUDIT_THROTTLE = timedelta(minutes=10)

#: The audit words each kind's draft lifecycle writes: (created, updated, deleted).
_DRAFT_ACTIONS: dict[str, tuple[str, str, str]] = {
    DocumentKind.ESTIMATE: (
        AuditAction.ESTIMATE_CREATED,
        AuditAction.ESTIMATE_UPDATED,
        AuditAction.ESTIMATE_DELETED,
    ),
    DocumentKind.CREDIT_NOTE: (
        AuditAction.CREDIT_NOTE_DRAFT_CREATED,
        AuditAction.CREDIT_NOTE_DRAFT_UPDATED,
        AuditAction.CREDIT_NOTE_DRAFT_DELETED,
    ),
}
_INVOICE_ACTIONS = (
    AuditAction.INVOICE_DRAFT_CREATED,
    AuditAction.INVOICE_DRAFT_UPDATED,
    AuditAction.INVOICE_DRAFT_DELETED,
)


def draft_actions(kind: str) -> tuple[str, str, str]:
    return _DRAFT_ACTIONS.get(kind, _INVOICE_ACTIONS)


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
def create_draft(*, ctx: Ctx, payload: dict, kind: str | None = None) -> dict:
    """A new draft. `kind` is the route's (estimate); None means the tenant's tax kind."""
    tenant = ctx.tenant
    document = SalesDocument(
        tenant=tenant,
        created_by=_actor(ctx),
        kind=kind or kind_for(tenant, payload.get("kind")),
        status=DocumentStatus.DRAFT,
        round_off_enabled=sales_settings.round_off_default(tenant),
        terms=sales_settings.default_terms(tenant),
    )
    outcome = apply_payload(ctx, document, payload, strict=False)
    document.save()
    replace_lines(document, outcome["rows"])
    write_audit(
        ctx=ctx,
        action=draft_actions(document.kind)[0],
        entity_type="sales_document",
        entity_id=document.id,
        after=_snapshot(document),
    )
    return {"document": document, "warnings": outcome["warnings"]}


def lock_document(
    tenant: Any, document_id: Any, kinds: tuple[str, ...] | None = INVOICE_KINDS
) -> SalesDocument:
    """`SELECT … FOR UPDATE` one document of `kinds` — another kind's id is a 404.

    The route decides the kinds, so `/sales/invoices/<an estimate's id>` can
    neither read nor change the estimate. `kinds=None` is for callers that
    already know what they hold (a credit note locking its invoice).
    """
    rows = SalesDocument.objects.select_for_update().filter(tenant=tenant, pk=document_id)
    if kinds is not None:
        rows = rows.filter(kind__in=kinds)
    document = rows.first()
    if document is None:
        raise NotFound("No such document.")
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
def update_draft(
    *, ctx: Ctx, document_id: Any, payload: dict, kinds: tuple[str, ...] = INVOICE_KINDS
) -> dict:
    document = lock_document(ctx.tenant, document_id, kinds)
    require_draft(document)
    check_version(document, payload.get("version"))
    if not may_edit_draft(ctx, document):
        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can change it."
        )
    if payload.get("kind") and document.kind in INVOICE_KINDS:
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
    action = draft_actions(document.kind)[1]
    recent = AuditLog.objects.filter(
        tenant=ctx.tenant,
        entity_type="sales_document",
        entity_id=document.id,
        action=action,
        created_at__gte=since,
    ).exists()
    if not recent:
        write_audit(
            ctx=ctx,
            action=action,
            entity_type="sales_document",
            entity_id=document.id,
            after=_snapshot(document),
            metadata={"changes_count": document.version - 1},
        )


@transaction.atomic
def delete_draft(*, ctx: Ctx, document_id: Any, kinds: tuple[str, ...] = INVOICE_KINDS) -> None:
    document = lock_document(ctx.tenant, document_id, kinds)
    require_draft(document)
    if not may_edit_draft(ctx, document):
        raise PermissionDenied(
            "Only the person who started this draft, or an owner, can delete it."
        )
    before = _snapshot(document)
    document_pk = document.id
    action = draft_actions(document.kind)[2]
    document.delete()
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="sales_document",
        entity_id=document_pk,
        before=before,
    )
