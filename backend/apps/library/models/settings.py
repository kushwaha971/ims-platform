"""`library_settings` — one row per tenant (LIB-01 §5, task B03).

Typed columns rather than `platform_tenant_setting` rows (R43 allows a module
its own settings table): every library service reads a fine rate, a pickup
window or a ceiling, and a CHECK can only guard a column. Weekly closed days
are NOT here — they live in the core calendar (`calendar.closed_weekdays.library`,
W-P3) so there is one calendar per tenant.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

from apps.common.db.fields import MoneyField
from apps.common.models import TenantModel
from apps.library.constants import (
    FineRounding,
    LostFoundPaid,
    OverdueIssueRule,
    RenewFrom,
    RenewOverdue,
)

#: D21: the overdue reminder days, and at most this many of them (BR-3).
DEFAULT_REMINDER_DAYS = (1, 7, 14, 30)
MAX_REMINDER_DAYS = 6


def default_reminder_days() -> list[int]:
    return list(DEFAULT_REMINDER_DAYS)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


def _null_or_non_negative(field: str) -> Q:
    return Q(**{f"{field}__isnull": True}) | Q(**{f"{field}__gte": 0})


class LibrarySettings(TenantModel):
    version = models.IntegerField(default=1)
    fine_skip_closed_days = models.BooleanField(default=True)
    fine_rounding = models.CharField(max_length=8, default=FineRounding.RUPEE)
    overdue_issue_rule = models.CharField(max_length=8, default=OverdueIssueRule.BLOCK)
    lost_counts_toward_limit = models.BooleanField(default=True)
    renew_from = models.CharField(max_length=10, default=RenewFrom.TODAY)
    renew_overdue = models.CharField(max_length=12, default=RenewOverdue.CHARGE_FINE)
    hold_pickup_days = models.SmallIntegerField(default=3)
    lost_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal("1.00"))
    lost_processing_fee = MoneyField(default=Decimal("0.00"))
    lost_found_paid = models.CharField(max_length=8, default=LostFoundPaid.REFUND)
    fallback_price = MoneyField(null=True, blank=True)
    damage_minor_amount = MoneyField(default=Decimal("20.00"))
    damage_major_percent = models.SmallIntegerField(default=50)
    #: D27: null means no ceiling.
    waiver_ceiling = MoneyField(null=True, blank=True, default=Decimal("100.00"))
    overdue_reminder_days = ArrayField(models.SmallIntegerField(), default=default_reminder_days)
    remind_day_before = models.BooleanField(default=False)

    class Meta:
        db_table = "library_settings"
        constraints = [
            models.UniqueConstraint(fields=["tenant"], name="uq_library_settings_tenant"),
            models.CheckConstraint(
                condition=_in("fine_rounding", FineRounding),
                name="ck_library_settings_fine_rounding",
            ),
            models.CheckConstraint(
                condition=_in("overdue_issue_rule", OverdueIssueRule),
                name="ck_library_settings_overdue_issue_rule",
            ),
            models.CheckConstraint(
                condition=_in("renew_from", RenewFrom), name="ck_library_settings_renew_from"
            ),
            models.CheckConstraint(
                condition=_in("renew_overdue", RenewOverdue),
                name="ck_library_settings_renew_overdue",
            ),
            models.CheckConstraint(
                condition=_in("lost_found_paid", LostFoundPaid),
                name="ck_library_settings_lost_found_paid",
            ),
            models.CheckConstraint(
                condition=Q(hold_pickup_days__gte=1, hold_pickup_days__lte=30),
                name="ck_library_settings_hold_pickup_days",
            ),
            models.CheckConstraint(
                condition=Q(lost_multiplier__gte=0, lost_multiplier__lte=10),
                name="ck_library_settings_lost_multiplier",
            ),
            models.CheckConstraint(
                condition=Q(damage_major_percent__gte=1, damage_major_percent__lte=100),
                name="ck_library_settings_damage_major_percent",
            ),
            models.CheckConstraint(
                condition=Q(lost_processing_fee__gte=0, damage_minor_amount__gte=0)
                & _null_or_non_negative("fallback_price")
                & _null_or_non_negative("waiver_ceiling"),
                name="ck_library_settings_money",
            ),
            models.CheckConstraint(
                condition=Q(overdue_reminder_days__len__lte=MAX_REMINDER_DAYS),
                name="ck_library_settings_reminder_days",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin/debug only
        return f"LibrarySettings({self.tenant_id})"
