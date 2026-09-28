"""What every ledger CSV export does before it streams a byte — the shared gate.

Both exports (LED-04's statement and LED-09's aging report) are a query
parameter on a URL everybody with read access may open, so the export's own
rules live in `ledger/views/exports.py` rather than on the view classes. These
tests are the security review's findings against that gate, one per defect:

* F-1 — the statement export was on the 600/min READ budget, not the 10/hour
  export one, because the throttle fell back to the view's `throttle_scope`.
* F-3 — a cross-site page could make a signed-in browser download a CSV, since
  the cookies are `SameSite=Lax` and the export is a GET.
* I-5 — the aging CSV computed the whole report before asking whether the
  caller may export it or has any budget left.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse
from rest_framework.views import APIView

from apps.common.audit import AuditAction
from apps.common.constants import Direction
from apps.common.throttling import ScopedUserRateThrottle
from apps.ledger.constants import EntryStatus, EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

STATEMENT = "v1:party-statement"
AGING = "v1:ledger-aging"

#: `UB_RATE_LIMIT_EXPORT`'s default. Asserted against the setting below so a
#: changed default fails loudly here instead of making these tests meaningless.
EXPORT_CEILING = 10


@pytest.fixture
def debtor(tenant: Any) -> Any:
    """One party owing ₹500 from ten days ago — enough for both exports to have a row."""
    party = PartyFactory(tenant=tenant, name="Aarav Traders", balance="500.00")
    LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction=Direction.DEBIT,
        amount=Decimal("500.00"),
        entry_date=dt.date.today() - dt.timedelta(days=10),
        entry_type=EntryType.MANUAL_GAVE,
        source_type=SourceType.MANUAL,
        status=EntryStatus.POSTED,
    )
    return party


def statement_url(party: Any) -> str:
    return reverse(STATEMENT, args=[party.id])


def test_the_export_ceiling_is_the_one_these_tests_assume(settings: Any) -> None:
    rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["export"]
    assert rate == f"{EXPORT_CEILING}/hour"


# ── F-1: the statement export is on the export budget ──────────────────────


class _ReadView(APIView):
    """A view on the read budget, as `PartyStatementView` is."""

    throttle_scope = "user"


def _authenticated_request() -> Any:
    user = type("U", (), {"is_authenticated": True, "pk": 7})()
    return type("R", (), {"user": user})()


@pytest.mark.parametrize("how", ["constructor", "assigned"])
def test_a_throttle_given_its_scope_keeps_it_against_the_views_scope(how: str) -> None:
    """F-1, at the unit: a throttle told `"export"` stays on `"export"` on a
    view whose `throttle_scope` is `"user"`, however it was told.

    The defect was the `"assigned"` form — `ScopedUserRateThrottle()` with
    `.scope = "export"` set afterwards, which is what `charge_export_budget`
    did. The fixed-scope flag was only set by the constructor, so
    `get_cache_key` replaced the scope with the view's and the export ran on
    the 600/min read budget. Before the fix the `"assigned"` case came back
    with scope `"user"` and 600 requests.
    """
    if how == "constructor":
        throttle = ScopedUserRateThrottle("export")
    else:
        throttle = ScopedUserRateThrottle()
        throttle.scope = "export"

    key = throttle.get_cache_key(_authenticated_request(), _ReadView())

    assert throttle.scope == "export"
    assert throttle.num_requests == EXPORT_CEILING
    assert key is not None and "export" in key


def test_a_throttle_with_no_scope_of_its_own_still_takes_the_views() -> None:
    """The class-level `throttle_scope` path the other views rely on."""

    class WriteView(APIView):
        throttle_scope = "ledger_write"

    throttle = ScopedUserRateThrottle()

    throttle.get_cache_key(_authenticated_request(), WriteView())

    assert throttle.scope == "ledger_write"


def test_the_statement_csv_is_on_the_export_budget(debtor: Any, api_as: Any) -> None:
    """F-1 — ten statement exports, then 429.

    `charge_export_budget` built `ScopedUserRateThrottle()` and set `.scope`
    afterwards; `get_cache_key` then fell back to `PartyStatementView`'s
    `throttle_scope = "user"`, so the export ran at 600/min instead of
    `UB_RATE_LIMIT_EXPORT`. Aging escaped only because its view declares no
    `throttle_scope`. Before the fix the eleventh export here answered 200.
    """
    client, _ = api_as(debtor.tenant)

    statuses = [
        client.get(statement_url(debtor), {"format": "csv"}).status_code
        for _ in range(EXPORT_CEILING + 1)
    ]

    assert statuses[:EXPORT_CEILING] == [200] * EXPORT_CEILING
    assert statuses[EXPORT_CEILING] == 429


def test_reading_a_statement_after_the_export_budget_is_spent_still_works(
    debtor: Any, api_as: Any
) -> None:
    """The other half of F-1's fix: the export budget must not leak onto reads.

    Twelve plain reads after the export budget is exhausted all answer 200 —
    the statement screen at the counter stays on the 600/min user budget.
    """
    client, _ = api_as(debtor.tenant)
    for _ in range(EXPORT_CEILING):
        assert client.get(statement_url(debtor), {"format": "csv"}).status_code == 200
    assert client.get(statement_url(debtor), {"format": "csv"}).status_code == 429

    assert {client.get(statement_url(debtor)).status_code for _ in range(12)} == {200}


# ── F-3: a cross-site page cannot trigger a download ───────────────────────


def _export(client: Any, which: str, party: Any, **headers: Any) -> Any:
    url = statement_url(party) if which == "statement" else reverse(AGING)
    return client.get(url, {"format": "csv"}, **headers)


@pytest.mark.parametrize("which", ["statement", "aging"])
def test_a_cross_site_export_is_refused(which: str, debtor: Any, api_as: Any) -> None:
    """F-3 — `Sec-Fetch-Site: cross-site` on `?format=csv` is 403.

    The session cookies are `SameSite=Lax`, which a top-level GET navigation
    from another site still carries, and both exports are GETs. So a page on
    any site could make a signed-in merchant's browser download their book and
    write an audit row saying they did. Before the fix this answered 200.
    """
    client, _ = api_as(debtor.tenant)

    response = _export(client, which, debtor, HTTP_SEC_FETCH_SITE="cross-site")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"


@pytest.mark.parametrize("which", ["statement", "aging"])
@pytest.mark.parametrize("site", ["same-origin", "same-site", "none", None])
def test_a_same_site_or_headerless_export_is_allowed(
    which: str, site: str | None, debtor: Any, api_as: Any
) -> None:
    """F-3's allowed side: our own pages, a typed URL (`none`), and clients
    that send no `Sec-Fetch-Site` at all — older browsers and curl."""
    client, _ = api_as(debtor.tenant)
    headers = {"HTTP_SEC_FETCH_SITE": site} if site is not None else {}

    response = _export(client, which, debtor, **headers)

    assert response.status_code == 200


@pytest.mark.parametrize("which", ["statement", "aging"])
def test_a_refused_cross_site_export_writes_no_audit_row_and_spends_no_budget(
    which: str, debtor: Any, api_as: Any
) -> None:
    """F-3 — the refusal happens BEFORE the budget is charged and the audit row
    written.

    Otherwise a hostile page could both forge "X exported the book" audit rows
    and burn the merchant's ten exports an hour, so their own download at the
    counter answers 429. After fifteen refused attempts, all ten of the real
    budget are still there and there is no export audit row.
    """
    client, _ = api_as(debtor.tenant)

    refused = [
        _export(client, which, debtor, HTTP_SEC_FETCH_SITE="cross-site").status_code
        for _ in range(15)
    ]

    assert set(refused) == {403}
    assert not AuditLog.objects.filter(
        action__in=[AuditAction.LEDGER_STATEMENT_EXPORTED, AuditAction.LEDGER_AGING_EXPORTED]
    ).exists()
    allowed = [_export(client, which, debtor).status_code for _ in range(EXPORT_CEILING)]
    assert allowed == [200] * EXPORT_CEILING


def test_a_cross_site_plain_read_is_not_refused(debtor: Any, api_as: Any) -> None:
    """Only the export is gated. A plain JSON read carries no file away, and
    the SPA's own origin may differ from the API's in some deployments."""
    client, _ = api_as(debtor.tenant)

    response = client.get(statement_url(debtor), HTTP_SEC_FETCH_SITE="cross-site")

    assert response.status_code == 200


# ── I-5: the aging CSV refuses before it computes ──────────────────────────


def test_an_aging_export_without_permission_is_refused_before_the_report_is_computed(
    debtor: Any, api_as: Any, monkeypatch: Any
) -> None:
    """I-5 — staff may read aging but not export it, and the refusal must not
    first run the FIFO walk over the whole book.

    `LedgerAgingView.get` built every row, then `_csv` checked
    `reports.export` and the export budget. A staff member (or a spent budget)
    could make the server compute the full report for a 403/429.
    """
    from apps.ledger.views import aging as aging_view

    def explode(**_kwargs: Any) -> Any:
        raise AssertionError("the report was computed before the export was authorised")

    staff, _ = api_as(debtor.tenant, role="staff")
    monkeypatch.setattr(aging_view, "aging_rows", explode)

    response = staff.get(reverse(AGING), {"format": "csv"})

    assert response.status_code == 403


def test_an_aging_export_over_budget_is_refused_before_the_report_is_computed(
    debtor: Any, api_as: Any, monkeypatch: Any
) -> None:
    """I-5 — the eleventh export in the hour is a 429 without a FIFO walk."""
    from apps.ledger.views import aging as aging_view

    client, _ = api_as(debtor.tenant)
    for _ in range(EXPORT_CEILING):
        assert client.get(reverse(AGING), {"format": "csv"}).status_code == 200

    def explode(**_kwargs: Any) -> Any:
        raise AssertionError("the report was computed before the budget was charged")

    monkeypatch.setattr(aging_view, "aging_rows", explode)

    assert client.get(reverse(AGING), {"format": "csv"}).status_code == 429


@pytest.mark.parametrize("which", ["statement", "aging"])
def test_a_refused_export_answers_with_the_json_error_envelope(
    which: str, debtor: Any, api_as: Any
) -> None:
    """Found while fixing F-3: every refusal on `?format=csv` was unreadable.

    Negotiation picks `PassthroughCsvRenderer` before the handler runs, so the
    exception handler's error envelope was handed to a renderer that returns
    its input untouched — and a `dict` given to an `HttpResponse` is iterated,
    so the body was the single word `error`, served as `text/csv`. A staff
    member's 403 carried no code, and a browser following the export link
    saved a "CSV" of that word. Before the fix `response.json()` raised.
    """
    staff, _ = api_as(debtor.tenant, role="staff")

    response = _export(staff, which, debtor)

    assert response.status_code == 403
    assert response["Content-Type"].startswith("application/json")
    assert response.json()["error"]["code"] == "permission_denied"
