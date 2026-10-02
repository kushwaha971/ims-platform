"""Wire shapes of the engine's reads (FRD 00 ATT-01 §6, ATT-02 §6, ATT-05 §6).

Plain functions, like the dues engine's. Dates ISO, times ISO with offset,
percentages a one-decimal string or null ("—", never a division error).

`context_label` is NOT sent on open visits (C12): the engine has no source for
it, and a key that is always empty is a claim this code cannot verify.
"""

from __future__ import annotations

from typing import Any

from apps.common.recurrence import mask_weekdays


def _iso(value: Any) -> str | None:
    return None if value is None else value.isoformat()


def party_json(party: Any) -> dict | None:
    if party is None:
        return None
    if isinstance(party, dict):
        return {"id": str(party["id"]), "name": party["name"]}
    return {"id": str(party.id), "name": party.name}


def group_json(group: Any) -> dict:
    rule = group.recurrence
    return {
        "id": str(group.id),
        "module": group.module,
        "name": group.name,
        "subject_type": group.subject_type,
        "subject_id": None if group.subject_id is None else str(group.subject_id),
        "mark_kind": group.mark_kind,
        "recurrence": (
            None
            if rule is None
            else {
                "freq": rule.freq,
                "interval": rule.interval,
                "weekdays": mask_weekdays(rule.by_weekday),
                "by_month_day": rule.by_month_day,
                "anchor": _iso(rule.anchor),
                "count": rule.count,
                "until": _iso(rule.until),
            }
        ),
        "session_start": group.session_start.strftime("%H:%M") if group.session_start else None,
        "session_minutes": group.session_minutes,
        "default_mark": group.default_mark,
        "one_per_day": group.one_per_day,
        "dedupe_minutes": group.dedupe_minutes,
        "edit_window_hours": group.edit_window_hours,
        "is_active": group.is_active,
    }


def session_json(row: dict) -> dict:
    session = row["session"]
    return {
        "id": str(session.id),
        "group_id": str(session.group_id),
        "on_date": _iso(row["on_date"]),
        "starts_at": _iso(session.starts_at),
        "ends_at": _iso(session.ends_at),
        "status": session.status,
        "cancel_reason": session.cancel_reason or None,
        "marked_count": row["marked_count"],
        "expected_count": row["expected_count"],
    }


def mark_json(mark: Any) -> dict:
    return {
        "id": str(mark.id),
        "module": mark.module,
        "party": party_json(mark.party),
        "group_id": None if mark.group_id is None else str(mark.group_id),
        "session_id": None if mark.session_id is None else str(mark.session_id),
        "on_date": _iso(mark.on_date),
        "status": mark.status,
        "check_in_at": _iso(mark.check_in_at),
        "check_out_at": _iso(mark.check_out_at),
        "auto_closed": mark.auto_closed,
        "method": mark.method,
        "context_type": mark.context_type,
        "context_id": None if mark.context_id is None else str(mark.context_id),
        "overridden": mark.override_reason is not None,
        "override_reason": mark.override_reason,
    }


def open_visit_json(mark: Any) -> dict:
    return {
        "mark_id": str(mark.id),
        "module": mark.module,
        "party": party_json(mark.party),
        "check_in_at": _iso(mark.check_in_at),
        "on_date": _iso(mark.on_date),
        "context_type": mark.context_type,
        "context_id": None if mark.context_id is None else str(mark.context_id),
    }


def register_json(grid: dict) -> dict:
    group = grid["group"]
    return {
        "group": {"id": str(group.id), "name": group.name, "module": group.module},
        "month": grid["month"],
        "columns": [
            {
                "key": column["key"],
                "date": _iso(column["date"]),
                "session_id": None if column["session_id"] is None else str(column["session_id"]),
                "kind": column["kind"],
                "starts_at": _iso(column["starts_at"]),
            }
            for column in grid["columns"]
        ],
        "rows": [
            {"party": party_json(row["party"]), "cells": row["cells"]} for row in grid["rows"]
        ],
    }


def percent_json(row: dict) -> dict:
    return {
        "party": party_json(row["party"]),
        "held": row["held"],
        "attended": row["attended"],
        "excused": row["excused"],
        "percent": None if row["percent"] is None else str(row["percent"]),
    }
