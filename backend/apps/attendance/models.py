"""The attendance engine's six tables (contracts §2.3, FRD 00 ATT-01…04, R18).

All six land in `0001` because FRD ATT-01 §5 specifies the engine's schema once.

── Marks are not money (ADR-050) ────────────────────────────────────────────
A mark is editable within a window, with audit; there is no append-only
trigger here. What IS a cache is `attendance_entitlement.used`, which must
equal Σ `attendance_entitlement_use.delta` — `manage.py recalc_entitlements`
replays it, the `recalc_balances` pattern.

── Recurrence is optional on a group (C17) ──────────────────────────────────
The FRD names an `OptionalRecurrenceFields` mixin that does not exist. `Group`
includes `RecurrenceFields` and overrides `freq` and `anchor` as nullable; the
mixin's CHECKs evaluate to NULL (which Postgres passes) on a group with no
rule, and an all-or-none CHECK keeps the two together. `Meta` spreads
`RecurrenceFields.Meta.constraints`, because a child list REPLACES the mixin's.

── One entitlement use per mark transition, not per sign (C3) ──────────────
The FRD's unique `(mark_id, delta)` forbids present → absent → present, which
ATT-04 BR-4 explicitly allows (it needs a second `+1` for the same mark). So a
use row carries `seq` (0, 1, 2 … per mark) and `(mark_id, seq)` is unique; the
service keeps Σ delta per mark in {0, 1}.

── No FK where the other side is not ours ───────────────────────────────────
`subject_id`, `context_id` and `booking_unit_id` are uuids: a vertical's row
and the bookings engine's unit are tables this engine may not import (L1).
"""

from __future__ import annotations

from django.db import models
from django.db.models import F, Q

from apps.attendance.constants import (
    CONTEXT_TYPE_MAX,
    MODULE_MAX,
    NAME_MAX,
    REASON_MAX,
    REASON_MIN,
    SUBJECT_TYPE_MAX,
    DefaultMark,
    MarkKind,
    MarkStatus,
    Method,
    SessionStatus,
)
from apps.common.db.recurrence import RecurrenceFields
from apps.common.models import TenantModel
from apps.common.recurrence import Recurrence


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


class Group(TenantModel, RecurrenceFields):
    """A class, batch or desk ("Morning yoga, Mon/Wed/Fri 6 am"; gym's "Front desk")."""

    module = models.CharField(max_length=MODULE_MAX)
    name = models.CharField(max_length=NAME_MAX)
    subject_type = models.CharField(max_length=SUBJECT_TYPE_MAX, default="", blank=True)
    subject_id = models.UUIDField(null=True, blank=True)
    mark_kind = models.CharField(max_length=8)
    # C17: the mixin's two NOT NULL columns, nullable here (a group may have no rule).
    freq = models.CharField(max_length=8, null=True, blank=True)
    anchor = models.DateField(null=True, blank=True)
    session_start = models.TimeField(null=True, blank=True)
    session_minutes = models.SmallIntegerField(null=True, blank=True)
    default_mark = models.CharField(max_length=8, default=DefaultMark.PRESENT)
    one_per_day = models.BooleanField(default=False)
    dedupe_minutes = models.SmallIntegerField(default=5)
    edit_window_hours = models.SmallIntegerField(default=24)
    is_active = models.BooleanField(default=True)

    class Meta(RecurrenceFields.Meta):
        abstract = False
        db_table = "attendance_group"
        constraints = [
            *RecurrenceFields.Meta.constraints,
            models.CheckConstraint(
                condition=_in("mark_kind", MarkKind), name="ck_attendance_group_mark_kind"
            ),
            models.CheckConstraint(
                condition=_in("default_mark", DefaultMark),
                name="ck_attendance_group_default_mark",
            ),
            models.CheckConstraint(
                condition=Q(freq__isnull=True, anchor__isnull=True)
                | Q(freq__isnull=False, anchor__isnull=False),
                name="ck_attendance_group_rule_all_or_none",
            ),
            models.CheckConstraint(
                condition=Q(freq__isnull=True, session_start__isnull=True)
                | Q(freq__isnull=False, session_start__isnull=False),
                name="ck_attendance_group_rule_has_start",
            ),
            models.CheckConstraint(
                condition=Q(session_start__isnull=True, session_minutes__isnull=True)
                | Q(session_start__isnull=False, session_minutes__isnull=False),
                name="ck_attendance_group_start_has_length",
            ),
            models.CheckConstraint(
                condition=Q(session_minutes__isnull=True)
                | Q(session_minutes__gte=1, session_minutes__lte=1440),
                name="ck_attendance_group_session_minutes",
            ),
            models.CheckConstraint(
                condition=Q(dedupe_minutes__gte=0, dedupe_minutes__lte=720),
                name="ck_attendance_group_dedupe_minutes",
            ),
            models.CheckConstraint(
                condition=Q(edit_window_hours__gte=0, edit_window_hours__lte=720),
                name="ck_attendance_group_edit_window",
            ),
            models.UniqueConstraint(
                fields=["tenant", "module", "subject_type", "subject_id"],
                condition=Q(subject_id__isnull=False),
                name="uq_attendance_group_subject",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "module", "is_active"], name="ix_attendance_group_mod"),
        ]

    @property
    def recurrence(self) -> Recurrence | None:  # type: ignore[override]
        if self.freq is None:
            return None
        return RecurrenceFields.recurrence.fget(self)  # type: ignore[attr-defined]


class GroupMember(TenantModel):
    """A party expected in a group over `[from_on, to_on]` (both inclusive)."""

    group = models.ForeignKey(Group, on_delete=models.RESTRICT, related_name="members")
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    from_on = models.DateField()
    to_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "attendance_group_member"
        constraints = [
            models.CheckConstraint(
                condition=Q(to_on__isnull=True) | Q(to_on__gte=F("from_on")),
                name="ck_attendance_member_range",
            ),
            models.UniqueConstraint(
                fields=["group", "party", "from_on"], name="uq_attendance_member_from"
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "party"], name="ix_attendance_member_party"),
        ]


class Session(TenantModel):
    """One generated (or ad hoc) occurrence of a presence group."""

    group = models.ForeignKey(Group, on_delete=models.RESTRICT, related_name="sessions")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=10, default=SessionStatus.SCHEDULED)
    booking_unit_id = models.UUIDField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)

    class Meta:
        db_table = "attendance_session"
        constraints = [
            models.CheckConstraint(
                condition=_in("status", SessionStatus), name="ck_attendance_session_status"
            ),
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")), name="ck_attendance_session_ends"
            ),
            models.CheckConstraint(
                condition=~Q(status=SessionStatus.CANCELLED) | ~Q(cancel_reason=""),
                name="ck_attendance_session_cancel_reason",
            ),
            models.UniqueConstraint(
                fields=["group", "starts_at"], name="uq_attendance_session_start"
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "group", "starts_at"], name="ix_attendance_session_group"
            ),
        ]


class Mark(TenantModel):
    """A party was there (a visit) or was marked in a session (ATT-02 §5)."""

    module = models.CharField(max_length=MODULE_MAX)
    group = models.ForeignKey(
        Group, on_delete=models.RESTRICT, null=True, blank=True, related_name="marks"
    )
    session = models.ForeignKey(
        Session, on_delete=models.RESTRICT, null=True, blank=True, related_name="marks"
    )
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    on_date = models.DateField()
    status = models.CharField(max_length=8)
    check_in_at = models.DateTimeField(null=True, blank=True)
    check_out_at = models.DateTimeField(null=True, blank=True)
    auto_closed = models.BooleanField(default=False)
    method = models.CharField(max_length=10, default=Method.DESK)
    context_type = models.CharField(max_length=CONTEXT_TYPE_MAX, default="", blank=True)
    context_id = models.UUIDField(null=True, blank=True)
    override_reason = models.CharField(max_length=REASON_MAX, null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=REASON_MAX, null=True, blank=True)
    marked_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "attendance_mark"
        constraints = [
            models.CheckConstraint(
                condition=_in("status", MarkStatus), name="ck_attendance_mark_status"
            ),
            models.CheckConstraint(
                condition=_in("method", Method), name="ck_attendance_mark_method"
            ),
            models.UniqueConstraint(
                fields=["session", "party"],
                condition=Q(session__isnull=False, voided_at__isnull=True),
                name="uq_attendance_session_party",
            ),
            models.CheckConstraint(
                condition=Q(check_out_at__isnull=True) | Q(check_out_at__gte=F("check_in_at")),
                name="ck_attendance_mark_out_after_in",
            ),
            models.CheckConstraint(
                condition=Q(voided_at__isnull=True, void_reason__isnull=True)
                | Q(voided_at__isnull=False, void_reason__isnull=False),
                name="ck_attendance_mark_void_pair",
            ),
            models.CheckConstraint(
                condition=~Q(status=MarkStatus.VISIT) | Q(check_in_at__isnull=False),
                name="ck_attendance_mark_visit_has_in",
            ),
            models.CheckConstraint(
                condition=Q(session__isnull=True) | Q(group__isnull=False),
                name="ck_attendance_mark_session_has_group",
            ),
            models.CheckConstraint(
                condition=Q(override_reason__isnull=True)
                | Q(override_reason__regex=r"^[\s\S]{%d,}$" % REASON_MIN),
                name="ck_attendance_mark_override_reason",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "module", "on_date"],
                condition=Q(
                    status=MarkStatus.VISIT, check_out_at__isnull=True, voided_at__isnull=True
                ),
                name="ix_attendance_open_visits",
            ),
            models.Index(fields=["tenant", "party", "on_date"], name="ix_attendance_party_date"),
            models.Index(fields=["tenant", "module", "on_date"], name="ix_attendance_module_date"),
            models.Index(fields=["tenant", "session"], name="ix_attendance_mark_session"),
        ]


class Entitlement(TenantModel):
    """A countable pack ("12 classes in 30 days"); `used` is a cache (ATT-04)."""

    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    module = models.CharField(max_length=MODULE_MAX)
    subject_type = models.CharField(max_length=SUBJECT_TYPE_MAX)
    subject_id = models.UUIDField()
    total = models.IntegerField()
    used = models.IntegerField(default=0)
    valid_from = models.DateField()
    valid_to = models.DateField()

    class Meta:
        db_table = "attendance_entitlement"
        constraints = [
            models.CheckConstraint(condition=Q(total__gt=0), name="ck_attendance_ent_total"),
            models.CheckConstraint(
                condition=Q(used__gte=0, used__lte=F("total")), name="ck_attendance_ent_used"
            ),
            models.CheckConstraint(
                condition=Q(valid_to__gte=F("valid_from")), name="ck_attendance_ent_validity"
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "party", "valid_to"], name="ix_attendance_ent_party"),
            models.Index(
                fields=["tenant", "subject_type", "subject_id"], name="ix_attendance_ent_subject"
            ),
        ]

    @property
    def left(self) -> int:
        return self.total - self.used


class EntitlementUse(TenantModel):
    """One `+1` (consumed) or `−1` (given back) against an entitlement for a mark."""

    entitlement = models.ForeignKey(Entitlement, on_delete=models.RESTRICT, related_name="uses")
    mark = models.ForeignKey(Mark, on_delete=models.RESTRICT, related_name="uses")
    delta = models.SmallIntegerField()
    seq = models.SmallIntegerField(default=0)

    class Meta:
        db_table = "attendance_entitlement_use"
        constraints = [
            models.CheckConstraint(condition=Q(delta__in=[1, -1]), name="ck_attendance_use_delta"),
            models.CheckConstraint(condition=Q(seq__gte=0), name="ck_attendance_use_seq"),
            models.UniqueConstraint(fields=["mark", "seq"], name="uq_attendance_use_mark_seq"),
        ]
        indexes = [
            models.Index(fields=["tenant", "entitlement"], name="ix_attendance_use_ent"),
        ]
