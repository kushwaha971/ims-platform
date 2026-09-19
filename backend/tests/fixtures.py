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
    DEFAULT_OTP_CODE,
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
    """Mint an access token carrying the claims of Part 20 §20.5.1.

    Sprint 1 added `epo` (`platform_user.token_epoch`), which the authentication
    class now requires: a token with no epoch claim is refused, because an
    absent claim must never be read as a passing one (Part 21 §21.3.1).
    """
    token = AccessToken.for_user(membership.user)
    token["tid"] = str(membership.tenant_id)
    token["rol"] = membership.role.code
    token["ver"] = membership.permissions_version
    token["sid"] = str(membership.id)
    token["epo"] = int(membership.user.token_epoch)
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


# ── Sprint 1 fixtures (PLT-01 … PLT-15) ──────────────────────────────────────


@pytest.fixture
def seeded_reference(db: Any) -> None:
    """The four system roles, the GST slabs and the UQC units."""
    from django.core.management import call_command

    call_command("seed_reference_data")


@pytest.fixture
def seeded_plans(db: Any) -> Any:
    """`free`, `unlimited` and the `metis` partner (PLT-15 FR-1)."""
    from django.core.management import call_command

    from apps.platform_app.models import Partner

    call_command("seed_plans")
    return Partner.objects.get(code="metis")


@pytest.fixture
def onboarding_ready(db: Any, seeded_reference: Any, seeded_plans: Any) -> Any:
    """Everything `POST /tenants` needs to exist before it is called."""
    return seeded_plans


@pytest.fixture
def auth_client() -> Any:
    """An unauthenticated client that declares itself an API client.

    `X-Client: api` is what PLT-01 FR-4 makes the switch for tokens in the body
    rather than only in cookies, so the test can read the access token.
    """
    client = APIClient()
    client.credentials(HTTP_X_CLIENT="api")
    return client


@pytest.fixture
def passwordless_user(db: Any) -> Any:
    """A user with `password_hash NULL` — the account that has never set one.

    `UserFactory` always sets a password, because most tests want one; PLT-02
    FR-3 and Part 27 §27.4.2's "Passwords are optional" need the other case.
    Since DEC-010 registration always sets a password, so this is the shape of
    an account created before it or through the retired OTP flow.
    """
    from apps.platform_app.models import User

    return User.objects.create_user(
        email="no-password@example.com",
        password=None,
        mobile="+919700000001",
        full_name="No Password",
    )


def register_via_api(client: Any, email: str, password: str = "Kirana1234", **extra: Any) -> dict:
    """Run the real one-call sign-up and return the response body's `data`."""
    from django.urls import reverse

    body = {"email": email, "password": password, **extra}
    response = client.post(reverse("v1:auth-register"), body, format="json")
    assert response.status_code == 201, response.content
    return response.json()["data"]


def login_via_password(client: Any, email: str, password: str = "Kirana1234") -> dict:
    """Run the real sign-in and return the response body's `data`."""
    from django.urls import reverse

    response = client.post(
        reverse("v1:auth-login"), {"email": email, "password": password}, format="json"
    )
    assert response.status_code == 200, response.content
    return response.json()["data"]


def reset_token_for(email: str) -> str:
    """The raw token of the live reset link for `email`.

    The token never leaves the server — that is the point of it — so a test that
    wants to click the link has to mint one the same way the service does. This
    helper does exactly that rather than reaching into the hash, which cannot be
    reversed.
    """
    import datetime as dt
    import secrets

    from django.utils import timezone

    from apps.platform_app.models import AuthToken, AuthTokenPurpose, User
    from apps.platform_app.services.passwords import hash_reset_token

    raw = secrets.token_urlsafe(32)
    AuthToken.objects.create(
        user=User.objects.get(email=email),
        purpose=AuthTokenPurpose.PASSWORD_RESET,
        token_hash=hash_reset_token(raw),
        expires_at=timezone.now() + dt.timedelta(seconds=900),
    )
    return raw


def reload_url_conf() -> None:
    """Rebuild the URL map after `UB_AUTH_OTP_ENABLED` changes (DEC-010).

    The OTP routes are registered at import time of `urls_auth`, which is what
    makes them genuinely absent rather than merely refusing. A test that flips
    the flag therefore has to re-import that module and drop Django's resolver
    caches; `override_settings` alone changes nothing, because the URL map was
    built before it ran.
    """
    import importlib

    from django.urls import clear_url_caches

    import config.urls
    from apps.platform_app import urls_auth

    importlib.reload(urls_auth)
    importlib.reload(config.urls)
    clear_url_caches()


# ── The retired OTP flow (reachable only with `UB_AUTH_OTP_ENABLED=1`) ───────


@pytest.fixture
def fixed_otp(monkeypatch: Any) -> str:
    """Pin the generated OTP so a test can type it.

    The generator itself is asserted by `test_generate_code_*`; every flow test
    would otherwise have to read a hash it cannot reverse.
    """
    monkeypatch.setattr("apps.platform_app.services.otp.generate_code", lambda: DEFAULT_OTP_CODE)
    return DEFAULT_OTP_CODE


def login_via_otp(
    client: Any, mobile: str, *, purpose: str = "login", code: str = DEFAULT_OTP_CODE
) -> dict:
    """Run the real two-call OTP flow and return the verify body's `data`."""
    from django.urls import reverse

    requested = client.post(
        reverse("v1:auth-otp-request"), {"mobile": mobile, "purpose": purpose}, format="json"
    )
    assert requested.status_code == 200, requested.content
    challenge_id = requested.json()["data"]["challenge_id"]
    verified = client.post(
        reverse("v1:auth-otp-verify"),
        {"challenge_id": challenge_id, "code": code, "device_label": "Test device"},
        format="json",
    )
    assert verified.status_code == 200, verified.content
    return verified.json()["data"]
