"""LED-04 BR-8 / §19 — the statement as a CSV a merchant hands their accountant.

Small, and two of the three things in it are about not being dangerous.
"""

from __future__ import annotations

import csv
from decimal import Decimal
from typing import Any, Iterable

from apps.common.constants import Direction

#: BR-8, in order. The header is the contract — an accountant opens this in
#: Excel and sorts by a column name.
CSV_COLUMNS = (
    "date",
    "particulars",
    "document_number",
    "you_gave",
    "you_got",
    "balance",
    "balance_label",
    "note",
    "entry_type",
    "status",
)

#: §19 — the four characters Excel and LibreOffice read as "this cell is a
#: formula". A CSV is not code, and a spreadsheet that decides otherwise about a
#: customer's name is a spreadsheet that can be made to run one.
FORMULA_LEAD = ("=", "+", "-", "@", "\t", "\r")


def neutralise(value: str) -> str:
    """Prefix a formula-leading cell with an apostrophe (§19).

    The apostrophe is Excel's own escape and is not shown to the reader, so the
    cell says what it said. `-` is in the set and that is not paranoia: a note
    reading "-500 returned" is a formula to a spreadsheet, and it is a note a
    shopkeeper would write.
    """
    text = str(value)
    return f"'{text}" if text[:1] in FORMULA_LEAD else text


def balance_label(amount: Decimal) -> str:
    """BR-4. The balance carries no sign on screen; the LABEL carries the direction.

    English in the file rather than the merchant's locale, for the reason the
    opening balance's note is English: a CSV is opened by a spreadsheet, filtered
    by a column value and mailed to an accountant, and a file whose values change
    language with the exporter's settings is a file nobody can write a formula
    against.
    """
    if amount > 0:
        return "You will get"
    if amount < 0:
        return "You will give"
    return "Settled"


def statement_csv_rows(rows: Iterable[Any], *, carried: Decimal, t: Any = None) -> Iterable[list]:
    """Header, then one list per row, with the running balance accumulated.

    A generator so a five-thousand-row export streams rather than assembling
    itself in memory first — §14 caps the synchronous path at that figure and
    hands anything larger to an async export, which is a table that does not
    exist yet, so the cap is enforced by the view and this stays honest.
    """
    yield list(CSV_COLUMNS)
    for row in rows:
        running = carried + getattr(row, "running_delta", Decimal("0.00"))
        yield [
            row.entry_date.strftime("%d/%m/%Y"),
            neutralise(row.note or row.get_entry_type_display()),
            "",  # No document has ever posted a ledger line; see the serializer.
            str(row.amount) if row.direction == Direction.DEBIT else "",
            str(row.amount) if row.direction == Direction.CREDIT else "",
            str(running),
            balance_label(running),
            neutralise(row.note or ""),
            row.entry_type,
            row.status,
        ]


def write_csv(handle: Any, rows: Iterable[list]) -> None:
    writer = csv.writer(handle)
    for row in rows:
        writer.writerow(row)
