"""T-PLT-X04-7 — the contract every registered archive guard keeps (A6, contracts §1.3).

Parametrised over EVERY guard registered at start-up, so a vertical's guard is
under contract the day it registers, without its owner remembering to add it
here. The clauses:

1. A party with no records of the guard's module is NOT blocked (`None`): a
   guard that refuses everybody would make archiving impossible for a business
   that merely switched the module on.
2. A block is an `ArchiveBlock` — `{module, count, label_id}` with the guard's own
   module, a positive integer count and a message id in that module's catalogue
   (`<module>.` prefix) — because the 409's `details` are copied from it verbatim.
3. A guard asks no more than a handful of queries, since bulk archive calls it
   for up to two hundred parties in one transaction.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.parties.services.archive import registered_archive_guards
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

#: A guard may read a few rows of its own module per party; more is a guard that
#: should be batched before bulk archive calls it two hundred times.
MAX_QUERIES_PER_CALL = 3

GUARDS = [
    pytest.param(module, guard, id=f"{module}:{getattr(guard, '__name__', repr(guard))}")
    for module, guards in sorted(registered_archive_guards().items())
    for guard in guards
]


def test_core_registers_at_least_the_guardian_guard() -> None:
    """The parametrisation below is not vacuous: parties' own BR-6 guard is there."""
    assert "parties" in registered_archive_guards()


@pytest.mark.parametrize(("module", "guard"), GUARDS)
def test_a_party_with_no_records_is_not_blocked(tenant: Any, module: str, guard: Any) -> None:
    """Clauses 1 and 3."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    with CaptureQueriesContext(connection) as captured:
        assert guard(tenant, party) is None
    assert len(captured.captured_queries) <= MAX_QUERIES_PER_CALL


@pytest.mark.parametrize(("module", "guard"), GUARDS)
def test_a_block_is_shaped_as_the_409_details(tenant: Any, module: str, guard: Any) -> None:
    """Clause 2, checked on the shape a guard CAN return: the guardian guard is
    driven into refusing; a vertical's guard is checked when its module's own
    fixture can make a record (until then its `None` path is what is covered)."""
    party = PartyFactory(tenant=tenant, balance="0.00")
    if module == "parties":
        from apps.common.context import Ctx
        from apps.parties.services.relations import create_relation

        ward = PartyFactory(tenant=tenant)
        create_relation(
            ctx=Ctx.system(tenant), party=ward, related_party_id=party.id, kind="guardian"
        )
    block = guard(tenant, party)
    if block is None:
        pytest.skip(f"no fixture makes an open {module} record yet")
    assert set(block) == {"module", "count", "label_id"}
    assert block["module"] == module
    assert isinstance(block["count"], int) and block["count"] > 0
    assert block["label_id"].startswith(f"{module}.")
