"""The `dues_due` origin listener and the ledger source resolvers (contracts §1.5, R2, R55).

── Why DUE-02 registers the listener (C-18 of the design note) ────────────────
`issue_document` refuses an origin type nobody registered, so the document
branch of `post_due` cannot issue a single invoice until `dues_due` is an
origin. A registered origin is held to the shared contract
(`tests/contracts/test_document_port.py`) from the moment it registers, so the
whole listener lands here rather than a stub that DUE-03 would finish:

* `check_void` never blocks (FRD DUE-03 §6): an invoice the merchant voids is
  an invoice that should not have been billed, and the due follows it.
* `on_void` cancels the due (`Invoice voided: <reason>`), inside sales' void
  transaction, after its party → document locks.
* `on_settlement_changed` keeps the due's `settled_amount` equal to
  `grand_total − amount_due` and re-derives `paid` / `due` / `overdue`.

Every call ignores a due still `scheduled`: sales may report a settlement while
`post_due` is issuing (open advances applied inside the issue), and `post_due`
writes those figures itself once the port returns.

── The origin's module (C-2, Q-D1) ────────────────────────────────────────────
Registered with `module="dues"`: one origin type serves every consuming
vertical and the port stamps one module per type. `labels()` names the subject,
so a register reads "Subject · Oct 2026" whatever the module column says.

`dues_adjustment` is not registered yet: nothing issues a penalty document
before DUE-04, and its listener's meaning (what a voided penalty does to the
due's caches) is DUE-04's `reverse_adjustment` (deviation recorded in the
progress file).
"""

from __future__ import annotations

from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.money import q2
from apps.dues.constants import REASON_MAX, SOURCE_COMPONENT, SOURCE_DUE, DueStatus
from apps.dues.models import DuesDue, DuesDueComponent
from apps.dues.registry import subject_for, subject_labels


def _labels_for(dues: list[DuesDue]) -> dict[Any, str]:
    """`{due.id: "Subject · Oct 2026"}`, one label call per subject type."""
    from apps.dues.services.posting import due_note

    by_type: dict[str, set] = {}
    for due in dues:
        by_type.setdefault(due.schedule.subject_type, set()).add(due.schedule.subject_id)
    names: dict[tuple[str, Any], str] = {}
    for subject_type, ids in by_type.items():
        for subject_id, label in subject_labels(subject_type, ids).items():
            names[(subject_type, subject_id)] = label
    return {
        due.id: due_note(
            subject_label=names.get((due.schedule.subject_type, due.schedule.subject_id)),
            period_label=due.period_label,
        )
        for due in dues
    }


def _changed(ctx: Any, due: DuesDue, before: str) -> None:
    if before == due.status:
        return
    subject = subject_for(due.schedule.subject_type)
    if subject is not None and subject.on_due_changed is not None:
        subject.on_due_changed(ctx, due, before, due.status)


def _matches(due: DuesDue | None, document: dict) -> bool:
    return (
        due is not None
        and due.status != DueStatus.SCHEDULED
        and due.document_id is not None
        and str(due.document_id) == str(document.get("document_id"))
    )


class DuesDueOrigin:
    """The `OriginListener` for `dues_due` (contracts §1.5)."""

    def check_void(self, *, tenant: Any, origin_id: Any) -> dict:
        return {"block": None, "confirm": None}

    def on_void(self, *, ctx: Any, origin_id: Any, document: dict, reason: str) -> None:
        due = (
            DuesDue.objects.for_tenant(ctx.tenant)
            .select_related("schedule")
            .select_for_update(of=("self",))
            .filter(pk=origin_id)
            .first()
        )
        if not _matches(due, document) or due.status == DueStatus.CANCELLED:
            return
        before = due.status
        cancel_reason = f"Invoice voided: {reason}"[:REASON_MAX]
        DuesDue.objects.filter(pk=due.pk).update(
            status=DueStatus.CANCELLED, cancel_reason=cancel_reason
        )
        due.status, due.cancel_reason = DueStatus.CANCELLED.value, cancel_reason
        write_audit(
            ctx=ctx,
            action=AuditAction.DUES_DUE_CANCELLED,
            entity_type="dues_due",
            entity_id=due.id,
            before={"status": before},
            after={"status": due.status},
            metadata={"document_id": str(due.document_id), "reason": cancel_reason},
        )
        _changed(ctx, due, before)

    def on_settlement_changed(self, *, ctx: Any, origin_id: Any, document: dict) -> None:
        from apps.dues.services.posting import open_status

        due = (
            DuesDue.objects.for_tenant(ctx.tenant)
            .select_related("schedule")
            .select_for_update(of=("self",))
            .filter(pk=origin_id)
            .first()
        )
        if not _matches(due, document) or due.status not in (
            DueStatus.DUE,
            DueStatus.OVERDUE,
            DueStatus.PAID,
        ):
            return
        owed = due.amount + due.penalty_amount - due.waived_amount
        settled = q2(document["grand_total"]) - q2(document["amount_due"])
        settled = max(min(q2(settled), owed), q2(0))
        before = due.status
        today = tenant_today(ctx.tenant)
        if settled >= owed:
            status, paid_on = DueStatus.PAID.value, due.paid_on or today
        else:
            status = open_status(due=due, grace_days=due.schedule.grace_days, today=today)
            paid_on = None
        if (settled, status, paid_on) == (due.settled_amount, due.status, due.paid_on):
            return
        DuesDue.objects.filter(pk=due.pk).update(
            settled_amount=settled, status=status, paid_on=paid_on
        )
        due.settled_amount, due.status, due.paid_on = settled, status, paid_on
        _changed(ctx, due, before)

    def labels(self, *, tenant: Any, ids: Any) -> dict:
        dues = list(
            DuesDue.objects.for_tenant(tenant).select_related("schedule").filter(pk__in=ids)
        )
        return _labels_for(dues)


def resolve_dues(ids: set[str]) -> dict[str, dict]:
    """LED-10 — a `dues_due` khata line reads "Subject · Oct 2026" (FRD DUE-02 §8)."""
    dues = list(DuesDue.objects.select_related("schedule").filter(pk__in=ids))
    labels = _labels_for(dues)
    return {
        str(due.id): {"number": labels[due.id], "status": due.status, "kind": SOURCE_DUE}
        for due in dues
    }


def resolve_components(ids: set[str]) -> dict[str, dict]:
    """The same for an expectation component's interest or fee line."""
    rows = list(DuesDueComponent.objects.select_related("due__schedule").filter(pk__in=ids))
    labels = _labels_for([row.due for row in rows])
    return {
        str(row.id): {
            "number": labels[row.due_id],
            "status": row.due.status,
            "kind": SOURCE_COMPONENT,
        }
        for row in rows
    }
