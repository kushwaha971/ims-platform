"""What a business spent, for a vertical's profit view (Library P0) — the spend seam.

A reading room's owner asks one question at the end of a month: the fees came in, the
rent and the light bill went out, what is left? The fees are the library's; the bills
are the expenses app's, which the library may not import (ADR-041: verticals never
reach into Shop & billing). So the expenses app registers ONE reader here in its
`ready()`, and a vertical asks this module — the document port's pattern, kept tiny.

Rule D1: this module imports the standard library only.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any, Callable, TypedDict


class SpendLine(TypedDict):
    category: str
    amount: Decimal


SpendReader = Callable[[Any, dt.date, dt.date], list[SpendLine]]
_reader: list[SpendReader] = []


def register_spend_reader(reader: SpendReader) -> None:
    """Idempotent for the same reader; the expenses app is the one caller."""
    if reader not in _reader:
        _reader.clear()
        _reader.append(reader)


def spend_by_category(tenant: Any, start: dt.date, end: dt.date) -> list[SpendLine]:
    """Recorded spend in `[start, end]` by category, largest first; [] with no reader."""
    return _reader[0](tenant, start, end) if _reader else []
