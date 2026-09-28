"""Payment fixtures: the sales track's GST shop, plus helpers that issue invoices to pay.

The sales fixtures are imported rather than copied — a payment settles an
invoice issued by the real `issue_invoice`, so the documents these suites pay
are exactly the ones a merchant would.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.sales.tests.conftest import (  # noqa: F401  (fixtures, re-exported)
    draft,
    issue,
    line,
    make_item,
    make_party,
    owner,
    reference,
    shop,
)

PAYMENTS = "v1:payment-list"


def payment_url(payment_id: Any, suffix: str = "") -> str:
    base = reverse("v1:payment-detail", args=[payment_id])
    return f"{base}/{suffix}" if suffix else base


def pay(client: Any, *, key: str | None = None, **body: Any) -> Any:
    """POST /payments with an idempotency key; `body` is the wire payload."""
    body.setdefault("direction", "in")
    return client.post(
        reverse(PAYMENTS), body, format="json", HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4())
    )


def upi(amount: str, reference: str = "") -> list[dict]:
    row: dict[str, str] = {"mode": "upi", "amount": amount}
    if reference:
        row["reference"] = reference
    return [row]


def cash_lines(amount: str) -> list[dict]:
    return [{"mode": "cash", "amount": amount}]


def void(client: Any, payment_id: Any, reason: str = "Wrong party") -> Any:
    return client.post(
        payment_url(payment_id, "void"),
        {"reason": reason},
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )


@pytest.fixture
def invoice_for(owner: Any, make_item: Any) -> Any:
    """`invoice_for(party, total, days_ago=0)` → an ISSUED credit invoice of exactly `total`.

    A zero-rated item at the total's price, so the grand total is the figure
    the test names (no tax, no round-off to reason about).
    """
    cache: dict[str, Any] = {}

    def _make(party: Any, total: str, days_ago: int = 0, due_days: int | None = None) -> dict:
        item = cache.get(total)
        if item is None:
            item = make_item(f"Goods {total}", total, "GST0", stock="1000")
            cache[total] = item
        body: dict[str, Any] = {"party_id": str(party.id), "lines": [line(item)]}
        from apps.common.dates import tenant_today

        today = tenant_today(party.tenant)
        document_date = today - dt.timedelta(days=days_ago)
        body["document_date"] = document_date.isoformat()
        if due_days is not None:
            body["due_on"] = (document_date + dt.timedelta(days=due_days)).isoformat()
        doc = draft(owner, **body).json()["data"]
        issued = issue(owner, doc["id"])
        assert issued.status_code == 200, issued.json()
        data = issued.json()["data"]
        assert Decimal(data["grand_total"]) == Decimal(total)
        return data

    return _make
