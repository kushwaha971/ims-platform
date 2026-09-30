"""Sales' side of the document port's origin listeners (A5, FRD 00 PLT-X05 §6, R1, R55, R58).

A document the port issued carries `(origin_module, origin_type, origin_id)`. Sales tells the
origin's listener about it at three points, always inside its own transaction and after its own
locks (party → document; the listener's rows come after, BR-5):

* `guard_origin_void` — after `refuse_unless_voidable`, before anything is reversed: the
  listener's `check_void` may BLOCK (409 `document_origin_locked {origin_type, reason}`) or ask
  to CONFIRM (409 `document_origin_confirm {origin_type, message}` unless the void request says
  `confirm_origin: true`). A block wins over a confirmation.
* `notify_origin_void` — last inside the void. A listener that raises rolls the void back.
* `notify_settlement_changed` — from `refresh_invoice_amounts`, when `amount_due` or `status`
  moved.

A void the MODULE asked for (`void_document` through the port) passes `from_origin=True` and
none of these run: its own `check_void` could only refuse itself.
"""

from __future__ import annotations

from typing import Any

from apps.common.exceptions import BusinessRuleViolation


def has_origin(document: Any) -> bool:
    return bool(getattr(document, "origin_type", None))


def summary_of(document: Any, *, ledger_entry_id: Any = None, refund_payment: Any = None) -> dict:
    """The port's `IssuedDocument` for one document."""
    return {
        "document_id": document.id,
        "number": document.number,
        "kind": document.kind,
        "status": document.status,
        "grand_total": document.grand_total,
        "amount_due": document.amount_due,
        "ledger_entry_id": ledger_entry_id,
        "refund_payment": refund_payment,
    }


def guard_origin_void(*, tenant: Any, document: Any, confirm_origin: bool) -> None:
    from apps.common.seams import documents as port

    if not has_origin(document):
        return
    answer = port.check_void(
        tenant=tenant, origin_type=document.origin_type, origin_id=document.origin_id
    )
    if answer["block"]:
        raise BusinessRuleViolation(
            "document_origin_locked",
            answer["block"],
            details={"origin_type": document.origin_type, "reason": answer["block"]},
        )
    if answer["confirm"] and not confirm_origin:
        raise BusinessRuleViolation(
            "document_origin_confirm",
            answer["confirm"],
            details={"origin_type": document.origin_type, "message": answer["confirm"]},
        )


def notify_origin_void(*, ctx: Any, document: Any, reason: str) -> None:
    from apps.common.seams import documents as port

    if has_origin(document):
        port.notify_void(
            ctx=ctx,
            origin_type=document.origin_type,
            origin_id=document.origin_id,
            document=summary_of(document),
            reason=reason,
        )


def notify_settlement_changed(*, ctx: Any, document: Any) -> None:
    from apps.common.seams import documents as port

    if has_origin(document):
        port.notify_settlement(
            ctx=ctx,
            origin_type=document.origin_type,
            origin_id=document.origin_id,
            document=summary_of(document),
        )


def origin_view(document: Any, labels: dict | None = None) -> dict | None:
    """`origin: {module, type, id, label} | null` for the list rows and the detail."""
    if not has_origin(document):
        return None
    key = (document.origin_type, str(document.origin_id))
    if labels is None:
        labels = page_labels(document.tenant, [document])
    return {
        "module": document.origin_module,
        "type": document.origin_type,
        "id": str(document.origin_id),
        "label": labels.get(key),
    }


def page_labels(tenant: Any, documents: Any) -> dict:
    """One label call per origin type for a page of documents (FRD §6 HTTP deltas)."""
    from apps.common.seams import documents as port

    pairs = [(d.origin_type, d.origin_id) for d in documents if has_origin(d)]
    return port.origin_labels(tenant=tenant, pairs=pairs) if pairs else {}
