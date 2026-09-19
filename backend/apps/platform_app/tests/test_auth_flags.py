"""The OTP retirement, asserted from the default configuration (DEC-010).

`test_otp.py` proves the OTP flow still works when it is switched on. This
module proves the other half, which is the half the decision is actually about:
with `UB_AUTH_OTP_ENABLED=0` — the default, and the setting every environment
module inherits — the endpoints are **absent**, not merely refusing, and nothing
on the default path reaches the OTP service, the SMS adapters or the challenge
table.

"Absent" is the word that matters. A 403 or a 501 would still be a surface an
attacker could probe and a client could accidentally depend on; a route that is
not in the URL map is neither.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.conf import settings
from django.urls import NoReverseMatch, reverse

pytestmark = pytest.mark.django_db


OTP_PATHS = ("/api/v1/auth/otp/request", "/api/v1/auth/otp/verify")


def test_the_flag_is_off_by_default() -> None:
    """The decision, in one assertion. Everything below follows from it."""
    assert settings.UB_AUTH_OTP_ENABLED is False


@pytest.mark.parametrize("name", ["v1:auth-otp-request", "v1:auth-otp-verify"])
def test_the_otp_route_names_do_not_resolve(name: str) -> None:
    with pytest.raises(NoReverseMatch):
        reverse(name)


@pytest.mark.parametrize("path", OTP_PATHS)
def test_posting_to_an_otp_path_is_a_404(anonymous_client: Any, path: str) -> None:
    """Not 401, not 403, not 405 — the route does not exist."""
    response = anonymous_client.post(path, {"mobile": "9876543210"}, format="json")
    assert response.status_code == 404


@pytest.mark.parametrize("path", OTP_PATHS)
def test_an_authenticated_caller_gets_the_same_404(api_as: Any, tenant: Any, path: str) -> None:
    client, _member = api_as(tenant)
    assert client.post(path, {"mobile": "9876543210"}, format="json").status_code == 404


def test_no_otp_route_is_registered_anywhere_in_the_url_map() -> None:
    """A stronger statement than "these two paths 404": nothing OTP is routed."""
    from django.urls import URLPattern, URLResolver, get_resolver

    names: set[str] = set()

    def walk(patterns: Any) -> None:
        for entry in patterns:
            if isinstance(entry, URLResolver):
                walk(entry.url_patterns)
            elif isinstance(entry, URLPattern) and entry.name:
                names.add(entry.name)

    walk(get_resolver().url_patterns)
    assert not [name for name in names if "otp" in name]


def test_the_default_sign_in_path_writes_no_otp_challenge(auth_client: Any) -> None:
    """Registration and login must not touch the retired table at all."""
    from apps.platform_app.models import OtpChallenge
    from tests.fixtures import login_via_password, register_via_api

    register_via_api(auth_client, "flagged@example.com")
    login_via_password(auth_client, "flagged@example.com")
    assert OtpChallenge.objects.count() == 0


def test_the_default_path_sends_no_sms(auth_client: Any) -> None:
    """The console SMS backend is configured and must stay unused."""
    from apps.notifications.models import MessageLog
    from tests.fixtures import register_via_api

    register_via_api(auth_client, "no-sms@example.com")
    auth_client.post(
        reverse("v1:auth-password-reset-request"), {"email": "no-sms@example.com"}, format="json"
    )
    assert not MessageLog.objects.filter(channel="sms").exists()
    assert MessageLog.objects.filter(channel="email").count() == 1


# ── `check --deploy` (PLT-01 EC-6, amended by DEC-010) ───────────────────────


def test_the_console_sms_gate_does_not_fire_while_otp_is_off(settings: Any) -> None:
    """There is nothing to deliver, so there is nothing to warn about."""
    from apps.platform_app.apps import check_console_sms_backend

    settings.DEBUG = False
    settings.UB_AUTH_OTP_ENABLED = False
    settings.UB_SMS_BACKEND = "apps.common.integrations.sms.console.ConsoleSmsBackend"
    settings.UB_ALLOW_CONSOLE_SMS = False
    assert check_console_sms_backend() == []


def test_the_console_sms_gate_still_fires_when_otp_is_switched_back_on(settings: Any) -> None:
    """The check was not deleted; it was made conditional on there being an OTP."""
    from apps.platform_app.apps import check_console_sms_backend

    settings.DEBUG = False
    settings.UB_AUTH_OTP_ENABLED = True
    settings.UB_SMS_BACKEND = "apps.common.integrations.sms.console.ConsoleSmsBackend"
    settings.UB_ALLOW_CONSOLE_SMS = False
    errors = check_console_sms_backend()
    assert [error.id for error in errors] == ["platform.E001"]

    settings.UB_ALLOW_CONSOLE_SMS = True
    assert check_console_sms_backend() == []
