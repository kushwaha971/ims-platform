"""MiniMoth verifies a phone; Django retains its own account/session controls."""

from __future__ import annotations
import json
from unittest.mock import MagicMock
import pytest
from django.urls import reverse
from apps.platform_app.services import minimoth, otp


def test_api_key_stays_in_header_and_tokens_stay_out_of_response(settings, monkeypatch):
    """Server credentials must never be sent in a URL or exposed to the browser."""
    settings.MINIMOTH_API_KEY = "test-key"
    calls = []

    def request(req, timeout):
        calls.append(req)
        result = MagicMock()
        result.__enter__.return_value.read.return_value = b'{"otp_id":"request-1"}'
        return result

    monkeypatch.setattr(minimoth.urllib.request, "urlopen", request)
    assert minimoth.send_otp("+919794620535") == "request-1"
    assert calls[0].full_url == "https://api.minimoth.dev/v1/otp/send"
    assert calls[0].get_header("X-api-key") == "test-key"
    assert json.loads(calls[0].data) == {"phone": "+919794620535"}


@pytest.mark.parametrize(
    "provider_code,reason",
    [("INVALID_OTP", "incorrect"), ("OTP_NOT_FOUND", "expired"), ("VERIFY_RATE_LIMITED", "burned")],
)
def test_bad_code_is_not_a_provider_outage(monkeypatch, provider_code, reason):
    """Incorrect codes consume local attempts while outages do not."""

    def refuse(*args):
        raise minimoth.MiniMothError(provider_code, 400)

    monkeypatch.setattr(minimoth, "_call", refuse)
    assert minimoth.validate_otp("+919794620535", "123456") == minimoth.Validation(False, reason)


@pytest.mark.django_db
def test_minimoth_request_and_verify_create_our_session_and_prevent_replay(
    auth_client, settings, monkeypatch
):
    """A six-digit verified phone creates YourKhata cookies, never provider tokens."""
    settings.UB_OTP_PROVIDER = "minimoth"
    monkeypatch.setattr(minimoth, "send_otp", lambda mobile: "request-1")
    calls = []

    def validate(mobile, code):
        calls.append((mobile, code))
        return minimoth.Validation(code == "123456", "" if code == "123456" else "incorrect")

    monkeypatch.setattr(minimoth, "validate_otp", validate)
    requested = auth_client.post(
        reverse("v1:auth-otp-request"), {"mobile": "9794620535"}, format="json"
    )
    assert requested.status_code == 200
    data = requested.json()["data"]
    assert set(data) == {"challenge_id", "expires_in", "retry_after"}
    from apps.platform_app.models import OtpChallenge

    row = OtpChallenge.objects.get(pk=data["challenge_id"])
    assert row.provider_verification_id == "minimoth:request-1"
    assert row.code_hash == ""
    bad = auth_client.post(
        reverse("v1:auth-otp-verify"),
        {"challenge_id": str(row.pk), "code": "000001"},
        format="json",
    )
    assert bad.status_code == 400
    row.refresh_from_db()
    assert row.attempts == 1
    result = auth_client.post(
        reverse("v1:auth-otp-verify"),
        {"challenge_id": str(row.pk), "code": "123456"},
        format="json",
    )
    assert result.status_code == 200
    assert "ub_access" in result.cookies
    assert result.cookies["ub_access"].value == result.json()["data"]["access_token"]
    replay = auth_client.post(
        reverse("v1:auth-otp-verify"),
        {"challenge_id": str(row.pk), "code": "123456"},
        format="json",
    )
    assert replay.status_code == 400
    assert len(calls) == 2


@pytest.mark.django_db
def test_failed_send_expires_challenge_without_console_fallback(auth_client, settings, monkeypatch):
    """Misconfigured or unavailable delivery never claims that a code was sent."""
    settings.UB_OTP_PROVIDER = "minimoth"

    def fail(*args):
        raise minimoth.MiniMothError()

    monkeypatch.setattr(minimoth, "send_otp", fail)
    result = auth_client.post(
        reverse("v1:auth-otp-request"), {"mobile": "9794620535"}, format="json"
    )
    assert result.status_code == 502
    from apps.platform_app.models import OtpChallenge
    from django.utils import timezone

    assert OtpChallenge.objects.get(mobile="+919794620535").expires_at <= timezone.now()


@pytest.mark.django_db
def test_provider_rate_limit_remains_a_rate_limit(auth_client, settings, monkeypatch):
    """Do not offer immediate retry when the upstream provider has imposed a limit."""
    settings.UB_OTP_PROVIDER = "minimoth"

    def fail(*args):
        raise minimoth.MiniMothError("OTP_RATE_LIMITED", 429)

    monkeypatch.setattr(minimoth, "send_otp", fail)
    result = auth_client.post(
        reverse("v1:auth-otp-request"), {"mobile": "9794620535"}, format="json"
    )
    assert result.status_code == 429


@pytest.mark.parametrize("purpose", ["reset", "verify"])
def test_only_signin_signup_can_send_through_minimoth(settings, purpose):
    settings.UB_OTP_PROVIDER = "minimoth"
    with pytest.raises(otp.OtpNotSent):
        otp.request_otp(mobile="+919794620535", purpose=purpose)
