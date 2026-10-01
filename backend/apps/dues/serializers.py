"""Wire shapes of the engine's reads (FRD 00 DUE-01 §6).

Plain functions, not DRF serializers: the shapes embed a subject label resolved
in one batched call per page (`selectors.dues.labels_for`), which a per-row
serializer field cannot do. Money is a 2-dp string, dates ISO (canon rule 3).

`late_fee_so_far` is NOT sent until DUE-04 can compute it (C-12): a key that is
always "0.00" is a claim this code cannot verify.
"""

from __future__ import annotations

from typing import Any

from apps.common.money import q2


def _money(value: Any) -> str | None:
    return None if value is None else str(q2(value))


def _date(value: Any) -> str | None:
    return None if value is None else value.isoformat()


def _party(party: Any) -> dict | None:
    return None if party is None else {"id": str(party.id), "name": party.name}


def subject_json(schedule: Any, labels: dict) -> dict:
    return {
        "type": schedule.subject_type,
        "id": str(schedule.subject_id),
        "label": labels.get((schedule.subject_type, schedule.subject_id)),
    }


def due_json(due: Any, *, labels: dict) -> dict:
    outstanding = due.amount + due.penalty_amount - due.waived_amount - due.settled_amount
    return {
        "id": str(due.id),
        "schedule_id": str(due.schedule_id),
        "module": due.module,
        "subject": subject_json(due.schedule, labels),
        "party": _party(due.party),
        "seq": due.seq,
        "period_start": _date(due.period_start),
        "period_end": _date(due.period_end),
        "period_label": due.period_label,
        "due_on": _date(due.due_on),
        "amount": _money(due.amount),
        "penalty_amount": _money(due.penalty_amount),
        "waived_amount": _money(due.waived_amount),
        "settled_amount": _money(due.settled_amount),
        "outstanding": _money(outstanding),
        "status": due.status,
        "paid_on": _date(due.paid_on),
        "document": {"id": str(due.document_id)} if due.document_id else None,
    }


def schedule_json(schedule: Any, *, labels: dict) -> dict:
    dues = list(schedule.dues.all())
    for due in dues:  # one schedule, one party: no per-row queries
        due.schedule = schedule
        due.party = schedule.party
    return {
        "id": str(schedule.id),
        "module": schedule.module,
        "plan": {"id": str(schedule.plan_id), "name": schedule.plan.name},
        "party": _party(schedule.party),
        "beneficiary_party": _party(schedule.beneficiary_party),
        "subject": subject_json(schedule, labels),
        "mode": schedule.mode,
        "posting": schedule.posting,
        "status": schedule.status,
        "ended_reason": schedule.ended_reason,
        "start_on": _date(schedule.start_on),
        "end_on": _date(schedule.end_on),
        "amount": _money(schedule.amount),
        "total": _money(schedule.total),
        "grace_days": schedule.grace_days,
        "recurrence": {
            "freq": schedule.freq,
            "interval": schedule.interval,
            "by_weekday": schedule.by_weekday,
            "by_month_day": schedule.by_month_day,
            "anchor": _date(schedule.anchor),
            "count": schedule.count,
            "until": _date(schedule.until),
            "explicit_dates": [d.isoformat() for d in schedule.explicit_dates or []],
        },
        "materialised_until": _date(schedule.materialised_until),
        "version": schedule.version,
        "heads": [
            {"seq": h.seq, "label": h.label, "amount": _money(h.amount)}
            for h in schedule.heads.all().order_by("seq")
        ],
        "dues": [due_json(due, labels=labels) for due in dues],
        "pauses": [
            {
                "id": str(p.id),
                "from_on": _date(p.from_on),
                "to_on": _date(p.to_on),
                "effect": p.effect,
                "reason": p.reason,
                "resumed_on": _date(p.resumed_on),
            }
            for p in schedule.pauses.all()
        ],
    }
