"""Field parsers shared by the inventory services.

Each takes the raw wire value and a `details` dict to collect errors into, so a
service can report every bad field at once (a form that reveals its objections
one at a time is a form somebody submits four times). A parser that fails
returns None and has written the message; `codes` carries the machine code the
client maps to its own copy (`details.field_codes`).

Every numeric parser checks finiteness first: `Decimal("NaN")`,
`Decimal("Infinity")` and `"1e400"` all parse, and each then raised
`InvalidOperation` from a later quantize and answered 500 (security review F-4
on the ledger).
"""

from __future__ import annotations

import datetime as dt
import unicodedata
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.dates import tenant_today
from apps.common.money import D
from apps.inventory.constants import MIN_STOCK_DATE


class Errors:
    """`details` plus `field_codes`, built together."""

    def __init__(self) -> None:
        self.details: dict[str, Any] = {}
        self.codes: dict[str, str] = {}

    def add(self, path: str, message: str, code: str) -> None:
        """`path` may be dotted (`opening_stock.qty`, `lines.2.qty`) — stored nested."""
        node = self.details
        parts = path.split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node.setdefault(parts[-1], []).append(message)
        self.codes.setdefault(path, code)

    def __bool__(self) -> bool:
        return bool(self.details)

    def payload(self) -> dict:
        return {**self.details, "field_codes": dict(self.codes)}


def clean_text(value: Any, *, multiline: bool = False) -> str:
    """NFKC, control characters removed, whitespace folded (the ledger's rule).

    A bidi override in an item name reverses the text a customer reads on an
    invoice line; a newline in a name breaks a thermal print.
    """
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFKC", value)
    if multiline:
        lines = [
            "".join(ch for ch in line if unicodedata.category(ch)[0] != "C")
            for line in text.splitlines()
        ]
        return "\n".join(" ".join(line.split()) for line in lines).strip()
    text = "".join(ch for ch in text if unicodedata.category(ch)[0] != "C")
    return " ".join(text.split())


def _decimal(raw: Any) -> Decimal | None:
    if raw is None or raw == "" or isinstance(raw, bool):
        return None
    try:
        value = D(raw) if not isinstance(raw, float) else D(repr(raw))
        if not value.is_finite():
            return None
        return value
    except (InvalidOperation, TypeError, ValueError):
        return None


def parse_decimal(
    raw: Any,
    *,
    path: str,
    errors: Errors,
    places: int,
    maximum: str,
    required: bool = False,
    allow_negative: bool = False,
    allow_zero: bool = True,
    code: str = "invalid_amount",
    message: str = "Enter a valid amount.",
) -> Decimal | None:
    """A decimal with at most `places` places, rejected (never rounded) beyond."""
    if raw is None or raw == "":
        if required:
            errors.add(path, message, "required")
        return None
    value = _decimal(raw)
    if value is None:
        errors.add(path, message, code)
        return None
    try:
        too_precise = value != value.quantize(Decimal(1).scaleb(-places))
    except InvalidOperation:
        errors.add(path, message, code)
        return None
    if too_precise or abs(value) > D(maximum):
        errors.add(path, message, code)
        return None
    if (value < 0 and not allow_negative) or (value == 0 and not allow_zero):
        errors.add(path, message, code)
        return None
    return value


def parse_date(
    raw: Any, *, path: str, errors: Errors, tenant: Any, required: bool = True
) -> dt.date | None:
    """A business date in the TENANT's calendar: never in the future, not before 2000."""
    if raw in (None, ""):
        if required:
            errors.add(path, "Choose a date.", "required")
        return None
    value = raw
    if isinstance(value, str):
        try:
            value = dt.date.fromisoformat(value)
        except ValueError:
            errors.add(path, "Enter a valid date.", "invalid_date")
            return None
    if isinstance(value, dt.datetime) or not isinstance(value, dt.date):
        errors.add(path, "Enter a valid date.", "invalid_date")
        return None
    if value > tenant_today(tenant):
        errors.add(path, "The date cannot be in the future.", "future_date")
        return None
    if value < dt.date.fromisoformat(MIN_STOCK_DATE):
        errors.add(path, "That date is too far in the past.", "date_too_old")
        return None
    return value


def parse_bool(raw: Any, default: bool = False) -> bool:
    if isinstance(raw, bool):
        return raw
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}
