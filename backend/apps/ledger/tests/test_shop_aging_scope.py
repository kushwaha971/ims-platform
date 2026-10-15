"""Shop reports must not navigate into or export the Udhaar book's money."""

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.dates import tenant_today
from apps.ledger.models import LedgerEntry
from apps.reports.tests import builders as b

pytestmark = pytest.mark.django_db


def test_shop_summary_aging_and_report_export_use_the_same_book(tenant: Any, api_as: Any) -> None:
    person = b.party(tenant, balance=Decimal("1000.00"), shop_balance=Decimal("100.00"))
    for bucket, amount in [("main", "1000.00"), ("shop", "100.00"), ("loan", "300.00")]:
        LedgerEntry.objects.create(
            tenant=tenant,
            party=person,
            bucket=bucket,
            direction="debit",
            amount=Decimal(amount),
            entry_date=tenant_today(tenant),
            entry_type="manual_gave",
            source_type="manual",
        )
    owner, _ = api_as(tenant)
    summary = owner.get(reverse("v1:ledger-summary"), {"book": "shop"})
    assert summary.json()["data"]["receivable"] == "100.00"
    aging = owner.get(reverse("v1:ledger-aging"), {"book": "shop"})
    assert aging.json()["meta"]["totals"]["total"] == "100.00"
    report = owner.get(reverse("v1:report-receivables-aging"), {"book": "shop"})
    assert report.json()["meta"]["totals"]["total"] == "100.00"
    exported = owner.get(reverse("v1:report-receivables-aging"), {"book": "shop", "format": "csv"})
    csv = b"".join(exported.streaming_content).decode("utf-8-sig")
    assert "100.00" in csv and "1000.00" not in csv
    main = owner.get(reverse("v1:ledger-summary"))
    assert main.json()["data"]["receivable"] == "1000.00"
