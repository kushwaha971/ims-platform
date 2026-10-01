"""Reads of `dues_due` (FRD 00 DUE-01 §6; DUE-06 adds the rest).

Every queryset here is narrowed to `module__in=` a set the CALLER computed
(`readable_engine_modules`), never to "all modules": an engine read applies no
vertical scope, so the module set is the whole of the authorisation (R25).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db.models import DecimalField, ExpressionWrapper, F, Q, QuerySet, Sum

from apps.common.money import ZERO, q2
from apps.dues.constants import OPEN_DUE_STATUSES, DueStatus
from apps.dues.models import DuesDue
from apps.dues.registry import subject_labels

#: The read list's keyset order (`ix_dues_due_party` / `ix_dues_due_module` lead with due_on).
DUE_ORDERING = ("due_on", "seq", "id")


def outstanding_expression() -> ExpressionWrapper:
    """`amount + penalty − waived − settled` — what is still owed on a due."""
    return ExpressionWrapper(
        F("amount") + F("penalty_amount") - F("waived_amount") - F("settled_amount"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )


def dues_queryset(tenant: Any, *, modules: Iterable[str]) -> QuerySet:
    return DuesDue.objects.for_tenant(tenant).filter(module__in=list(modules))


def with_outstanding(qs: QuerySet) -> QuerySet:
    return qs.annotate(outstanding=outstanding_expression())


def totals(qs: QuerySet) -> dict[str, str]:
    """`{outstanding, overdue}` over the open dues of `qs` (the filtered set)."""
    owed = outstanding_expression()
    figures = qs.order_by().aggregate(
        outstanding=Sum(owed, filter=Q(status__in=OPEN_DUE_STATUSES)),
        overdue=Sum(owed, filter=Q(status=DueStatus.OVERDUE)),
    )
    return {key: str(q2(value or ZERO)) for key, value in figures.items()}


def labels_for(dues: Iterable[Any]) -> dict[tuple[str, Any], str]:
    """Subject labels for a page, ONE call per subject type (the `resolve_sources` rule)."""
    wanted: dict[str, set[Any]] = {}
    for due in dues:
        schedule = due.schedule
        wanted.setdefault(schedule.subject_type, set()).add(schedule.subject_id)
    found: dict[tuple[str, Any], str] = {}
    for subject_type, ids in wanted.items():
        for subject_id, label in subject_labels(subject_type, ids).items():
            found[(subject_type, subject_id)] = label
    return found
