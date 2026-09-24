"""LED-05 FR-3 / BR-1 — Due today, Overdue and Upcoming, as counts and amounts.

One aggregate with three `FILTER` clauses over the cached balances (§20: "or
one with FILTER clauses"), against the tenant's own today. Every bucket needs
`balance > 0`: a promise from somebody who owes nothing is not a collection,
and the party list's `collection=` chips apply the same predicate so tapping a
tile lists exactly the parties it counted (AC-2).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.ledger.constants import UPCOMING_BUCKET_DAYS

BUCKETS = ("due_today", "overdue", "upcoming_7d")


def bucket_filters(today: dt.date) -> dict[str, Q]:
    return {
        "due_today": Q(collection_date=today),
        "overdue": Q(collection_date__lt=today),
        "upcoming_7d": Q(
            collection_date__gt=today,
            collection_date__lte=today + dt.timedelta(days=UPCOMING_BUCKET_DAYS),
        ),
    }


def collection_buckets(*, tenant: Any, today: dt.date) -> dict[str, dict[str, Any]]:
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    empty = {key: {"count": 0, "amount": ZERO} for key in BUCKETS}
    if tenant is None:
        return empty
    money = DecimalField(max_digits=14, decimal_places=2)
    aggregates: dict[str, Any] = {}
    for key, predicate in bucket_filters(today).items():
        aggregates[f"{key}__count"] = Count("id", filter=predicate)
        aggregates[f"{key}__amount"] = Coalesce(
            Sum("balance", filter=predicate), Decimal("0.00"), output_field=money
        )
    row = (
        Party.objects.for_tenant(tenant)
        .filter(status=PartyStatus.ACTIVE, balance__gt=ZERO, collection_date__isnull=False)
        .aggregate(**aggregates)
    )
    return {
        key: {"count": row[f"{key}__count"], "amount": row[f"{key}__amount"]} for key in BUCKETS
    }


#: The reminders screen's tab names → the summary's bucket keys.
DUE_TABS = {"today": "due_today", "overdue": "overdue", "upcoming": "upcoming_7d"}

#: The order each tab is worked in: the biggest debt first today; the oldest
#: promise first when overdue; the nearest date first when looking ahead.
DUE_ORDERING = {
    "today": ("-balance", "name", "id"),
    "overdue": ("collection_date", "-balance", "id"),
    "upcoming": ("collection_date", "-balance", "id"),
}


def due_parties(*, tenant: Any, today: dt.date, tab: str) -> Any:
    """LED-05 FR-4 — the parties behind one bucket, with the SAME predicate the
    figures are counted with, so the rows under a tab are the tab's count."""
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    predicate = bucket_filters(today)[DUE_TABS[tab]]
    return (
        Party.objects.for_tenant(tenant)
        .filter(status=PartyStatus.ACTIVE, balance__gt=ZERO, collection_date__isnull=False)
        .filter(predicate)
        .only("id", "name", "mobile", "balance", "collection_date")
        .order_by(*DUE_ORDERING[tab])
    )
