"""B04 — accession and member numbers: validation, keys, natural sort, lookup
classification (LIB-02 FR-5, §9 BR-2/BR-3/BR-4/BR-8, EC-3; LIB-04 §5).
"""

from __future__ import annotations

import inspect
import random
import re

import pytest

from apps.library.services import codes
from apps.library.services.codes import InvalidNumber
from apps.library.tests.purity import impure_imports

MESSAGE = "Use letters, numbers, - or /."


def test_a_legal_number_comes_back_trimmed() -> None:
    """LIB-02 §9: trimmed, then 1–24 of letters, digits, `-`, `/`."""
    assert codes.validate_number("  4512-A ") == "4512-A"
    assert codes.validate_number("R/2026/10") == "R/2026/10"
    assert codes.validate_number("x" * 24) == "x" * 24


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        "x" * 25,
        "45 12",  # a space inside
        "-4512",  # must start with a letter or digit
        "/1",
        "4512_A",
        "४५१२",  # Devanagari digits: `str.isdigit()` says yes
        "4512\nA",  # a newline inside (a pasted two-line cell)
        "Ⅻ",  # a Roman-numeral code point that `str.isalnum()` accepts
    ],
)
def test_illegal_numbers_are_refused_with_the_field_message(raw: str) -> None:
    """A Devanagari digit or an inner space stored as an accession number can
    never be scanned back, and a non-ASCII character defeats `upper()`-based
    uniqueness. The refusal carries the FRD's copy, so B05's serializer passes
    it straight through."""
    with pytest.raises(InvalidNumber) as caught:
        codes.validate_number(raw)
    assert caught.value.message == MESSAGE


def test_number_key_is_case_insensitive() -> None:
    """FR-5: `r-1` and `R-1` are one number; the unique index is on the upper
    case, so lookups must be too."""
    assert codes.number_key(" r-1 ") == codes.number_key("R-1") == "R-1"


def test_the_sort_vector_follows_br4() -> None:
    """T-LIB-02-2 corrected (G12): every digit run padded, so `9 < 10 < 100`
    and `R-2 < R-10`; padded digits sort before letters, so the numeric series
    comes before the R- series. A plain string sort gives `10, 100, 4512, 9`."""
    vector = ["9", "10", "100", "4512", "4512-A", "R-2", "R-10"]
    shuffled = list(reversed(vector))
    assert sorted(shuffled, key=codes.natural_sort_key) == vector
    assert codes.natural_sort_key("R-2") == "R-000000000002"
    assert codes.natural_sort_key("r-2") == codes.natural_sort_key("R-2")


def test_runs_longer_than_twelve_digits_still_sort_numerically() -> None:
    """G13: a register that uses 13-digit numbers padded to 12 would put
    1000000000000 before 999999999999. A long run sorts after every short one."""
    ordered = ["999999999999", "1000000000000", "999999999999999999999999"]
    assert sorted(reversed(ordered), key=codes.natural_sort_key) == ordered
    assert codes.natural_sort_key("0000000000042") == codes.natural_sort_key("42")


def test_the_longest_possible_key_fits_the_column() -> None:
    """G13: `varchar(48)` overflows on a legal 24-character number with twelve
    digit runs; the column is `varchar(160)`, and this is the worst case."""
    worst = [
        "1/" * 11 + "1",
        "1/" * 12,
        "1" * 24,
        "1" * 13 + "/1/1/1/1/1/",
    ]
    for raw in worst:
        assert len(codes.validate_number(raw)) <= 24
        assert len(codes.natural_sort_key(raw)) <= codes.SORT_KEY_MAX == 160


def _reference_key(raw: str) -> list[tuple[int, ...]]:
    """A different route to the same order: digit runs as integers, every other
    character by its code point, with a run ranked where `0` is."""
    out: list[tuple[int, ...]] = []
    for token in re.findall(r"[0-9]+|[^0-9]", raw.upper()):
        out.append((ord("0"), int(token)) if token[0].isdigit() else (ord(token),))
    return out


def test_fuzzed_sort_order_matches_a_reference_natural_sort() -> None:
    """Two thousand random legal numbers, sorted by the padded key and by a
    tokenising natural sort: the orders must be identical. Prevents a padding
    width, a case fold or a separator rule drifting from what SQL will see
    under C collation."""
    rng = random.Random(402)
    alphabet = "0123456789" * 3 + "ABCRxz-/"
    numbers = []
    for _ in range(2000):
        n = rng.randint(1, 24)
        raw = rng.choice("0123456789ARx") + "".join(rng.choice(alphabet) for _ in range(n - 1))
        numbers.append(codes.validate_number(raw))
    assert sorted(numbers, key=codes.natural_sort_key) == sorted(numbers, key=_reference_key)


def test_numeric_value_reads_only_all_digit_numbers() -> None:
    """BR-2/BR-3/EC-3: only an all-digit number moves the counter, by its
    value (`0042` is 42, stored as typed); `4512-A` never does."""
    assert codes.numeric_value("0042") == 42
    assert codes.numeric_value("9000") == 9000
    assert codes.numeric_value("4512-A") is None
    assert codes.numeric_value("४२") is None
    assert codes.numeric_value("") is None


def test_numeric_value_takes_the_series_prefix() -> None:
    """The core numbering screen can give a series a prefix (`M-` for members).
    A typed `M-0042` must raise that series past 42, case-insensitively, and a
    number from some other series must not move it."""
    assert codes.numeric_value("M-0042", prefix="M-") == 42
    assert codes.numeric_value("m-0042", prefix="M-") == 42
    assert codes.numeric_value("R-0042", prefix="M-") is None
    assert codes.numeric_value("M-", prefix="M-") is None


def test_classify_a_ten_digit_code_as_both_a_number_and_an_isbn() -> None:
    """BR-8: the resolver tries accession first, so it must be handed the
    number key even when the code is also a valid ISBN-10 — otherwise a
    ten-digit register number would open a book."""
    found = codes.classify("8173711461")
    assert found.number_key == "8173711461"
    assert found.isbn13 == "9788173711466"


def test_classify_a_code_that_is_only_one_of_the_two() -> None:
    """A typed ISBN with spaces is not a legal number but is a book; a
    suffixed number is never a book."""
    spaced = codes.classify("978 81 7371 146 6")
    assert spaced.number_key is None and spaced.isbn13 == "9788173711466"
    suffixed = codes.classify("4512-a")
    assert suffixed.number_key == "4512-A" and suffixed.isbn13 is None


def test_the_module_is_pure() -> None:
    """Same rule as `isbn.py`: no Django or app import in a validator."""
    assert impure_imports(inspect.getsource(codes)) == []


def test_the_purity_rule_catches_a_relative_import() -> None:
    """The guard read only absolute imports, so `from ..models import Copy`
    inside a helper would have passed it (B04 QA round 1, note 2)."""
    assert impure_imports("from ..models import Copy\n") == ["..models"]
    assert impure_imports("from . import models\n") == ["."]
    assert impure_imports("from . import isbn\nfrom .isbn import normalise\n") == []
    assert impure_imports("import django.db\nfrom apps.common import money\n") == [
        "django.db",
        "apps.common",
    ]
    assert impure_imports("import re\nfrom dataclasses import dataclass\n") == []
