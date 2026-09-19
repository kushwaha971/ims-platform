"""The shared fixture definitions (Part 32 §32.3.4 task S0-42).

They live in a plain module rather than in a `conftest.py` so that both the
root `conftest.py` (which serves the per-app suites under `apps/`) and
`tests/conftest.py` (which serves the cross-app suites under `tests/`) can
star-import the same definitions without pytest registering one module twice.

Every test is tenant-aware (Part 26 §26.15 R15.2): there is no fixture that
produces a request with no tenant except the ones that exist to prove the
fail-closed behaviour.
"""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.common.constants import RoleCode
from apps.parties.models import Party
from tests.factories.parties import PartyFactory
from tests.factories.platform import (
    MembershipFactory,
    PartnerFactory,
    PlanFactory,
    RoleFactory,
    TenantFactory,
    UserFactory,
)


@pytest.fixture
def partner(db: Any) -> Any:
    return PartnerFactory()


@pytest.fixture
def plan(db: Any) -> Any:
    return PlanFactory()


@pytest.fixture
def tenant(db: Any, partner: Any, plan: Any) -> Any:
    return TenantFactory(partner=partner, plan=plan)


@pytest.fixture
def other_tenant(db: Any, partner: Any, plan: Any) -> Any:
    """A second tenant under the same partner — the isolation counterparty."""
    return TenantFactory(partner=partner, plan=plan)


@pytest.fixture
def system_roles(db: Any) -> dict:
    """The four system roles, seeded exactly as `seed_reference_data` writes them."""
    return {code.value: RoleFactory(tenant=None, code=code.value) for code in RoleCode}


@pytest.fixture
def user(db: Any) -> Any:
    return UserFactory()


@pytest.fixture
def membership(db: Any, user: Any, tenant: Any, system_roles: dict) -> Any:
    return MembershipFactory(user=user, tenant=tenant, role=system_roles[RoleCode.OWNER.value])


def build_access_token(membership: Any) -> str:
    """Mint an access token carrying the claims of Part 20 §20.5.1."""
    token = AccessToken.for_user(membership.user)
    token["tid"] = str(membership.tenant_id)
    token["rol"] = membership.role.code
    token["ver"] = membership.permissions_version
    token["sid"] = str(membership.id)
    return str(token)


@pytest.fixture
def api_as(db: Any, system_roles: dict) -> Any:
    """`api_as(tenant, role="staff")` → an authenticated client for that tenant.

    Returns `(client, membership)` so a test can assert against the member it is
    acting as without re-querying.
    """

    def _make(tenant: Any, role: str = RoleCode.OWNER.value, user: Any = None) -> tuple:
        member = MembershipFactory(
            user=user or UserFactory(), tenant=tenant, role=system_roles[role]
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
        return client, member

    return _make


@pytest.fixture
def anonymous_client() -> APIClient:
    return APIClient()


@pytest.fixture
def two_tenants_full(db: Any, partner: Any, plan: Any, system_roles: dict) -> dict:
    """One of every Sprint 0 entity in two tenants — the isolation fixture.

    Later sprints extend this with their own rows; the contract is that whatever
    a sprint adds, it adds to *both* tenants, so the isolation suite grows with
    the schema instead of lagging it.
    """
    result: dict = {}
    for key in ("a", "b"):
        this_tenant = TenantFactory(partner=partner, plan=plan)
        member = MembershipFactory(
            user=UserFactory(), tenant=this_tenant, role=system_roles[RoleCode.OWNER.value]
        )
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {build_access_token(member)}")
        result[key] = {
            "tenant": this_tenant,
            "membership": member,
            "user": member.user,
            "client": client,
            "party": PartyFactory(tenant=this_tenant, name=f"Party of {key}"),
        }
    return result


@pytest.fixture
def party(db: Any, tenant: Any) -> Party:
    return PartyFactory(tenant=tenant)
