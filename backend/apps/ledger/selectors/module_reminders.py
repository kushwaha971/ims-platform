"""A7 — a module's reminder candidates as the reminders screen lists them (PLT-X06 §2, §6).

Buckets (§2 flow 1): a due is `due_soon` (in the next three days), `due_today`,
`overdue_7` (1–7 days), `overdue_30` (8–30) or `overdue_older` (30+); a notice
(no amount) is `notice` ("ready to collect"). Rows are sorted by due date then
subject, and each carries `allowed` and `next_allowed_at` from the module's
policy, so the list says "Next: 8:00 am" before anybody taps.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from apps.common.exceptions import ValidationFailed
from apps.ledger.services.reminder_seam import candidates_for, is_allowed, reminder_modules

DUE_SOON_DAYS = 3
BUCKETS = ("due_soon", "due_today", "overdue_7", "overdue_30", "overdue_older", "notice")


def bucket_of(candidate: dict, today: dt.date) -> str | None:
    """The candidate's bucket, or None when it is further off than `due_soon`."""
    if candidate.get("amount") is None:
        return "notice"
    days = (candidate["due_on"] - today).days
    if days == 0:
        return "due_today"
    if 0 < days <= DUE_SOON_DAYS:
        return "due_soon"
    if days > DUE_SOON_DAYS:
        return None
    late = -days
    if late <= 7:
        return "overdue_7"
    if late <= 30:
        return "overdue_30"
    return "overdue_older"


def module_due_rows(*, tenant: Any, today: dt.date, module: str, bucket: str = "") -> list[dict]:
    """The module's candidates with their bucket; 400 for a module that has no
    reminder source or is switched off (EC-4), or an unknown bucket."""
    if module not in reminder_modules(tenant):
        raise ValidationFailed({"module": ["Unknown reminder module."]})
    if bucket and bucket not in BUCKETS:
        raise ValidationFailed({"bucket": ["Unknown bucket."]})
    rows: list[dict] = []
    for candidate in candidates_for(tenant, today, module=module):
        found = bucket_of(candidate, today)
        if found is None or (bucket and found != bucket):
            continue
        rows.append({**candidate, "bucket": found})
    rows.sort(
        key=lambda row: (row["due_on"], row.get("subject_label") or "", str(row["source_id"]))
    )
    return rows


def with_allowance(tenant: Any, module: str, rows: list[dict]) -> list[dict]:
    """The wire shape for one page: names in one query, the policy per row."""
    from apps.parties.models import Party

    ids = {row["party_id"] for row in rows} | {
        row["recipient_party_id"] for row in rows if row.get("recipient_party_id")
    }
    names = dict(Party.objects.for_tenant(tenant).filter(pk__in=ids).values_list("pk", "name"))
    out = []
    for row in rows:
        allowed, upcoming = is_allowed(
            tenant=tenant, module=module, party_id=row["party_id"], source_id=row["source_id"]
        )
        recipient_id = row.get("recipient_party_id")
        amount = row.get("amount")
        out.append(
            {
                "party": {"id": str(row["party_id"]), "name": names.get(row["party_id"], "")},
                "recipient": (
                    {"id": str(recipient_id), "name": names.get(recipient_id, "")}
                    if recipient_id
                    else None
                ),
                "source_type": row["source_type"],
                "source_id": str(row["source_id"]),
                "subject_label": row.get("subject_label") or "",
                "due_on": row["due_on"].isoformat(),
                "amount": str(amount) if amount is not None else None,
                "bucket": row["bucket"],
                "allowed": allowed,
                "next_allowed_at": upcoming.isoformat() if upcoming else None,
            }
        )
    return out
