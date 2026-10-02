"""Accession and member numbers (LIB-02 FR-5, §9, BR-2–BR-4, BR-8, EC-3; LIB-04 §5; task B04).

Pure: no database, no Django. Serializers, importers and the counter's lookup
resolver all call these, and B05/B07 store `natural_sort_key` in
`accession_sort` and `member_number_sort`.

Characters are ASCII only, matched by explicit classes and `fullmatch`:
`str.isdigit()`/`isalnum()` accept Devanagari digits and Roman-numeral code
points.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from . import isbn

NUMBER_MAX = 24
#: G13: the stored sort key's column width. The worst legal case is 156
#: characters (twelve one-digit runs and twelve separators).
SORT_KEY_MAX = 160
#: BR-4: every digit run is left-padded to this width.
RUN_WIDTH = 12

MESSAGE = "Use letters, numbers, - or /."

_NUMBER = re.compile(r"[A-Za-z0-9][A-Za-z0-9/-]*")
_RUN = re.compile(r"[0-9]+")
#: Sorts after every digit and before every letter in C collation (0x3A).
_LONG_RUN_MARK = ":"


class InvalidNumber(ValueError):
    """A number that is not 1–24 of letters, digits, `-` and `/`."""

    def __init__(self, message: str = MESSAGE) -> None:
        super().__init__(message)
        self.message = message


def validate_number(raw: str) -> str:
    """The trimmed number, or `InvalidNumber` with the field's message."""
    value = (raw or "").strip()
    if not 1 <= len(value) <= NUMBER_MAX or not _NUMBER.fullmatch(value):
        raise InvalidNumber()
    return value


def number_key(raw: str) -> str:
    """The case-insensitive identity of a number (FR-5): lookup and uniqueness."""
    return (raw or "").strip().upper()


def _pad_run(match: re.Match[str]) -> str:
    run = match.group(0)
    significant = run.lstrip("0") or "0"
    if len(significant) <= RUN_WIDTH:
        return significant.rjust(RUN_WIDTH, "0")
    # G13: a value of 13+ digits. Padding it to 12 would do nothing and it
    # would sort before 999999999999; the mark ranks it after every 12-wide
    # run, and the fixed 24 width orders long runs among themselves.
    return _LONG_RUN_MARK + significant.rjust(NUMBER_MAX, "0")


def natural_sort_key(raw: str) -> str:
    """BR-4: upper case with every digit run left-padded to 12 (`R-2` →
    `R-000000000002`), so `ORDER BY` on the stored key under C collation is
    numeric-aware. Runs equal in value are equal (`0042` and `42`)."""
    return _RUN.sub(_pad_run, number_key(raw))


def numeric_value(raw: str, *, prefix: str = "") -> int | None:
    """The value of an all-digit number after the series prefix, else None.

    BR-2/EC-3: `0042` is 42 (the number is stored as typed; the counter moves
    by value). BR-3: `4512-A` is None and never moves the counter. A number
    that does not carry the series prefix belongs to no series.
    """
    value = number_key(raw)
    head = (prefix or "").upper()
    if not value.startswith(head):
        return None
    digits = value[len(head) :]
    return int(digits) if _RUN.fullmatch(digits) else None


@dataclass(frozen=True, slots=True)
class Classified:
    """What a scanned or typed code could be, for the BR-8 resolver (B05, B07).

    `number_key` is set when the code is a legal number (accession, barcode or
    member number); `isbn13` when it is a valid ISBN in either form. A code can
    be both — the resolver tries numbers first, so a ten-digit register number
    is never read as a book.
    """

    number_key: str | None
    isbn13: str | None


def classify(code: str) -> Classified:
    try:
        key: str | None = number_key(validate_number(code))
    except InvalidNumber:
        key = None
    return Classified(number_key=key, isbn13=isbn.to_isbn13(code))
