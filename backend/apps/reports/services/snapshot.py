"""`reports_snapshot` — read a fresh one, store one, drop a tenant's (CR-106, RPT-01 BR-5).

The table is the dashboard's cache, and this module is the only code that
touches it. Three verbs and no policy beyond "how old is too old": which
report is cached, for how long and under which key is the CALLER's decision,
so a second cached report (the nightly aging snapshot of RPT-05 FR-6) is a
second caller rather than a second module.

── Why a table and not `django.core.cache` ─────────────────────────────────
`CACHES` is `LocMemCache` (ADR-012: no Redis), which is per PROCESS. A write
served by one gunicorn worker could invalidate that worker's copy and leave
the other three serving the old figures for a minute — exactly the "I just
billed ₹1,772 and the dashboard still says ₹0" the write-through rule exists
to prevent. A row is shared by every worker, and deleting it is seen by all of
them at once (Part 20 §20.14.5: the cache tables ARE the caching strategy).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.reports.models import Snapshot


def read_fresh(
    *,
    tenant: Any,
    report_name: str,
    as_of: dt.date,
    params_hash: str,
    max_age_seconds: int,
    now: dt.datetime | None = None,
) -> Snapshot | None:
    """The stored row if it was computed within `max_age_seconds`, else None.

    An old row is not deleted here: the caller is about to overwrite it with
    `store`, and a read that writes is a read that can deadlock two readers.
    """
    moment = now or timezone.now()
    return (
        Snapshot.objects.filter(
            tenant=tenant,
            report_name=report_name,
            as_of=as_of,
            params_hash=params_hash,
            computed_at__gte=moment - dt.timedelta(seconds=max_age_seconds),
        )
        .only("payload", "computed_at", "row_count")
        .first()
    )


def store(
    *,
    tenant: Any,
    report_name: str,
    as_of: dt.date,
    params_hash: str,
    payload: dict,
    row_count: int | None = None,
    computed_at: dt.datetime | None = None,
) -> Snapshot:
    """Upsert the one row for this key.

    Two requests that both missed the cache race to write it; the unique
    constraint lets exactly one INSERT win and the loser updates instead. Both
    computed the same figures a few milliseconds apart, so which one survives
    does not matter — only that neither answers the merchant with a 500.
    """
    moment = computed_at or timezone.now()
    values = {"payload": payload, "row_count": row_count, "computed_at": moment}
    key = {
        "tenant": tenant,
        "report_name": report_name,
        "as_of": as_of,
        "params_hash": params_hash,
    }
    try:
        with transaction.atomic():
            snapshot, _created = Snapshot.objects.update_or_create(**key, defaults=values)
    except IntegrityError:
        Snapshot.objects.filter(**key).update(**values, updated_at=moment)
        snapshot = Snapshot.objects.get(**key)
    return snapshot


def invalidate(*, tenant_id: Any, report_names: tuple[str, ...]) -> int:
    """Drop the tenant's rows for these reports; the next reader recomputes.

    Deleting rather than flagging, because a flagged row is one more condition
    every reader has to remember to check — and the one that forgets serves
    yesterday's sales.
    """
    if tenant_id is None:
        return 0
    deleted, _ = Snapshot.objects.filter(tenant_id=tenant_id, report_name__in=report_names).delete()
    return deleted
