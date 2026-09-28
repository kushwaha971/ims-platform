"""Password hashing never runs inside `transaction.atomic()` (Sprint 12 hardening).

QA saw register and team-member creation answer 500 under CPU load with
`IdleInTransactionSessionTimeout`: PBKDF2 (a million iterations at Django 5.2's
default) ran inside the service's transaction, the connection sat idle while
the starved CPU hashed, and PostgreSQL's 30 s `idle_in_transaction_session_timeout`
killed it. `create_member` also held the TENANT row lock for the whole hash.

Each test here records the depth of Django's atomic-block stack at the moment the
hasher's `encode` is called and asserts it is the test's own baseline — i.e. no
service- or view-level `atomic()` is open around the hash. The suite runs inside a
per-test transaction, so the baseline is measured rather than assumed to be 0.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.contrib.auth.hashers import get_hasher
from django.db import connection
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.constants import RoleCode
from apps.platform_app.services import credentials
from tests.fixtures import login_via_password, register_via_api, reset_token_for


pytestmark = pytest.mark.django_db


@pytest.fixture
def encode_depths(monkeypatch: Any) -> list[int]:
    """Every `encode` call's atomic depth, relative to the test's own baseline."""
    hasher = get_hasher("default")
    original = type(hasher).encode
    baseline = len(connection.atomic_blocks)
    depths: list[int] = []

    def spy(self: Any, password: str, salt: str, *args: Any, **kwargs: Any) -> str:
        depths.append(len(connection.atomic_blocks) - baseline)
        return original(self, password, salt, *args, **kwargs)

    monkeypatch.setattr(type(hasher), "encode", spy)
    return depths


def _ctx(user: Any, tenant: Any) -> Ctx:
    return Ctx(tenant=tenant, actor=user, actor_type="user", request_id="t", ip=None)


def test_register_hashes_before_its_transaction(auth_client: Any, encode_depths: list) -> None:
    """The sign-up that 500'd under load: its one hash runs with no atomic open."""
    register_via_api(auth_client, "new-shop@example.com")
    assert encode_depths, "the spy never saw a hash — the test is not measuring anything"
    assert set(encode_depths) == {0}, encode_depths


def test_create_member_hashes_before_taking_the_tenant_lock(
    tenant: Any, user: Any, system_roles: dict, encode_depths: list
) -> None:
    """The temporary password is hashed before `lock_tenant_for_write`, not under it."""
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="counter@shop.test",
        full_name="Counter Staff",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    assert issued.user.check_password(issued.password)  # the pre-computed hash is the real one
    assert 0 in encode_depths
    # `check_password` above re-encodes to compare; only the MINT is under test,
    # and it is the first call.
    assert encode_depths[0] == 0, encode_depths


def test_regenerate_hashes_before_its_transaction(
    tenant: Any, user: Any, system_roles: dict, encode_depths: list
) -> None:
    issued = credentials.create_member(
        tenant=tenant,
        role=system_roles[RoleCode.STAFF.value],
        email="again@shop.test",
        full_name="Again",
        actor=user,
        ctx=_ctx(user, tenant),
    )
    encode_depths.clear()
    again = credentials.regenerate(membership=issued.membership, actor=user, ctx=_ctx(user, tenant))
    assert encode_depths and encode_depths[0] == 0, encode_depths
    again.user.refresh_from_db()
    assert again.user.check_password(again.password)


def test_set_password_hashes_before_its_transaction(
    api_as: Any, tenant: Any, user: Any, encode_depths: list
) -> None:
    user.set_password("Kirana1234")
    user.save(update_fields=["password"])
    client, _member = api_as(tenant, user=user)
    encode_depths.clear()
    response = client.post(
        reverse("v1:auth-password-set"),
        {"current_password": "Kirana1234", "new_password": "Almirah9876"},
        format="json",
    )
    assert response.status_code == 200, response.content
    # One encode to CHECK the current password (outside any atomic by
    # construction) and one to hash the new one — both at depth 0.
    assert encode_depths and set(encode_depths) == {0}, encode_depths


def test_reset_confirm_hashes_before_spending_the_link(
    auth_client: Any, anonymous_client: Any, encode_depths: list
) -> None:
    """The confirm view's own `atomic()` holds the link's row lock; the hash is not inside it."""
    register_via_api(auth_client, "forgot@example.com")
    token = reset_token_for("forgot@example.com")
    encode_depths.clear()
    response = anonymous_client.post(
        reverse("v1:auth-password-reset-confirm"),
        {"token": token, "new_password": "Almirah9876"},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert encode_depths and set(encode_depths) == {0}, encode_depths
    login_via_password(anonymous_client, "forgot@example.com", "Almirah9876")


def test_a_refused_reset_password_leaves_the_link_unspent(
    auth_client: Any, anonymous_client: Any
) -> None:
    """FR-5 still holds after the reorder: a bad password costs nothing, the link still works."""
    register_via_api(auth_client, "retry@example.com")
    token = reset_token_for("retry@example.com")
    url = reverse("v1:auth-password-reset-confirm")
    refused = anonymous_client.post(url, {"token": token, "new_password": "short"}, format="json")
    assert refused.status_code == 400
    ok = anonymous_client.post(url, {"token": token, "new_password": "Almirah9876"}, format="json")
    assert ok.status_code == 200, ok.content
    spent = anonymous_client.post(url, {"token": token, "new_password": "Other98765"}, format="json")
    assert spent.status_code == 400
