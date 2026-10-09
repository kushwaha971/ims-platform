"""The Fast2SMS adapter (owner, 9 Oct 2026) — no network, `urlopen` replaced.

What each test prevents is in its docstring; the shape they share is that a
provider answer of any kind becomes an `SmsResult` and never an exception,
because `messaging.send_sms` must never 500 the sign-in screen.
"""

from __future__ import annotations

import io
import json
import urllib.error
from typing import Any

import pytest

from apps.common.integrations.sms import fast2sms
from apps.common.integrations.sms.fast2sms import Fast2SmsBackend

OTP_BODY = "482913 is your YourKhata code. Valid 10 min. Do not share."


class _Answer(io.BytesIO):
    def __enter__(self) -> _Answer:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


@pytest.fixture
def sent(monkeypatch: Any, settings: Any) -> list[dict]:
    """Every request the adapter makes, answered with Fast2SMS's success body."""
    settings.UB_FAST2SMS_API_KEY = "test-key"
    settings.UB_FAST2SMS_ALLOW_QUICK = False
    calls: list[dict] = []

    def fake_urlopen(request: Any, timeout: int) -> _Answer:
        calls.append(
            {
                "url": request.full_url,
                "headers": dict(request.header_items()),
                "body": json.loads(request.data.decode()),
                "timeout": timeout,
            }
        )
        return _Answer(json.dumps({"return": True, "request_id": "f2s-1"}).encode())

    monkeypatch.setattr(fast2sms.urllib.request, "urlopen", fake_urlopen)
    return calls


def test_the_otp_goes_by_the_otp_route_with_only_the_digits(sent: list[dict]) -> None:
    """Fast2SMS's `otp` route takes the code alone and writes its own text; a
    body sent there would be ignored, and a code not extracted would send the
    merchant "Your OTP is" followed by nothing."""
    result = Fast2SmsBackend().send(
        to="+919876543210", body=OTP_BODY, sender_id="UDHAAR", template_id="otp"
    )
    assert result.status == "sent" and result.provider_message_id == "f2s-1"
    [call] = sent
    assert call["url"] == "https://www.fast2sms.com/dev/bulkV2"
    assert call["body"] == {"route": "otp", "variables_values": "482913", "numbers": "9876543210"}
    # urllib title-cases header names; Fast2SMS reads the key from `authorization`.
    assert call["headers"]["Authorization"] == "test-key"
    assert call["timeout"] == fast2sms.TIMEOUT_SECONDS


def test_a_reminder_is_not_sent_unless_quick_sms_is_allowed(sent: list[dict], settings: Any) -> None:
    """Setting the key for sign-in must not quietly start billing for reminders
    over the quick route, which costs per message and needs DLT in India."""
    result = Fast2SmsBackend().send(
        to="+919876543210", body="Ramesh, ₹500 is due.", sender_id="UDHAAR", template_id="reminder"
    )
    assert result.status == "skipped" and sent == []

    settings.UB_FAST2SMS_ALLOW_QUICK = True
    result = Fast2SmsBackend().send(
        to="+919876543210", body="Ramesh, ₹500 is due.", sender_id="UDHAAR", template_id="reminder"
    )
    assert result.status == "sent"
    assert sent[0]["body"]["route"] == "q"


def test_a_foreign_number_fails_with_a_reason_and_calls_nobody(sent: list[dict]) -> None:
    """Fast2SMS is India-only; a UK number would be a provider error at best."""
    result = Fast2SmsBackend().send(
        to="+447911123456", body=OTP_BODY, sender_id="UDHAAR", template_id="otp"
    )
    assert result.status == "failed" and "Indian" in (result.error or "")
    assert sent == []


def test_no_key_is_skipped_not_an_error(settings: Any, sent: list[dict]) -> None:
    settings.UB_FAST2SMS_API_KEY = ""
    result = Fast2SmsBackend().send(
        to="+919876543210", body=OTP_BODY, sender_id="UDHAAR", template_id="otp"
    )
    assert result.status == "skipped" and sent == []


def test_a_refusal_is_a_failed_result_carrying_fast2smss_reason(
    monkeypatch: Any, settings: Any
) -> None:
    """A wrong key answers 412 with a JSON reason; that reason is what the
    message log should show the operator, not "HTTP Error 412"."""
    settings.UB_FAST2SMS_API_KEY = "wrong"

    def refuse(request: Any, timeout: int) -> Any:
        body = json.dumps(
            {"return": False, "status_code": 412, "message": "Invalid Authentication"}
        ).encode()
        raise urllib.error.HTTPError(request.full_url, 412, "Precondition", {}, io.BytesIO(body))

    monkeypatch.setattr(fast2sms.urllib.request, "urlopen", refuse)
    result = Fast2SmsBackend().send(
        to="+919876543210", body=OTP_BODY, sender_id="UDHAAR", template_id="otp"
    )
    assert result.status == "failed"
    assert result.error == "412: Invalid Authentication"


def test_an_unreachable_provider_is_a_failed_result(monkeypatch: Any, settings: Any) -> None:
    settings.UB_FAST2SMS_API_KEY = "test-key"

    def offline(request: Any, timeout: int) -> Any:
        raise urllib.error.URLError("no route to host")

    monkeypatch.setattr(fast2sms.urllib.request, "urlopen", offline)
    result = Fast2SmsBackend().send(
        to="+919876543210", body=OTP_BODY, sender_id="UDHAAR", template_id="otp"
    )
    assert result.status == "failed" and "unreachable" in (result.error or "")


def test_the_key_chooses_the_backend() -> None:
    """With a key Fast2SMS sends; without one the code goes to the log, which is
    how a local run works without paying for a message. An EMPTY
    `UB_SMS_BACKEND` (what docker-compose passes) follows the key too."""
    import importlib
    import os

    from config.settings import base

    saved = {k: os.environ.get(k) for k in ("UB_FAST2SMS_API_KEY", "UB_SMS_BACKEND")}
    try:
        os.environ["UB_SMS_BACKEND"] = ""
        os.environ["UB_FAST2SMS_API_KEY"] = "k"
        assert importlib.reload(base).UB_SMS_BACKEND.endswith("Fast2SmsBackend")
        os.environ["UB_FAST2SMS_API_KEY"] = ""
        assert importlib.reload(base).UB_SMS_BACKEND.endswith("ConsoleSmsBackend")
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        importlib.reload(base)
