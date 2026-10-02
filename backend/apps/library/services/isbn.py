"""ISBN-10 and ISBN-13 (LIB-02 §9 "isbn13", FR-9; task B04).

Pure: no database, no Django. A title stores the ISBN-13; a person may type
either form, with spaces or hyphens, and a scanner sends the bare digits.

Only ASCII digits count. `str.isdigit()` is true for Devanagari ०–९, and
`int()` reads them, so a check that leaned on either would accept an "ISBN"
typed on a Hindi keyboard that no scanner can ever produce.
"""

from __future__ import annotations

import re

_DIGITS = re.compile(r"[0-9]+")
_ISBN10 = re.compile(r"[0-9]{9}[0-9X]")
_SEPARATORS = re.compile(r"[\s-]+")
_BOOK_PREFIXES = ("978", "979")


def normalise(raw: str) -> str:
    """Strip whitespace and hyphens and upper-case the `x` check character."""
    return _SEPARATORS.sub("", raw or "").upper()


def _isbn10_check(nine: str) -> str:
    remainder = sum(int(ch) * (10 - i) for i, ch in enumerate(nine)) % 11
    value = (11 - remainder) % 11
    return "X" if value == 10 else str(value)


def _ean_check(twelve: str) -> str:
    total = sum(int(ch) * (3 if i % 2 else 1) for i, ch in enumerate(twelve))
    return str((10 - total % 10) % 10)


def is_valid_isbn10(value: str) -> bool:
    """A normalised ISBN-10: nine digits and a mod-11 check, `X` only last."""
    return bool(_ISBN10.fullmatch(value)) and _isbn10_check(value[:9]) == value[9]


def is_valid_isbn13(value: str) -> bool:
    """A normalised ISBN-13: thirteen digits, a 978/979 prefix, the EAN check."""
    return (
        len(value) == 13
        and bool(_DIGITS.fullmatch(value))
        and value.startswith(_BOOK_PREFIXES)
        and _ean_check(value[:12]) == value[12]
    )


def to_isbn13(raw: str) -> str | None:
    """The ISBN-13 of an ISBN typed in either form, or None if it is not one."""
    value = normalise(raw)
    if is_valid_isbn13(value):
        return value
    if is_valid_isbn10(value):
        twelve = "978" + value[:9]
        return twelve + _ean_check(twelve)
    return None


def to_isbn10(raw: str) -> str | None:
    """The ISBN-10 for display; None when there is none (any 979 number)."""
    thirteen = to_isbn13(raw)
    if thirteen is None or not thirteen.startswith("978"):
        return None
    nine = thirteen[3:12]
    return nine + _isbn10_check(nine)
