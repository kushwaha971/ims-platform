"""A stand-in module for A7's reminder tests: a source, a policy and templates.

The module is called `test`, like the A6 and A9b stand-ins. Its source yields
whatever the test puts in `CANDIDATES[tenant.pk]`, which is how a test says
"these instalments are due" without a lending app. The policy is lending's
(ADR-054): 08:00–19:00 in the tenant's zone, one per record per day, fixed text.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest

from apps.ledger.services import reminder_seam
from apps.notifications.services import templates as template_registry

IST = ZoneInfo("Asia/Kolkata")
MODULE = "test"
SOURCE = "test_instalment"
TEMPLATE = "test_instalment_due"
NOTICE_TEMPLATE = "test_ready"

#: tenant pk -> list of candidates the fake source yields.
CANDIDATES: dict[Any, list[dict]] = {}

LENDING_LIKE = {
    "window": (dt.time(8, 0), dt.time(19, 0)),
    "daily_cap_per_source": 1,
    "fixed_templates": True,
    "forbidden_words": frozenset({"police", "jail"}),
}


def _candidates(tenant: Any, today: dt.date) -> list[dict]:
    return list(CANDIDATES.get(tenant.pk, []))


def at_ist(day: dt.date, hour: int, minute: int = 0, second: int = 0) -> dt.datetime:
    return dt.datetime.combine(day, dt.time(hour, minute, second), tzinfo=IST)


def candidate(
    party: Any,
    *,
    amount: str | None = "5625.00",
    due_on: dt.date = dt.date(2026, 10, 12),
    label: str = "Instalment 4 of LN-0042",
    recipient: Any = None,
    source_id: uuid.UUID | None = None,
) -> dict:
    return {
        "party_id": party.pk,
        "source_type": SOURCE,
        "source_id": source_id or uuid.uuid4(),
        "due_on": due_on,
        "amount": Decimal(amount) if amount is not None else None,
        "subject_label": label,
        "template_key": TEMPLATE if amount is not None else NOTICE_TEMPLATE,
        "recipient_party_id": recipient.pk if recipient is not None else None,
        "params": {},
    }


def module_on(tenant: Any, module: str = MODULE) -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | {module}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | {module})
    tenant.timezone = "Asia/Kolkata"
    tenant.save(update_fields=["enabled_modules", "timezone"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


@pytest.fixture
def test_module() -> Any:
    """Register the stand-in source, policy and templates; undo them after."""
    reminder_seam._reset_sources_for_tests()
    reminder_seam._reset_policies_for_tests()
    template_registry._reset_for_tests()
    CANDIDATES.clear()
    reminder_seam.register_reminder_source(SOURCE, module=MODULE, candidates=_candidates)
    reminder_seam.register_reminder_policy(MODULE, dict(LENDING_LIKE))  # type: ignore[arg-type]
    template_registry.register_default_templates(
        {
            TEMPLATE: {
                "whatsapp": {
                    "en": "Namaste {{recipient_name}}, {{subject}} for {{name}} of Rs {{amount}}"
                    " is due on {{due_date}}. — {{shop}}",
                    "hi": "नमस्ते {{recipient_name}}, {{name}} की {{subject}} Rs {{amount}}"
                    " {{due_date}} को देय है। — {{shop}}",
                },
                "sms": {"en": "{{shop}}: {{subject}} Rs {{amount}} due {{due_date}}."},
            },
            NOTICE_TEMPLATE: {
                "whatsapp": {"en": "Namaste {{recipient_name}}, {{subject}}. — {{shop}}"},
                "sms": {"en": "{{shop}}: {{subject}}."},
            },
        }
    )
    yield
    CANDIDATES.clear()
    reminder_seam._reset_sources_for_tests()
    reminder_seam._reset_policies_for_tests()
    template_registry._reset_for_tests()


@pytest.fixture
def clock(monkeypatch: Any) -> Any:
    """`clock(datetime)` sets the policy's clock (and only the policy's)."""

    def _set(moment: dt.datetime) -> None:
        monkeypatch.setattr(reminder_seam, "now", lambda: moment)

    return _set
