"""Mobile + OTP is the sign-in, by default (owner, 9 Oct 2026; reverses DEC-010).

This module used to assert the OTP retirement: with the flag off by default,
the routes were absent. The owner has now asked for sign-up and sign-in by
mobile number and OTP only, so the flag is ON by default and these assert that
the routes exist and are reachable from the default configuration — the same
configuration every environment module inherits. `test_otp.py` proves the flow
itself.

The password endpoints still exist for the platform console and for existing
accounts until they are moved over; the checks further down prove that path
still writes no OTP challenge and sends no SMS.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.conf import settings
from django.urls import reverse

pytestmark = pytest.mark.django_db


OTP_PATHS = ("/api/v1/auth/otp/request", "/api/v1/auth/otp/verify")


def test_the_flag_is_on_by_default() -> None:
    """The decision, in one assertion. Everything below follows from it."""
    assert settings.UB_AUTH_OTP_ENABLED is True


@pytest.mark.parametrize("name", ["v1:auth-otp-request", "v1:auth-otp-verify"])
def test_the_otp_route_names_resolve(name: str) -> None:
    assert reverse(name).startswith("/api/v1/auth/otp/")


@pytest.mark.parametrize("path", OTP_PATHS)
def test_an_otp_path_answers_rather_than_404(anonymous_client: Any, path: str) -> None:
    """An empty body is a validation error from a route that exists."""
    response = anonymous_client.post(path, {}, format="json")
    assert response.status_code == 400


def test_sessions_last_ninety_days_by_default() -> None:
    """ "Stay signed in just like other mobile apps": every refresh restarts the
    clock, so this is ninety days WITHOUT opening the app, not ninety in all."""
    assert settings.UB_REFRESH_TOKEN_DAYS == 90


def test_a_resend_waits_two_minutes() -> None:
    """The owner's timer, enforced on the server; the screen only shows it."""
    from apps.platform_app.services import throttle

    assert throttle.OTP_RESEND_GAP_SECONDS == 120


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
