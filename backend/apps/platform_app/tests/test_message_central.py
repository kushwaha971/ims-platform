"""Message Central VerifyNow (DEC-014) — the service, and sign-in through it.

No test here touches the network: `message_central._call` is replaced by a
scripted exchange, and what is asserted is what this code OWNS — the URLs and
headers it builds, how it caches and refreshes the token, how it reads their
answers, and that a merchant can actually sign in with a code only Message
Central knows.
"""

from __future__ import annotations

import base64
import urllib.parse
from typing import Any

import pytest
from django.core.cache import cache
from django.urls import reverse

from apps.platform_app.services import message_central as mc

REQUEST_URL = "v1:auth-otp-request"
VERIFY_URL = "v1:auth-otp-verify"


class FakeMessageCentral:
    """Answers like their API, and records every call it was sent."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, str], dict[str, str]]] = []
        self.tokens = iter(["token-1", "token-2", "token-3"])
        self.valid_tokens = {"token-1", "token-2", "token-3"}
        self.send_response: tuple[int, dict] = (
            200,
            {
                "responseCode": 200,
                "message": "SUCCESS",
                "data": {"verificationId": "2949", "timeout": "60"},
            },
        )
        self.code = "1476"
        self.validate_override: tuple[int, dict] | None = None

    def __call__(self, method: str, url: str, headers: dict[str, str]) -> tuple[int, dict]:
        parsed = urllib.parse.urlsplit(url)
        params = dict(urllib.parse.parse_qsl(parsed.query))
        self.calls.append((method, parsed.path, params, headers))
        if parsed.path == "/auth/v1/authentication/token":
            return 200, {"status": 200, "token": next(self.tokens)}
        if headers.get("authToken") not in self.valid_tokens:
            return 401, {}
        if parsed.path == "/verification/v3/send":
            return self.send_response
        if parsed.path == "/verification/v3/validateOtp":
            if self.validate_override is not None:
                return self.validate_override
            if params["code"] == self.code:
                return 200, {
                    "responseCode": 200,
                    "data": {"verificationStatus": "VERIFICATION_COMPLETED"},
                }
            return 200, {"responseCode": 702, "message": "WRONG_OTP_PROVIDED", "data": None}
        return 404, {}

    def paths(self) -> list[str]:
        return [path for _, path, _, _ in self.calls]


@pytest.fixture
def fake(monkeypatch: Any, settings: Any) -> FakeMessageCentral:
    settings.MC_CUSTOMER_ID = "C-TEST"
    settings.MC_PASSWORD = "s3cret-pass"
    settings.MC_BASE_URL = "https://cpaas.messagecentral.com"
    settings.UB_OTP_PROVIDER = "message_central"
    cache.delete(mc.TOKEN_CACHE_KEY)
    fake = FakeMessageCentral()
    monkeypatch.setattr(mc, "_call", fake)
    yield fake
    cache.delete(mc.TOKEN_CACHE_KEY)


# ── the service ──────────────────────────────────────────────────────────────


def test_the_token_request_carries_the_customer_id_and_the_base64_password(
    fake: FakeMessageCentral,
) -> None:
    assert mc.get_auth_token() == "token-1"
    method, path, params, headers = fake.calls[0]
    assert (method, path) == ("GET", "/auth/v1/authentication/token")
    assert params == {
        "customerId": "C-TEST",
        "key": base64.b64encode(b"s3cret-pass").decode(),
        "scope": "NEW",
    }
    assert "authToken" not in headers


def test_the_token_is_cached_and_not_fetched_for_every_call(fake: FakeMessageCentral) -> None:
    mc.send_otp("+919845011122")
    mc.send_otp("+919845011123")
    assert fake.paths().count("/auth/v1/authentication/token") == 1


def test_a_401_refreshes_the_token_once_and_retries(fake: FakeMessageCentral) -> None:
    """Their token expires on their clock, not on our thirty-minute cache."""
    mc.get_auth_token()
    fake.valid_tokens = {"token-2"}  # token-1 has expired on their side
    assert mc.send_otp("+919845011122") == "2949"
    assert fake.paths() == [
        "/auth/v1/authentication/token",
        "/verification/v3/send",
        "/auth/v1/authentication/token",
        "/verification/v3/send",
    ]


def test_send_asks_for_an_sms_to_the_ten_digit_number(fake: FakeMessageCentral) -> None:
    assert mc.send_otp("+919845011122") == "2949"
    method, path, params, headers = fake.calls[-1]
    assert (method, path) == ("POST", "/verification/v3/send")
    assert params == {
        "countryCode": "91",
        "customerId": "C-TEST",
        "flowType": "SMS",
        "mobileNumber": "9845011122",
    }
    assert headers["authToken"] == "token-1"


def test_a_refused_send_raises_with_their_code(fake: FakeMessageCentral) -> None:
    fake.send_response = (200, {"responseCode": 506, "message": "REQUEST_ALREADY_EXISTS"})
    with pytest.raises(mc.MessageCentralError) as exc:
        mc.send_otp("+919845011122")
    assert exc.value.code == mc.REQUEST_ALREADY_EXISTS


def test_validate_sends_the_number_the_id_and_the_code(fake: FakeMessageCentral) -> None:
    assert mc.validate_otp("+919845011122", "2949", "1476") == mc.Validation(verified=True)
    method, path, params, _ = fake.calls[-1]
    assert (method, path) == ("GET", "/verification/v3/validateOtp")
    assert params == {
        "countryCode": "91",
        "mobileNumber": "9845011122",
        "verificationId": "2949",
        "customerId": "C-TEST",
        "code": "1476",
    }


@pytest.mark.parametrize(
    ("their_code", "reason"),
    [(702, "incorrect"), (705, "expired"), (703, "used"), (800, "burned")],
)
def test_a_wrong_or_expired_code_is_an_answer_not_an_error(
    fake: FakeMessageCentral, their_code: int, reason: str
) -> None:
    fake.validate_override = (200, {"responseCode": their_code, "data": None})
    assert mc.validate_otp("+919845011122", "2949", "0000") == mc.Validation(False, reason)


def test_without_credentials_nothing_is_called(settings: Any, monkeypatch: Any) -> None:
    settings.MC_CUSTOMER_ID = ""
    settings.MC_PASSWORD = ""
    monkeypatch.setattr(mc, "_call", lambda *a, **k: pytest.fail("the network was called"))
    with pytest.raises(mc.NotConfigured):
        mc.get_auth_token()


# ── sign-in through it ───────────────────────────────────────────────────────


@pytest.mark.django_db
def test_a_new_number_signs_in_with_the_code_message_central_sent(
    auth_client: Any, fake: FakeMessageCentral
) -> None:
    """The whole point: we never made, stored or saw the code until it was typed."""
    from apps.platform_app.models import OtpChallenge, User

    requested = auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    assert requested.status_code == 200, requested.content
    body = requested.json()["data"]
    assert set(body) == {"challenge_id", "expires_in", "retry_after"}
    assert body["retry_after"] == 60
    # Neither their id nor any credential leaves Django.
    assert "2949" not in requested.content.decode()

    challenge = OtpChallenge.objects.get(pk=body["challenge_id"])
    assert challenge.provider_verification_id == "2949"
    assert challenge.code_hash == ""

    verified = auth_client.post(
        reverse(VERIFY_URL), {"challenge_id": body["challenge_id"], "code": "1476"}, format="json"
    )
    assert verified.status_code == 200, verified.content
    assert verified.json()["data"]["user"]["is_new"] is True
    assert User.objects.filter(mobile="+919845011122").exists()


@pytest.mark.django_db
def test_a_wrong_code_counts_an_attempt_and_says_how_many_are_left(
    auth_client: Any, fake: FakeMessageCentral
) -> None:
    requested = auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    challenge_id = requested.json()["data"]["challenge_id"]
    wrong = auth_client.post(
        reverse(VERIFY_URL), {"challenge_id": challenge_id, "code": "0000"}, format="json"
    )
    assert wrong.status_code == 400
    error = wrong.json()["error"]
    assert error["code"] == "otp_invalid"
    assert error["details"] == {"reason": "incorrect", "attempts_left": 4}


@pytest.mark.django_db
def test_an_expired_code_is_reported_as_expired(auth_client: Any, fake: FakeMessageCentral) -> None:
    requested = auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    fake.validate_override = (200, {"responseCode": 705, "message": "VERIFICATION_EXPIRED"})
    late = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested.json()["data"]["challenge_id"], "code": "1476"},
        format="json",
    )
    assert late.status_code == 400
    assert late.json()["error"]["details"]["reason"] == "expired"


@pytest.mark.django_db
def test_a_code_message_central_did_not_send_is_an_error_not_a_200(
    auth_client: Any, fake: FakeMessageCentral
) -> None:
    from apps.platform_app.models import OtpChallenge

    fake.send_response = (500, {"responseCode": 500, "message": "SERVER_ERROR"})
    response = auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    assert response.status_code == 502, response.content
    assert response.json()["error"]["code"] == "provider_error"
    from django.utils import timezone

    assert OtpChallenge.objects.get(mobile="+919845011122").expires_at <= timezone.now()


@pytest.mark.django_db
def test_an_outage_while_checking_does_not_cost_the_person_an_attempt(
    auth_client: Any, fake: FakeMessageCentral
) -> None:
    from apps.platform_app.models import OtpChallenge

    requested = auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    challenge_id = requested.json()["data"]["challenge_id"]
    fake.validate_override = (500, {"responseCode": 500})
    down = auth_client.post(
        reverse(VERIFY_URL), {"challenge_id": challenge_id, "code": "1476"}, format="json"
    )
    assert down.status_code == 502
    assert OtpChallenge.objects.get(pk=challenge_id).attempts == 0

    fake.validate_override = None
    again = auth_client.post(
        reverse(VERIFY_URL), {"challenge_id": challenge_id, "code": "1476"}, format="json"
    )
    assert again.status_code == 200


@pytest.mark.django_db
def test_a_resend_inside_sixty_seconds_never_reaches_message_central(
    auth_client: Any, fake: FakeMessageCentral
) -> None:
    auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    second = auth_client.post(reverse(REQUEST_URL), {"mobile": "9845011122"}, format="json")
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "otp_throttled"
    assert fake.paths().count("/verification/v3/send") == 1


def test_the_deploy_check_wants_credentials_in_production(settings: Any) -> None:
    from apps.platform_app.apps import check_console_sms_backend

    settings.DEBUG = False
    settings.UB_AUTH_OTP_ENABLED = True
    settings.UB_ALLOW_CONSOLE_SMS = False
    settings.UB_OTP_PROVIDER = "console"
    assert [error.id for error in check_console_sms_backend()] == ["platform.E001"]
    settings.UB_OTP_PROVIDER = "message_central"
    assert check_console_sms_backend() == []


def test_dashboard_token_works_without_account_password(settings, monkeypatch):
    """Use the provider-issued API token without retaining the console password."""
    settings.MC_CUSTOMER_ID = "C-TEST"
    settings.MC_PASSWORD = ""
    settings.MC_AUTH_TOKEN = "dashboard-token"

    def unexpected(*args, **kwargs):
        raise AssertionError("Static API token must not trigger password authentication")

    monkeypatch.setattr(mc, "_call", unexpected)
    assert mc.is_configured()
    assert mc.get_auth_token() == "dashboard-token"
    assert mc.get_auth_token(force=True) == "dashboard-token"
