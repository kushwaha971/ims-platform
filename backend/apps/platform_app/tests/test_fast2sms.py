"""Fast2SMS must send only auth codes, fail closed, and retain one-use verification."""

from __future__ import annotations

import json
import urllib.parse
from unittest.mock import MagicMock

import pytest
from django.urls import reverse

from apps.platform_app.services import fast2sms, otp


def response(body, status=200):
    result = MagicMock()
    result.__enter__.return_value.status = status
    result.__enter__.return_value.read.return_value = json.dumps(body).encode()
    return result


def test_posts_one_numeric_code_without_putting_secrets_in_url(settings, monkeypatch):
    """An arbitrary message or a batch must never reach the paid OTP route."""
    settings.FAST2SMS_API_KEY = "test-key"
    calls = []

    def send(request, timeout):
        calls.append(request)
        assert timeout == 10
        return response({"return": True, "request_id": "delivery-1"})

    monkeypatch.setattr(fast2sms.urllib.request, "urlopen", send)
    assert fast2sms.send_otp("+919794620535", "1234") == "delivery-1"
    request = calls[0]
    assert request.full_url == "https://www.fast2sms.com/dev/bulkV2"
    assert request.get_header("Authorization") == "test-key"
    assert urllib.parse.parse_qs(request.data.decode()) == {
        "route": ["otp"],
        "variables_values": ["1234"],
        "numbers": ["9794620535"],
        "flash": ["0"],
    }
    for mobile, code in [
        ("+919794620535,+919794620536", "1234"),
        ("+14155552671", "1234"),
        ("+919794620535", "send promotions"),
    ]:
        with pytest.raises(fast2sms.Fast2SmsError):
            fast2sms.send_otp(mobile, code)
    assert len(calls) == 1


@pytest.mark.parametrize("body", [{"return": False}, {}, [], {"return": "true"}])
def test_provider_refusal_never_looks_like_delivery(settings, monkeypatch, body):
    """HTTP 200 alone is not proof the SMS provider accepted the code."""
    settings.FAST2SMS_API_KEY = "test-key"
    monkeypatch.setattr(fast2sms.urllib.request, "urlopen", lambda *a, **kw: response(body))
    with pytest.raises(fast2sms.Fast2SmsError):
        fast2sms.send_otp("+919794620535", "1234")


def test_missing_key_does_not_fall_back_to_console(settings):
    """Production must never claim a text was sent when credentials are missing."""
    settings.UB_OTP_PROVIDER = "fast2sms"
    settings.FAST2SMS_API_KEY = ""
    assert otp._provider() == "fast2sms"
    with pytest.raises(fast2sms.Fast2SmsError):
        fast2sms.send_otp("+919794620535", "1234")


@pytest.mark.django_db
@pytest.mark.parametrize("purpose", ["login", "signup"])
def test_auth_code_is_hashed_verified_once_and_throttled(
    auth_client, settings, monkeypatch, purpose
):
    """Delivery, replay protection and the resend gap work together on the real API."""
    settings.UB_OTP_PROVIDER = "fast2sms"
    calls = []
    monkeypatch.setattr(fast2sms, "send_otp", lambda mobile, code: calls.append((mobile, code)))
    requested = auth_client.post(
        reverse("v1:auth-otp-request"), {"mobile": "9794620535", "purpose": purpose}, format="json"
    )
    assert requested.status_code == 200
    data = requested.json()["data"]
    assert "code" not in data
    assert len(calls) == 1
    from apps.platform_app.models import OtpChallenge

    row = OtpChallenge.objects.get(pk=data["challenge_id"])
    assert row.code_hash == otp.hash_code(calls[0][1])
    assert not row.provider_verification_id
    resent = auth_client.post(
        reverse("v1:auth-otp-request"), {"mobile": "9794620535", "purpose": purpose}, format="json"
    )
    assert resent.status_code == 429
    assert len(calls) == 1
    otp.consume_challenge(challenge_id=row.pk, code=calls[0][1])
    with pytest.raises(otp.OtpInvalid):
        otp.consume_challenge(challenge_id=row.pk, code=calls[0][1])


@pytest.mark.django_db
def test_failed_delivery_expires_challenge_and_returns_error(auth_client, settings, monkeypatch):
    """A failed send must not leave the customer waiting for an undelivered code."""
    settings.UB_OTP_PROVIDER = "fast2sms"

    def refused(*args):
        raise fast2sms.Fast2SmsError("Refused")

    monkeypatch.setattr(fast2sms, "send_otp", refused)
    result = auth_client.post(
        reverse("v1:auth-otp-request"), {"mobile": "9794620535"}, format="json"
    )
    assert result.status_code == 502
    from django.utils import timezone

    from apps.platform_app.models import OtpChallenge

    assert OtpChallenge.objects.get(mobile="+919794620535").expires_at <= timezone.now()


@pytest.mark.parametrize("purpose", ["verify", "reset"])
@pytest.mark.parametrize("provider", ["fast2sms", "message_central"])
def test_fast2sms_cannot_be_used_outside_signin_signup(settings, purpose, provider):
    """Only the owner's requested authentication purposes may trigger a paid SMS."""
    settings.UB_OTP_PROVIDER = provider
    settings.MC_CUSTOMER_ID = "C-TEST"
    settings.MC_AUTH_TOKEN = "test-token"
    with pytest.raises(otp.OtpNotSent):
        otp.request_otp(mobile="+919794620535", purpose=purpose)
