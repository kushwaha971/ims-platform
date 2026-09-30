"""LED-06 §14 — one reminder row on the wire. Money as strings (canon rule 3)."""

from __future__ import annotations

from typing import Any


def serialize_reminder(row: Any) -> dict:
    party = row.party
    return {
        "id": str(row.id),
        "party": {"id": str(party.id), "name": party.name},
        "due_on": row.due_on.isoformat(),
        "channel": row.channel,
        "kind": row.kind,
        "status": row.status,
        "snapshot_balance": str(row.snapshot_balance) if row.snapshot_balance is not None else None,
        "note": row.note,
        "scheduled_for": row.scheduled_for.isoformat() if row.scheduled_for else None,
        "sent_at": row.sent_at.isoformat() if row.sent_at else None,
        "message_log_id": str(row.message_log_id) if row.message_log_id else None,
        "created_at": row.created_at.isoformat(),
        # ── A7 ── PLT-X06 §6: what it was about, and who was contacted.
        "module": row.module,
        "source_type": row.source_type,
        "source_id": str(row.source_id) if row.source_id else None,
        "subject_label": row.subject_label,
        "recipient": (
            {"id": str(row.recipient_party_id), "name": row.recipient_party.name}
            if row.recipient_party_id
            else None
        ),
    }
