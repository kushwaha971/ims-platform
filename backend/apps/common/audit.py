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
    # PTY-06 §16 — emitted IN ADDITION to `party.updated` when a credit limit or
    # its payment terms change. A limit is a financial control rather than a
    # field, and an auditor asking "when did this customer's cap move, and what
    # did they owe at the time" should not have to read every party edit to find
    # out. `balance_at_change` is in the metadata for exactly that question: it
    # is not recoverable later, because the balance moves.
    CREDIT_LIMIT_SET = "credit.limit.set"
    # ── Sprint 4: LED-01 (17-02 §16) ───────────────────────────────────────
    #
    # `after` is the full row, which is what an append-only table's audit means:
    # there is no `before`, because there was nothing before, and there will
    # never be an update to diff against.
    LEDGER_ENTRY_CREATED = "ledger.entry.created"
    # Written IN ADDITION to the entry's own row when an owner posts past a
    # blocking credit limit (LED-01 FR-7). Its own action rather than a flag on
    # the create, because "who has ever lent past a limit" is a question about a
    # rare deliberate act, and filtering every entry create by a metadata key
    # makes the rare event as hard to find as the common one.
    CREDIT_LIMIT_OVERRIDDEN = "ledger.credit_limit.overridden"
    # ── Sprint 4: LED-03 (17-02 §16) ───────────────────────────────────────
    #
    # These two carry a `before` as well as an `after`, which nothing else in
    # the ledger does — because they are the only events that CHANGE a posted
    # line rather than adding one. §16 asks for 7 years of retention on them,
    # which is the retention a financial correction needs: "who changed this
    # number, when, and what did they say the reason was" is the question an
    # auditor arrives with, and the answer has to outlive everyone involved.
    LEDGER_ENTRY_REVERSED = "ledger.entry.reversed"
    LEDGER_ENTRY_CORRECTED = "ledger.entry.corrected"
    # ── Sprint 4: LED-04 / LED-09 (17-02 §16) ──────────────────────────────
    #
    # Reading a statement or the aging report is not audited — §16 rules it out
    # on volume. Leaving with one in a file is: a statement is a customer's
    # whole account with the shop and the aging export is the shop's debtor
    # list, and "who took it, and which one" is answerable only if the
    # parameters and the row count are written at the moment it left.
    LEDGER_STATEMENT_EXPORTED = "ledger.statement.exported"
    LEDGER_AGING_EXPORTED = "ledger.aging.exported"
    # ── Sprint 5: LED-05 … LED-08 (17-02 §16) ──────────────────────────────
    #
    # LED-05 §16: the system clearing a collection date because the balance
    # reached zero is its own action (with `actor_type='system'`), so "why did
    # the date disappear" is answered by a row rather than by an inference.
    PARTY_COLLECTION_DATE_CLEARED = "party.collection_date_cleared"
    # LED-06 §16 / LED-07 §16 — minimal, per Part 21 §21.7. Individual message
    # deliveries are NOT audited (NTF-02 §16); they are the message log.
    REMINDER_SENT = "reminder.sent"
    REMINDER_FAILED = "reminder.failed"
    REMINDER_DONE = "reminder.done"
    REMINDER_DISMISSED = "reminder.dismissed"
    # LED-07 §16 — the two ledger messaging toggles. The string is Part 21's
    # generic settings action, so a future `PUT /tenants/current/settings`
    # writes the same word for the same event.
    TENANT_SETTINGS_UPDATED = "tenant.settings.updated"
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
