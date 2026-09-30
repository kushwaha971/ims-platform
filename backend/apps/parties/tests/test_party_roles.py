"""PLT-X04 — party roles: the registry, `?role=`, `GET /parties/roles`, badges (A6).

T-PLT-X04-1…3. A module's role on a person is the existence of its profile row
(ADR-046); core finds those people through `register_party_role` without
importing the module. The stand-in "profile table" here is the tag join
(`PartyTag`) — a real table with a `party_id` column, which is all a role needs —
and, for the plan test, a scratch table created inside the test transaction.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import connection
from django.db.models.expressions import RawSQL
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.parties.constants import PartyStatus
from apps.parties.models import Party, PartyTag, Tag
from apps.parties.services import roles as role_registry
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

LIST = "v1:party-list"
ROLES = "v1:party-roles"


def _tagged(tag_name: str):
    """A role whose profile rows are the parties carrying `tag_name`."""

    def party_ids(tenant: Any) -> Any:
        return PartyTag.objects.filter(tag__tenant=tenant, tag__name=tag_name).values("party_id")

    return party_ids


VIP_IDS = _tagged("VIP")
LOAN_IDS = _tagged("Loan")
GUEST_IDS = _tagged("Guest")


@pytest.fixture
def registry() -> Any:
    role_registry._reset_for_tests()
    role_registry.register_party_role(
        "test_member", module="test", label_id="test.role.members", party_ids=VIP_IDS
    )
    role_registry.register_party_role(
        "test_borrower", module="test", label_id="test.role.borrowers", party_ids=LOAN_IDS
    )
    role_registry.register_party_role(
        "other_guest", module="other", label_id="other.role.guests", party_ids=GUEST_IDS
    )
    yield role_registry
    role_registry._reset_for_tests()


def _module_on(tenant: Any, module: str = "test") -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | {module}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | {module})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


def _tag(tenant: Any, party: Party, name: str) -> None:
    tag, _ = Tag.objects.get_or_create(tenant=tenant, name=name)
    PartyTag.objects.get_or_create(party=party, tag=tag)


# ── The registry (ADR-042) ───────────────────────────────────────────────────


def test_registering_the_same_role_twice_is_harmless_and_a_conflict_raises(
    registry: Any,
) -> None:
    """A module imported twice must not crash start-up; two apps claiming one
    `?role=` value must, or the URL means whichever loaded last."""
    registry.register_party_role(
        "test_member", module="test", label_id="test.role.members", party_ids=VIP_IDS
    )
    with pytest.raises(ImproperlyConfigured):
        registry.register_party_role(
            "test_member", module="gym", label_id="gym.role.members", party_ids=VIP_IDS
        )
    with pytest.raises(ImproperlyConfigured):
        registry.register_party_role("bad,code", module="x", label_id="x.y", party_ids=VIP_IDS)


# ── `?role=` (T-PLT-X04-1, BR-1, EC-1, EC-2) ─────────────────────────────────


def test_role_filter_returns_the_modules_people_and_ors_within_the_group(
    tenant: Any, api_as: Any, registry: Any
) -> None:
    """T-PLT-X04-1 / EC-1: `?role=a,b` is everybody with either profile, once each —
    and ANDs with the other filters, the `tag=` rule."""
    _module_on(tenant)
    rahul = PartyFactory(tenant=tenant, name="Rahul", balance="0.00")
    sita = PartyFactory(tenant=tenant, name="Sita", balance="50.00")
    both = PartyFactory(tenant=tenant, name="Both", balance="10.00")
    PartyFactory(tenant=tenant, name="Nobody")
    _tag(tenant, rahul, "VIP")
    _tag(tenant, sita, "Loan")
    _tag(tenant, both, "VIP")
    _tag(tenant, both, "Loan")
    client, _ = api_as(tenant)

    one = client.get(reverse(LIST), {"role": "test_member"}).json()["data"]
    assert {row["name"] for row in one} == {"Rahul", "Both"}

    either = client.get(reverse(LIST), {"role": "test_member,test_borrower"}).json()
    assert sorted(row["name"] for row in either["data"]) == ["Both", "Rahul", "Sita"]
    # A party with two profiles is counted once in the totals too.
    assert either["meta"]["totals"]["receivable"] == "60.00"

    anded = client.get(reverse(LIST), {"role": "test_member", "balance": "owes_me"}).json()
    assert [row["name"] for row in anded["data"]] == ["Both"]


def test_a_role_of_a_disabled_or_unknown_module_is_a_400(
    tenant: Any, api_as: Any, registry: Any
) -> None:
    """T-PLT-X04-1 / BR-1 / EC-2: `other` is registered but not enabled — to this
    tenant its role does not exist, which is the same answer as a made-up code."""
    _module_on(tenant)
    client, _ = api_as(tenant)

    for value in ("other_guest", "nonsense", "test_member,other_guest"):
        response = client.get(reverse(LIST), {"role": value})
        assert response.status_code == 400, value
        body = response.json()["error"]
        assert body["code"] == "validation_error"
        assert body["details"] == {"role": ["Unknown role."]}


def test_switching_a_module_off_removes_its_roles_badges_and_filter(
    tenant: Any, api_as: Any, registry: Any
) -> None:
    """EC-2 — the profile rows stay; everything that SHOWS the role goes."""
    _module_on(tenant)
    rahul = PartyFactory(tenant=tenant, name="Rahul")
    _tag(tenant, rahul, "VIP")
    client, _ = api_as(tenant)
    assert client.get(reverse(LIST), {"role": "test_member"}).status_code == 200

    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "test"]
    tenant.save(update_fields=["enabled_modules"])

    assert client.get(reverse(ROLES)).json()["data"] == []
    assert client.get(reverse(LIST), {"role": "test_member"}).status_code == 400
    row = client.get(reverse(LIST)).json()["data"][0]
    assert "roles" not in row
    detail = client.get(reverse("v1:party-detail", args=[rahul.id])).json()["data"]
    assert "roles" not in detail
    assert PartyTag.objects.filter(party=rahul).exists()  # the "profile" stays


# ── `GET /parties/roles` ─────────────────────────────────────────────────────


def test_roles_endpoint_lists_enabled_roles_with_active_counts(
    tenant: Any, api_as: Any, registry: Any
) -> None:
    """§6 — `{code, module, label_id, count}` for enabled modules only; an archived
    party is not counted, because the chip says how many the list will show."""
    _module_on(tenant)
    rahul = PartyFactory(tenant=tenant)
    gone = PartyFactory(tenant=tenant, status=PartyStatus.ARCHIVED)
    _tag(tenant, rahul, "VIP")
    _tag(tenant, gone, "VIP")
    client, _ = api_as(tenant, role="accountant")  # parties.party.read is enough

    response = client.get(reverse(ROLES))

    assert response.status_code == 200
    assert response.json()["data"] == [
        {"code": "test_member", "module": "test", "label_id": "test.role.members", "count": 1},
        {"code": "test_borrower", "module": "test", "label_id": "test.role.borrowers", "count": 0},
    ]


def test_roles_endpoint_is_an_empty_list_without_a_role_bearing_module(
    tenant: Any, api_as: Any
) -> None:
    """The client hides the chips row on `[]` (§8) — the key is always there."""
    client, _ = api_as(tenant)
    response = client.get(reverse(ROLES))
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_another_tenants_profile_rows_never_count_or_match(
    tenant: Any, other_tenant: Any, api_as: Any, registry: Any
) -> None:
    """Tenant scoping on the role subquery is the module's `party_ids(tenant)` AND
    the party list's own scope — a profile row of another business matches nothing."""
    _module_on(tenant)
    _module_on(other_tenant)
    theirs = PartyFactory(tenant=other_tenant)
    _tag(other_tenant, theirs, "VIP")
    client, _ = api_as(tenant)

    assert client.get(reverse(LIST), {"role": "test_member"}).json()["data"] == []
    assert client.get(reverse(ROLES)).json()["data"][0]["count"] == 0


# ── Badges (T-PLT-X04-2) ─────────────────────────────────────────────────────


def test_list_rows_and_detail_carry_the_roles(tenant: Any, api_as: Any, registry: Any) -> None:
    """§6 — list rows gain `roles` (codes), the detail `roles: [{code, module, label_id}]`."""
    _module_on(tenant)
    both = PartyFactory(tenant=tenant, name="Both")
    PartyFactory(tenant=tenant, name="Plain")
    _tag(tenant, both, "VIP")
    _tag(tenant, both, "Loan")
    client, _ = api_as(tenant)

    rows = {row["name"]: row for row in client.get(reverse(LIST)).json()["data"]}
    assert sorted(rows["Both"]["roles"]) == ["test_borrower", "test_member"]
    assert rows["Plain"]["roles"] == []

    detail = client.get(reverse("v1:party-detail", args=[both.id])).json()["data"]
    assert detail["roles"] == [
        {"code": "test_member", "module": "test", "label_id": "test.role.members"},
        {"code": "test_borrower", "module": "test", "label_id": "test.role.borrowers"},
    ]


def test_a_page_of_fifty_with_three_roles_costs_one_badge_query(
    tenant: Any, api_as: Any, registry: Any
) -> None:
    """T-PLT-X04-2 — badges are ONE query for the page, however many roles and rows
    (the contract allows up to four). The list endpoint runs exactly one query more
    with roles on than with them off, at two page sizes."""
    _module_on(tenant)
    _module_on(tenant, "other")
    parties = PartyFactory.create_batch(60, tenant=tenant)
    for index, party in enumerate(parties):
        _tag(tenant, party, ("VIP", "Loan", "Guest")[index % 3])
    ids = [party.pk for party in parties[:50]]
    role_registry.enabled_roles(tenant)  # the entitlement read the module gate already did

    with CaptureQueriesContext(connection) as captured:
        badges = role_registry.roles_for(tenant, ids)
    assert len(captured.captured_queries) == 1
    assert len(badges) == 50

    client, _ = api_as(tenant)

    def count(page_size: int) -> int:
        client.get(reverse(LIST), {"page_size": page_size})  # warm
        with CaptureQueriesContext(connection) as seen:
            assert client.get(reverse(LIST), {"page_size": page_size}).status_code == 200
        return len(seen.captured_queries)

    with_roles = {size: count(size) for size in (25, 50)}
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m not in ("test", "other")]
    tenant.save(update_fields=["enabled_modules"])
    without = {size: count(size) for size in (25, 50)}
    assert with_roles == {size: without[size] + 1 for size in (25, 50)}


def test_no_role_registered_costs_no_query_at_all(tenant: Any) -> None:
    """Every tenant until the first vertical ships: the list's budget must not move."""
    role_registry._reset_for_tests()
    saved = dict(role_registry._ROLES)
    role_registry._ROLES.clear()
    try:
        party = PartyFactory(tenant=tenant)
        with CaptureQueriesContext(connection) as captured:
            assert role_registry.roles_for(tenant, [party.pk]) == {}
            assert role_registry.role_counts(tenant) == []
        assert captured.captured_queries == []
    finally:
        role_registry._ROLES.update(saved)


def test_the_csv_export_carries_a_roles_column(tenant: Any, api_as: Any, registry: Any) -> None:
    """§11 — the party list CSV gains `roles`, from one annotation (not a query per row)."""
    _module_on(tenant)
    rahul = PartyFactory(tenant=tenant, name="Rahul")
    PartyFactory(tenant=tenant, name="Plain")
    _tag(tenant, rahul, "VIP")
    client, _ = api_as(tenant)

    response = client.get(reverse(LIST), {"format": "csv"})

    assert response.status_code == 200
    lines = b"".join(response.streaming_content).decode("utf-8-sig").splitlines()
    header = lines[0].split(",")
    assert header[-1] == "roles"
    by_name = {line.split(",")[0]: line.split(",")[-1] for line in lines[1:]}
    assert by_name == {"Rahul": "test_member", "Plain": ""}


# ── The plan (T-PLT-X04-3) ───────────────────────────────────────────────────


@pytest.mark.postgres
def test_the_role_filter_can_use_the_profile_tables_unique_party_index(
    tenant: Any, api_as: Any
) -> None:
    """T-PLT-X04-3 — `id IN party_ids(tenant)` reaches the profile table through its
    unique party index. A scratch table stands in for `gym_member`: `party_id`
    UNIQUE, which every `OneToOneField("parties.Party")` profile has. Sequential
    scans are switched off for the EXPLAIN because the table is tiny — the claim
    is that the query SHAPE lets the index answer, not that the planner prefers it
    on four rows."""
    with connection.cursor() as cursor:
        cursor.execute(
            "CREATE TABLE test_profile (id bigserial PRIMARY KEY, tenant_id uuid NOT NULL,"
            " party_id uuid NOT NULL CONSTRAINT uq_test_profile_party UNIQUE)"
        )
    role_registry._reset_for_tests()
    role_registry.register_party_role(
        "test_member",
        module="test",
        label_id="test.role.members",
        party_ids=lambda t: Party.objects.filter(
            pk__in=RawSQL("SELECT party_id FROM test_profile WHERE tenant_id = %s", [t.pk])
        ).values("pk"),
    )
    try:
        _module_on(tenant)
        member = PartyFactory(tenant=tenant)
        PartyFactory.create_batch(3, tenant=tenant)
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO test_profile (tenant_id, party_id) VALUES (%s, %s)",
                [tenant.pk, member.pk],
            )
        roles = role_registry.parse_role_codes(tenant, "test_member")
        queryset = Party.objects.for_tenant(tenant).filter(
            role_registry.role_predicate(tenant, roles)
        )
        assert list(queryset.values_list("pk", flat=True)) == [member.pk]
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL enable_seqscan = off")
        plan = queryset.explain()
        assert "uq_test_profile_party" in plan, plan
    finally:
        role_registry._reset_for_tests()
