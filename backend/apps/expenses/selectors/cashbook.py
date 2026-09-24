"""EXP-03 — the cashbook: money in and out, day by day, cash and bank apart.

── A projection, never a table (BR-1) ───────────────────────────────────────
Every figure is recomputed from its sources on every request. That is why a
void erases a row from the day it was recorded (FR-12) with no bookkeeping, and
why the closing figure can always be proved: there is no cached number to drift.

── Sources are a list, and payments is the next line in it ─────────────────
FR-1 names four sources. Three exist on this branch, as two sources:

* `expenses_expense` — `status='recorded'` AND `paid=true` → money OUT under
  its mode. An unpaid expense never appears (BR-4): the money leaves when a
  payment settles it, and that payment appears instead.
* `ledger_entry` — a POSTED manual entry that carries a `payment_mode` →
  money IN for a credit ("You got ₹500, cash"). BR-5: a "You gave" recording
  goods on credit is not a cash event. On this branch a debit can never carry a
  mode (`ck_ledger_entry_debit_has_no_mode`), so every "You gave" is excluded
  by construction; the query still reads the direction, so the day the ledger
  lets a "cash given" carry its mode, it appears as money out with no change
  here.

`payments_payment` is the missing one: `apps/payments` has no tables. Each
source is an object with two methods — the rows in a range and the net before
a date — and `CASHBOOK_SOURCES` is the tuple the projection walks. PAY-01 adds
a third object (one row per `mode_breakup` entry, BR-3) and nothing else in
this module changes. Part 20 §20.1.4 forbids `expenses` importing `payments`,
so when that source exists this composition moves to `apps/reports`, which may
read every app's selectors (rule D4) — the two sources below move with it
unchanged, which is why they are self-contained.

── The opening is everything before the range (FR-5, partially) ────────────
FR-5's one-time anchor ("I had ₹25,000 in the drawer on 1 April") is a tenant
SETTING, written from `/settings/cashbook`, and the settings screen is not on
this branch. Without it the honest opening is the sum of every recorded money
event before the range: a real number, anchored at zero on the day the book
began. The response says so (`anchor: null`) rather than inventing an anchor
nobody set; the anchor, when it exists, becomes one more term in the opening
sum at the top of `build_cashbook`.
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol

from django.db.models import Count, Sum

from apps.common.constants import Direction, PaymentMode
from apps.common.money import ZERO
from apps.expenses.constants import BANK_BUCKET, BUCKETS, CASH_BUCKET, ExpenseStatus
from apps.expenses.models import Expense
from apps.ledger.constants import EntryStatus, EntryType
from apps.ledger.models import LedgerEntry

IN = "in"
OUT = "out"


def bucket_of(mode: str | None) -> str:
    """FR-2 — `cash` is cash; every other mode is money in a bank or behind an app."""
    return CASH_BUCKET if mode == PaymentMode.CASH else BANK_BUCKET


@dataclass(frozen=True, slots=True)
class CashRow:
    """FR-4's row, before the running balance is known."""

    source_type: str
    source_id: str
    date: dt.date
    at: dt.datetime
    direction: str
    mode: str
    upi_app: str | None
    amount: Decimal
    party: dict | None
    category: dict | None
    number: str | None
    reference: str
    note: str

    @property
    def bucket(self) -> str:
        return bucket_of(self.mode)


class CashbookSource(Protocol):
    """One kind of money event. Both methods are read-only and tenant-scoped."""

    name: str

    def rows(self, *, tenant: Any, date_from: dt.date, date_to: dt.date) -> Iterable[CashRow]: ...

    def net_before(self, *, tenant: Any, before: dt.date) -> dict[str, Decimal]:
        """`in − out` per bucket for every event dated before `before`."""
        ...


class ExpenseSource:
    """Paid, recorded expenses — money out under their mode (FR-1 b)."""

    name = "expense"

    @staticmethod
    def _base(tenant: Any) -> Any:
        return Expense.objects.for_tenant(tenant).filter(status=ExpenseStatus.RECORDED, paid=True)

    def rows(self, *, tenant: Any, date_from: dt.date, date_to: dt.date) -> Iterable[CashRow]:
        queryset = (
            self._base(tenant)
            .filter(expense_date__gte=date_from, expense_date__lte=date_to)
            .select_related("category", "party")
        )
        for expense in queryset:
            yield CashRow(
                source_type="expense",
                source_id=str(expense.id),
                date=expense.expense_date,
                at=expense.created_at,
                direction=OUT,
                mode=expense.mode or PaymentMode.OTHER,
                upi_app=expense.upi_app,
                amount=expense.amount,
                party=(
                    {"id": str(expense.party_id), "name": expense.party.name}
                    if expense.party_id
                    else None
                ),
                category={
                    "id": str(expense.category_id),
                    "name": expense.category.name,
                    "color": expense.category.color,
                },
                number=expense.number,
                reference=expense.reference,
                note=expense.note,
            )

    def net_before(self, *, tenant: Any, before: dt.date) -> dict[str, Decimal]:
        net: dict[str, Decimal] = defaultdict(lambda: ZERO)
        totals = (
            self._base(tenant)
            .filter(expense_date__lt=before)
            .order_by()
            .values("mode")
            .annotate(total=Sum("amount"))
        )
        for row in totals:
            net[bucket_of(row["mode"])] -= row["total"] or ZERO
        return net


class LedgerCashSource:
    """Manual khata entries that say how the money moved (FR-1 c, BR-5)."""

    name = "ledger_entry"

    @staticmethod
    def _base(tenant: Any) -> Any:
        return LedgerEntry.objects.filter(
            tenant=tenant,
            status=EntryStatus.POSTED,
            entry_type__in=(EntryType.MANUAL_GOT, EntryType.MANUAL_GAVE),
            payment_mode__isnull=False,
        )

    def rows(self, *, tenant: Any, date_from: dt.date, date_to: dt.date) -> Iterable[CashRow]:
        queryset = (
            self._base(tenant)
            .filter(entry_date__gte=date_from, entry_date__lte=date_to)
            .select_related("party")
        )
        for entry in queryset:
            yield CashRow(
                source_type="ledger_entry",
                source_id=str(entry.id),
                date=entry.entry_date,
                at=entry.created_at,
                direction=IN if entry.direction == Direction.CREDIT else OUT,
                mode=entry.payment_mode,
                upi_app=entry.upi_app,
                amount=entry.amount,
                party={"id": str(entry.party_id), "name": entry.party.name},
                category=None,
                number=None,
                reference=entry.reference,
                note=entry.note,
            )

    def net_before(self, *, tenant: Any, before: dt.date) -> dict[str, Decimal]:
        net: dict[str, Decimal] = defaultdict(lambda: ZERO)
        totals = (
            self._base(tenant)
            .filter(entry_date__lt=before)
            .order_by()
            .values("payment_mode", "direction")
            .annotate(total=Sum("amount"))
        )
        for row in totals:
            signed = row["total"] if row["direction"] == Direction.CREDIT else -row["total"]
            net[bucket_of(row["payment_mode"])] += signed
        return net


#: The projection's inputs, in the order ties within one second are broken.
CASHBOOK_SOURCES: tuple[CashbookSource, ...] = (LedgerCashSource(), ExpenseSource())


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))


def _figures(values: dict[str, Decimal], buckets: tuple[str, ...]) -> dict[str, str]:
    """`{cash, bank, total}` — only the buckets asked for, and their sum as `total`.

    BR-2: the total is `cash + bank`, not a separately rounded figure. A bucket
    that was not asked for is ABSENT rather than "0.00": a staff member scoped
    to the till must not be sent the bank figure, and a zero where the real
    number was withheld would be a false statement about the bank.
    """
    out = {bucket: _money(values.get(bucket, ZERO)) for bucket in buckets}
    out["total"] = _money(sum((values.get(bucket, ZERO) for bucket in buckets), ZERO))
    return out


def _voided_counts(*, tenant: Any, date_from: dt.date, date_to: dt.date) -> dict[dt.date, int]:
    """FR-12's footnote — how many paid expenses on each day were withdrawn."""
    rows = (
        Expense.objects.for_tenant(tenant)
        .filter(
            status=ExpenseStatus.VOID,
            paid=True,
            expense_date__gte=date_from,
            expense_date__lte=date_to,
        )
        .order_by()
        .values("expense_date")
        .annotate(n=Count("id"))
    )
    return {row["expense_date"]: row["n"] for row in rows}


def build_cashbook(
    *,
    tenant: Any,
    date_from: dt.date,
    date_to: dt.date,
    buckets: tuple[str, ...] = BUCKETS,
    sources: tuple[CashbookSource, ...] = CASHBOOK_SOURCES,
) -> dict:
    """The whole response body for one range. Read-only; five queries for two sources.

    BR-2's chain, per bucket: `closing(d) = opening(d) + in(d) − out(d)` and
    `opening(d) = closing(d − 1)`, starting from the net of everything before
    `date_from`. Days with no rows are skipped (FR-3 `show_empty_days=false`)
    — their opening equals the previous closing, so nothing is lost.

    Days come back newest first (FR-3); rows within a day oldest first, with a
    `running_after` per bucket, so a day reads like a passbook (FR-4, BR-11).
    """
    opening: dict[str, Decimal] = defaultdict(lambda: ZERO)
    for source in sources:
        for bucket, value in source.net_before(tenant=tenant, before=date_from).items():
            opening[bucket] += value

    rows: list[CashRow] = []
    for source in sources:
        rows.extend(
            row
            for row in source.rows(tenant=tenant, date_from=date_from, date_to=date_to)
            if row.bucket in buckets
        )
    rows.sort(key=lambda row: (row.date, row.at, row.source_id))

    by_day: dict[dt.date, list[CashRow]] = defaultdict(list)
    for row in rows:
        by_day[row.date].append(row)
    voided = _voided_counts(tenant=tenant, date_from=date_from, date_to=date_to)

    running = {bucket: opening[bucket] for bucket in BUCKETS}
    range_in: dict[str, Decimal] = defaultdict(lambda: ZERO)
    range_out: dict[str, Decimal] = defaultdict(lambda: ZERO)
    by_category: dict[str, dict] = {}
    days: list[dict] = []
    for day in sorted(by_day):
        day_opening = dict(running)
        day_in: dict[str, Decimal] = defaultdict(lambda: ZERO)
        day_out: dict[str, Decimal] = defaultdict(lambda: ZERO)
        day_rows = []
        for row in by_day[day]:
            bucket = row.bucket
            if row.direction == IN:
                day_in[bucket] += row.amount
                running[bucket] += row.amount
            else:
                day_out[bucket] += row.amount
                running[bucket] -= row.amount
                if row.category:
                    slot = by_category.setdefault(
                        row.category["id"], {**row.category, "amount": ZERO}
                    )
                    slot["amount"] += row.amount
            day_rows.append(
                {
                    "id": f"{row.source_type}:{row.source_id}",
                    "source_type": row.source_type,
                    "source_id": row.source_id,
                    "date": row.date.isoformat(),
                    "at": row.at.isoformat(),
                    "direction": row.direction,
                    "mode": row.mode,
                    "upi_app": row.upi_app,
                    "bucket": bucket,
                    "amount": _money(row.amount),
                    "party": row.party,
                    "category": row.category,
                    "number": row.number,
                    "reference": row.reference,
                    "note": row.note,
                    "running_after": _figures(running, buckets),
                }
            )
        for bucket in BUCKETS:
            range_in[bucket] += day_in[bucket]
            range_out[bucket] += day_out[bucket]
        days.append(
            {
                "date": day.isoformat(),
                "opening": _figures(day_opening, buckets),
                "in": _figures(day_in, buckets),
                "out": _figures(day_out, buckets),
                "closing": _figures(running, buckets),
                "voided_count": voided.get(day, 0),
                "rows": day_rows,
            }
        )
    days.reverse()

    categories = sorted(by_category.values(), key=lambda c: (-c["amount"], c["name"]))
    return {
        "anchor": None,
        "range": {
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "opening": _figures(opening, buckets),
            "in": _figures(range_in, buckets),
            "out": _figures(range_out, buckets),
            "closing": _figures(running, buckets),
        },
        "days": days,
        "breakdown": {
            "by_category": [{**c, "amount": _money(c["amount"])} for c in categories],
        },
        "buckets": list(buckets),
        "sources": [source.name for source in sources],
        "rows_total": len(rows),
    }
