"""B06 — membership types and loan rules (LIB-04 FR-1, LIB-05 FR-1, BR-1, BR-2; T-LIB-05-1)."""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.common.context import Ctx
from apps.library.models import LibraryLoanRule, LibraryMembershipType
from apps.library.services.rules import resolve_rule
from apps.library.services.settings import seed_library

pytestmark = pytest.mark.django_db
D = Decimal
TYPES = "v1:library-membership-types"
RULES = "v1:library-loan-rules"


def _type(**over: Any) -> SimpleNamespace:
    base = {
        "id": "T",
        "loan_days": 14,
        "max_renewals": 2,
        "fine_per_day": D("2.00"),
        "fine_cap": None,
        "grace_days": 0,
        "allows_reference_loan": False,
    }
    base.update(over)
    return SimpleNamespace(**base)


def _rule(type_id: Any, material: str, **cols: Any) -> SimpleNamespace:
    base = {
        "membership_type_id": type_id,
        "material_type": material,
        "loanable": True,
        "loan_days": None,
        "max_renewals": None,
        "fine_per_day": None,
        "fine_cap": None,
        "grace_days": None,
    }
    base.update(cols)
    return SimpleNamespace(**base)


# ── T-LIB-05-1: resolution, column by column ────────────────────────────────


@pytest.mark.parametrize(
    "specific, general, loan_days, fine, source",
    [
        (None, None, 14, D("2.00"), "type"),
        (None, {"loan_days": 3}, 3, D("2.00"), "material"),
        ({"loan_days": 7}, None, 7, D("2.00"), "type_material"),
        ({"loan_days": 7}, {"loan_days": 3}, 7, D("2.00"), "type_material"),
        (None, {"fine_per_day": D("1.00")}, 14, D("1.00"), "type"),
        ({"fine_per_day": D("5.00")}, {"fine_per_day": D("1.00")}, 14, D("5.00"), "type"),
        # The mixed case: loan days from (T, M), the fine from (null, M).
        ({"loan_days": 7}, {"fine_per_day": D("1.00")}, 7, D("1.00"), "type_material"),
        ({}, {}, 14, D("2.00"), "type"),
    ],
)
def test_each_column_resolves_on_its_own(
    specific: dict | None, general: dict | None, loan_days: int, fine: Decimal, source: str
) -> None:
    """T-LIB-05-1 — a whole-row "most specific wins" would take the fine from a type row that
    only meant to shorten the loan; every column falls through on its own (BR-1)."""
    rows = []
    if specific is not None:
        rows.append(_rule("T", "magazine", **specific))
    if general is not None:
        rows.append(_rule(None, "magazine", **general))
    resolved = resolve_rule(_type(), rows, "magazine")
    assert (resolved.loan_days, resolved.fine_per_day, resolved.source) == (loan_days, fine, source)


def test_a_reference_copy_resolves_as_reference_and_some_types_may_borrow_it() -> None:
    """BR-1, BR-2 — a reference copy of a "book" title is not lent, unless the type allows
    reference loans (D29), and then for the rule's days."""
    rules = [_rule(None, "reference", loanable=False, loan_days=1)]
    assert resolve_rule(_type(), rules, "book", is_reference=True).loanable is False
    allowed = resolve_rule(_type(allows_reference_loan=True), rules, "book", is_reference=True)
    assert (allowed.loanable, allowed.loan_days) == (True, 1)
    assert resolve_rule(_type(), rules, "book").loanable is True


def test_two_every_type_rows_for_one_material_are_refused(library_on: Any) -> None:
    """Two (null, magazine) rows would make resolution depend on row order;
    `NULLS NOT DISTINCT` refuses the second."""
    LibraryLoanRule.objects.create(tenant=library_on, material_type="magazine", loan_days=3)
    with pytest.raises(IntegrityError), transaction.atomic():
        LibraryLoanRule.objects.create(tenant=library_on, material_type="magazine", loan_days=5)


# ── the API ─────────────────────────────────────────────────────────────────


def test_put_with_one_bad_row_changes_nothing(api_as: Any, library_on: Any) -> None:
    """A half-applied rule list is a counter lending magazines for 365 days; one bad row is a
    400 naming it, and the old list stands."""
    client, _ = api_as(library_on, role="owner")
    seed_library(Ctx.system(library_on), library_on)
    before = list(LibraryLoanRule.objects.filter(tenant=library_on).values_list("material_type"))
    response = client.put(
        reverse(RULES),
        {
            "rows": [
                {"material_type": "magazine", "loan_days": 3},
                {"material_type": "textbook", "loan_days": 999},
            ]
        },
        format="json",
    )
    assert response.status_code == 400
    assert "rows.1.loan_days" in response.json()["error"]["details"]
    after = list(LibraryLoanRule.objects.filter(tenant=library_on).values_list("material_type"))
    assert after == before


def test_put_replaces_the_list_and_answers_the_effective_matrix(
    api_as: Any, library_on: Any
) -> None:
    client, _ = api_as(library_on, role="owner")
    seed_library(Ctx.system(library_on), library_on)
    response = client.put(
        reverse(RULES),
        {"rows": [{"material_type": "magazine", "loan_days": 3, "max_renewals": 0}]},
        format="json",
    )
    assert response.status_code == 200, response.content
    body = response.json()
    assert [r["material_type"] for r in body["data"]] == ["magazine"]
    magazine = next(e for e in body["meta"]["effective"] if e["material_type"] == "magazine")
    assert (magazine["loan_days"], magazine["max_renewals"], magazine["source"]) == (
        3,
        0,
        "material",
    )


def test_type_bounds_hold_and_a_duplicate_name_is_a_field_error(
    api_as: Any, library_on: Any
) -> None:
    """LIB-04 §5 — `max_copies` 0–50 is the service's rule AND a CHECK; "student" and
    "Student" are one name."""
    client, _ = api_as(library_on, role="owner")
    assert client.post(reverse(TYPES), {"name": "Student"}, format="json").status_code == 201
    dup = client.post(reverse(TYPES), {"name": "student"}, format="json")
    assert dup.status_code == 400 and "name" in dup.json()["error"]["details"]
    bad = client.post(reverse(TYPES), {"name": "Big", "max_copies": 51}, format="json")
    assert bad.status_code == 400 and "max_copies" in bad.json()["error"]["details"]
    with pytest.raises(IntegrityError), transaction.atomic():
        LibraryMembershipType.objects.create(tenant=library_on, name="Raw", max_copies=51)


def test_a_type_is_patched_with_its_version_and_never_deleted(api_as: Any, library_on: Any) -> None:
    """FR-1 — a type with members is deactivated, never deleted (405); a stale save is 409."""
    client, _ = api_as(library_on, role="owner")
    created = client.post(reverse(TYPES), {"name": "Adult"}, format="json").json()["data"]
    url = reverse("v1:library-membership-type", args=[created["id"]])
    off = client.patch(url, {"is_active": False, "version": 1}, format="json")
    assert off.status_code == 200 and off.json()["data"]["is_active"] is False
    assert client.patch(url, {"loan_days": 7, "version": 1}, format="json").status_code == 409
    assert client.delete(url).status_code == 405


def test_staff_cannot_write_and_the_accountant_can_read(api_as: Any, library_on: Any) -> None:
    staff, _ = api_as(library_on, role="staff")
    assert staff.post(reverse(TYPES), {"name": "X"}, format="json").status_code == 403
    accountant, _ = api_as(library_on, role="accountant")
    assert accountant.get(reverse(TYPES)).status_code == 200
    assert accountant.get(reverse(RULES)).status_code == 200


# ── the seed (BR-4) ─────────────────────────────────────────────────────────


def test_seeding_is_idempotent_and_never_restores_a_deleted_rule(library_on: Any) -> None:
    """Switching the module off and on must not undo a library's own decisions."""
    ctx = Ctx.system(library_on)
    seed_library(ctx, library_on)
    seed_library(ctx, library_on)
    assert LibraryMembershipType.objects.filter(tenant=library_on).count() == 1
    rule = LibraryLoanRule.objects.get(tenant=library_on)
    assert (rule.membership_type_id, rule.material_type, rule.loanable) == (
        None,
        "reference",
        False,
    )
    rule.delete()
    seed_library(ctx, library_on)
    assert not LibraryLoanRule.objects.filter(tenant=library_on).exists()
