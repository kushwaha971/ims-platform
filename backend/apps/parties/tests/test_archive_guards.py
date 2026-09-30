"""PLT-X04 — archive guards in single and bulk archive (A6, BR-3, BR-4).

T-PLT-X04-4. A module that holds open records for a person refuses their
archive with 409 `party_has_open_records {module, count, label_id}`; a guard of
a module the tenant cannot reach is never called; bulk archive skips and
reports a blocked party instead of archiving it.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.parties.constants import PartyStatus
from apps.parties.services import archive as archive_service
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

BLOCKED_NAME = "Rahul"


def _module_on(tenant: Any, module: str) -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | {module}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | {module})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


class _Guard:
    """A guard that blocks `BLOCKED_NAME` and records every party it was asked about."""

    def __init__(self, module: str, label_id: str) -> None:
        self.module = module
        self.label_id = label_id
        self.calls: list[str] = []

    def __call__(self, tenant: Any, party: Any) -> Any:
        self.calls.append(party.name)
        if party.name == BLOCKED_NAME:
            return {"module": self.module, "count": 1, "label_id": self.label_id}
        return None


@pytest.fixture
def guards() -> Any:
    archive_service._reset_guards_for_tests()
    gym = _Guard("test", "test.archive.activeMemberships")
    off = _Guard("other", "other.archive.open")
    archive_service.register_archive_guard("test", gym)
    archive_service.register_archive_guard("other", off)
    yield gym, off
    archive_service._reset_guards_for_tests()


def test_a_registered_guard_refuses_the_archive_with_the_module_and_count(
    tenant: Any, api_as: Any, guards: Any
) -> None:
    """T-PLT-X04-4 / worked example: Rahul, ₹0.00, one active membership → 409
    with `{module, count, label_id}`, and he stays active."""
    _module_on(tenant, "test")
    rahul = PartyFactory(tenant=tenant, name=BLOCKED_NAME, balance="0.00")
    client, _ = api_as(tenant)

    response = client.post(reverse("v1:party-archive", args=[rahul.id]), {}, format="json")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "party_has_open_records"
    assert error["details"] == {
        "module": "test",
        "count": 1,
        "label_id": "test.archive.activeMemberships",
    }
    rahul.refresh_from_db()
    assert rahul.status == PartyStatus.ACTIVE


def test_the_guard_of_a_disabled_module_is_not_called(
    tenant: Any, api_as: Any, guards: Any
) -> None:
    """BR-3 — `other` is registered and off: its guard never runs, so it cannot
    block and cannot cost a query."""
    gym, off = guards
    _module_on(tenant, "test")
    sita = PartyFactory(tenant=tenant, name="Sita", balance="0.00")
    client, _ = api_as(tenant)

    response = client.post(reverse("v1:party-archive", args=[sita.id]), {}, format="json")

    assert response.status_code == 200
    assert gym.calls == ["Sita"]
    assert off.calls == []


def test_the_balance_check_runs_before_the_guards(tenant: Any, api_as: Any, guards: Any) -> None:
    """BR-3 order — a party who owes money gets the balance refusal, which is the
    one the dialog can act on in place (write off), not the module's."""
    _module_on(tenant, "test")
    rahul = PartyFactory(tenant=tenant, name=BLOCKED_NAME, balance="10.00")
    client, _ = api_as(tenant)

    response = client.post(reverse("v1:party-archive", args=[rahul.id]), {}, format="json")

    assert response.json()["error"]["code"] == "party_balance_nonzero"


def test_bulk_archive_skips_a_blocked_party_and_reports_why(
    tenant: Any, api_as: Any, guards: Any
) -> None:
    """T-PLT-X04-4 / BR-4 / worked example: [Rahul, Sita] → Sita archived, Rahul
    skipped with the guard's code, module and count; never archived."""
    _module_on(tenant, "test")
    rahul = PartyFactory(tenant=tenant, name=BLOCKED_NAME, balance="0.00")
    sita = PartyFactory(tenant=tenant, name="Sita", balance="0.00")
    client, _ = api_as(tenant)

    response = client.post(
        reverse("v1:party-bulk-archive"), {"ids": [str(rahul.id), str(sita.id)]}, format="json"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["archived"] == [str(sita.id)]
    assert body["data"]["skipped"] == [
        {
            "id": str(rahul.id),
            "name": BLOCKED_NAME,
            "code": "party_has_open_records",
            "balance": "0.00",
            "module": "test",
            "count": 1,
            "label_id": "test.archive.activeMemberships",
        }
    ]
    assert body["meta"] == {"archived_count": 1, "skipped_count": 1}
    rahul.refresh_from_db()
    sita.refresh_from_db()
    assert rahul.status == PartyStatus.ACTIVE
    assert sita.status == PartyStatus.ARCHIVED


def test_a_guard_refusal_rolls_back_a_write_off_posted_in_the_same_request(
    tenant: Any, api_as: Any, guards: Any
) -> None:
    """The write-off runs BEFORE the guards (BR-3), so a guard that then refuses
    must take the write-off back with it — otherwise the merchant forgives a debt
    and keeps the party, which is neither of the things they asked for. The
    balance is built from a real entry, so the cache has something behind it."""
    from apps.common.constants import Direction
    from apps.ledger.models import LedgerEntry

    _module_on(tenant, "test")
    rahul = PartyFactory(tenant=tenant, name=BLOCKED_NAME, balance="0.00")
    client, _ = api_as(tenant)
    posted = client.post(
        reverse("v1:ledger-entry-list"),
        {
            "party_id": str(rahul.id),
            "direction": Direction.DEBIT,
            "amount": "250.00",
            "entry_date": "2026-04-01",
        },
        format="json",
    )
    assert posted.status_code == 201, posted.content
    entries = LedgerEntry.objects.filter(party=rahul).count()

    response = client.post(
        reverse("v1:party-archive", args=[rahul.id]),
        {"reason": "Moved away", "write_off": {"reason": "Cannot recover"}},
        format="json",
    )

    assert response.status_code == 409, response.content
    assert response.json()["error"]["code"] == "party_has_open_records"
    rahul.refresh_from_db()
    assert rahul.status == PartyStatus.ACTIVE
    assert str(rahul.balance) == "250.00"
    assert LedgerEntry.objects.filter(party=rahul).count() == entries
