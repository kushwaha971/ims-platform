"""Shifts and seats of a study library (W02; owner, 4 Oct 2026).

A private library rents study space, not books: a student pays a monthly fee
for a SEAT in a SHIFT (Morning 6–12, Evening 12–6, Full day…). Two students can
share one seat when their shifts do not overlap, which is the whole economics
of the business — one desk, three shifts, three fees.

The platform plan puts seats in a future bookings engine (research library.md
§15.4). That engine does not exist and the owner asked for seats now, so these
two tables are the library's own, deliberately small: a seat is a label, a
shift is a time range, and who sits where is two columns on the membership.
When the engine lands, these rows are what it imports.
"""

from __future__ import annotations

from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Lower, Upper

from apps.common.models import TenantModel
from apps.library.constants import (
    SEAT_LABEL_MAX,
    SEAT_LABEL_SORT_MAX,
    SEAT_ZONE_MAX,
    SHIFT_NAME_MAX,
)


class LibraryShift(TenantModel):
    """A named time range. `ends_at <= starts_at` is an overnight shift (22:00–06:00)."""

    name = models.CharField(max_length=SHIFT_NAME_MAX)
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    is_active = models.BooleanField(default=True)
    sort_order = models.SmallIntegerField(default=0)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_shift"
        constraints = [
            models.UniqueConstraint(F("tenant"), Lower("name"), name="uq_library_shift_name"),
        ]


class LibrarySeat(TenantModel):
    """A desk. `zone` groups them on the map ("AC hall", "First floor")."""

    label = models.CharField(max_length=SEAT_LABEL_MAX)
    label_sort = models.CharField(max_length=SEAT_LABEL_SORT_MAX, db_collation="C")
    zone = models.CharField(max_length=SEAT_ZONE_MAX, default="", blank=True)
    is_active = models.BooleanField(default=True)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_seat"
        constraints = [
            models.UniqueConstraint(F("tenant"), Upper("label"), name="uq_library_seat_label"),
            models.CheckConstraint(condition=~Q(label=""), name="ck_library_seat_label"),
        ]
        indexes = [models.Index(fields=["tenant", "label_sort"], name="ix_library_seat_sort")]
