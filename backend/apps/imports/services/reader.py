"""Reading an uploaded CSV the way a spreadsheet wrote it (IMP-01 §17.8.0 dialect).

Streaming, and that is a requirement rather than a preference (§5): a 10,000-row
file is read one record at a time, so memory is O(row). Nothing here calls
`read()` on the whole file.

── Row numbers are the SPREADSHEET's (BR-5) ──────────────────────────────────
The header is row 1 and the first data row is row 2. Comment lines (`#…`) and
blank lines are skipped but COUNTED, so "row 12" in an error is the row the
merchant sees labelled 12 in Excel — the whole point of the number. A quoted
cell with a newline inside it is one spreadsheet row and one record here,
which is why the count is of csv RECORDS and never of physical lines.
"""

from __future__ import annotations

import codecs
import csv
import io
import itertools
import unicodedata
from collections.abc import Iterator
from dataclasses import dataclass
from typing import IO

#: The candidates, in the order a tie is broken (§17.8.0: `,` `;` `\t` `|`).
DELIMITERS = (",", ";", "\t", "|")
_CHUNK = 64 * 1024

# Excel writes fields up to 32,767 characters; the csv module's default limit is
# 131,072, which is fine. Kept explicit so nobody lowers it by accident.
csv.field_size_limit(1 << 20)


class FileRefused(ValueError):
    """The whole file is unusable: `code` is a §10 file-level code."""

    def __init__(self, code: str, message: str, **details: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def detect_encoding(handle: IO[bytes]) -> str:
    """`utf-8-sig`, `utf-16` (by BOM) or `cp1252` — decided by a streamed pass.

    UTF-8 first, with or without a BOM. When a byte sequence is not UTF-8 the
    file came from Excel on an older Windows, which writes cp1252; cp1252
    decodes almost any byte, so the check that matters there is the five bytes
    it leaves undefined. Anything that fails both is `bad_encoding` (§10).
    """
    handle.seek(0)
    head = handle.read(4)
    handle.seek(0)
    if head.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return "utf-16"
    for encoding in ("utf-8-sig", "cp1252"):
        decoder = codecs.getincrementaldecoder(encoding)(errors="strict")
        try:
            while chunk := handle.read(_CHUNK):
                decoder.decode(chunk)
            decoder.decode(b"", final=True)
        except UnicodeDecodeError:
            handle.seek(0)
            continue
        handle.seek(0)
        return encoding
    handle.seek(0)
    raise FileRefused(
        "bad_encoding", "The file's characters could not be read — save it as CSV UTF-8."
    )


def looks_like_text(head: bytes) -> bool:
    """Content sniff (§10): a NUL byte means binary, whatever the extension said.

    UTF-16 is the one text encoding full of NULs, and it announces itself with a
    BOM, so it is let through here and decoded properly above.
    """
    if head.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return True
    return b"\x00" not in head


def normalise_header(cell: str) -> str:
    """`" Opening Balance "` → `opening_balance`; case, spaces and dashes folded."""
    value = unicodedata.normalize("NFC", cell or "").replace("\ufeff", "").strip().lower()
    for ch in (" ", "-", "."):
        value = value.replace(ch, "_")
    while "__" in value:
        value = value.replace("__", "_")
    return value.strip("_")


def _sniff(line: str) -> str:
    """The candidate that occurs most often OUTSIDE quotes on the header line."""
    counts = dict.fromkeys(DELIMITERS, 0)
    quoted = False
    for ch in line:
        if ch == '"':
            quoted = not quoted
        elif not quoted and ch in counts:
            counts[ch] += 1
    best = max(DELIMITERS, key=lambda d: counts[d])
    return best if counts[best] else ","


def _is_comment(cells: list[str]) -> bool:
    return bool(cells) and cells[0].lstrip().startswith("#")


def _is_blank(cells: list[str]) -> bool:
    return all(not (cell or "").strip() for cell in cells)


@dataclass(slots=True)
class Record:
    """One data row: its spreadsheet row number and its cells as typed."""

    row: int
    cells: list[str]


@dataclass(slots=True)
class ParsedFile:
    header: list[str]
    header_row: int
    delimiter: str
    records: Iterator[Record]
    #: Blank and comment rows seen so far — filled as `records` is consumed.
    skipped: list[int]


def open_records(handle: IO[bytes]) -> ParsedFile:
    """Decode, find the header, sniff the delimiter, and hand back a record stream.

    Leading comment and blank lines are allowed before the header (they keep
    their numbers). A file with no header at all is `empty_file`.
    """
    encoding = detect_encoding(handle)
    text = io.TextIOWrapper(handle, encoding=encoding, newline="")
    # Read physical lines until the header candidate. Comments and blank lines
    # before it are kept and replayed, so the csv reader numbers them too.
    prefix: list[str] = []
    header_line = None
    for line in text:
        prefix.append(line)
        stripped = line.strip().lstrip("\ufeff")
        if stripped and not stripped.startswith("#"):
            header_line = line
            break
        if len(prefix) > 1000:
            break
    if header_line is None:
        raise FileRefused("empty_file", "The file has no rows.")
    delimiter = _sniff(header_line)
    reader = csv.reader(itertools.chain(prefix, text), delimiter=delimiter)

    skipped: list[int] = []
    row_number = 0
    header: list[str] | None = None
    header_row = 0
    for cells in reader:
        row_number += 1
        if _is_blank(cells) or _is_comment(cells):
            skipped.append(row_number)
            continue
        header = cells
        header_row = row_number
        break
    if header is None:
        raise FileRefused("empty_file", "The file has no rows.")

    def records() -> Iterator[Record]:
        number = header_row
        for cells in reader:
            number += 1
            if _is_blank(cells) or _is_comment(cells):
                skipped.append(number)
                continue
            yield Record(row=number, cells=cells)

    return ParsedFile(
        header=header,
        header_row=header_row,
        delimiter=delimiter,
        records=records(),
        skipped=skipped,
    )
