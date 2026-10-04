"""Open dues written straight to the tables, for the shared target contract suite (T-DUE-03-1).

`tests/contracts/test_allocation_targets.py` runs on sales' `shop` tenant with no test subject
registered, so it cannot go through `create_schedule` (which needs a registered subject and an
entitled module). These rows satisfy every CHECK of `dues_*` and are exactly what a posted due
looks like to the targets: a `due` with an amount owed, and for an expectation, its components.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

from apps.dues.models import DuesDue, DuesDueComponent, DuesPlan, DuesSchedule


def open_due(
    tenant: Any,
    party: Any,
    day: dt.date,
    *,
    mode: str = "charge",
    amount: str = "500.00",
    components: dict[str, str] | None = None,
    allocation_order: str = "oldest_first",
    grace_days: int = 0,
    status: str = "due",
) -> DuesDue:
    expectation = mode == "expectation"
    common = {
        "tenant": tenant,
        "module": "test",
        "mode": mode,
        "posting": "none" if expectation else "ledger",
        "freq": "once",
        "anchor": day,
        "allocation_order": allocation_order,
        "grace_days": grace_days,
    }
    plan = DuesPlan.objects.create(
        name=f"Plan {uuid.uuid4().hex[:8]}",
        amount_rule="supplied" if expectation else "fixed",
        amount=None if expectation else Decimal(amount),
        **common,
    )
    schedule = DuesSchedule.objects.create(
        plan=plan,
        party=party,
        amount=None if expectation else Decimal(amount),
        subject_type="test_subject",
        subject_id=uuid.uuid4(),
        start_on=day,
        materialised_until=day,
        **common,
    )
    due = DuesDue.objects.create(
        tenant=tenant,
        schedule=schedule,
        module="test",
        party=party,
        seq=1,
        period_start=day,
        period_end=day + dt.timedelta(days=30),
        period_label=day.strftime("%b %Y"),
        due_on=day,
        amount=Decimal(amount),
        status=status,
        # `ck_dues_due_paid_has_date`: a paid due is settled and dated.
        settled_amount=Decimal(amount) if status == "paid" else Decimal("0"),
        paid_on=day if status == "paid" else None,
    )
    if expectation:
        parts = components or {"principal": "400.00", "interest": "100.00"}
        for name, value in parts.items():
            DuesDueComponent.objects.create(
                tenant=tenant, due=due, component=name, amount=Decimal(value)
            )
    return due
