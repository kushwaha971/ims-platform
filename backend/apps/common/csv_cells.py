"""One CSV cell, made safe and readable (§19) — HTTP-free, so services may use it.

The PLT-10 full export is the third CSV writer to need formula neutralisation;
the ledger's statement and the audit log's export predate this module and keep
their own copies until their owners move them here.
"""

from __future__ import annotations

import datetime as dt
import json
import uuid
from decimal import Decimal
from typing import Any

#: The characters Excel and LibreOffice read as "this cell is a formula".
FORMULA_LEAD = ("=", "+", "-", "@", "\t", "\r")


def neutralise(value: str) -> str:
    """Prefix a formula-leading TEXT cell with an apostrophe (Excel's own escape)."""
    text = str(value)
    return f"'{text}" if text[:1] in FORMULA_LEAD else text


def cell(value: Any) -> str:
    """A Python value as the text a spreadsheet should show.

    Numbers and dates are written as themselves — a negative amount is a
    number, not a formula, and must stay sortable. Only free TEXT is
    neutralised, because text is where a customer's name or a note can start
    with `=`.
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        return neutralise(json.dumps(value, ensure_ascii=False, default=str, sort_keys=True))
    return neutralise(str(value))
