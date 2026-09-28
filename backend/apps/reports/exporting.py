"""RPT-08 — one export mechanism for every report: a registry of report exporters.

IMP-02 built the list half: a list view names its columns and the async job
REPLAYS the view's filtered queryset. A report is not a queryset — the day book
is a `UNION ALL` across six tables — so a report registers an `Exporter` here
instead, and both halves of the pipeline read it:

* the view (`apps.reports.views.export_support.report_csv`) authorises,
  counts, then streams ≤ 5,000 rows or queues the rest (FR-2, FR-3);
* the job (`reports.build_export`) looks the exporter up by the slug stored on
  the `reports_export` row and runs the SAME `rows` with the SAME params — the
  file equals the screen (BR-1) because there is one row source, not two.

Adding a report's export is one `register(Exporter(...))` in the module that
builds the report — Track W4-B's registers and GST summary register theirs the
same way. The params an exporter receives are JSON-safe and INCLUDE the
reader's grants (RPT-08 BR-2: "the permission set is captured at request
time"), so a queued file never contains a column its requester could not see.

── CSV rules (RPT-common) ───────────────────────────────────────────────────
The writer is `apps.common.exports.csv_lines`: UTF-8 with a BOM, CRLF, minimal
quoting, and every text cell formula-neutralised (BR-6). The cell helpers
below give RPT-08's report conventions, which differ from IMP-02's list ones
on purpose — dates are `YYYY-MM-DD` and booleans `true`/`false` in a report
file, because the accountant importing it into Tally is the reader (FR-9).
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from apps.common.exports import ExportColumn


@dataclass(frozen=True)
class Exporter:
    """How one report becomes a file.

    `columns(params)` — the header, already trimmed by the grants in `params`
    (a suppressed column is ABSENT, never blank: BR-2).
    `rows(tenant, params)` — every row, as a generator (O(chunk) memory).
    `count(tenant, params)` — the row count that decides sync or async (BR-3).
    `filename(params)` — FR-8's `<slug>_<from>_<to>.csv`.
    """

    slug: str
    columns: Callable[[dict], tuple[ExportColumn, ...]]
    rows: Callable[[Any, dict], Iterable[Any]]
    count: Callable[[Any, dict], int]
    filename: Callable[[dict], str]
    codename: str = "reports.export"


REGISTRY: dict[str, Exporter] = {}


def register(exporter: Exporter) -> Exporter:
    """Add a report's exporter. A second registration of a slug is a defect."""
    existing = REGISTRY.get(exporter.slug)
    if existing is not None and existing is not exporter:
        raise ValueError(f"report exporter {exporter.slug!r} is registered twice")
    REGISTRY[exporter.slug] = exporter
    return exporter


def exporter_for(slug: str) -> Exporter:
    _load_builtin()
    try:
        return REGISTRY[slug]
    except KeyError:
        raise ValueError(f"{slug!r} is not an exportable report") from None


def replay(export: Any) -> tuple[tuple[ExportColumn, ...], Iterable[Any]]:
    """The async half: the stored report's columns and rows (IMP-02's replay, for reports)."""
    params = (export.params or {}).get("query") or {}
    exporter = exporter_for((export.params or {}).get("report") or "")
    return exporter.columns(params), exporter.rows(export.tenant, params)


def _load_builtin() -> None:
    """Import the modules that register exporters, so the job can find them."""
    from apps.reports.views import aging, day_book, stock  # noqa: F401


# ── Cell helpers (RPT-08 FR-9) ───────────────────────────────────────────────


def cell_date(value: dt.date | None) -> str:
    return value.isoformat() if value else ""


def cell_money(value: Decimal | None) -> str:
    return "" if value is None else str(Decimal(value).quantize(Decimal("0.01")))


def cell_bool(value: bool | None) -> str:
    return "" if value is None else ("true" if value else "false")


def inr(value: Decimal | None) -> str:
    """`₹12,34,567.89` — Indian grouping, for a DESCRIPTION cell's prose only.

    Amount columns carry plain decimals (FR-9, BR-7); this is for the one place
    RPT-02 FR-6 asks for an amount in words ("Sale ₹1,772.00 credit").
    """
    amount = Decimal(value or 0).quantize(Decimal("0.01"))
    sign = "-" if amount < 0 else ""
    whole, _, paise = f"{abs(amount):.2f}".partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join([*groups, tail])
    return f"{sign}₹{whole}.{paise}"
