"""`post_due` — the ONE routine that turns a scheduled due into money owed (FRD DUE-02 §6).

DUE-01 owns the `charge/ledger` branch and the zero branch (Q-D6, C-10), so a
confirmed backdated schedule really posts in DUE-01; DUE-02 adds the `document`
and `expectation` branches here, beside them, rather than a second routine.

The caller holds the transaction and has LOCKED the party (lock order: party →
schedule → dues). The status change is a conditional update on
`status='scheduled'`, so a second call is a no-op on top of the ledger's own
idempotency by `(source_type, source_id, entry_type)`.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.dues.constants import SOURCE_DUE, DueStatus, Posting
from apps.dues.models import DuesDue
from apps.dues.registry import subject_for, subject_labels


class PostingNotBuilt(RuntimeError):
    """A posting branch whose task has not landed (C-10). A programming error."""


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
    from apps.ledger.constants import EntryType
    from apps.ledger.services.postings import post_source_entry

    today = today or tenant_today(ctx.tenant)
    if due.status != DueStatus.SCHEDULED or due.due_on > today:
        return due
    schedule = due.schedule  # the snapshot: posting mode and grace (BR-3)
    posting, grace_days = schedule.posting, schedule.grace_days
    changes: dict[str, Any]
    if due.amount == 0:
        # BR-10: nothing to post (`post_source_entry` refuses 0); paid on its date.
        changes = {"status": DueStatus.PAID.value, "paid_on": due.due_on}
    elif posting == Posting.LEDGER:
        if subject_label is None:
            subject_label = subject_labels(schedule.subject_type, {schedule.subject_id}).get(
                schedule.subject_id
            )
        entry, _balance = post_source_entry(
            ctx=ctx,
            party=party,
            amount=due.amount,
            entry_date=due.due_on,
            entry_type=EntryType.CHARGE,
            source_type=SOURCE_DUE,
            source_id=due.id,
            note=due_note(subject_label=subject_label, period_label=due.period_label),
            bucket="main",
        )
        overdue = due.due_on + dt.timedelta(days=grace_days) < today
        changes = {
            "status": (DueStatus.OVERDUE if overdue else DueStatus.DUE).value,
            "posted_entry_id": entry.id,
        }
    else:
        raise PostingNotBuilt(f"{posting!r} posting arrives with DUE-02")
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
            },
        )
        # Contracts §5: the subject hears of every status change, in this
        # transaction, so a vertical can act on "overdue" (QA-DUE-01-6).
        subject = subject_for(schedule.subject_type)
        if subject is not None and subject.on_due_changed is not None:
            subject.on_due_changed(ctx, due, before, due.status)
    return due
