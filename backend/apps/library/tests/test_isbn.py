"""B04 — ISBN-10 and ISBN-13 validation and conversion (LIB-02 §9, T-LIB-02-1).

Every vector here is computed, not copied: T-LIB-02-1's "817371146X-style"
example is not a real ISBN-10 of the book it names (its check digit is 1, G11),
which is exactly how a copied vector teaches a validator to accept a typo. The
reference functions below compute check digits by a different route from the
module under test (whole-number weighted sums against a target residue, rather
than a computed check character), so a shared mistake is unlikely.
"""

from __future__ import annotations

import inspect
import random

from apps.library.services import isbn
from apps.library.tests.purity import impure_imports

WINGS_OF_FIRE_13 = "978-81-7371-146-6"
WINGS_OF_FIRE_10 = "8173711461"


def _ref_isbn10_ok(s: str) -> bool:
    if len(s) != 10:
        return False
    values = []
    for i, ch in enumerate(s):
        if ch.isascii() and ch.isdigit():
            values.append(int(ch))
        elif ch == "X" and i == 9:
            values.append(10)
        else:
            return False
    return sum(v * (10 - i) for i, v in enumerate(values)) % 11 == 0


def _ref_ean_ok(s: str) -> bool:
    if len(s) != 13 or not (s.isascii() and s.isdigit()):
        return False
    return sum(int(ch) * (3 if i % 2 else 1) for i, ch in enumerate(s)) % 10 == 0


def _ref_isbn13_ok(s: str) -> bool:
    return _ref_ean_ok(s) and s[:3] in ("978", "979")


def _ref_complete10(stem: str) -> str:
    for check in "0123456789X":
        if _ref_isbn10_ok(stem + check):
            return stem + check
    raise AssertionError(stem)


def _ref_complete13(stem: str) -> str:
    """Any EAN-13 (a 977 periodical too), so the prefix rule is tested apart."""
    for check in "0123456789":
        if _ref_ean_ok(stem + check):
            return stem + check
    raise AssertionError(stem)


def test_the_reference_agrees_with_the_book_in_the_frd() -> None:
    """The two vectors the rest of this file leans on are themselves checked."""
    assert _ref_isbn13_ok(WINGS_OF_FIRE_13.replace("-", ""))
    assert _ref_isbn10_ok(WINGS_OF_FIRE_10)


def test_normalise_strips_spaces_and_hyphens_and_upper_cases_x() -> None:
    """A scanner sends digits; a person types `81-7371-146-1` or `81 7371 146 x`.
    All three must reach the validator as the same ten characters."""
    assert isbn.normalise(" 978-81-7371-146-6 ") == "9788173711466"
    assert isbn.normalise("81 7371 146 x") == "817371146X"


def test_the_book_is_valid_in_both_forms_and_converts_both_ways() -> None:
    """T-LIB-02-1: a book catalogued by its ISBN-10 must be found by its
    ISBN-13 and the other way round; the title stores the 13."""
    assert isbn.is_valid_isbn13(isbn.normalise(WINGS_OF_FIRE_13))
    assert isbn.is_valid_isbn10(WINGS_OF_FIRE_10)
    assert isbn.to_isbn13(WINGS_OF_FIRE_10) == "9788173711466"
    assert isbn.to_isbn13(WINGS_OF_FIRE_13) == "9788173711466"
    assert isbn.to_isbn10(WINGS_OF_FIRE_13) == WINGS_OF_FIRE_10


def test_a_wrong_check_digit_is_refused() -> None:
    """The field's whole message is "This ISBN's check digit is wrong."; the
    `X` the FRD example carries is that kind of typo for this book."""
    assert not isbn.is_valid_isbn10("817371146X")
    assert not isbn.is_valid_isbn13("9788173711467")
    assert isbn.to_isbn13("817371146X") is None


def test_x_is_accepted_only_as_the_last_character_and_in_either_case() -> None:
    """Mod 11 needs a symbol for ten, and only the check position can hold it.
    An `X` anywhere else is a letter in a number."""
    stem = next(
        s
        for s in (f"{n:09d}" for n in range(81_7371_100, 81_7371_400))
        if _ref_complete10(s).endswith("X")
    )
    with_x = stem + "X"
    assert isbn.is_valid_isbn10(with_x)
    assert isbn.is_valid_isbn10(isbn.normalise(stem + "x"))
    assert isbn.to_isbn13(stem + "x") == _ref_complete13("978" + stem)
    moved = "X" + with_x[1:9] + with_x[0]
    assert not isbn.is_valid_isbn10(moved)


def test_only_the_978_and_979_prefixes_are_books() -> None:
    """977 is a periodical (ISSN) prefix and other EANs are groceries; a
    library must not catalogue a biscuit packet as a book."""
    issn = _ref_complete13("977123456789")
    assert not isbn.is_valid_isbn13(issn)
    assert isbn.to_isbn13(issn) is None
    assert isbn.is_valid_isbn13(_ref_complete13("979100000000"))


def test_letters_and_non_ascii_digits_inside_are_refused() -> None:
    """`str.isdigit()` is true for Devanagari digits; an ISBN typed on a Hindi
    keyboard is not one, and `int()` would happily read it."""
    assert not isbn.is_valid_isbn10("81737A1461")
    assert not isbn.is_valid_isbn13("97881737114६6")
    assert isbn.to_isbn13("८१७३७११४६१") is None
    assert isbn.to_isbn13("") is None


def test_a_979_book_has_no_isbn10() -> None:
    """ISBN-10 exists only for the 978 range; inventing one for 979 prints a
    number that belongs to a different book."""
    assert isbn.to_isbn10(_ref_complete13("979100000000")) is None


def test_fuzzed_conversions_agree_with_the_reference() -> None:
    """Five hundred random stems: every computed ISBN-10 converts to the
    reference ISBN-13 and back, and a one-digit change is always refused (the
    property both check digits exist for)."""
    rng = random.Random(1402)
    for _ in range(500):
        stem = f"{rng.randrange(10**9):09d}"
        ten = _ref_complete10(stem)
        thirteen = _ref_complete13("978" + stem)
        assert isbn.is_valid_isbn10(ten), ten
        assert isbn.to_isbn13(ten) == thirteen
        assert isbn.to_isbn10(thirteen) == ten
        pos = rng.randrange(9)
        changed = ten[:pos] + str((int(ten[pos]) + rng.randrange(1, 10)) % 10) + ten[pos + 1 :]
        assert not isbn.is_valid_isbn10(changed), (ten, changed)


def test_the_module_is_pure() -> None:
    """B04's helpers run in serializers, importers and the counter's resolver.
    A Django or app import here is the first step to a lookup that queries the
    database from inside a validator."""
    assert impure_imports(inspect.getsource(isbn)) == []
