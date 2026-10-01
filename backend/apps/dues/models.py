"""The dues engine's nine tables (contracts §2.1, FRD 00 DUE-01 §5, R16, R17).

All nine land in `0001` because FRD DUE-01 §5 specifies the engine's schema
once; DUE-02…05 write rows into the tables they name and add only indexes
their `EXPLAIN` tests ask for.

── Money never lives in jsonb (R16) ─────────────────────────────────────────
A plan's heads are rows (`dues_plan_head`), copied into `dues_schedule_head`;
the schedule's snapshot of the plan is TYPED columns for everything a query
or a sum reads (recurrence, amounts, grace, penalty, allocation, closed-day
and rounding rules, and — additively, C-6 / Q-D8 — `mode` and `posting`).
`terms` holds the remaining non-money policy strings only.

── Recurrence CHECKs ─────────────────────────────────────────────────────────
`DuesPlan` and `DuesSchedule` include `RecurrenceFields`; their `Meta` spreads
`RecurrenceFields.Meta.constraints` because a child `constraints` list
REPLACES the mixin's (`apps/common/db/recurrence.py`).

── No FK where the other side is not ours ───────────────────────────────────
`document_id`, `posted_entry_id` and `payment_id` are uuids: the port owns the
document, the ledger owns the entry, and a FK into `payments_payment` would
put a RESTRICT on rows payments voids. `(subject_type, subject_id)` points at
a vertical's row, which an engine may not import.
"""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower

from apps.common.db.fields import MoneyField
from apps.common.db.recurrence import RecurrenceFields
from apps.common.models import TenantModel
from apps.common.money import ROUNDING_RULES
from apps.dues.constants import (
    HEAD_LABEL_MAX,
    LIVE_SCHEDULE_STATUSES,
    MODULE_MAX,
    OPEN_DUE_STATUSES,
    PERIOD_LABEL_MAX,
    PLAN_NAME_MAX,
    REASON_MAX,
    SUBJECT_TYPE_MAX,
    AdjustmentKind,
    AllocationOrder,
    AmountRule,
    ClosedDayRule,
    Component,
    DueStatus,
    JoinPolicy,
    LeavePolicy,
    Mode,
    PauseEffect,
    PenaltyKind,
    Posting,
    ScheduleStatus,
)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


def _mode_posting_pair() -> Q:
    return Q(mode=Mode.CHARGE, posting__in=[Posting.DOCUMENT, Posting.LEDGER]) | Q(
        mode=Mode.EXPECTATION, posting=Posting.NONE
    )


def _non_negative(*fields: str) -> Q:
    q = Q()
    for field in fields:
        q &= Q(**{f"{field}__isnull": True}) | Q(**{f"{field}__gte": 0})
    return q


class DuesPlan(TenantModel, RecurrenceFields):
    """A tenant's plan, per module ("Gym monthly ₹1,200").

    C-4: `anchor` is NOT NULL on the mixin but a plan has no meaningful anchor;
    it stores the creation date as a template value nothing computes from. The
    schedule's anchor is set at schedule creation.
    """

    module = models.CharField(max_length=MODULE_MAX)
    name = models.CharField(max_length=PLAN_NAME_MAX)
    mode = models.CharField(max_length=12)
    posting = models.CharField(max_length=8)
    amount_rule = models.CharField(max_length=12)
    amount = MoneyField(null=True, blank=True)
    total = MoneyField(null=True, blank=True)
    split_weights = ArrayField(
        models.DecimalField(max_digits=9, decimal_places=4), default=list, blank=True
    )
    join_policy = models.CharField(max_length=14, default=JoinPolicy.FULL)
    leave_policy = models.CharField(max_length=12, default=LeavePolicy.NO_REFUND)
    grace_days = models.SmallIntegerField(default=0)
    penalty_kind = models.CharField(max_length=16, default=PenaltyKind.NONE)
    penalty_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    penalty_cap = MoneyField(null=True, blank=True)
    pause_max_days = models.SmallIntegerField(null=True, blank=True)
    pause_min_days = models.SmallIntegerField(null=True, blank=True)
    pause_max_count = models.SmallIntegerField(null=True, blank=True)
    hsn_sac = models.CharField(max_length=8, null=True, blank=True)
    tax_code = models.CharField(max_length=16, null=True, blank=True)
    tax_inclusive = models.BooleanField(default=False)
    rounding_rule = models.CharField(max_length=8, default="rupee")
    allocation_order = models.CharField(max_length=12, default=AllocationOrder.OLDEST_FIRST)
    auto_apply_advance = models.BooleanField(default=True)
    closed_day_rule = models.CharField(max_length=8, default=ClosedDayRule.IGNORE)
    is_active = models.BooleanField(default=True)
    version = models.IntegerField(default=1)

    class Meta(RecurrenceFields.Meta):
        abstract = False
        db_table = "dues_plan"
        constraints = [
            *RecurrenceFields.Meta.constraints,
            models.CheckConstraint(condition=_mode_posting_pair(), name="ck_dues_plan_mode_posting"),
            models.CheckConstraint(
                condition=Q(tax_code__isnull=True, hsn_sac__isnull=True)
                | Q(posting=Posting.DOCUMENT),
                name="ck_dues_plan_taxable_is_document",
            ),
            models.CheckConstraint(
                condition=~Q(amount_rule=AmountRule.FIXED) | Q(amount__isnull=False),
                name="ck_dues_plan_fixed_has_amount",
            ),
            models.CheckConstraint(
                condition=~Q(amount_rule=AmountRule.TOTAL_SPLIT) | Q(total__isnull=False),
                name="ck_dues_plan_split_has_total",
            ),
            models.CheckConstraint(
                condition=Q(penalty_kind=PenaltyKind.NONE, penalty_value__isnull=True)
                | (~Q(penalty_kind=PenaltyKind.NONE) & Q(penalty_value__isnull=False)),
                name="ck_dues_plan_penalty_value",
            ),
            models.CheckConstraint(
                condition=_non_negative("amount", "penalty_cap", "penalty_value"),
                name="ck_dues_plan_money_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(total__isnull=True) | Q(total__gt=0), name="ck_dues_plan_total_positive"
            ),
            models.CheckConstraint(
                condition=Q(grace_days__gte=0, grace_days__lte=365), name="ck_dues_plan_grace"
            ),
            models.CheckConstraint(condition=_in("mode", Mode), name="ck_dues_plan_mode"),
            models.CheckConstraint(condition=_in("posting", Posting), name="ck_dues_plan_posting"),
            models.CheckConstraint(
                condition=_in("amount_rule", AmountRule), name="ck_dues_plan_amount_rule"
            ),
            models.CheckConstraint(
                condition=_in("join_policy", JoinPolicy), name="ck_dues_plan_join_policy"
            ),
            models.CheckConstraint(
                condition=_in("leave_policy", LeavePolicy), name="ck_dues_plan_leave_policy"
            ),
            models.CheckConstraint(
                condition=_in("penalty_kind", PenaltyKind), name="ck_dues_plan_penalty_kind"
            ),
            models.CheckConstraint(
                condition=_in("allocation_order", AllocationOrder),
                name="ck_dues_plan_allocation_order",
            ),
            models.CheckConstraint(
                condition=_in("closed_day_rule", ClosedDayRule), name="ck_dues_plan_closed_day_rule"
            ),
            models.CheckConstraint(
                condition=Q(rounding_rule__in=ROUNDING_RULES), name="ck_dues_plan_rounding_rule"
            ),
            models.UniqueConstraint(
                F("tenant"),
                F("module"),
                Lower("name"),
                condition=Q(is_active=True),
                name="uq_dues_plan_name",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "module", "is_active"], name="ix_dues_plan_module"),
        ]

    def __str__(self) -> str:
        return self.name


class DuesPlanHead(TenantModel):
    """One named part of a fixed plan's amount ("Tuition ₹1,000 + Locker ₹200"), R16."""

    plan = models.ForeignKey(DuesPlan, on_delete=models.CASCADE, related_name="heads")
    seq = models.SmallIntegerField()
    label = models.CharField(max_length=HEAD_LABEL_MAX)
    amount = MoneyField()

    class Meta:
        db_table = "dues_plan_head"
        ordering = ("seq",)
        constraints = [
            models.UniqueConstraint(fields=["plan", "seq"], name="uq_dues_plan_head_seq"),
            models.CheckConstraint(condition=Q(amount__gte=0), name="ck_dues_plan_head_amount"),
        ]


class DuesSchedule(TenantModel, RecurrenceFields):
    """A party on a plan for one subject, with the plan's terms SNAPSHOTTED (BR-3)."""

    module = models.CharField(max_length=MODULE_MAX)
    plan = models.ForeignKey(DuesPlan, on_delete=models.RESTRICT, related_name="schedules")
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    beneficiary_party = models.ForeignKey(
        "parties.Party", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    # ── the typed snapshot (R16; mode/posting additive, C-6) ──
    mode = models.CharField(max_length=12)
    posting = models.CharField(max_length=8)
    amount = MoneyField(null=True, blank=True)
    total = MoneyField(null=True, blank=True)
    grace_days = models.SmallIntegerField(default=0)
    penalty_kind = models.CharField(max_length=16, default=PenaltyKind.NONE)
    penalty_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    penalty_cap = MoneyField(null=True, blank=True)
    allocation_order = models.CharField(max_length=12, default=AllocationOrder.OLDEST_FIRST)
    closed_day_rule = models.CharField(max_length=8, default=ClosedDayRule.IGNORE)
    rounding_rule = models.CharField(max_length=8, default="rupee")
    #: Non-money policy strings only: amount_rule, join/leave policy, pause
    #: limits, hsn_sac, tax_code, tax_inclusive, auto_apply_advance, split_weights.
    terms = models.JSONField(default=dict, blank=True)
    # ── the subject and the life of the schedule ──
    subject_type = models.CharField(max_length=SUBJECT_TYPE_MAX)
    subject_id = models.UUIDField()
    start_on = models.DateField()
    end_on = models.DateField(null=True, blank=True)  # exclusive
    status = models.CharField(max_length=10, default=ScheduleStatus.ACTIVE)
    ended_reason = models.CharField(max_length=REASON_MAX, blank=True, default="")
    #: C-9: the HORIZON through which occurrences were computed (inclusive).
    materialised_until = models.DateField()
    version = models.IntegerField(default=1)

    class Meta(RecurrenceFields.Meta):
        abstract = False
        db_table = "dues_schedule"
        constraints = [
            *RecurrenceFields.Meta.constraints,
            models.UniqueConstraint(
                fields=["tenant", "subject_type", "subject_id"],
                condition=Q(status__in=LIVE_SCHEDULE_STATUSES),
                name="uq_dues_schedule_live_subject",
            ),
            models.CheckConstraint(
                condition=Q(end_on__isnull=True) | Q(end_on__gt=F("start_on")),
                name="ck_dues_schedule_end_after_start",
            ),
            models.CheckConstraint(
                condition=_mode_posting_pair(), name="ck_dues_schedule_mode_posting"
            ),
            models.CheckConstraint(
                condition=_in("status", ScheduleStatus), name="ck_dues_schedule_status"
            ),
            models.CheckConstraint(
                condition=_non_negative("amount", "penalty_cap", "penalty_value")
                & (Q(total__isnull=True) | Q(total__gt=0)),
                name="ck_dues_schedule_money",
            ),
            models.CheckConstraint(
                condition=_in("penalty_kind", PenaltyKind), name="ck_dues_schedule_penalty_kind"
            ),
            models.CheckConstraint(
                condition=_in("allocation_order", AllocationOrder),
                name="ck_dues_schedule_allocation_order",
            ),
            models.CheckConstraint(
                condition=_in("closed_day_rule", ClosedDayRule),
                name="ck_dues_schedule_closed_day_rule",
            ),
            models.CheckConstraint(
                condition=Q(rounding_rule__in=ROUNDING_RULES),
                name="ck_dues_schedule_rounding_rule",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "party", "status"], name="ix_dues_schedule_party"),
            models.Index(fields=["tenant", "module", "status"], name="ix_dues_schedule_module"),
            models.Index(
                fields=["tenant", "materialised_until"],
                condition=Q(status__in=LIVE_SCHEDULE_STATUSES),
                name="ix_dues_schedule_window",
            ),
        ]


class DuesScheduleHead(TenantModel):
    """The plan's heads, copied at schedule creation (R16)."""

    schedule = models.ForeignKey(DuesSchedule, on_delete=models.CASCADE, related_name="heads")
    seq = models.SmallIntegerField()
    label = models.CharField(max_length=HEAD_LABEL_MAX)
    amount = MoneyField()

    class Meta:
        db_table = "dues_schedule_head"
        ordering = ("seq",)
        constraints = [
            models.UniqueConstraint(fields=["schedule", "seq"], name="uq_dues_schedule_head_seq"),
            models.CheckConstraint(condition=Q(amount__gte=0), name="ck_dues_schedule_head_amount"),
        ]


class DuesDue(TenantModel):
    """One due of a schedule: what is owed for one period, on one date."""

    schedule = models.ForeignKey(DuesSchedule, on_delete=models.RESTRICT, related_name="dues")
    module = models.CharField(max_length=MODULE_MAX)
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    seq = models.IntegerField()
    period_start = models.DateField()
    period_end = models.DateField()
    period_label = models.CharField(max_length=PERIOD_LABEL_MAX)
    due_on = models.DateField()
    amount = MoneyField()
    status = models.CharField(max_length=10, default=DueStatus.SCHEDULED)
    settled_amount = MoneyField(default=0)
    waived_amount = MoneyField(default=0)
    penalty_amount = MoneyField(default=0)
    penalty_exempt_days = models.SmallIntegerField(default=0)
    paid_on = models.DateField(null=True, blank=True)
    document_id = models.UUIDField(null=True, blank=True)
    posted_entry_id = models.UUIDField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=REASON_MAX, blank=True, default="")

    class Meta:
        db_table = "dues_due"
        constraints = [
            models.UniqueConstraint(fields=["schedule", "seq"], name="uq_dues_due_seq"),
            models.CheckConstraint(
                condition=Q(
                    amount__gte=0,
                    settled_amount__gte=0,
                    waived_amount__gte=0,
                    penalty_amount__gte=0,
                    penalty_exempt_days__gte=0,
                ),
                name="ck_dues_due_money_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(
                    settled_amount__lte=F("amount") + F("penalty_amount") - F("waived_amount")
                ),
                name="ck_dues_due_settled_within_owed",
            ),
            models.CheckConstraint(
                condition=Q(period_end__gt=F("period_start")), name="ck_dues_due_period"
            ),
            models.CheckConstraint(
                condition=~Q(document_id__isnull=False, posted_entry_id__isnull=False),
                name="ck_dues_due_one_posting",
            ),
            models.CheckConstraint(
                condition=~Q(status=DueStatus.PAID) | Q(paid_on__isnull=False),
                name="ck_dues_due_paid_has_date",
            ),
            models.CheckConstraint(condition=_in("status", DueStatus), name="ck_dues_due_status"),
        ]
        indexes = [
            models.Index(fields=["tenant", "status", "due_on"], name="ix_dues_due_status"),
            models.Index(fields=["tenant", "party", "due_on"], name="ix_dues_due_party"),
            models.Index(
                fields=["tenant", "module", "status", "due_on"], name="ix_dues_due_module"
            ),
            models.Index(
                fields=["tenant", "party", "due_on", "seq"],
                condition=Q(status__in=OPEN_DUE_STATUSES),
                name="ix_dues_due_open_party",
            ),
        ]


class DuesDueComponent(TenantModel):
    """Expectation mode: the principal / interest / fee split of one due."""

    due = models.ForeignKey(DuesDue, on_delete=models.RESTRICT, related_name="components")
    component = models.CharField(max_length=10)
    amount = MoneyField()
    settled = MoneyField(default=0)
    waived = MoneyField(default=0)
    posted_entry_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = "dues_due_component"
        constraints = [
            models.UniqueConstraint(fields=["due", "component"], name="uq_dues_due_component"),
            models.CheckConstraint(
                condition=Q(amount__gte=0, settled__gte=0, waived__gte=0)
                & Q(settled__lte=F("amount") - F("waived")),
                name="ck_dues_due_component_money",
            ),
            models.CheckConstraint(
                condition=_in("component", Component), name="ck_dues_due_component_kind"
            ),
        ]


class DuesAdjustment(TenantModel):
    """A penalty (> 0), or a waiver, discount or proration (< 0), on one due."""

    due = models.ForeignKey(DuesDue, on_delete=models.RESTRICT, related_name="adjustments")
    kind = models.CharField(max_length=10)
    component = models.CharField(max_length=10, null=True, blank=True)
    amount = MoneyField()
    reason = models.CharField(max_length=REASON_MAX)
    posted_entry_id = models.UUIDField(null=True, blank=True)
    document_id = models.UUIDField(null=True, blank=True)  # C-6: FRD's, R22 needs it
    reversed_by = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )

    class Meta:
        db_table = "dues_adjustment"
        constraints = [
            models.CheckConstraint(
                condition=Q(kind=AdjustmentKind.PENALTY, amount__gt=0)
                | Q(
                    kind__in=[
                        AdjustmentKind.WAIVER,
                        AdjustmentKind.DISCOUNT,
                        AdjustmentKind.PRORATION,
                    ],
                    amount__lt=0,
                ),
                name="ck_dues_adjustment_sign",
            ),
            models.CheckConstraint(
                condition=Q(component__isnull=True) | _in("component", Component),
                name="ck_dues_adjustment_component",
            ),
        ]
        indexes = [models.Index(fields=["tenant", "due"], name="ix_dues_adjustment_due")]


class DuesPause(TenantModel):
    """A pause of a schedule, `[from_on, to_on]` inclusive (DUE-05)."""

    schedule = models.ForeignKey(DuesSchedule, on_delete=models.RESTRICT, related_name="pauses")
    from_on = models.DateField()
    to_on = models.DateField()
    effect = models.CharField(max_length=5)
    reason = models.CharField(max_length=REASON_MAX)
    resumed_on = models.DateField(null=True, blank=True)  # C-6: FRD's

    class Meta:
        db_table = "dues_pause"
        constraints = [
            models.CheckConstraint(condition=Q(to_on__gte=F("from_on")), name="ck_dues_pause_range"),
            models.CheckConstraint(
                condition=_in("effect", PauseEffect), name="ck_dues_pause_effect"
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "schedule", "from_on"], name="ix_dues_pause_schedule")
        ]


class DuesSettlement(TenantModel):
    """How much of one payment settled one component of one due (R17, every mode)."""

    payment_id = models.UUIDField()
    due = models.ForeignKey(DuesDue, on_delete=models.RESTRICT, related_name="settlements")
    component = models.CharField(max_length=10)
    amount = MoneyField()

    class Meta:
        db_table = "dues_settlement"
        constraints = [
            models.UniqueConstraint(
                fields=["payment_id", "due", "component"], name="uq_dues_settlement"
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="ck_dues_settlement_amount"),
            models.CheckConstraint(
                condition=_in("component", Component), name="ck_dues_settlement_component"
            ),
        ]
        indexes = [models.Index(fields=["tenant", "due"], name="ix_dues_settlement_due")]
