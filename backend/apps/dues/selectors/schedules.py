"""Reads of `dues_schedule` (FRD 00 DUE-01 §6)."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db.models import Prefetch, QuerySet

from apps.dues.models import DuesDue, DuesPause, DuesSchedule


def schedules_queryset(tenant: Any, *, modules: Iterable[str]) -> QuerySet:
    """A tenant's schedules of the readable modules, with dues and pauses in two queries."""
    return (
        DuesSchedule.objects.for_tenant(tenant)
        .filter(module__in=list(modules))
        .select_related("party", "beneficiary_party", "plan")
        .prefetch_related(
            Prefetch("dues", queryset=DuesDue.objects.order_by("seq")),
            Prefetch("pauses", queryset=DuesPause.objects.order_by("from_on", "id")),
        )
    )
