"""Lending rows for tests that need a loan without the whole create path."""

from __future__ import annotations

import datetime as dt
import itertools
from decimal import Decimal
from typing import Any

from apps.lending.models import LendingBorrower, LendingLoan

_seq = itertools.count(1)


def loan(tenant: Any, party: Any, *, day: dt.date, cash: str = "1000.00") -> LendingLoan:
    n = next(_seq)
    borrower, _ = LendingBorrower.objects.get_or_create(
        tenant=tenant, party=party, defaults={"borrower_number": f"B-T{n:04d}"}
    )
    return LendingLoan.objects.create(
        tenant=tenant,
        number=f"LN-T{n:04d}",
        borrower=borrower,
        party=party,
        plan_type="flat",
        principal=Decimal(cash),
        frequency="monthly",
        instalment_count=1,
        disbursed_on=day,
        first_due_on=day + dt.timedelta(days=30),
        maturity_on=day + dt.timedelta(days=30),
        instalment_amount=Decimal(cash),
        total_interest=Decimal("0.00"),
        total_payable=Decimal(cash),
        cash_handed_over=Decimal(cash),
        effective_annual_rate=Decimal("0.00"),
    )
