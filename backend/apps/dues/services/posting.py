"""`post_due` — the ONE routine that turns a scheduled due into money owed (FRD DUE-02 §6, §9).

DUE-01 built the `charge/ledger` branch and the zero branch (Q-D6, C-10);
DUE-02 adds the other two here, beside them, rather than a second routine:

* `charge/document` — `issue_document` through the port with origin
  `("dues_due", due.id)`, dated the due's own date, `credit_check="skip"`
  (ADR-048: an agreed fee is not a counter sale the limit can refuse; a crossed
  limit comes back in the port's warnings) and `apply_open_advances` from the
  snapshot. `amount := grand_total`, and an invoice that advances paid at issue
  leaves the due `settled` by `grand_total − amount_due`. The port is idempotent
  per origin under the party lock, so a retried run gets the standing invoice.
* `expectation` — each non-principal component posts as its own source
  `("dues_component", component.id)`, `INTEREST` or `CHARGE`, bucket `loan`
  (contracts §1.2 rule 2). The principal never posts: the loan's disbursement
  already put it in the khata, and posting it again would count it twice.

The caller holds the transaction and has LOCKED the party (lock order: party →
schedule → dues → the port's documents → payments → sequence). The status
change is a conditional update on `status='scheduled'`, so a second call is a
no-op on top of the ledger's `(source_type, source_id, entry_type)` and the
port's `(origin_type, origin_id)` idempotency.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.money import q2, sum_money
from apps.dues.constants import SOURCE_COMPONENT, SOURCE_DUE, Component, DueStatus, Mode, Posting
from apps.dues.models import DuesDue, DuesDueComponent
from apps.dues.registry import subject_for, subject_labels


def due_note(*, subject_label: str | None, period_label: str) -> str:
    """ "Membership · Oct 2026" — the khata line a merchant reads."""
    return f"{subject_label} · {period_label}" if subject_label else period_label


def post_due(
    *,
    ctx: Any,
    due: DuesDue,
    party: Any,
    today: dt.date | None = None,
    subject_label: str | None = None,
) -> DuesDue:
    """Post one `scheduled` due dated on or before today. Returns the due, refreshed.

    `party` is the LOCKED party row. The entry is dated the due's own `due_on`
    (BR-7: catch-up lines carry their own dates, never today's).
    """
    today = today or tenant_today(ctx.tenant)
    if due.status != DueStatus.SCHEDULED or due.due_on > today:
        return due
    schedule = due.schedule  # the snapshot: posting mode and grace (BR-3)
    if subject_label is None:
        subject_label = subject_labels(schedule.subject_type, {schedule.subject_id}).get(
            schedule.subject_id
        )
    note = due_note(subject_label=subject_label, period_label=due.period_label)
    changes: dict[str, Any]
    if due.amount == 0:
        # BR-10: nothing to post (`post_source_entry` refuses 0); paid on its date.
        changes = {"status": DueStatus.PAID.value, "paid_on": due.due_on}
    elif schedule.posting == Posting.LEDGER:
        changes = _post_ledger(ctx=ctx, due=due, party=party, note=note)
    elif schedule.posting == Posting.DOCUMENT:
        changes = _post_document(ctx=ctx, due=due, schedule=schedule, note=note)
    elif schedule.mode == Mode.EXPECTATION:
        changes = _post_expectation(ctx=ctx, due=due, party=party, note=note)
    else:  # pragma: no cover - the mode/posting CHECK makes this unreachable
        raise ValueError(f"no posting for {schedule.mode!r}/{schedule.posting!r}")
    if "status" not in changes and due.amount > 0 and _prepaid(due):
        # DUE-03 EC-2 — an instalment prepaid in full before its date posts its
        # non-principal components like any other and is paid on its own date.
        changes.update(status=DueStatus.PAID.value, paid_on=due.due_on)
    if "status" not in changes:
        changes["status"] = open_status(due=due, grace_days=schedule.grace_days, today=today)
    before = due.status
    updated = DuesDue.objects.filter(pk=due.pk, status=DueStatus.SCHEDULED).update(**changes)
    if updated:
        for key, value in changes.items():
            setattr(due, key, value)
        write_audit(
            ctx=ctx,
            action=AuditAction.DUES_DUE_POSTED,
            entity_type="dues_due",
            entity_id=due.id,
            after={"status": due.status, "amount": due.amount, "due_on": due.due_on},
            metadata={
                "schedule_id": str(due.schedule_id),
                "posted_entry_id": str(due.posted_entry_id) if due.posted_entry_id else None,
                "document_id": str(due.document_id) if due.document_id else None,
            },
        )
        # Contracts §5: the subject hears of every status change, in this
        # transaction, so a vertical can act on "overdue" (QA-DUE-01-6).
        subject = subject_for(schedule.subject_type)
        if subject is not None and subject.on_due_changed is not None:
            subject.on_due_changed(ctx, due, before, due.status)
    return due


def _prepaid(due: DuesDue) -> bool:
    from apps.dues.services.settlement import outstanding

    return due.settled_amount > 0 and outstanding(due) <= 0


def open_status(*, due: DuesDue, grace_days: int, today: dt.date) -> str:
    """`due`, or `overdue` once `due_on + grace_days < today` (catch-up posts
    straight to overdue; FRD DUE-02 step 2)."""
    late = due.due_on + dt.timedelta(days=grace_days) < today
    return (DueStatus.OVERDUE if late else DueStatus.DUE).value


def _post_ledger(*, ctx: Any, due: DuesDue, party: Any, note: str) -> dict[str, Any]:
    from apps.ledger.constants import EntryType
    from apps.ledger.services.postings import post_source_entry

    entry, _balance = post_source_entry(
        ctx=ctx,
        party=party,
        amount=due.amount,
        entry_date=due.due_on,
        entry_type=EntryType.CHARGE,
        source_type=SOURCE_DUE,
        source_id=due.id,
        note=note,
        bucket="shop",  # DEC-019
    )
    return {"posted_entry_id": entry.id}


#: R54 — the only keys a subject's `line_hook` may override.
LINE_HOOK_KEYS = ("description", "hsn_sac", "tax_code")


def document_lines(*, ctx: Any, due: DuesDue, schedule: Any, note: str) -> list[dict]:
    """The invoice lines of one due: the schedule's heads when they add up to
    the due's amount (a stub or an `amount_hook` price does not), else one line;
    then the subject's `line_hook` overlay (R54)."""
    terms = schedule.terms or {}
    base: dict[str, Any] = {
        "qty": Decimal("1"),
        "tax_inclusive": bool(terms.get("tax_inclusive")),
        "hsn_sac": terms.get("hsn_sac") or None,
        "tax_code": terms.get("tax_code") or None,
    }
    heads = [h for h in schedule.heads.all().order_by("seq") if h.amount > 0]
    if heads and sum_money(h.amount for h in heads) == due.amount:
        lines = [
            {**base, "description": f"{note} · {h.label}"[:255], "unit_price": h.amount}
            for h in heads
        ]
    else:
        lines = [{**base, "description": note[:255], "unit_price": due.amount}]
    subject = subject_for(schedule.subject_type)
    if subject is not None and subject.line_hook is not None:
        overrides = subject.line_hook(ctx.tenant, due) or {}
        for line in lines:
            line.update({k: overrides[k] for k in LINE_HOOK_KEYS if k in overrides})
    return lines


def _post_document(*, ctx: Any, due: DuesDue, schedule: Any, note: str) -> dict[str, Any]:
    from apps.common.seams.documents import issue_document

    issued = issue_document(
        ctx=ctx,
        request={
            "origin_type": SOURCE_DUE,
            "origin_id": due.id,
            "party_id": due.party_id,
            "document_date": due.due_on,
            "due_on": due.due_on,
            "lines": document_lines(ctx=ctx, due=due, schedule=schedule, note=note),
            "credit_check": "skip",
            "apply_open_advances": bool((schedule.terms or {}).get("auto_apply_advance", True)),
        },
    )
    grand_total = q2(issued["grand_total"])
    settled = q2(grand_total - q2(issued["amount_due"]))
    changes: dict[str, Any] = {
        "document_id": issued["document_id"],
        "amount": grand_total,
        "settled_amount": settled,
    }
    if settled >= grand_total:
        # Open advances paid the whole invoice as it was issued.
        changes.update(status=DueStatus.PAID.value, paid_on=due.due_on)
    return changes


def _post_expectation(*, ctx: Any, due: DuesDue, party: Any, note: str) -> dict[str, Any]:
    from apps.ledger.constants import EntryType
    from apps.ledger.services.postings import post_source_entry

    for component in due.components.all().order_by("component"):
        if (
            component.component == Component.PRINCIPAL
            or component.amount <= 0
            or component.posted_entry_id is not None
        ):
            continue
        entry_type = (
            EntryType.INTEREST if component.component == Component.INTEREST else EntryType.CHARGE
        )
        entry, _balance = post_source_entry(
            ctx=ctx,
            party=party,
            amount=component.amount,
            entry_date=due.due_on,
            entry_type=entry_type,
            source_type=SOURCE_COMPONENT,
            source_id=component.id,
            note=note,
            bucket="loan",
        )
        DuesDueComponent.objects.filter(pk=component.pk).update(posted_entry_id=entry.id)
    return {}
