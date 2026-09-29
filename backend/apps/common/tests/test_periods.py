"""Periods and their labels (FRD 00 PLT-X09 §8, contracts §1.8, task A9a).

A due, a session or a booking is FOR a period, and statements, receipts and
reminders print its label, so a customer reads "Rent for Oct 2026" rather than a
pair of dates. The defects prevented: a range label printing the exclusive end
("12 Oct – 12 Nov", one day too many, on a customer's receipt); a quarter
numbered by the calendar year (Oct–Dec is Q3 of an Indian financial year, not
Q4); and Hindi labels in English month names.
"""

from __future__ import annotations

from datetime import date

import pytest

from apps.common.periods import Period, period_label

OCT = Period(start=date(2026, 10, 1), end=date(2026, 11, 1))
RANGE = Period(start=date(2026, 10, 12), end=date(2026, 11, 12))


@pytest.mark.parametrize(
    ("period", "style", "en", "hi"),
    [
        (OCT, "month", "Oct 2026", "अक्टू 2026"),
        (RANGE, "range", "12 Oct – 11 Nov 2026", "12 अक्टू – 11 नव 2026"),
        (
            Period(start=date(2026, 12, 12), end=date(2027, 1, 12)),
            "range",
            "12 Dec 2026 – 11 Jan 2027",
            "12 दिस 2026 – 11 जन 2027",
        ),
        (
            Period(start=date(2026, 10, 12), end=date(2026, 10, 13)),
            "range",
            "12 Oct 2026",
            "12 अक्टू 2026",
        ),
        (OCT, "quarter", "Q3 FY 2026-27", "तिमाही 3, वित्त वर्ष 2026-27"),
        (
            Period(start=date(2027, 2, 1), end=date(2027, 3, 1)),
            "quarter",
            "Q4 FY 2026-27",
            "तिमाही 4, वित्त वर्ष 2026-27",
        ),
        (
            Period(start=date(2026, 4, 1), end=date(2026, 7, 1)),
            "quarter",
            "Q1 FY 2026-27",
            "तिमाही 1, वित्त वर्ष 2026-27",
        ),
        (OCT, "fy", "FY 2026-27", "वित्त वर्ष 2026-27"),
        (
            Period(start=date(2027, 3, 31), end=date(2027, 4, 1)),
            "fy",
            "FY 2026-27",
            "वित्त वर्ष 2026-27",
        ),
        (RANGE, "day", "12 Oct 2026", "12 अक्टू 2026"),
        (
            Period(start=date(2099, 12, 1), end=date(2100, 1, 1)),
            "fy",
            "FY 2099-00",
            "वित्त वर्ष 2099-00",
        ),
    ],
)
def test_labels_in_both_locales(period: Period, style: str, en: str, hi: str) -> None:
    """T-PLT-X09-5: every style in `en` and `hi` (FRD 00 X09 §8)."""
    assert period_label(period, style=style, locale="en") == en
    assert period_label(period, style=style, locale="hi") == hi


def test_every_month_has_a_hindi_name() -> None:
    names = {
        period_label(
            Period(start=date(2026, m, 1), end=date(2026, m, 2)), style="month", locale="hi"
        )
        for m in range(1, 13)
    }
    assert len(names) == 12
    assert all(not any("a" <= ch <= "z" for ch in name.lower()) for name in names)


def test_a_regional_locale_tag_uses_its_language() -> None:
    assert period_label(OCT, style="month", locale="hi-IN") == "अक्टू 2026"
    assert period_label(OCT, style="month", locale="en-IN") == "Oct 2026"


def test_an_unknown_style_is_refused() -> None:
    with pytest.raises(ValueError):
        period_label(OCT, style="week", locale="en")


def test_a_period_is_half_open_and_non_empty() -> None:
    """[start, end): the end is the first day NOT in the period, so a month is
    1 Oct – 1 Nov and has 31 days."""
    assert OCT.days == 31
    with pytest.raises(ValueError):
        Period(start=date(2026, 10, 1), end=date(2026, 10, 1))
