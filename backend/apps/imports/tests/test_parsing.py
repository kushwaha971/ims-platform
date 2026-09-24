"""T-IMP-01-1 … T-IMP-01-3 — the shared scalar parsers and the CSV dialect.

These are the rules every import kind inherits, so a regression here is a
regression in every file a merchant uploads.
"""

from __future__ import annotations

import codecs
import datetime as dt
import io
from decimal import Decimal

import pytest

from apps.imports.services import coerce
from apps.imports.services.coerce import CoerceError
from apps.imports.services.reader import FileRefused, normalise_header, open_records


def _raises(code: str, fn, *args, **kwargs) -> None:
    with pytest.raises(CoerceError) as caught:
        fn(*args, **kwargs)
    assert caught.value.code == code


# ── T-IMP-01-1: coercers ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("1250", Decimal("1250.00")),
        ("1250.5", Decimal("1250.50")),
        ("1,250.50", Decimal("1250.50")),
        ("₹1,24,500.00", Decimal("124500.00")),
        ("Rs. 2300/-", Decimal("2300.00")),
        (" 1250.50 ", Decimal("1250.50")),
        ("1250.500", Decimal("1250.50")),
    ],
)
def test_money_accepts_what_a_merchant_types(raw: str, expected: Decimal) -> None:
    """Indian grouping, the rupee sign and `/-` must not make a real amount an error."""
    assert coerce.money(raw) == expected


@pytest.mark.parametrize("raw", ["(1250)", "12.345", "abc", "1e5", "-5"])
def test_money_refuses_what_it_would_have_to_guess(raw: str) -> None:
    """A bracket, a third decimal or a negative is a question, never a silent reading."""
    _raises("invalid_amount", coerce.money, raw)


def test_blank_and_dash_cells_are_nothing() -> None:
    """`-`, `NA` and an empty cell all mean "not given", not an error."""
    for raw in ("", "  ", "-", "NA", "n/a", None):
        assert coerce.money(raw) is None
        assert coerce.mobile(raw) is None


def test_quantity_and_unit_cost_have_their_own_precision() -> None:
    assert coerce.quantity("2.125") == Decimal("2.125")
    _raises("invalid_qty", coerce.quantity, "2.1255")
    assert coerce.unit_cost("400.1234") == Decimal("400.1234")


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("2026-04-01", dt.date(2026, 4, 1)),
        ("01/04/2026", dt.date(2026, 4, 1)),
        ("01-04-2026", dt.date(2026, 4, 1)),
        ("04/05/2026", dt.date(2026, 5, 4)),
        ("01-Apr-26", dt.date(2026, 4, 1)),
    ],
)
def test_dates_are_day_first(raw: str, expected: dt.date) -> None:
    """04/05/2026 is the fourth of May in India — never read as MM/DD."""
    assert coerce.date_value(raw) == expected


def test_a_future_date_and_a_nonsense_date_have_different_codes() -> None:
    _raises("future_date", coerce.date_value, "01/01/2030", today=dt.date(2026, 9, 24))
    _raises("invalid_date", coerce.date_value, "31/02/2026")


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("yes", True),
        ("Y", True),
        ("1", True),
        ("हाँ", True),
        ("No", False),
        ("0", False),
        ("नहीं", False),
    ],
)
def test_booleans_in_english_and_hindi(raw: str, expected: bool) -> None:
    assert coerce.boolean(raw) is expected


@pytest.mark.parametrize(
    "raw", ["9876543210", "+919876543210", "091-98765 43210", "+91 98765-43210", "919876543210"]
)
def test_mobiles_normalise_to_e164_like_everywhere_else(raw: str) -> None:
    """The four shapes of §17.8.0 land on the one spelling the database holds."""
    assert coerce.mobile(raw) == "+919876543210"


@pytest.mark.parametrize("raw", ["12345", "5876543210", "9.87654E+09"])
def test_mobiles_that_are_not_mobiles_are_refused(raw: str) -> None:
    """A landline-looking number, a short one, and Excel's scientific notation."""
    _raises("invalid_mobile", coerce.mobile, raw)


def test_text_strips_control_characters_and_normalises() -> None:
    """A bidi override would make "Ramesh" display as another name everywhere."""
    assert coerce.text("  Ram\u202eesh \x07 ") == "Ramesh"


# ── T-IMP-01-2 / 3: dialect and row numbering ────────────────────────────────


def _parse(data: bytes) -> tuple[list[str], list[tuple[int, list[str]]]]:
    parsed = open_records(io.BytesIO(data))
    return parsed.header, [(r.row, r.cells) for r in parsed.records]


@pytest.mark.parametrize("delimiter", [",", ";", "\t", "|"])
def test_the_delimiter_is_sniffed_from_the_header(delimiter: str) -> None:
    """A European-locale Excel saves `;`; a copy from a TSV saves tabs (EC-1)."""
    text = (
        delimiter.join(["name", "mobile"]) + "\n" + delimiter.join(["Ramesh", "9876543210"]) + "\n"
    )
    header, rows = _parse(text.encode())
    assert header == ["name", "mobile"]
    assert rows == [(2, ["Ramesh", "9876543210"])]


def test_bom_crlf_and_quoted_newlines_are_read_as_excel_wrote_them() -> None:
    data = codecs.BOM_UTF8 + b'name,notes\r\n"Sharma, Ltd","line one\r\nline two"\r\nNext,x\r\n'
    header, rows = _parse(data)
    assert normalise_header(header[0]) == "name"
    assert rows[0] == (2, ["Sharma, Ltd", "line one\r\nline two"])
    # The quoted newline is ONE spreadsheet row, so "Next" is row 3, not 4.
    assert rows[1][0] == 3


def test_cp1252_from_old_excel_is_decoded() -> None:
    """A file saved by Excel on older Windows is not UTF-8; it is still readable."""
    data = "name,notes\nCafé,naïve\n".encode("cp1252")
    _header, rows = _parse(data)
    assert rows == [(2, ["Café", "naïve"])]


def test_utf16_with_a_bom_is_decoded() -> None:
    data = "name\nरमेश\n".encode("utf-16")
    _header, rows = _parse(data)
    assert rows == [(2, ["रमेश"])]


def test_row_numbers_are_the_spreadsheets_with_comments_and_blanks_interleaved() -> None:
    """BR-5 — "row 7" in an error must be the row Excel labels 7."""
    data = b"name\n# allowed values...\nA\n\nB\n# note\nC\n"
    _header, rows = _parse(data)
    assert rows == [(3, ["A"]), (5, ["B"]), (7, ["C"])]


def test_a_file_with_nothing_but_comments_is_empty() -> None:
    with pytest.raises(FileRefused) as caught:
        open_records(io.BytesIO(b"# just a comment\n\n"))
    assert caught.value.code == "empty_file"


def test_headers_fold_case_spaces_and_dashes() -> None:
    assert normalise_header(" Opening Balance ") == "opening_balance"
    assert normalise_header("\ufeffName") == "name"
    assert normalise_header("mobile-no.") == "mobile_no"
