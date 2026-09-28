"""`GET /parties/{id}` — the khata page's header (FRD PTY-03 FR-1, FR-2, §14).

The interesting assertions here are about what the response does NOT contain.
PTY-03 specifies a `summary` of seven figures and a `recent_entries` array; four
of the seven and all of the entries are about ledger rows, invoices and
payments, and the `ledger` app has no models and no migrations. Sending
`"overdue_amount": "0.00"` from a product that cannot record an overdue amount
would be a placeholder the client renders as a fact, so those keys are absent
and these tests hold them absent — if one appears, it is because somebody wired
real data to it, and the test that says so should be deleted in the same commit.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


def test_the_detail_carries_the_header_figures(tenant: Any, api_as: Any) -> None:
    party = PartyFactory(tenant=tenant, name="Ramesh Traders", balance="2300.00")
    client, _member = api_as(tenant)

    response = client.get(reverse("v1:party-detail", args=[party.id]))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["name"] == "Ramesh Traders"
    assert data["summary"]["balance"] == "2300.00"
    # LED-01 grew this block. `receivable` and `payable` are the party's own
    # caches, which the ledger now writes; the three ledger figures are an
    # aggregate over a party with no entries, which is a real zero rather than a
    # placeholder — the distinction the test below is about.
    assert data["summary"]["receivable"] == "2300.00"
    assert data["summary"]["payable"] == "0.00"


def test_the_balance_is_a_string_in_the_summary_too(tenant: Any, api_as: Any) -> None:
    """Canon rule 3 does not stop applying because the number moved one level in.

    `meta.totals` shipped as JSON floats for exactly this reason — a dict handed
    to the renderer instead of a serializer — and a nested block is where that
    mistake is easiest to repeat.
    """
    party = PartyFactory(tenant=tenant, balance="1234.50")
    client, _member = api_as(tenant)

    summary = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["summary"]

    assert summary["balance"] == "1234.50"
    assert isinstance(summary["balance"], str)


def test_the_figures_that_have_no_data_behind_them_are_absent_not_zero(
    tenant: Any, api_as: Any
) -> None:
    """The deliberate omission, pinned — and narrowed by LED-01, as promised.

    A key that is always `"0.00"` or `[]` reads to the client as a fact about
    this party, and the client has no way to tell it apart from a real zero.
    This test used to hold seven keys out. LED-01 built `ledger_entry`, so two of
    them — `receivable` and `payable` — now arrive, derived from the balance
    rather than read from a cache that could disagree with it.

    Three are still about `sales_document` and `payments_payment`, which are
    unbuilt; they arrive with SAL-02 and PAY-01 the same way. `recent_entries`
    is absent for an architectural reason rather than a data one — see below.
    """
    party = PartyFactory(tenant=tenant)
    client, _member = api_as(tenant)

    data = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]

    for figure in ("open_invoices", "overdue_amount", "last_payment_at"):
        assert figure not in data["summary"], f"{figure} is being sent with nothing behind it"
    # And `recent_entries`, for a different reason than the three above: the
    # rows exist now, but `parties` may not import `ledger` (Part 20 §20.1.4).
    # The khata page reads `/parties/{id}/ledger-entries`, whose first page IS
    # the recent entries and whose `meta.summary` carries the header's ledger
    # figures. Two requests, each answered by the app that owns the table.
    assert "recent_entries" not in data


def test_a_party_with_no_credit_limit_has_no_credit_block(tenant: Any, api_as: Any) -> None:
    """Absent, not a dict of nulls: there is no usage bar to draw."""
    party = PartyFactory(tenant=tenant, credit_limit=None)
    client, _member = api_as(tenant)

    data = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]

    assert "credit" not in data


def test_the_credit_block_reports_the_exposure_and_what_is_left(tenant: Any, api_as: Any) -> None:
    """PTY-06 §14's shape, and a rename worth explaining.

    PTY-03 shipped this block as `{limit, used, available}`. PTY-06 names the
    middle field `exposure`, which is the word FR-4 defines and the word the
    whole feature reasons in — "used" reads like a count of something spent,
    and what the number actually is is how much of the merchant's money is
    standing out with this party right now.

    `days` rides along because it is the other half of the same decision
    (FR-15): a cap of ₹5,000 over seven days and the same cap over ninety are
    different amounts of trust.
    """
    party = PartyFactory(
        tenant=tenant, credit_limit=Decimal("5000.00"), credit_days=30, balance="2000.00"
    )
    client, _member = api_as(tenant)

    credit = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["credit"]

    assert credit == {
        "limit": "5000.00",
        "days": 30,
        "exposure": "2000.00",
        "available": "3000.00",
        "over_by": "0.00",
        "usage_pct": 40,
        "mode": "warn",
        "status": "ok",
    }


def test_a_party_in_credit_is_using_none_of_their_limit(tenant: Any, api_as: Any) -> None:
    """BR-3, and it is the rule rather than caution.

    A negative balance is money the MERCHANT owes — an advance the customer
    paid, which is THEIR money, not extra credit. Without the floor a customer
    ₹800 in advance against a ₹5,000 limit would read as ₹5,800 of headroom and
    the product would be lending them their own deposit back.

    It also keeps PTY-06's usage bar from running backwards off the left of its
    track, which is where this first showed up.
    """
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("5000.00"), balance="-800.00")
    client, _member = api_as(tenant)

    credit = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["credit"]

    assert credit["exposure"] == "0.00"
    assert credit["available"] == "5000.00"
    assert credit["usage_pct"] == 0


def test_a_party_past_their_limit_has_nothing_available_rather_than_a_negative(
    tenant: Any, api_as: Any
) -> None:
    """ "Available" is money that can still be lent, and that is never below zero.

    What the merchant needs instead is `over_by`, which is the figure the
    caption reads out: "₹500 over the ₹2,000 limit".
    """
    party = PartyFactory(tenant=tenant, credit_limit=Decimal("2000.00"), balance="2500.00")
    client, _member = api_as(tenant)

    credit = client.get(reverse("v1:party-detail", args=[party.id])).json()["data"]["credit"]

    assert credit["exposure"] == "2500.00"
    assert credit["available"] == "0.00"
    assert credit["over_by"] == "500.00"
    assert credit["status"] == "over"


def test_an_archived_party_is_still_readable(tenant: Any, api_as: Any) -> None:
    """FR-14 / BR-11 — archiving hides a party from a list, not from history.

    Guarded here as well as in the list tests because the two failed together
    once: BR-4's active-by-default filter reached `get_object()` and turned an
    archived party into a 404 for retrieve and PATCH alike.
    """
    party = PartyFactory(tenant=tenant, status="archived", name="Old Supplier")
    client, _member = api_as(tenant)

    response = client.get(reverse("v1:party-detail", args=[party.id]))

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "archived"


def test_another_tenants_party_is_not_found_rather_than_forbidden(
    tenant: Any, other_tenant: Any, api_as: Any
) -> None:
    """Canon §0.11 rule 2. A 403 confirms the id exists, which is the leak."""
    theirs = PartyFactory(tenant=other_tenant, name="Not Yours")
    client, _member = api_as(tenant)

    response = client.get(reverse("v1:party-detail", args=[theirs.id]))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_an_unknown_id_is_a_clean_404(tenant: Any, api_as: Any) -> None:
    client, _member = api_as(tenant)
    response = client.get(reverse("v1:party-detail", args=["01a0c000-0000-7000-8000-000000000000"]))
    assert response.status_code == 404
