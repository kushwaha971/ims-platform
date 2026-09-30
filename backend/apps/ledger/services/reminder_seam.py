"""A7 — module reminders: sources, policies, and the one check every path makes.

FRD 00 PLT-X06, contracts §1.6, ADR-054. A module's reminder names a specific
thing — "Instalment 4 of LN-0042 · ₹5,625 due 12 Oct", "Wings of Fire is ready to
collect" — rather than a party balance. The module owns the records, so it
registers two things here from its `ready()`:

* a **source** (`register_reminder_source`) — `candidates(tenant, today)` yields
  what could be reminded about today, one `ReminderCandidate` per due or notice;
* a **policy** (`register_reminder_policy`) — the module's legal guardrail:
  a sending window, daily caps, fixed templates. Lending registers
  `window=(08:00, 19:00)`, `daily_cap_per_source=1`, `fixed_templates=True`.

**BR-1.** Every path that records, prepares or sends a reminder calls
`check_reminder_allowed` first: `/reminders/{id}/send`, `/reminders/bulk`, the
automated job, `record_source_reminders` and any vertical endpoint. Preview
records nothing and is always allowed. A module without a policy behaves as
today — no window, no cap (BR-4, owner Q5's default: no window outside lending).

**Windows are tenant-local `[start, end)`** (BR-2, EC-2), and a tenant may
NARROW a module's window through the setting `reminders.<module>.window`, never
widen it, and never below an hour (BR-5).

Nothing is sent by the product (DEC-012): "send" records that the merchant was
handed the text; the provider SMS path is the automated job's.

Registries follow ADR-042: idempotent for an equal spec, a conflict raises,
`_reset_for_tests` restores the start-up snapshot.
"""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, TypedDict

from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.db.models import Q
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_timezone
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.ledger.constants import (
    CAP_COUNTED_STATUSES,
    MIN_WINDOW_MINUTES,
    ReminderKind,
    ReminderStatus,
)


def now() -> dt.datetime:
    """The clock the policy reads. One seam, so tests move the window's hands
    without moving Django's (session tokens expire by the real clock)."""
    return timezone.now()


def today(tenant: Any) -> dt.date:
    """The tenant's date on the policy's clock — what the module lists and the
    automated job treat as today."""
    return timezone.localtime(now(), tenant_timezone(tenant)).date()


# ── Sources ──────────────────────────────────────────────────────────────────


class ReminderCandidate(TypedDict):
    party_id: uuid.UUID
    source_type: str
    source_id: uuid.UUID
    due_on: dt.date
    #: The source's CURRENT open amount for a due; `None` for a notice (BR-6).
    amount: Decimal | None
    subject_label: str
    #: A registered template code, `<module>_<purpose>` (A10's registry).
    template_key: str
    #: The guardian or payer to contact instead of the party (BR-8), or None.
    recipient_party_id: uuid.UUID | None
    #: Extra template parameters ("price", "ends_on"), strings only (R10).
    params: dict[str, str]


CandidatesFn = Callable[[Any, dt.date], Iterable[ReminderCandidate]]
LookupFn = Callable[[Any, uuid.UUID, dt.date], "ReminderCandidate | None"]


@dataclass(frozen=True)
class ReminderSource:
    source_type: str
    module: str
    candidates: CandidatesFn
    #: Optional: the one candidate for a source id, without listing them all.
    lookup: LookupFn | None = None


_SOURCES: dict[str, ReminderSource] = {}
_SOURCES_BASELINE: dict[str, ReminderSource] | None = None


def register_reminder_source(
    source_type: str,
    *,
    module: str,
    candidates: CandidatesFn,
    lookup: LookupFn | None = None,
) -> None:
    """Declare that `module` can be reminded about records of `source_type`.

    `lookup(tenant, source_id, today)` is an additive, optional fast path for a
    send or preview of one record; without it the source's candidates are
    scanned. A candidate the source no longer yields is a closed record (EC-1).
    """
    if not source_type or len(source_type) > 48 or not module:
        raise ImproperlyConfigured("A reminder source needs a short source_type and a module.")
    spec = ReminderSource(source_type, module, candidates, lookup)
    existing = _SOURCES.get(source_type)
    if existing is not None:
        if existing == spec:
            return
        raise ImproperlyConfigured(f"Reminder source {source_type!r} is already registered.")
    _SOURCES[source_type] = spec


def registered_sources() -> tuple[ReminderSource, ...]:
    return tuple(_SOURCES.values())


def _effective(tenant: Any) -> frozenset[str]:
    from apps.platform_app.services.entitlements import effective_modules

    return effective_modules(tenant)


def reminder_modules(tenant: Any) -> list[str]:
    """The enabled modules that have a reminder source, in registration order."""
    if not _SOURCES:
        return []
    effective = _effective(tenant)
    seen: dict[str, None] = {}
    for source in _SOURCES.values():
        if source.module in effective:
            seen.setdefault(source.module, None)
    return list(seen)


def sources_for(tenant: Any, module: str | None = None) -> list[ReminderSource]:
    """Sources of enabled modules (EC-4: a switched-off module's disappear)."""
    if not _SOURCES:
        return []
    effective = _effective(tenant)
    return [
        source
        for source in _SOURCES.values()
        if source.module in effective and (module is None or source.module == module)
    ]


def candidates_for(
    tenant: Any, today: dt.date, *, module: str | None = None
) -> list[ReminderCandidate]:
    """Every candidate of every enabled source — one call per source (§6)."""
    found: list[ReminderCandidate] = []
    for source in sources_for(tenant, module):
        found.extend(source.candidates(tenant, today))
    return found


def module_of_source(source_type: str) -> str | None:
    source = _SOURCES.get(source_type)
    return source.module if source else None


def find_candidate(
    tenant: Any, source_type: str, source_id: Any, today: dt.date
) -> ReminderCandidate | None:
    """The live candidate for one record, or None when it is closed or unknown."""
    source = _SOURCES.get(source_type)
    if source is None or source.module not in _effective(tenant):
        return None
    wanted = uuid.UUID(str(source_id))
    if source.lookup is not None:
        return source.lookup(tenant, wanted, today)
    for candidate in source.candidates(tenant, today):
        if uuid.UUID(str(candidate["source_id"])) == wanted:
            return candidate
    return None


def _reset_sources_for_tests() -> None:  # pragma: no cover - test helper
    global _SOURCES_BASELINE
    if _SOURCES_BASELINE is None:
        _SOURCES_BASELINE = dict(_SOURCES)
    _SOURCES.clear()
    _SOURCES.update(_SOURCES_BASELINE)


# ── Policies ─────────────────────────────────────────────────────────────────


class ReminderPolicy(TypedDict, total=False):
    #: Tenant-local, inclusive start, exclusive end.
    window: tuple[dt.time, dt.time] | None
    daily_cap_per_source: int | None
    daily_cap_per_party: int | None
    #: Free text refused: the sheet shows the text read-only and hides the note.
    fixed_templates: bool
    #: Enforced by a TEMPLATE test over the module's registered templates (BR-9).
    forbidden_words: frozenset[str]


_POLICIES: dict[str, ReminderPolicy] = {}
_POLICIES_BASELINE: dict[str, ReminderPolicy] | None = None


def register_reminder_policy(module: str, policy: ReminderPolicy) -> None:
    window = policy.get("window")
    if window is not None and not (
        isinstance(window, tuple) and len(window) == 2 and window[0] < window[1]
    ):
        raise ImproperlyConfigured(f"{module}: a window is (start, end) with start < end.")
    for cap in ("daily_cap_per_source", "daily_cap_per_party"):
        value = policy.get(cap)
        if value is not None and (not isinstance(value, int) or value < 1):
            raise ImproperlyConfigured(f"{module}: {cap} is a positive integer or None.")
    existing = _POLICIES.get(module)
    if existing is not None:
        if existing == policy:
            return
        raise ImproperlyConfigured(f"A reminder policy for {module!r} is already registered.")
    _POLICIES[module] = dict(policy)  # type: ignore[assignment]


def registered_policy(module: str) -> ReminderPolicy | None:
    return _POLICIES.get(module)


def _reset_policies_for_tests() -> None:  # pragma: no cover - test helper
    global _POLICIES_BASELINE
    if _POLICIES_BASELINE is None:
        _POLICIES_BASELINE = dict(_POLICIES)
    _POLICIES.clear()
    _POLICIES.update(_POLICIES_BASELINE)


def window_setting_key(module: str) -> str:
    return f"reminders.{module}.window"


def _parse_hhmm(raw: Any) -> dt.time | None:
    if not isinstance(raw, str):
        return None
    try:
        return dt.time.fromisoformat(raw.strip())
    except ValueError:
        return None


def _fmt(value: dt.time) -> str:
    return value.strftime("%H:%M")


def _minutes(value: dt.time) -> int:
    return value.hour * 60 + value.minute


def validate_window(module: str, raw: Any) -> tuple[dt.time, dt.time] | None:
    """A tenant's narrowing of `module`'s window, or None to clear it (BR-5).

    `["09:00", "18:00"]` or `{"start": …, "end": …}`. Refused when the module has
    no window to narrow, when it is wider than the policy's, or under an hour.
    """
    key = window_setting_key(module)
    if raw is None:
        return None
    policy = registered_policy(module) or {}
    base = policy.get("window")
    if base is None:
        raise ValidationFailed({key: ["This feature has no sending hours to narrow."]})
    if isinstance(raw, dict):
        raw = [raw.get("start"), raw.get("end")]
    if not isinstance(raw, (list, tuple)) or len(raw) != 2:
        raise ValidationFailed({key: ["Give a start and an end time, like 09:00 and 18:00."]})
    start, end = _parse_hhmm(raw[0]), _parse_hhmm(raw[1])
    if start is None or end is None or start >= end:
        raise ValidationFailed({key: ["The start must be before the end."]})
    if start < base[0] or end > base[1]:
        raise ValidationFailed(
            {key: [f"Can only be narrower than {_fmt(base[0])}–{_fmt(base[1])}."]}
        )
    if _minutes(end) - _minutes(start) < MIN_WINDOW_MINUTES:
        raise ValidationFailed({key: ["Keep at least one hour."]})
    return start, end


def _stored_window(tenant: Any, module: str) -> tuple[dt.time, dt.time] | None:
    from apps.platform_app.models import TenantSetting

    row = (
        TenantSetting.objects.filter(tenant=tenant, key=window_setting_key(module))
        .only("value")
        .first()
    )
    if row is None:
        return None
    value = row.value.get("value") if isinstance(row.value, dict) else row.value
    try:
        return validate_window(module, value)
    except ValidationFailed:
        return None  # a stale or hand-edited row never WIDENS the window


def effective_policy(tenant: Any, module: str) -> ReminderPolicy:
    """The registered policy, its window narrowed by the tenant's setting (§6)."""
    policy = registered_policy(module)
    if policy is None:
        return {}
    result: ReminderPolicy = dict(policy)  # type: ignore[assignment]
    if policy.get("window") is not None:
        narrowed = _stored_window(tenant, module)
        if narrowed is not None:
            result["window"] = narrowed
    return result


# ── The check (BR-1 … BR-4) ──────────────────────────────────────────────────


def _local(tenant: Any, at: dt.datetime) -> dt.datetime:
    return timezone.localtime(at, tenant_timezone(tenant))


def _day_bounds(tenant: Any, day: dt.date) -> tuple[dt.datetime, dt.datetime]:
    zone = tenant_timezone(tenant)
    start = dt.datetime.combine(day, dt.time.min, tzinfo=zone)
    return start, start + dt.timedelta(days=1)


def _count_on_day(tenant: Any, day: dt.date, *, exclude_id: Any = None, **filters: Any) -> int:
    from apps.ledger.models import Reminder

    start, end = _day_bounds(tenant, day)
    rows = (
        Reminder.objects.for_tenant(tenant)
        .filter(status__in=CAP_COUNTED_STATUSES, **filters)
        .alias(when=Coalesce("sent_at", "scheduled_for"))
        .filter(when__gte=start, when__lt=end)
    )
    if exclude_id is not None:
        rows = rows.exclude(pk=exclude_id)
    return rows.count()


def _refusal(
    tenant: Any,
    module: str,
    policy: ReminderPolicy,
    *,
    party_id: Any,
    source_id: Any,
    at: dt.datetime,
    exclude_id: Any = None,
) -> tuple[str, dict] | None:
    local = _local(tenant, at)
    window = policy.get("window")
    if window is not None and not (window[0] <= local.time() < window[1]):
        return "reminder_outside_window", {
            "window_start": _fmt(window[0]),
            "window_end": _fmt(window[1]),
        }
    per_source = policy.get("daily_cap_per_source")
    if per_source and source_id is not None:
        used = _count_on_day(
            tenant, local.date(), exclude_id=exclude_id, module=module, source_id=source_id
        )
        if used >= per_source:
            return "reminder_cap_reached", {"cap": per_source}
    per_party = policy.get("daily_cap_per_party")
    if per_party:
        used = _count_on_day(
            tenant, local.date(), exclude_id=exclude_id, module=module, party_id=party_id
        )
        if used >= per_party:
            return "reminder_cap_reached", {"cap": per_party}
    return None


def next_allowed_at(
    *,
    tenant: Any,
    module: str,
    party_id: Any,
    source_id: Any,
    after: dt.datetime,
    exclude_id: Any = None,
) -> dt.datetime:
    """The first moment at or after `after` a reminder would be allowed.

    A window refusal moves to the window's start (today's when before it, the
    next day's when after it — BR-2); a cap refusal moves to the next day's
    first allowed moment. A handful of steps settles it: a future day has no
    reminders counted yet.
    """
    policy = effective_policy(tenant, module)
    moment = after
    for _ in range(8):
        refused = _refusal(
            tenant,
            module,
            policy,
            party_id=party_id,
            source_id=source_id,
            at=moment,
            exclude_id=exclude_id,
        )
        if refused is None:
            return moment
        local = _local(tenant, moment)
        window = policy.get("window")
        start_time = window[0] if window else dt.time.min
        code, _details = refused
        zone = tenant_timezone(tenant)
        if code == "reminder_outside_window" and window and local.time() < window[0]:
            moment = dt.datetime.combine(local.date(), start_time, tzinfo=zone)
        else:
            moment = dt.datetime.combine(
                local.date() + dt.timedelta(days=1), start_time, tzinfo=zone
            )
    return moment  # pragma: no cover - a policy that refuses every day


def check_reminder_allowed(
    *,
    tenant: Any,
    module: str,
    party_id: Any,
    source_id: Any,
    at: dt.datetime | None = None,
    exclude_id: Any = None,
) -> None:
    """Raise 409 `reminder_outside_window` or `reminder_cap_reached`, or return.

    `exclude_id` leaves out the row being sent itself: a `scheduled` row counts
    towards the cap (BR-3), and must not refuse its own send. No policy — every
    party reminder, and every module that registered none — returns at once,
    without a query.
    """
    if not module:
        return
    policy = effective_policy(tenant, module)
    if not policy:
        return
    at = at or now()
    refused = _refusal(
        tenant,
        module,
        policy,
        party_id=party_id,
        source_id=source_id,
        at=at,
        exclude_id=exclude_id,
    )
    if refused is None:
        return
    code, details = refused
    upcoming = next_allowed_at(
        tenant=tenant,
        module=module,
        party_id=party_id,
        source_id=source_id,
        after=at,
        exclude_id=exclude_id,
    )
    details = {**details, "next_allowed_at": _local(tenant, upcoming).isoformat()}
    local_next = _local(tenant, upcoming).strftime("%d/%m/%Y %H:%M")
    message = (
        f"Reminders for this can be sent between {details['window_start']} and "
        f"{details['window_end']}. Next: {local_next}."
        if code == "reminder_outside_window"
        else f"The daily limit of {details['cap']} is used. Next: {local_next}."
    )
    raise BusinessRuleViolation(code, message, details=details)


def is_allowed(
    *, tenant: Any, module: str, party_id: Any, source_id: Any, at: dt.datetime | None = None
) -> tuple[bool, dt.datetime | None]:
    """`(allowed, next_allowed_at)` for a list row, without raising."""
    try:
        check_reminder_allowed(
            tenant=tenant, module=module, party_id=party_id, source_id=source_id, at=at
        )
    except BusinessRuleViolation as refusal:
        return False, dt.datetime.fromisoformat(refusal.details["next_allowed_at"])
    return True, None


# ── Recording several sources as one message (R10) ───────────────────────────


@transaction.atomic
def record_source_reminders(
    *,
    ctx: Ctx,
    party_id: Any,
    recipient_party_id: Any,
    module: str,
    kind: str,
    channel: str,
    sources: list[dict],
    text: str,
    at: dt.datetime | None = None,
) -> list[Any]:
    """One row per source, sharing `message_group_id` — "3 books overdue" is one
    message about three loans, and each loan's own history must show it.

    `sources`: `[{source_type, source_id, subject_label, amount}]`. The check runs
    once per source BEFORE anything is written, so one refused source refuses
    the whole message rather than recording half of it. `kind` becomes
    `notice` when every amount is None. Rows are `sent` (the merchant was
    handed the text); `text` is kept in the audit row, not on the reminder.
    """
    from apps.ledger.models import Reminder
    from apps.parties.models import Party

    if not sources:
        raise ValidationFailed({"sources": ["Name at least one record."]})
    party = Party.objects.for_tenant(ctx.tenant).filter(pk=party_id).first()
    if party is None:
        raise ValidationFailed({"party_id": ["No such party."]})
    if recipient_party_id is not None and not (
        Party.objects.for_tenant(ctx.tenant).filter(pk=recipient_party_id).exists()
    ):
        raise ValidationFailed({"recipient_party_id": ["No such party."]})
    moment = at or now()
    for source in sources:
        check_reminder_allowed(
            tenant=ctx.tenant,
            module=module,
            party_id=party.pk,
            source_id=source.get("source_id"),
            at=moment,
        )
    if all(source.get("amount") is None for source in sources):
        kind = ReminderKind.NOTICE
    group = uuid.uuid4() if len(sources) > 1 else None
    today = _local(ctx.tenant, moment).date()
    rows = [
        Reminder.objects.create(
            tenant=ctx.tenant,
            created_by=ctx.actor if ctx.actor_type == "user" else None,
            party=party,
            recipient_party_id=recipient_party_id,
            due_on=source.get("due_on") or today,
            channel=channel,
            kind=kind,
            status=ReminderStatus.SENT,
            module=module,
            source_type=source["source_type"],
            source_id=source["source_id"],
            subject_label=(source.get("subject_label") or "")[:120],
            snapshot_balance=None if kind == ReminderKind.NOTICE else source.get("amount"),
            message_group_id=group,
            scheduled_for=moment,
            sent_at=moment,
        )
        for source in sources
    ]
    for row in rows:
        write_audit(
            ctx=ctx,
            action=AuditAction.REMINDER_SENT,
            entity_type="ledger_reminder",
            entity_id=row.id,
            metadata={
                "channel": channel,
                "kind": row.kind,
                "module": module,
                "source_type": row.source_type,
                "source_id": str(row.source_id),
                "message_group_id": str(group) if group else None,
                "text": text[:1000],
            },
        )
    return rows


# ── A6's relation history (who has USED a guardian/payer link) ───────────────


def relation_reminder_count(relation: Any) -> int:
    """Reminders that went to `relation.related_party` about `relation.party`.

    Registered with `parties.services.relations.register_relation_history`, so
    a used link is ended rather than deleted and "who was told" survives.
    """
    from apps.ledger.models import Reminder

    return (
        Reminder.objects.filter(
            tenant_id=relation.tenant_id,
            party_id=relation.party_id,
            recipient_party_id=relation.related_party_id,
        )
        .filter(~Q(status=ReminderStatus.CANCELLED))
        .count()
    )
