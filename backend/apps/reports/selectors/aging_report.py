"""RPT-05 — receivables and payables aging as a REPORT: LED-09's buckets plus the
collection sheet around them.

FR-4 is the whole design: "one implementation". The FIFO walk and the four
buckets are `ledger.selectors.aging.aging_rows`, unchanged except that it now
also returns the oldest open entry's date it already knew. What RPT-05 adds
is the party's side of the sheet — mobile, customer/supplier, tags,
collection date, credit limit — and the date of the last payment, so the file
an accountant exports is the file a collection round can be run from.

Totals are over the FILTERED rows (FR-3, EC-5), and for `as_of = today` with
no filter they equal `/ledger/summary`'s receivable and payable to the paisa
(BR-3) — asserted in the reconciliation suite, because both are FIFO over the
same book and must reach the same figure the cached balances hold.

── Not built here, with reasons ────────────────────────────────────────────
The nightly `reports_snapshot` path (FR-6, BR-6) is for tenants above 5,000
posted entries; `meta.cached_at` is `null` because every response is live.
The snapshot is a performance measure the live path does not yet need at the
volumes this product runs, and a cache that is never read is a cache that is
never proved.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import Max

from apps.common.money import ZERO

BUCKETS: tuple[str, ...] = ("0_30", "31_60", "61_90", "90_plus")
ORDERINGS: tuple[str, ...] = ("-90_plus", "-total", "name", "-oldest_days")

#: BR-5 — what counts as "a payment" on each side, manual khata lines included.
_PAYMENT_SIDE: dict[str, tuple[str, tuple[str, ...]]] = {
    "receivable": ("credit", ("payment_in", "manual_got")),
    "payable": ("debit", ("payment_out", "manual_gave")),
}


def _party_type(party: Any) -> str:
    if party.is_customer and party.is_supplier:
        return "both"
    return "supplier" if party.is_supplier else "customer"


def aging_report(
    *,
    tenant: Any,
    as_of: dt.date,
    kind: str,
    tag: str | None = None,
    party_id: str | None = None,
    min_total: Decimal | None = None,
    bucket: str | None = None,
    ordering: str = "-90_plus",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Every party with something outstanding on `kind`'s side, filtered and ordered.

    Returns `(rows, totals)`; paging is the caller's (the order is computed —
    see LED-09's view on why it cannot be pushed into the query).
    """
    from apps.ledger.models import LedgerEntry
    from apps.ledger.selectors.aging import aging_rows
    from apps.parties.filters import PartyFilterSet
    from apps.parties.models import Party

    raw = aging_rows(tenant=tenant, as_of=as_of, kind=kind)
    if party_id:
        raw = {key: value for key, value in raw.items() if key == str(party_id)}
    parties = Party.objects.filter(tenant=tenant, id__in=list(raw)).prefetch_related("tags")
    if tag:
        parties = PartyFilterSet(queryset=parties).filter_tags(parties, "tag", tag)
    by_id = {str(party.id): party for party in parties}

    direction, payment_types = _PAYMENT_SIDE[kind]
    last_paid = {
        str(row["party_id"]): row["last"]
        for row in LedgerEntry.objects.filter(
            tenant=tenant,
            party_id__in=list(by_id),
            status="posted",
            direction=direction,
            entry_type__in=payment_types,
            entry_date__lte=as_of,
        )
        .values("party_id")
        .annotate(last=Max("entry_date"))
    }

    rows: list[dict[str, Any]] = []
    for key, figures in raw.items():
        party = by_id.get(key)
        if party is None:
            continue
        if min_total is not None and figures["total"] < min_total:
            continue
        if bucket and figures[bucket] <= ZERO:
            continue
        oldest = figures.get("oldest_entry_date")
        rows.append(
            {
                "party": {
                    "id": key,
                    "name": party.name,
                    "mobile": party.mobile or None,
                    "is_customer": party.is_customer,
                    "is_supplier": party.is_supplier,
                    "type": _party_type(party),
                    "tags": sorted(t.name for t in party.tags.all()),
                },
                "collection_date": party.collection_date,
                # BR-8 — a credit limit is about lending, so receivable only.
                "credit_limit": party.credit_limit if kind == "receivable" else None,
                "buckets": {name: figures[name] for name in BUCKETS},
                "total": figures["total"],
                "oldest_entry_date": oldest,
                "oldest_days": (as_of - oldest).days if oldest else None,
                "last_payment_date": last_paid.get(key),
            }
        )

    rows.sort(key=_sort_key(ordering))
    totals: dict[str, Any] = {name: ZERO for name in BUCKETS}
    totals["total"] = ZERO
    for row in rows:
        for name in BUCKETS:
            totals[name] += row["buckets"][name]
        totals["total"] += row["total"]
    totals["party_count"] = len(rows)
    return rows, totals


def _sort_key(ordering: str) -> Any:
    """FR-1's four orders, each with the party id last so the order is stable."""
    if ordering == "name":
        return lambda row: (row["party"]["name"].casefold(), row["party"]["id"])
    if ordering == "-total":
        return lambda row: (-row["total"], -row["buckets"]["90_plus"], row["party"]["id"])
    if ordering == "-oldest_days":
        return lambda row: (-(row["oldest_days"] or 0), -row["total"], row["party"]["id"])
    return lambda row: (-row["buckets"]["90_plus"], -row["total"], row["party"]["id"])
