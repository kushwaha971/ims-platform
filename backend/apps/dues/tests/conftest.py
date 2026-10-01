"""Dues engine fixtures: the test-only subject (`subject.py`) and plan helpers."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest

from apps.common.context import Ctx
from apps.dues.tests.subject import dues_subject  # noqa: F401  (fixture)
from apps.dues.tests.subject import TEST_MODULE

TODAY = dt.date(2026, 10, 5)


@pytest.fixture
def ctx(tenant: Any) -> Ctx:
    return Ctx.system(tenant)


@pytest.fixture
def today(dues_subject: Any, monkeypatch: Any) -> dt.date:
    """The FRD worked example's today: 5 Oct 2026."""
    dues_subject.set_today(monkeypatch, TODAY)
    return TODAY


def monthly(**overrides: Any) -> dict:
    """"Gym monthly ₹1,200": fixed, monthly on the 1st, charge/ledger."""
    data = {
        "name": "Gym monthly",
        "mode": "charge",
        "posting": "ledger",
        "recurrence": {"freq": "monthly", "by_month_day": 1},
        "amount_rule": "fixed",
        "amount": "1200.00",
    }
    data.update(overrides)
    return data


@pytest.fixture
def make_plan(ctx: Ctx, dues_subject: Any) -> Any:
    from apps.dues.services.plans import create_plan

    def _make(module: str = TEST_MODULE, **overrides: Any) -> Any:
        return create_plan(ctx=ctx, module=module, data=monthly(**overrides))

    return _make
