"""Periods and the labels customers read (ADR-055, contracts §1.8, FRD 00 PLT-X09 §8).

A due, a session or a booking is FOR a period, and statements, receipts and
reminders print its label: "Rent for Oct 2026", not two dates. Pure code: no
`apps.*`, no Django, no clock.

A period is half-open, `[start, end)`: the end is the first day NOT in it, so a
month is 1 Oct – 1 Nov and `days` is 31. The range label prints the LAST day
(`end - 1`), because "12 Oct – 12 Nov" on a receipt is one day more than the
customer paid for.

Quarters and financial years are Indian, starting 1 April (Q3 is Oct–Dec), the
default of `Tenant.fy_start_month` and the only value any tenant has today.

Hindi month names are CLDR's `hi-IN` abbreviations without the abbreviation
mark ("अक्टू", as FRD 00 X09 §8 writes it). A regional tag uses its language
(`hi-IN` -> `hi`); any other language falls back to English, which is what the
rest of the product shows a locale it has no catalogue for.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

STYLES = ("month", "range", "quarter", "fy", "day")

_MONTHS = {
    "en": ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"),
    "hi": ("जन", "फ़र", "मार्च", "अप्रैल", "मई", "जून", "जुल", "अग", "सित", "अक्टू", "नव", "दिस"),
}
_QUARTER = {"en": "Q{q} FY {fy}", "hi": "तिमाही {q}, वित्त वर्ष {fy}"}
_FY = {"en": "FY {fy}", "hi": "वित्त वर्ष {fy}"}
_RANGE_SEPARATOR = " – "  # an en dash, spaced

FY_START_MONTH = 4


@dataclass(frozen=True)
class Period:
    """`[start, end)` as tenant-local dates."""

    start: date
    end: date

    def __post_init__(self) -> None:
        if self.end <= self.start:
            raise ValueError(f"a period ends after it starts: [{self.start}, {self.end})")

    @property
    def days(self) -> int:
        return (self.end - self.start).days

    @property
    def last_day(self) -> date:
        return self.end - timedelta(days=1)


def _language(locale: str) -> str:
    language = (locale or "en").replace("_", "-").split("-")[0].lower()
    return language if language in _MONTHS else "en"


def _fy_start_year(on: date) -> int:
    return on.year if on.month >= FY_START_MONTH else on.year - 1


def _fy_label(on: date) -> str:
    start_year = _fy_start_year(on)
    return f"{start_year}-{str((start_year + 1) % 100).zfill(2)}"


def _day(on: date, language: str, *, year: bool = True) -> str:
    text = f"{on.day} {_MONTHS[language][on.month - 1]}"
    return f"{text} {on.year}" if year else text


def period_label(period: Period, *, style: str, locale: str) -> str:
    """`month` "Oct 2026" · `range` "12 Oct – 11 Nov 2026" · `quarter`
    "Q3 FY 2026-27" · `fy` "FY 2026-27" · `day` "12 Oct 2026".

    `month`, `quarter`, `fy` and `day` describe the period's START; `range`
    runs from the start to the last day inclusive."""
    language = _language(locale)
    start = period.start
    if style == "month":
        return f"{_MONTHS[language][start.month - 1]} {start.year}"
    if style == "day":
        return _day(start, language)
    if style == "range":
        last = period.last_day
        if last == start:
            return _day(start, language)
        if last.year == start.year:
            return _day(start, language, year=False) + _RANGE_SEPARATOR + _day(last, language)
        return _day(start, language) + _RANGE_SEPARATOR + _day(last, language)
    if style == "quarter":
        quarter = (start.month - FY_START_MONTH) % 12 // 3 + 1
        return _QUARTER[language].format(q=quarter, fy=_fy_label(start))
    if style == "fy":
        return _FY[language].format(fy=_fy_label(start))
    raise ValueError(f"unknown period label style {style!r}; one of {', '.join(STYLES)}")
