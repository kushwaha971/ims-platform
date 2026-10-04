"""Field cleaners shared by the library's write services (B05 catalogue, B06 on).

Each takes the request body and a field name, returns the cleaned value or
records a per-field message on `Errors` (and returns None), so a service can
report every bad field of a request in one 400 instead of the first.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any

from apps.common.exceptions import ValidationFailed

MONEY_MAX = Decimal("99999999.99")


class Errors(dict):
    def add(self, field: str, message: str) -> None:
        self.setdefault(field, []).append(message)

    def raise_if_any(self) -> None:
        if self:
            raise ValidationFailed(dict(self))


def text(errors: Errors, data: dict, field: str, limit: int, *, required: bool = False) -> Any:
    value = data.get(field, "")
    if value is None:
        value = ""
    if not isinstance(value, str):
        errors.add(field, "Enter text.")
        return None
    value = value.strip()
    if required and not value:
        errors.add(field, "This field is required.")
        return None
    if len(value) > limit:
        errors.add(field, f"Use at most {limit} characters.")
        return None
    return value


def choice(errors: Errors, data: dict, field: str, choices: Any, default: str) -> Any:
    value = data.get(field, default)
    if value not in choices.values:
        errors.add(field, "Choose one of the options.")
        return None
    return value


def money(errors: Errors, data: dict, field: str) -> Any:
    value = data.get(field)
    if value in (None, ""):
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        errors.add(field, "Enter an amount.")
        return None
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation:
        errors.add(field, "Enter an amount.")
        return None
    if (
        not amount.is_finite()
        or amount != amount.quantize(Decimal("0.01"))
        or not Decimal("0") <= amount <= MONEY_MAX
    ):
        errors.add(field, "Enter an amount from 0 to 99,999,999.99.")
        return None
    return amount.quantize(Decimal("0.01"))


def date(errors: Errors, data: dict, field: str) -> Any:
    value = data.get(field)
    if value in (None, ""):
        return None
    try:
        return dt.date.fromisoformat(str(value))
    except ValueError:
        errors.add(field, "Enter a date as YYYY-MM-DD.")
        return None


def boolean(errors: Errors, data: dict, field: str, default: bool = False) -> Any:
    value = data.get(field, default)
    if not isinstance(value, bool):
        errors.add(field, "Choose yes or no.")
        return None
    return value


def uuid_or_none(raw: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError, AttributeError):
        return None


def owned(model: Any, tenant: Any, raw: Any, errors: Errors, field: str) -> Any:
    """A live row of `model` in this tenant by id, or a field error (never 404:
    the id is a field of the body, and another tenant's id is "not a choice")."""
    if raw in (None, ""):
        return None
    pk = uuid_or_none(raw)
    row = model.objects.filter(tenant=tenant, pk=pk).first() if pk else None
    if row is None:
        errors.add(field, "Choose one of the options.")
    return row


def integer(
    errors: Errors, data: dict, field: str, low: int, high: int, *, default: Any = None
) -> Any:
    """A whole number in `[low, high]`; blank is `default` (None = "inherit" / "no limit")."""
    value = data.get(field, default)
    if value in (None, ""):
        return default
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        errors.add(field, "Enter a whole number.")
        return None
    try:
        number = int(str(value).strip())
    except ValueError:
        errors.add(field, "Enter a whole number.")
        return None
    if not low <= number <= high:
        errors.add(field, f"Enter a number from {low} to {high}.")
        return None
    return number
