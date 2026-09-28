"""The shared scalar parsers (IMP-01 §17.8.0, normative).

Every importer uses these and nothing else, so `invalid_amount` means the same
thing — and says the same sentence — in the parties file and the items file.
Each returns the clean value or raises `CoerceError(code, message)`; the engine
turns that into one row error on the column being read.

A blank cell is `None` everywhere. `-`, `NA` and `N/A` are blanks too (PTY-10
§10's lenient normalisations): a merchant who typed a dash meant "nothing".
"""

from __future__ import annotations

import datetime as dt
import re
import unicodedata
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation


class CoerceError(ValueError):
    """One cell that does not parse. `code` is §17.8.0's snake_case error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


BLANKS = frozenset({"", "-", "na", "n/a"})

#: `₹`, `Rs`, `Rs.`, `INR`, a trailing `/-`, spaces and grouping commas. Indian
#: grouping (`1,24,500.00`) and Western grouping read the same once commas go.
_CURRENCY_JUNK = re.compile(r"(?i)(₹|rs\.?|inr|/-|\s|,)")
#: Excel's scientific notation for a long number — `8.90123E+12`. A barcode or a
#: mobile in that shape has already lost digits, and no parser can get them back.
SCIENTIFIC = re.compile(r"^[+-]?\d+(\.\d+)?[eE][+-]?\d+$")


def text(raw: str | None) -> str:
    """Trimmed, NFC-normalised, control characters stripped (§17.8.0 Text)."""
    if raw is None:
        return ""
    value = unicodedata.normalize("NFC", str(raw))
    value = "".join(ch for ch in value if unicodedata.category(ch)[0] != "C")
    return value.strip()


def is_blank(raw: str | None) -> bool:
    return text(raw).lower() in BLANKS


def optional_text(raw: str | None, *, max_length: int | None = None) -> str | None:
    if is_blank(raw):
        return None
    value = text(raw)
    if max_length is not None and len(value) > max_length:
        raise CoerceError("max_length", f"Keep this under {max_length} characters.")
    return value


def decimal_value(
    raw: str | None,
    *,
    places: int,
    code: str = "invalid_amount",
    message: str = "Enter an amount like 2300 or 2300.50.",
    minimum: Decimal | None = Decimal("0"),
    maximum: Decimal | None = None,
) -> Decimal | None:
    """Money (2 dp), quantity (3 dp) and unit cost (4 dp) share this.

    `(1250)` is refused rather than read as negative: an accountant's bracket
    means "credit" in one sheet and "estimate" in the next, and a guess about
    money is worse than a question.
    """
    if is_blank(raw):
        return None
    cleaned = _CURRENCY_JUNK.sub("", text(raw))
    if not cleaned or cleaned.startswith("(") or SCIENTIFIC.match(cleaned):
        raise CoerceError(code, message)
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        raise CoerceError(code, message) from None
    if not value.is_finite():
        raise CoerceError(code, message)
    if -value.as_tuple().exponent > places and value != value.quantize(Decimal(10) ** -places):
        raise CoerceError(code, f"Use at most {places} decimal places.")
    if minimum is not None and value < minimum:
        raise CoerceError(code, "Enter an amount of zero or more.")
    if maximum is not None and value > maximum:
        raise CoerceError(code, message)
    return value.quantize(Decimal(10) ** -places)


def money(raw: str | None, **kwargs: object) -> Decimal | None:
    return decimal_value(raw, places=2, **kwargs)  # type: ignore[arg-type]


def quantity(raw: str | None, **kwargs: object) -> Decimal | None:
    kwargs.setdefault("code", "invalid_qty")
    kwargs.setdefault("message", "Enter a quantity like 10 or 2.5.")
    return decimal_value(raw, places=3, **kwargs)  # type: ignore[arg-type]


def unit_cost(raw: str | None, **kwargs: object) -> Decimal | None:
    return decimal_value(raw, places=4, **kwargs)  # type: ignore[arg-type]


_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d-%b-%y", "%d-%b-%Y")


def date_value(raw: str | None, *, today: dt.date | None = None) -> dt.date | None:
    """`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, and Excel's `01-Apr-26`.

    `DD/MM` is never read as `MM/DD`: 04/05/2026 is the fourth of May, which is
    what every merchant in the country means by it. A date in the future is its
    own code, because the fix is different — the day is real, it is just wrong.
    """
    if is_blank(raw):
        return None
    value = text(raw)
    for fmt in _DATE_FORMATS:
        try:
            parsed = dt.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
        if today is not None and parsed > today:
            raise CoerceError("future_date", "Use a date that is not in the future.")
        return parsed
    raise CoerceError("invalid_date", "Use a date like 01/04/2026.")


_TRUE = frozenset({"true", "yes", "y", "1", "हाँ", "हां"})
_FALSE = frozenset({"false", "no", "n", "0", "नहीं"})


def boolean(raw: str | None) -> bool | None:
    if is_blank(raw):
        return None
    value = text(raw).lower()
    if value in _TRUE:
        return True
    if value in _FALSE:
        return False
    raise CoerceError("invalid_boolean", "Use yes or no.")


def mobile(raw: str | None) -> str | None:
    """E.164 `+91XXXXXXXXXX`, through the SAME normaliser the rest of the app uses.

    §17.8.0's "strip non-digits, take the last 10" is applied first — so
    `091-98765 43210` and `+91 98765-43210` both land — and the result is then
    handed to `platform_app.mobile.normalise_mobile`, which is what decides what
    a valid Indian mobile is everywhere else. Two definitions of a valid number
    would be one per screen by next quarter.
    """
    from apps.platform_app.mobile import InvalidMobile, normalise_mobile

    if is_blank(raw):
        return None
    value = text(raw)
    if SCIENTIFIC.match(value.replace(" ", "")):
        raise CoerceError(
            "invalid_mobile", "Excel turned this number into 9.9E+09 — format the column as Text."
        )
    digits = re.sub(r"\D", "", value)
    if len(digits) < 10:
        raise CoerceError("invalid_mobile", "Not a valid 10-digit mobile.")
    try:
        return normalise_mobile(digits[-10:])
    except InvalidMobile:
        raise CoerceError("invalid_mobile", "Not a valid 10-digit mobile.") from None


def choice(raw: str | None, allowed: Iterable[str], *, message: str) -> str | None:
    """Any case, matched to the allowed set (§17.8.0 Enum)."""
    if is_blank(raw):
        return None
    value = text(raw).lower().replace(" ", "_")
    options = {option.lower(): option for option in allowed}
    if value not in options:
        raise CoerceError("invalid_choice", message)
    return options[value]
