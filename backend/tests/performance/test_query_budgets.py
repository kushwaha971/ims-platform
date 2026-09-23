"""The query budget of Part 20 §20.14.1, as a gate rather than a paragraph.

§20.14.1 says a budget is "declared per endpoint and asserted in a test;
exceeding it fails CI". Until now nothing asserted one — `grep -rn
"num_queries\\|CaptureQueriesContext" backend/` returned nothing — and the
budget had already drifted: `GET /parties` was running 7 queries against a
specified 4 and no gate said so.

**How to change a budget.**

*Lowering* one is a one-character edit: `budget` is an upper bound, so a fix that
removes a query makes `test_endpoint_is_within_its_query_budget` pass with room
to spare, and `test_budget_has_no_slack` then fails and tells you the new number
to write. Lower it in the same commit as the fix.

*Raising* one is deliberately awkward. `budget` must equal
`len(composition)` — `test_budget_matches_its_composition` enforces it — so a
higher number is only accepted once you have written down, in one line each,
what every query in it is *for*. There is no way to absorb an accidental query
into a round number: you have to name it, and naming an accidental query is
usually enough to notice that it was accidental.

**The per-request floor.** §20.14.1's compositions count an endpoint's own data
queries and nothing else. A real request also pays for authentication and
tenancy, and `django_assert_num_queries` counts every query on the connection,
so the two numbers cannot be compared directly. The floor is:

    1. `platform_user`            — the authentication class loads the user
    2. `platform_membership`      — `tenancy._resolve_membership_tenant`, which
                                    since `CR-153` carries `tenant`, `role`,
                                    `tenant__plan` and `tenant__partner` in one
                                    `select_related`
    3. `platform_tenant_setting`  — `entitlements.for_tenant`'s plan overrides,
                                    paid only by endpoints behind `ModuleEnabled`

so 2 queries for an endpoint with no module gate and 3 for one with it. Every
budget below is therefore `floor + endpoint`, and the `spec_budget` column
records what §20.14.1 says the endpoint half should be.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from tests.factories.parties import PartyFactory

# ── The table ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class QueryBudget:
    """One endpoint's budget. Adding an endpoint to the gate is adding a row."""

    #: pytest id; keep it stable, it is what a failure names.
    id: str
    #: The endpoint as canon §0.8 writes it.
    label: str
    #: `(world) -> url`. `world` is what `budget_world` below builds.
    url: Callable[[dict[str, Any]], str]
    #: The upper bound asserted. Must equal `len(composition)`.
    budget: int
    #: One line per query in the budget, in the order they are issued.
    composition: tuple[str, ...]
    #: What §20.14.1 budgets for this endpoint's *own* queries, floor excluded.
    spec_budget: int | None = None
    #: Why this row's number differs from `spec_budget`, when it does.
    spec_note: str = ""
    #: Page sizes to prove the count does not scale with the page. §20.14.1:
    #: "The second half is the important half."
    page_sizes: tuple[int, ...] = field(default=())

    def __str__(self) -> str:  # pragma: no cover - pytest id only
        return self.id


AUTH_FLOOR = (
    "platform_user — the authentication class loads the request user",
    "platform_membership — tenancy resolves the membership, tenant, role, plan and partner",
)
MODULE_GATE = ("platform_tenant_setting — entitlements.for_tenant reads the plan overrides",)

QUERY_BUDGETS: tuple[QueryBudget, ...] = (
    QueryBudget(
        id="parties-list",
        label="GET /parties",
        url=lambda w: reverse("v1:party-list"),
        budget=7,
        composition=(
            *AUTH_FLOOR,
            *MODULE_GATE,
            "parties_party — the paginator's COUNT(*) over the filtered set",
            "parties_party — the page itself",
            "parties_tag — the chips, prefetched once for the whole page",
            "parties_party — the meta.totals aggregate over the filtered set",
        ),
        spec_budget=4,
        spec_note=(
            "§20.14.1 composes 4 as 'count, page, tags prefetch, meta.totals aggregate', "
            "and with PTY-05 all four are now real — so the endpoint issues exactly the "
            "4 the spec allows, plus the 3-query floor. The tags prefetch is ONE query "
            "for the page however many rows it holds, which is the whole reason "
            "`list_parties` prefetches rather than letting the serializer walk the "
            "relation: without it a page of 25 is 26 queries. The totals aggregate is "
            "likewise one query for three numbers — `count` rides along with the two "
            "conditional sums rather than taking a `queryset.count()` of its own."
        ),
        page_sizes=(25, 100),
    ),
    QueryBudget(
        id="parties-list-search",
        label="GET /parties?q=",
        url=lambda w: reverse("v1:party-list") + "?q=budget",
        budget=7,
        composition=(
            *AUTH_FLOOR,
            *MODULE_GATE,
            "parties_party — COUNT(*) over the filtered set",
            "parties_party — the page itself",
            "parties_tag — the chips, prefetched once for the whole page",
            "parties_party — the meta.totals aggregate over the filtered set",
        ),
        spec_budget=4,
        spec_note=(
            "Same endpoint as `parties-list`; the `q` filter is a predicate, not a query — "
            "including the mobile-suffix and GSTIN branches, which are OR'd into the same "
            "WHERE rather than fetched separately."
        ),
        page_sizes=(25, 100),
    ),
    QueryBudget(
        id="parties-list-status",
        label="GET /parties?status=active",
        url=lambda w: reverse("v1:party-list") + "?status=active",
        budget=7,
        composition=(
            *AUTH_FLOOR,
            *MODULE_GATE,
            "parties_party — COUNT(*) over the filtered set",
            "parties_party — the page itself",
            "parties_tag — the chips, prefetched once for the whole page",
            "parties_party — the meta.totals aggregate over the filtered set",
        ),
        spec_budget=4,
        spec_note="Same endpoint as `parties-list`; this is the request the shipping UI sends.",
        page_sizes=(25, 100),
    ),
    QueryBudget(
        id="parties-detail",
        label="GET /parties/{id}",
        url=lambda w: reverse("v1:party-detail", args=[w["party"].id]),
        budget=6,
        composition=(
            *AUTH_FLOOR,
            *MODULE_GATE,
            "parties_party — the row",
            "parties_tag — the party's chips",
            "platform_tenant_setting — PTY-06's credit mode",
        ),
        spec_budget=5,
        spec_note=(
            "§20.14.1 composes 5 as 'party, summary aggregate, recent entries, tags, "
            "open-invoice count'. Two of the five are real now — the row and PTY-05's "
            "tags. The summary aggregate costs nothing because `retrieve` computes it "
            "from the row it is already holding; the recent entries and the open-invoice "
            "count need the ledger and sales documents, which do not exist."
            "\n\n"
            "PTY-06 adds the sixth, which the spec's composition does not list: one read "
            "of `ledger.credit_limit_mode`. It is deliberately NOT cached on the tenant "
            "object — a cache here would be a second thing to invalidate the moment "
            "PLT-06 lets somebody change the mode, in exchange for one indexed read of a "
            "table with one row per tenant per key. The alternative, sending the credit "
            "block without the mode, would make the client ask a second question before "
            "it could decide whether to draw the bar at all (FR-10)."
        ),
    ),
    QueryBudget(
        id="auth-me",
        label="GET /auth/me",
        url=lambda w: reverse("v1:auth-me"),
        budget=7,
        composition=(
            *AUTH_FLOOR,
            "platform_membership — `active_membership` for the tenant in the `tid` claim",
            "platform_membership — the caller's other memberships, for the switcher",
            *MODULE_GATE,
            "platform_membership — the seat count behind `plan_limits.max_users`",
            "platform_session — the current device, for the session card",
        ),
        spec_note=(
            "§20.14.1 has no row for `/auth/me`. It is in this table because it is the "
            "first request of every cold load and the most expensive endpoint shipping."
        ),
    ),
    QueryBudget(
        id="tenants-current",
        label="GET /tenants/current",
        url=lambda w: reverse("v1:tenant-current"),
        budget=2,
        composition=AUTH_FLOOR,
        spec_note=(
            "§20.14.1 has no row for it. It is the bare per-request floor with no module "
            "gate, which is why it is worth keeping measured: if this number moves, every "
            "endpoint in the product moved with it."
        ),
    ),
)


# ── The fixture the table's URL builders read ────────────────────────────────


@pytest.fixture
def budget_world(db: Any, tenant: Any, api_as: Any) -> dict[str, Any]:
    """One tenant, one authenticated owner, 50 parties and a party to fetch."""
    client, membership = api_as(tenant)
    PartyFactory.create_batch(50, tenant=tenant, name="Budget party")
    return {
        "tenant": tenant,
        "client": client,
        "membership": membership,
        "party": PartyFactory(tenant=tenant, name="Budget party detail"),
    }


def _measure(world: dict[str, Any], url: str) -> list[str]:
    """Issue `url` and return one SQL string per query the request ran."""
    client = world["client"]
    # The first call warms whatever is lazily imported or content-type
    # negotiated; the budget is about the steady state, not about cold imports.
    first = client.get(url)
    assert first.status_code == 200, (url, first.content[:400])
    with CaptureQueriesContext(connection) as captured:
        response = client.get(url)
    assert response.status_code == 200, (url, response.content[:400])
    return [" ".join(q["sql"].split()) for q in captured.captured_queries]


def _report(budget: QueryBudget, url: str, queries: Sequence[str]) -> str:
    lines = [
        f"{budget.label} ran {len(queries)} queries against a budget of {budget.budget}.",
        f"  url: {url}",
        "  budget composition:",
        *[f"    {i:2d}. {line}" for i, line in enumerate(budget.composition, 1)],
        "  queries actually issued:",
        *[f"    {i:2d}. {sql[:160]}" for i, sql in enumerate(queries, 1)],
    ]
    return "\n".join(lines)


# ── The gates ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("budget", QUERY_BUDGETS, ids=str)
def test_budget_matches_its_composition(budget: QueryBudget) -> None:
    """A budget is a number *and* a list of what is in it, or it is a round number.

    This is the half that makes raising a budget hard to do quietly: the extra
    query has to be named before the number will move.
    """
    assert budget.budget == len(budget.composition), (
        f"{budget.label}: budget is {budget.budget} but {len(budget.composition)} queries "
        f"are named in `composition`. Raising a budget means writing down the query that "
        f"was added; lowering one means deleting the line it no longer runs."
    )


@pytest.mark.django_db
@pytest.mark.parametrize("budget", QUERY_BUDGETS, ids=str)
def test_endpoint_is_within_its_query_budget(
    budget: QueryBudget, budget_world: dict[str, Any]
) -> None:
    """The gate: an endpoint may not run more queries than its row allows."""
    url = budget.url(budget_world)
    queries = _measure(budget_world, url)
    assert len(queries) <= budget.budget, _report(budget, url, queries)


@pytest.mark.django_db
@pytest.mark.parametrize("budget", QUERY_BUDGETS, ids=str)
def test_budget_has_no_slack(budget: QueryBudget, budget_world: dict[str, Any]) -> None:
    """A budget above what the endpoint runs is a budget that has stopped gating.

    Slack is where the next regression hides: an endpoint budgeted at 8 that runs
    5 can grow by three queries in silence. When this fails, the fix is to lower
    `budget` and delete the composition line that no longer happens.
    """
    url = budget.url(budget_world)
    queries = _measure(budget_world, url)
    assert len(queries) >= budget.budget, (
        f"{budget.label} now runs {len(queries)} queries but is budgeted {budget.budget}. "
        f"Lower the budget to {len(queries)} and remove the composition line for the query "
        f"it no longer issues.\n" + _report(budget, url, queries)
    )


@pytest.mark.django_db
@pytest.mark.parametrize("budget", [b for b in QUERY_BUDGETS if b.page_sizes], ids=str)
def test_list_query_count_does_not_scale_with_the_page(
    budget: QueryBudget, budget_world: dict[str, Any]
) -> None:
    """§20.14.1: "The second half is the important half."

    A fixed count at one page size can still hide an N+1 that happens to be
    N = 1. So the count is taken at two page sizes over two different row counts,
    and the two must agree — a per-row query would make them differ.
    """
    tenant = budget_world["tenant"]
    base_url = budget.url(budget_world)
    joiner = "&" if "?" in base_url else "?"

    counts: dict[int, int] = {}
    for index, page_size in enumerate(budget.page_sizes):
        if index:
            # More rows before each later measurement, so a per-row query would
            # have more rows to be per.
            PartyFactory.create_batch(50, tenant=tenant, name="Budget party")
        url = f"{base_url}{joiner}page_size={page_size}"
        counts[page_size] = len(_measure(budget_world, url))

    assert len(set(counts.values())) == 1, (
        f"{budget.label} runs a different number of queries at different page sizes: "
        f"{counts}. That is an N+1 — the count must be constant in the page."
    )
    assert (
        max(counts.values()) <= budget.budget
    ), f"{budget.label} exceeded its budget of {budget.budget} at some page size: {counts}"


def test_every_list_endpoint_in_the_table_proves_it_is_not_o_of_page_size() -> None:
    """§20.14.1's "Any endpoint: never O(page_size)" needs the second measurement.

    A list row with no `page_sizes` is a row that only asserts the easy half, so
    the table refuses to accept one.
    """
    missing = [b.id for b in QUERY_BUDGETS if "list" in b.id and not b.page_sizes]
    assert missing == [], (
        f"list endpoints with no second page size: {missing}. Give the row a "
        f"`page_sizes` tuple so the N+1 half of §20.14.1 is asserted too."
    )
