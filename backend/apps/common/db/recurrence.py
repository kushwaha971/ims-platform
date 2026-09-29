"""`RecurrenceFields`: the persisted form of a `Recurrence` (ADR-055, FRD 00 PLT-X09 §5).

Typed columns plus a `date[]`, never JSON, so the database refuses a rule no
code could run and a query can find "every schedule due on the 31st". An engine
table includes it beside `TenantModel`:

    class DuesSchedule(TenantModel, RecurrenceFields):
        ...
        class Meta(RecurrenceFields.Meta):
            db_table = "dues_schedule"
            constraints = [*RecurrenceFields.Meta.constraints, ...its own...]

**The trap this module cannot close by itself:** a child `Meta` that sets
`constraints` REPLACES the mixin's list (Django does not merge it), and the
table silently loses every CHECK below. Spread `RecurrenceFields.Meta.constraints`
into it, as above. `apps/common/tests/test_recurrence_fields.py` fails for any
installed model that forgot.

Constraint names carry the table (`%(app_label)s_%(class)s_…`), so two engine
tables including the mixin do not collide.
"""

from __future__ import annotations

from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.models import Q

from apps.common.recurrence import FREQS, LAST_DAY, MAX_COUNT, MAX_INTERVAL, Recurrence

#: suffix -> condition. The name of each CHECK is `<app>_<model>_<suffix>`.
RECURRENCE_CHECKS: dict[str, Q] = {
    "recurrence_freq_valid": Q(freq__in=FREQS),
    "recurrence_interval_range": Q(interval__gte=1, interval__lte=MAX_INTERVAL),
    "recurrence_by_weekday_range": Q(by_weekday__gte=0, by_weekday__lte=127),
    "recurrence_by_month_day_range": (
        Q(by_month_day__isnull=True)
        | Q(by_month_day=LAST_DAY)
        | Q(by_month_day__gte=1, by_month_day__lte=31)
    ),
    "recurrence_count_range": Q(count__isnull=True) | Q(count__gte=1, count__lte=MAX_COUNT),
    "recurrence_until_after_anchor": Q(until__isnull=True) | Q(until__gte=models.F("anchor")),
}


class RecurrenceFields(models.Model):
    """The columns of contracts §1.8 and the CHECKs of FRD 00 PLT-X09 §5."""

    freq = models.CharField(max_length=8)
    interval = models.SmallIntegerField(default=1)
    by_weekday = models.SmallIntegerField(default=0)
    by_month_day = models.SmallIntegerField(null=True, blank=True)
    anchor = models.DateField()
    count = models.IntegerField(null=True, blank=True)
    until = models.DateField(null=True, blank=True)
    explicit_dates = ArrayField(models.DateField(), default=list, blank=True)

    class Meta:
        abstract = True
        constraints = [
            models.CheckConstraint(condition=condition, name=f"%(app_label)s_%(class)s_{suffix}")
            for suffix, condition in RECURRENCE_CHECKS.items()
        ]

    @property
    def recurrence(self) -> Recurrence:
        return Recurrence(
            freq=self.freq,
            interval=self.interval,
            by_weekday=self.by_weekday,
            by_month_day=self.by_month_day,
            anchor=self.anchor,
            count=self.count,
            until=self.until,
            explicit_dates=tuple(self.explicit_dates or ()),
        )

    def set_recurrence(self, rule: Recurrence) -> None:
        """Copy a rule onto the columns. Explicit dates are stored sorted and
        unique, which is how `occurrences()` reads them anyway."""
        self.freq = rule.freq
        self.interval = rule.interval
        self.by_weekday = rule.by_weekday
        self.by_month_day = rule.by_month_day
        self.anchor = rule.anchor
        self.count = rule.count
        self.until = rule.until
        self.explicit_dates = sorted(set(rule.explicit_dates))
