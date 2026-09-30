"""A rate to its tax code, for the document port's `gst_rate` convenience (R2, ADR-057).

`tax_code` is THE tax field of a document line; a rate is not enough to name a supply, because
four codes are 0% — GST0, EXEMPT, NIL and NONGST — and GSTR-1 reports each apart. So a rate is
mapped only when exactly one code carries it on the document date (tenant rows shadowing global
ones, as `rates_on` sees them), and anything else is refused with the words the port's 400 shows
on `lines.N.gst_rate` (FRD 00 PLT-X05 BR-7).
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.tax.selectors.rates import rates_on


class RateNotResolved(ValueError):
    """`reason` is `none`, `several` or `invalid`; the message is the merchant-facing text."""

    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


def _percent(rate: Decimal) -> str:
    text = format(rate.normalize(), "f")
    return text


def code_for_rate(tenant: Any, rate: Any, on_date: dt.date) -> str:
    """The one tax code whose rate on `on_date` is `rate`, or `RateNotResolved`."""
    try:
        wanted = Decimal(str(rate))
    except (InvalidOperation, TypeError, ValueError):
        raise RateNotResolved("Enter a GST rate or send tax_code.", reason="invalid") from None
    if not wanted.is_finite():
        raise RateNotResolved("Enter a GST rate or send tax_code.", reason="invalid")
    codes = [
        row["code"]
        for row in rates_on(tenant=tenant, on_date=on_date)
        if Decimal(row["rate"]) == wanted
    ]
    if not codes:
        raise RateNotResolved(
            f"No tax code for {_percent(wanted)}% on {on_date.strftime('%d/%m/%Y')}.",
            reason="none",
        )
    if len(codes) > 1:
        raise RateNotResolved(
            f"Several tax codes are {_percent(wanted)}%; send tax_code.", reason="several"
        )
    return codes[0]
