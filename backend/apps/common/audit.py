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

    # ── Sprint 1: PLT-01 / PLT-02 (17-01 §16) ──────────────────────────────
    OTP_REQUESTED = "auth.otp_requested"
    OTP_FAILED = "auth.otp_failed"
    LOGIN_SUCCEEDED = "auth.login_succeeded"
    LOGIN_FAILED = "auth.login_failed"
    USER_CREATED = "auth.user_created"
    PASSWORD_SET = "auth.password_set"
    PASSWORD_CHANGED = "auth.password_changed"
    PASSWORD_RESET = "auth.password_reset"
    PASSWORD_RESET_REQUESTED = "auth.password_reset_requested"
    EMAIL_VERIFY_REQUESTED = "auth.email_verify_requested"
    EMAIL_VERIFIED = "auth.email_verified"
    REFRESH_REUSE_DETECTED = "auth.refresh_reuse_detected"
    LOGGED_OUT = "auth.logged_out"
    TENANT_SWITCHED = "auth.tenant_switched"
    # ── Sprint 1: PLT-03 / PLT-04 / PLT-15 ─────────────────────────────────
    TENANT_CREATED = "tenant.created"
    TENANT_PRESET_APPLIED = "tenant.preset_applied"
    MEMBER_CREATED = "member.created"
    MEMBER_ACCEPTED = "member.accepted"
    MEMBER_DEFAULT_CHANGED = "member.default_changed"
    MEMBER_LEFT = "member.left"
    PLAN_LIMIT_HIT = "plan.limit_hit"
    PLAN_MODULES_TRIMMED = "plan.modules_trimmed"

    TENANT_UPDATED = "tenant.updated"
    MEMBER_INVITED = "member.invited"
    # Revoking was writing MEMBER_INVITED, so the audit trail said an
    # invitation had been sent at the moment it was cancelled. A revocation
    # is its own event and needs its own word.
    MEMBER_INVITE_REVOKED = "member.invite_revoked"
    # An owner created a member directly and was handed a temporary
    # password to pass on (DEC-012). The password itself is never audited.
    MEMBER_CREDENTIALS_ISSUED = "member.credentials_issued"
    MEMBER_CREDENTIALS_REGENERATED = "member.credentials_regenerated"
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
