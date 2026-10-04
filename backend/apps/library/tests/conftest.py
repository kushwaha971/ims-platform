"""Library fixtures (B01).

`library_on` is the one way a library suite switches the module on: library is
in `UNRELEASED_MODULES` (A1, ADR-041), so a tenant reaches it only when its
plan, its partner and its own switches all name it AND the
`UB_UNRELEASED_MODULES` flag is set. This mirrors `_with_new_modules` in
`apps/platform_app/tests/test_release_gate.py`.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from django.test import override_settings
from django.urls import reverse

LIBRARY = "library"


def entitle_library(tenant: Any) -> Any:
    """Put library on the tenant's plan, its partner and its `enabled_modules`.

    Deliberately does NOT set the flag: the release gate must still hide the
    module, which `test_skeleton.py` proves.
    """
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field) or []) | {LIBRARY}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules or []) | {LIBRARY})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    return tenant


@pytest.fixture
def library_on(tenant: Any) -> Iterator[Any]:
    """The `tenant` fixture with library entitled, switched on and released by the flag."""
    with override_settings(UB_UNRELEASED_MODULES=True):
        yield entitle_library(tenant)


@pytest.fixture
def desk(api_as: Any, library_on: Any) -> dict:
    """B09, B10b: an owner at the counter, a member allowed two books, and three copies of one
    title priced ₹250."""
    from apps.library.models import LibraryMembershipType
    from tests.factories.parties import PartyFactory

    owner, _ = api_as(library_on, role="owner")
    kind = LibraryMembershipType.objects.create(
        tenant=library_on, name="Student", max_copies=2, loan_days=14, grace_days=0
    )
    enrolled = owner.post(
        reverse("v1:library-members"),
        {"membership_type_id": str(kind.id), "party_id": str(PartyFactory(tenant=library_on).id)},
        format="json",
        HTTP_IDEMPOTENCY_KEY="e1",
    ).json()["data"]
    title = owner.post(
        reverse("v1:library-titles"),
        {"title": "Wings of Fire", "copies": {"count": 3, "price": "250.00"}},
        format="json",
        HTTP_IDEMPOTENCY_KEY="t1",
    ).json()["data"]
    return {
        "client": owner,
        "tenant": library_on,
        "member": enrolled["membership_id"],
        "kind": kind,
        "copies": [c["accession_number"] for c in title["copies"]],
        "title_id": title["id"],
    }
