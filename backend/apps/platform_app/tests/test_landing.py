"""docs/platform/14 §4.1 — where a session goes next is decided by the server, once.

Each test is a row of §8's validation matrix that concerns signing in. The two
cases the owner reported are here, reproduced against the live stack before
this existed: the owner of a business made by a script (step 0), sent to the
wizard on every sign-in; and a staff member whose own half-made shop was their
default, sent into its wizard instead of the business they work at.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.platform_app.constants import MembershipStatus
from apps.platform_app.models import Membership
from apps.platform_app.tokens import CSRF_COOKIE
from tests.factories.platform import MembershipFactory, RoleFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db
PASSWORD = "Kirana-1234-x"


def _owner() -> Any:
    return RoleFactory(code="owner", name="Owner")


def _staff() -> Any:
    return RoleFactory(code="staff", name="Staff")


def _sign_in(user: Any) -> dict:
    got = APIClient().post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert got.status_code == 200, got.content
    return got.json()["data"]


def _signed_in_client(user: Any) -> APIClient:
    """A browser: cookie session, and the CSRF header every cookie write needs."""
    client = APIClient()
    got = client.post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    )
    assert got.status_code == 200, got.content
    client.credentials(HTTP_X_CSRF_TOKEN=got.cookies[CSRF_COOKIE].value)
    return client


def _user(**kw: Any) -> Any:
    return UserFactory(password=PASSWORD, **kw)


def test_a_business_made_outside_the_wizard_is_never_unfinished() -> None:
    """R2 — step 0 is "not made by the wizard". Its owner opens the business."""
    user = _user()
    tenant = TenantFactory(onboarding_step=0)
    MembershipFactory(user=user, tenant=tenant, role=_owner())
    data = _sign_in(user)
    assert data["landing"] == {"kind": "app", "tenant_id": str(tenant.id)}


def test_an_owner_who_stopped_the_wizard_resumes_it_at_the_next_step() -> None:
    user = _user()
    tenant = TenantFactory(onboarding_step=2)
    MembershipFactory(user=user, tenant=tenant, role=_owner())
    landing = _sign_in(user)["landing"]
    assert landing == {"kind": "business_setup", "tenant_id": str(tenant.id), "step": 3}


def test_staff_of_an_unfinished_business_go_to_the_app_not_a_wizard_they_cannot_finish() -> None:
    user = _user()
    tenant = TenantFactory(onboarding_step=1)
    MembershipFactory(user=user, tenant=tenant, role=_staff())
    assert _sign_in(user)["landing"]["kind"] == "app"


def test_someone_who_works_here_is_not_sent_into_their_own_half_made_side_business() -> None:
    """R3, as reported: staff at Verma Finance, owner of a side business they
    abandoned at step 1 — which, being their oldest membership, was the default."""
    user = _user()
    side = TenantFactory(name="Asha half-made shop", onboarding_step=1)
    work = TenantFactory(name="Verma Finance", onboarding_step=4)
    MembershipFactory(user=user, tenant=side, role=_owner(), is_default=True)
    MembershipFactory(user=user, tenant=work, role=_staff(), is_default=False)
    data = _sign_in(user)
    assert data["active_tenant_id"] == str(work.id)
    assert data["landing"] == {"kind": "app", "tenant_id": str(work.id)}


def test_a_sign_in_opens_the_business_last_used_on_any_device() -> None:
    """Owner of a side business AND staff somewhere: whichever they used last."""
    user = _user()
    own = TenantFactory(onboarding_step=4)
    work = TenantFactory(onboarding_step=4)
    MembershipFactory(user=user, tenant=own, role=_owner(), is_default=True)
    MembershipFactory(user=user, tenant=work, role=_staff(), is_default=False)
    first = _signed_in_client(user)
    switched = first.post(
        reverse("v1:auth-switch-tenant"), {"tenant_id": str(work.id)}, format="json"
    )
    assert switched.status_code == 200, switched.content
    # Another device, later: it opens where they left off, not the default.
    assert _sign_in(user)["active_tenant_id"] == str(work.id)


def test_choosing_a_default_is_what_the_next_sign_in_opens() -> None:
    user = _user()
    a = TenantFactory(onboarding_step=4)
    b = TenantFactory(onboarding_step=4)
    ma = MembershipFactory(user=user, tenant=a, role=_owner(), is_default=True)
    mb = MembershipFactory(user=user, tenant=b, role=_staff(), is_default=False)
    Membership.objects.filter(pk=ma.pk).update(last_used_at=timezone.now())
    client = _signed_in_client(user)
    made = client.patch(
        reverse("v1:membership-detail", args=[mb.id]), {"is_default": True}, format="json"
    )
    assert made.status_code == 200, made.content
    assert _sign_in(user)["active_tenant_id"] == str(b.id)


def test_several_businesses_never_used_and_no_default_ask_which() -> None:
    user = _user()
    for _ in range(2):
        MembershipFactory(user=user, tenant=TenantFactory(onboarding_step=4), role=_staff(),
                          is_default=False)  # fmt: skip
    data = _sign_in(user)
    assert data["active_tenant_id"] is None
    assert data["landing"] == {"kind": "choose_business"}


def test_only_an_invitation_goes_to_the_chooser_that_lists_it() -> None:
    user = _user()
    MembershipFactory(user=user, role=_staff(), status=MembershipStatus.INVITED, is_default=False)
    assert _sign_in(user)["landing"] == {"kind": "invitation"}


def test_nobody_anywhere_creates_a_business() -> None:
    assert _sign_in(_user())["landing"] == {"kind": "no_business"}


def test_an_operator_with_no_business_goes_to_the_console() -> None:
    assert _sign_in(_user(is_super_admin=True))["landing"] == {"kind": "admin"}


def test_a_temporary_password_comes_before_everything() -> None:
    user = _user()
    MembershipFactory(user=user, tenant=TenantFactory(onboarding_step=4), role=_staff())
    user.must_change_password = True
    user.password_expires_at = timezone.now() + dt.timedelta(days=1)
    user.save(update_fields=["must_change_password", "password_expires_at"])
    assert _sign_in(user)["landing"] == {"kind": "set_password"}


def test_me_and_refresh_say_the_same_as_the_sign_in() -> None:
    """Refresh and a deep link read `/auth/me`; it must not disagree with login."""
    user = _user()
    tenant = TenantFactory(onboarding_step=0)
    MembershipFactory(user=user, tenant=tenant, role=_owner())
    client = APIClient()
    signed = client.post(
        reverse("v1:auth-login"), {"email": user.email, "password": PASSWORD}, format="json"
    ).json()["data"]["landing"]
    assert client.get(reverse("v1:auth-me")).json()["data"]["landing"] == signed
