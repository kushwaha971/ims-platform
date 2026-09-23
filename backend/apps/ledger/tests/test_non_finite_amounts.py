"""F-4 — an amount that is not a finite number is a 400, never a 500.

`Decimal("Infinity")`, `Decimal("NaN")` and `Decimal("sNaN")` all construct
without error, so `_parse_amount`'s `try` let them through to a
`quantize()` that raised `InvalidOperation` OUTSIDE it (or, for `sNaN`, a
comparison that did). `1e400` is finite but has more digits than the decimal
context holds, and failed in the same `quantize()`. Every one answered 500 on
every write that takes an amount: a new entry, a correction and the archive's
write-off confirmation.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.constants import Direction
from apps.ledger.models import LedgerEntry
from apps.parties.constants import PartyStatus
from apps.platform_app.models import AuditLog
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

ENTRIES = "v1:ledger-entry-list"
DETAIL = "v1:ledger-entry-detail"

NOT_FINITE = ["Infinity", "-Infinity", "NaN", "sNaN", "1e400", "-inf", "nan"]


def _assert_refused(response: Any, *path: str) -> None:
    assert response.status_code == 400, response.content
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    details = error["details"]
    for key in path:
        details = details[key]
    assert details == ["Enter a valid amount."]


@pytest.mark.parametrize("raw", NOT_FINITE)
def test_a_new_entry_with_a_non_finite_amount_is_refused(
    raw: str, tenant: Any, api_as: Any
) -> None:
    """POST /ledger-entries with `amount` of Infinity/NaN/sNaN/1e400 → 400
    `validation_error` under `amount`. Before the fix: 500."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")

    response = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.DEBIT,
            "amount": raw,
            "entry_date": "2026-04-01",
        },
        format="json",
    )

    _assert_refused(response, "amount")
    assert not LedgerEntry.objects.filter(party=party).exists()


@pytest.mark.parametrize("raw", NOT_FINITE)
def test_a_correction_to_a_non_finite_amount_is_refused(raw: str, tenant: Any, api_as: Any) -> None:
    """POST /ledger-entries/{id}/correct with a non-finite `amount` → 400 under
    `amount`, and the original is still standing. Before the fix: 500."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    created = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.DEBIT,
            "amount": "500.00",
            "entry_date": "2026-04-01",
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    entry_id = created.json()["data"]["id"]

    response = client.post(
        f"{reverse(DETAIL, args=[entry_id])}/correct",
        {"amount": raw, "reason": "Typed it wrong"},
        format="json",
    )

    _assert_refused(response, "amount")
    assert LedgerEntry.objects.filter(party=party).count() == 1


@pytest.mark.parametrize("raw", NOT_FINITE)
def test_a_write_off_confirming_a_non_finite_amount_is_refused(
    raw: str, tenant: Any, api_as: Any
) -> None:
    """POST /parties/{id}/archive with `write_off.amount` non-finite → 400
    under `write_off.amount`; nothing written, the party still active.
    Before the fix: 500."""
    client, _ = api_as(tenant)
    party = PartyFactory(tenant=tenant, balance="0.00")
    given = client.post(
        reverse(ENTRIES),
        {
            "party_id": str(party.id),
            "direction": Direction.DEBIT,
            "amount": "2300.00",
            "entry_date": "2026-04-01",
        },
        format="json",
    )
    assert given.status_code == 201, given.content
    audit_rows = AuditLog.objects.count()

    response = client.post(
        reverse("v1:party-archive", args=[party.id]),
        {"write_off": {"reason": "Cannot recover", "amount": raw}},
        format="json",
    )

    _assert_refused(response, "write_off", "amount")
    party.refresh_from_db()
    assert party.status == PartyStatus.ACTIVE
    assert party.balance == Decimal("2300.00")
    assert LedgerEntry.objects.filter(party=party).count() == 1
    assert AuditLog.objects.count() == audit_rows
