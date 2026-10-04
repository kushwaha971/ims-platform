"""The fine calculator (LIB-07 §9; task B10). Pure: no queries, no writes.

```
if returned_on ≤ due_on:            0
days_late = (returned_on − due_on) − closed days in (due_on, returned_on]   (when skipped, D4)
if days_late ≤ grace_days:          0                     (grace waives, it does not shift — D5)
rounded = round_amount(days_late × fine_per_day, rounding)                  (D19)
cap = min(rule cap, copy price ?? fallback price)          (either may be absent, D24)
fine = max(0, min(rounded, cap − already charged on this loan))
```

The cap is applied AFTER rounding, so a fine can never exceed the price by
half a rupee (EC-8). The closed days are the calendar AS IT IS on the return
day (BR-3): the caller reads them then, not at issue.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

from apps.common.money import ZERO, round_amount


@dataclass(frozen=True)
class FineCalc:
    due_on: dt.date
    returned_on: dt.date
    calendar_days: int
    closed_days_skipped: int
    days_late: int
    grace_days: int
    within_grace: bool
    rate: Decimal
    raw_amount: Decimal
    rounded_amount: Decimal
    cap_amount: Decimal | None
    cap_source: str | None
    already_charged_on_loan: Decimal
    amount: Decimal

    def as_json(self) -> dict:
        def m(value: Decimal | None) -> str | None:
            return None if value is None else f"{value:.2f}"

        return {
            "due_on": self.due_on.isoformat(),
            "returned_on": self.returned_on.isoformat(),
            "calendar_days": self.calendar_days,
            "closed_days_skipped": self.closed_days_skipped,
            "days_late": self.days_late,
            "grace_days": self.grace_days,
            "within_grace": self.within_grace,
            "rate": m(self.rate),
            "raw_amount": m(self.raw_amount),
            "rounded_amount": m(self.rounded_amount),
            "cap": {"amount": m(self.cap_amount), "source": self.cap_source},
            "already_charged_on_loan": m(self.already_charged_on_loan),
            "amount": m(self.amount),
        }


def _cap(
    fine_cap: Decimal | None, price: Decimal | None, fallback_price: Decimal | None
) -> tuple[Decimal | None, str | None]:
    candidates: list[tuple[Decimal, str]] = []
    if fine_cap is not None:
        candidates.append((Decimal(fine_cap), "rule"))
    if price is not None:
        candidates.append((Decimal(price), "price"))
    elif fallback_price is not None:
        candidates.append((Decimal(fallback_price), "fallback_price"))
    if not candidates:
        return None, None
    return min(candidates, key=lambda c: c[0])


def calculate_fine(
    *,
    due_on: dt.date,
    returned_on: dt.date,
    closed: set[dt.date],
    skip_closed: bool,
    fine_per_day: Decimal,
    grace_days: int,
    fine_cap: Decimal | None,
    price: Decimal | None,
    fallback_price: Decimal | None,
    already_charged: Decimal = ZERO,
    rounding: str = "rupee",
) -> FineCalc:
    """The fine for one copy returned (or renewed, or declared lost) on `returned_on`."""
    rate = Decimal(fine_per_day)
    already = Decimal(already_charged)
    cap_amount, cap_source = _cap(fine_cap, price, fallback_price)
    calendar_days = max((returned_on - due_on).days, 0)
    skipped = (
        sum(1 for day in closed if due_on < day <= returned_on)
        if skip_closed and calendar_days
        else 0
    )
    days_late = calendar_days - skipped
    within_grace = 0 < calendar_days and days_late <= grace_days
    if days_late <= grace_days or calendar_days == 0:
        raw = rounded = amount = ZERO
    else:
        raw = days_late * rate
        rounded = round_amount(raw, rounding)
        room = None if cap_amount is None else cap_amount - already
        amount = rounded if room is None else min(rounded, room)
        amount = max(amount, ZERO)
    return FineCalc(
        due_on=due_on,
        returned_on=returned_on,
        calendar_days=calendar_days,
        closed_days_skipped=skipped,
        days_late=max(days_late, 0),
        grace_days=grace_days,
        within_grace=within_grace,
        rate=rate,
        raw_amount=Decimal(raw).quantize(Decimal("0.01")),
        rounded_amount=Decimal(rounded).quantize(Decimal("0.01")),
        cap_amount=cap_amount,
        cap_source=cap_source,
        already_charged_on_loan=already,
        amount=Decimal(amount).quantize(Decimal("0.01")),
    )
