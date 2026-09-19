"""The audit writer (Part 20 §20.2.2, Part 21 §21.7).

Rule D1: `common` imports no other `apps.*` package at module level. `AuditLog`
is therefore resolved lazily through `django.apps.apps.get_model`.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from django.apps import apps

from apps.common.constants import ActorType


class AuditAction:
    """The action vocabulary (Part 21 §21.3.1: `party.created`, `invoice.issued`, …).

    Sprint 0 registers only what Sprint 0 writes; each later sprint adds its own
    constants beside these rather than inventing strings at the call site.
    """

    TENANT_UPDATED = "tenant.updated"
    MEMBER_INVITED = "member.invited"
    MEMBER_ROLE_CHANGED = "member.role_changed"
    MEMBER_REMOVED = "member.removed"
    PARTY_CREATED = "party.created"
    PARTY_UPDATED = "party.updated"
    PARTY_ARCHIVED = "party.archived"
    PARTY_RESTORED = "party.restored"
    JOB_REQUEUED = "job.requeued"
    REFERENCE_DATA_SEEDED = "platform.reference_data_seeded"


def diff_fields(
    before: Mapping[str, Any] | None,
    after: Mapping[str, Any] | None,
    *,
    fields: Iterable[str] | None = None,
) -> tuple[dict, dict]:
    """Return `(before, after)` restricted to the keys whose value changed.

    Part 21 §21.7 asks for "changed fields" on most entities and a full row on a
    few; passing whole dicts and letting this narrow them keeps the call sites
    honest about which is which.
    """
    before = dict(before or {})
    after = dict(after or {})
    keys = set(fields) if fields is not None else set(before) | set(after)
    changed = {k for k in keys if before.get(k) != after.get(k)}
    return (
        {k: _jsonable(before.get(k)) for k in sorted(changed) if k in before},
        {k: _jsonable(after.get(k)) for k in sorted(changed) if k in after},
    )


def write_audit(
    *,
    ctx: Any,
    action: str,
    entity_type: str,
    entity_id: Any = None,
    before: Mapping[str, Any] | None = None,
    after: Mapping[str, Any] | None = None,
    metadata: Mapping[str, Any] | None = None,
) -> Any:
    """Write exactly one audit row per logical event (Part 26 §26.4 R4.6).

    Called from inside the service's transaction, so an audit row never survives
    a rolled-back change and never goes missing for a committed one.
    """
    audit_log = apps.get_model("platform", "AuditLog")
    actor = getattr(ctx, "actor", None)
    meta = {
        "request_id": getattr(ctx, "request_id", None),
        "ip": getattr(ctx, "ip", None),
        "user_agent": getattr(ctx, "user_agent", None),
        **dict(getattr(ctx, "audit_meta", {}) or {}),
        **dict(metadata or {}),
    }
    return audit_log.objects.create(
        tenant=getattr(ctx, "tenant", None),
        actor=actor,
        actor_type=getattr(ctx, "actor_type", ActorType.SYSTEM),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before={k: _jsonable(v) for k, v in (before or {}).items()} or None,
        after={k: _jsonable(v) for k, v in (after or {}).items()} or None,
        metadata={k: v for k, v in meta.items() if v is not None},
    )


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return str(value)
