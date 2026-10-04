"""Holds — a queue for the next copy of a title (LIB-08 §5; task B11).

A hold is a QUEUE, not a booking (no time range), so it lives here and not in the
bookings engine. Two partial unique keys hold the rules the FRD names: a member
holds a title at most once while the hold is live, and a kept-aside copy serves
exactly one ready hold (EC-5: two desks returning copies of one title can allot the
first member in line only once).
"""

from __future__ import annotations

from django.db import models
from django.db.models import Q

from apps.common.models import TenantModel
from apps.library.constants import LIVE_HOLD_STATUSES, REASON_MAX, HoldStatus


class LibraryHold(TenantModel):
    title = models.ForeignKey(
        "library.LibraryTitle", on_delete=models.RESTRICT, related_name="holds"
    )
    copy = models.ForeignKey(
        "library.LibraryCopy", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    membership = models.ForeignKey(
        "library.LibraryMembership", on_delete=models.RESTRICT, related_name="holds"
    )
    party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT, related_name="+")
    placed_on = models.DateField()
    placed_at = models.DateTimeField()
    status = models.CharField(max_length=10, default=HoldStatus.WAITING)
    ready_copy = models.ForeignKey(
        "library.LibraryCopy", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    ready_on = models.DateField(null=True, blank=True)
    collect_by = models.DateField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    close_reason = models.CharField(max_length=REASON_MAX, default="", blank=True)
    loan = models.ForeignKey(
        "library.LibraryLoan", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_hold"
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "title"],
                condition=Q(status__in=LIVE_HOLD_STATUSES),
                name="uq_library_hold_live",
            ),
            models.UniqueConstraint(
                fields=["ready_copy"],
                condition=Q(status=HoldStatus.READY),
                name="uq_library_hold_ready_copy",
            ),
            models.CheckConstraint(
                condition=Q(status__in=HoldStatus.values), name="ck_library_hold_status"
            ),
            models.CheckConstraint(
                condition=~Q(status=HoldStatus.READY)
                | Q(ready_copy__isnull=False, collect_by__isnull=False),
                name="ck_library_hold_ready_copy",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "title", "status", "placed_at"], name="ix_library_hold_queue"
            ),
            models.Index(fields=["tenant", "status", "collect_by"], name="ix_library_hold_expiry"),
            models.Index(fields=["tenant", "membership", "status"], name="ix_library_hold_member"),
        ]
