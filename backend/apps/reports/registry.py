"""Dashboard sections and reports that modules publish (ADR-042, contracts §1.9, R8, R9).

`reports` may read every EXISTING app's selectors, but it never gains the
engines or the verticals (10-architecture §3; the literal `ALLOWED["reports"]`
in `tests/architecture/test_import_rules.py`). So a vertical does not wait to be
imported: it registers its dashboard section and its reports here from its own
`AppConfig.ready()`, and `GET /reports/dashboard`, `GET /reports` and
`GET /reports/<key>` serve whatever is registered.

**This module is one of the two a vertical may import from an otherwise
forbidden app (R27).** It must therefore import nothing but the standard
library, Django and `apps.common` at import time — the import test asserts it —
so that importing it executes nothing of `reports` beyond this file.

Rules (ADR-042, FRD 00 PLT-X13):

* Keys are `<module>.<name>`, lower-case, and the prefix is the registrant's
  own module (BR-2). A second registration of an EQUAL entry is a no-op (a
  second `ready()` is harmless); a different entry under a used key raises
  `ImproperlyConfigured` at start-up.
* A section's `selector(tenant, today) -> dict` runs at most
  `SECTION_QUERY_BUDGET` queries (T-PLT-X13-3). A report's
  `selector(tenant, params) -> Any` answers the JSON; its optional
  `csv(tenant, params) -> Iterable[Sequence]` yields the header row first,
  then one sequence per row (numbers as `Decimal`/`int`, the rest as text).
* Visibility is decided by the endpoint per reader — module enabled, codename
  held — never here.
* `_reset_for_tests()` restores what the apps registered at start-up.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Any

from django.core.exceptions import ImproperlyConfigured

SECTION_QUERY_BUDGET = 3
_KEY = re.compile(r"^(?P<module>[a-z][a-z0-9_]*)\.[a-z0-9][a-z0-9_]*$")

SectionSelector = Callable[[Any, date], dict]
ReportSelector = Callable[[Any, dict], Any]
ReportCsv = Callable[[Any, dict], Iterable[Sequence[Any]]]


@dataclass(frozen=True)
class DashboardSection:
    key: str
    module: str
    permission: str
    selector: SectionSelector
    order: int


@dataclass(frozen=True)
class RegisteredReport:
    key: str
    module: str
    permission: str
    label_id: str
    selector: ReportSelector
    csv: ReportCsv | None

    @property
    def has_csv(self) -> bool:
        return self.csv is not None


_SECTIONS: dict[str, DashboardSection] = {}
_REPORTS: dict[str, RegisteredReport] = {}
_BASELINE: tuple[dict[str, DashboardSection], dict[str, RegisteredReport]] | None = None


def _check_key(key: str, module: str) -> None:
    match = _KEY.match(key or "")
    if match is None or match.group("module") != module:
        raise ImproperlyConfigured(
            f"{key!r} is not a key of module {module!r}; use '<module>.<name>' (PLT-X13 BR-2)"
        )


def _put(store: dict, key: str, entry: Any, what: str) -> None:
    existing = store.get(key)
    if existing is not None and existing != entry:
        raise ImproperlyConfigured(f"{what} {key!r} is registered twice with different specs")
    store[key] = entry


def register_dashboard_section(
    key: str, *, module: str, permission: str, selector: SectionSelector, order: int
) -> None:
    """A module's block on `/dashboard`, below the core tiles, in `order`."""
    _check_key(key, module)
    _put(
        _SECTIONS,
        key,
        DashboardSection(key, module, permission, selector, int(order)),
        "dashboard section",
    )


def register_report(
    key: str,
    *,
    module: str,
    permission: str,
    label_id: str,
    selector: ReportSelector,
    csv: ReportCsv | None,
) -> None:
    """A module's report, listed by `GET /reports` and served at `/reports/<key>`."""
    _check_key(key, module)
    _put(
        _REPORTS, key, RegisteredReport(key, module, permission, label_id, selector, csv), "report"
    )


def dashboard_sections() -> list[DashboardSection]:
    return sorted(_SECTIONS.values(), key=lambda section: (section.order, section.key))


def reports() -> list[RegisteredReport]:
    return sorted(_REPORTS.values(), key=lambda report: report.key)


def report(key: str) -> RegisteredReport | None:
    return _REPORTS.get(key)


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to the start-up registrations (every `ready()` has run by the first
    call), never to empty — the `guards._reset_for_tests` rule."""
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = (dict(_SECTIONS), dict(_REPORTS))
    _SECTIONS.clear()
    _SECTIONS.update(_BASELINE[0])
    _REPORTS.clear()
    _REPORTS.update(_BASELINE[1])
