"""`PLT-01` — mobile OTP sign-up and login. **Retired, not deleted (DEC-010).**

Identity at MVP is email plus password, and the OTP flow sits behind
`UB_AUTH_OTP_ENABLED`, which is off: the routes are not registered, so they 404.
None of that makes the flow wrong, and none of these 37 assertions has been
weakened — they are what makes turning the flag back on a configuration change
rather than an archaeology exercise.

The module therefore forces the flag **on** and rebuilds the URL map, which is
the honest way to test code that is genuinely absent by default. The counterpart
— that with the flag off the endpoints really are gone — is
`test_auth_flags.py`.

Test IDs follow the FRD's §21 list. Tier 1 throughout (Part 28 §28.6.3): every
rule here touches a permission, a tenant boundary or an authentication
guarantee, so each has its own test rather than a shared one.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.platform_app.mobile import InvalidMobile, normalise_mobile
from tests.fixtures import reload_url_conf

pytestmark = pytest.mark.django_db


REQUEST_URL = "v1:auth-otp-request"
VERIFY_URL = "v1:auth-otp-verify"


@pytest.fixture(autouse=True)
def otp_enabled(settings: Any) -> Any:
    """Register the retired routes for the duration of this module.

    The flag is restored and the URL map rebuilt explicitly on the way out
    rather than left to the `settings` fixture: that fixture finalises *after*
    this one, so a rebuild that relied on it would run while the flag was still
    on and leave the routes registered for the next module.
    """
    settings.UB_AUTH_OTP_ENABLED = True
    reload_url_conf()
    yield
    settings.UB_AUTH_OTP_ENABLED = False
    reload_url_conf()


# ── T-PLT-01-1 unit: code generation ─────────────────────────────────────────


def test_generate_code_is_six_digits_and_zero_padded() -> None:
    """T-PLT-01-1 / BR-4."""
    from apps.platform_app.services.otp import generate_code

    seen = {generate_code() for _ in range(300)}
    assert all(re.fullmatch(r"\d{6}", code) for code in seen)
    assert len(seen) > 100, "the generator is not varying"


def test_generate_code_never_returns_all_zeroes() -> None:
    """BR-4: `000000` is regenerated."""
    from apps.platform_app.services import otp as otp_service

    assert all(otp_service.generate_code() != "000000" for _ in range(2000))


def test_the_code_is_hashed_with_a_pepper_not_stored_plain(settings: Any) -> None:
    """Part 27 §27.4.1 storage row: `sha256(code + UB_OTP_PEPPER)`."""
    import hashlib

    from apps.platform_app.services.otp import hash_code

    settings.UB_OTP_PEPPER = "pepper-a"
    with_pepper = hash_code("123456")
    settings.UB_OTP_PEPPER = "pepper-b"
    assert hash_code("123456") != with_pepper
    assert with_pepper != hashlib.sha256(b"123456").hexdigest()


# ── T-PLT-01-2 unit: mobile normalisation ────────────────────────────────────


@pytest.mark.parametrize(
    "raw",
    ["9876543210", "+919876543210", "91 98765 43210", "+91-98765-43210", " 9876543210 "],
)
def test_every_accepted_spelling_normalises_to_one(raw: str) -> None:
    """T-PLT-01-2 / BR-1: one `platform_user` per mobile means one spelling."""
    assert normalise_mobile(raw) == "+919876543210"


@pytest.mark.parametrize("raw", ["09876543210", "5876543210", "98765", "", None, "abcdefghij"])
def test_a_number_that_is_not_an_indian_mobile_is_refused(raw: Any) -> None:
    """T-PLT-01-2: `09876…` is the landline trunk prefix, not a mobile."""
    with pytest.raises(InvalidMobile):
        normalise_mobile(raw)


# ── T-PLT-01-3 API: the happy path ───────────────────────────────────────────


def test_request_then_verify_creates_user_session_and_cookies(
    auth_client: Any, fixed_otp: str
) -> None:
    """T-PLT-01-3 / AC-1 / FR-4 / FR-5."""
    from apps.platform_app.models import OtpChallenge, Session, User

    response = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543210", "purpose": "signup"}, format="json"
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert set(body) == {"challenge_id", "expires_in", "retry_after"}
    assert body["expires_in"] == 300
    assert body["retry_after"] == 30
    assert "code" not in response.content.decode()

    verified = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": body["challenge_id"], "code": fixed_otp, "device_label": "Pixel"},
        format="json",
    )
    assert verified.status_code == 200
    data = verified.json()["data"]
    assert data["user"]["is_new"] is True
    assert data["user"]["mobile"] == "+919876543210"
    assert data["tenants"] == []
    assert data["active_tenant_id"] is None
    assert data["permissions"] == []

    assert User.objects.filter(mobile="+919876543210").exists()
    assert Session.objects.filter(device_label="Pixel").count() == 1
    assert OtpChallenge.objects.get(pk=body["challenge_id"]).verified_at is not None

    assert "ub_access" in verified.cookies
    assert "ub_refresh" in verified.cookies
    assert verified.cookies["ub_access"]["httponly"] is True
    assert verified.cookies["ub_refresh"]["path"] == "/api/v1/auth/refresh"
    assert verified.cookies["ub_csrf"]["httponly"] == ""


def test_a_second_verify_of_the_same_challenge_fails(auth_client: Any, fixed_otp: str) -> None:
    """BR-3: a verified challenge is single-use."""
    from tests.fixtures import login_via_otp

    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543211"}, format="json"
    ).json()["data"]
    first = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert first.status_code == 200
    second = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "otp_invalid"
    assert second.json()["error"]["details"]["reason"] == "used"
    assert login_via_otp is not None  # the helper is exercised by later modules


def test_an_existing_user_is_not_new_and_keeps_their_row(
    auth_client: Any, fixed_otp: str, user: Any
) -> None:
    """FR-5: `is_new` is decided by user existence, not by the client."""
    from apps.platform_app.models import User

    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": user.mobile}, format="json"
    ).json()["data"]
    data = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    ).json()["data"]
    assert data["user"]["is_new"] is False
    assert data["user"]["id"] == str(user.id)
    assert User.objects.filter(mobile=user.mobile).count() == 1


# ── T-PLT-01-4 API: attempts and burning ─────────────────────────────────────


def test_five_wrong_codes_burn_the_challenge(auth_client: Any, fixed_otp: str) -> None:
    """T-PLT-01-4 / FR-6: `attempts_left` counts down to 0 and the sixth is refused."""
    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543212"}, format="json"
    ).json()["data"]

    seen = []
    for _ in range(5):
        response = auth_client.post(
            reverse(VERIFY_URL),
            {"challenge_id": requested["challenge_id"], "code": "000001"},
            format="json",
        )
        assert response.status_code in (400, 429)
        seen.append(response.json()["error"]["details"].get("attempts_left"))
    assert seen[:4] == [4, 3, 2, 1]

    sixth = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert sixth.status_code in (400, 429)
    assert sixth.json()["error"]["code"] in ("otp_invalid", "otp_throttled")


def test_the_correct_code_after_four_failures_still_works(auth_client: Any, fixed_otp: str) -> None:
    """FR-6: the challenge is burned on the fifth failure, not the fourth."""
    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543213"}, format="json"
    ).json()["data"]
    for _ in range(4):
        auth_client.post(
            reverse(VERIFY_URL),
            {"challenge_id": requested["challenge_id"], "code": "000001"},
            format="json",
        )
    response = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert response.status_code == 200


# ── T-PLT-01-5 API: throttling and lockout (Part 27 §27.4.1) ─────────────────


def test_the_sixth_request_in_ten_minutes_is_429(auth_client: Any, fixed_otp: str) -> None:
    """T-PLT-01-5 / FR-7: 5 per mobile per 10 minutes, with `Retry-After`."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    for index in range(5):
        response = auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543214"}, format="json")
        assert response.status_code == 200, index
        # FR-7's 30-second resend gap would otherwise refuse request 2 onwards;
        # this test is about the *window*, so the gap is aged out deliberately.
        RateLimit.objects.filter(scope=throttle.SCOPE_OTP_MOBILE).update(
            last_hit_at=timezone.now() - dt.timedelta(seconds=60)
        )

    refused = auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543214"}, format="json")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "otp_throttled"
    assert int(refused["Retry-After"]) > 0
    assert refused.json()["error"]["details"]["retry_after"] > 0


def test_a_resend_inside_thirty_seconds_is_refused(auth_client: Any) -> None:
    """FR-7: "Resend is allowed after `retry_after` (30 s)"."""
    first = auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543215"}, format="json")
    assert first.status_code == 200
    second = auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543215"}, format="json")
    assert second.status_code == 429
    assert second.json()["error"]["details"]["retry_after"] <= 30


def test_twenty_requests_from_one_ip_per_hour_is_the_ceiling(auth_client: Any) -> None:
    """FR-7 / Part 22 §22.1: 20 per IP per hour, independent of the mobile."""
    from apps.platform_app.services import throttle

    for index in range(20):
        response = auth_client.post(
            reverse(REQUEST_URL), {"mobile": f"98765{index:05d}"}, format="json"
        )
        assert response.status_code == 200, index

    refused = auth_client.post(reverse(REQUEST_URL), {"mobile": "9812345678"}, format="json")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "otp_throttled"
    assert throttle.OTP_REQUESTS_PER_IP == 20


def test_five_failed_challenges_lock_the_mobile_out_for_thirty_minutes(
    auth_client: Any,
) -> None:
    """Part 27 §27.4.1 "Lockout" — the counter lives in PostgreSQL, not LocMem."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    mobile = "9876543216"
    for _ in range(5):
        requested = auth_client.post(reverse(REQUEST_URL), {"mobile": mobile}, format="json").json()
        if "error" in requested:
            break
        auth_client.post(
            reverse(VERIFY_URL),
            {"challenge_id": requested["data"]["challenge_id"], "code": "000001"},
            format="json",
        )
        RateLimit.objects.filter(scope=throttle.SCOPE_OTP_MOBILE).update(
            last_hit_at=timezone.now() - dt.timedelta(seconds=60)
        )

    lock = RateLimit.objects.get(
        scope=throttle.SCOPE_OTP_FAILURES, key=throttle.digest(f"+91{mobile}")
    )
    assert lock.locked_until is not None
    assert lock.locked_until > timezone.now() + dt.timedelta(minutes=25)

    refused = auth_client.post(reverse(REQUEST_URL), {"mobile": mobile}, format="json")
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "otp_throttled"


def test_the_lockout_key_is_a_hash_not_the_mobile_number(auth_client: Any) -> None:
    """Part 27 §27.7.3: a leaked `platform_rate_limit` is not a phone book."""
    from apps.platform_app.models import RateLimit

    auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543217"}, format="json")
    stored = set(RateLimit.objects.values_list("key", flat=True))
    assert stored
    assert all(len(key) == 64 and "9876543217" not in key for key in stored)


# ── T-PLT-01-6 API: no account enumeration ───────────────────────────────────


def test_the_request_response_is_identical_for_known_and_unknown_mobiles(
    auth_client: Any, user: Any
) -> None:
    """T-PLT-01-6 / FR-2 / BR-2 / Part 27 §27.4.1 "Enumeration"."""
    known = auth_client.post(reverse(REQUEST_URL), {"mobile": user.mobile}, format="json")
    unknown = auth_client.post(reverse(REQUEST_URL), {"mobile": "9812345670"}, format="json")

    assert known.status_code == unknown.status_code == 200
    known_body, unknown_body = known.json()["data"], unknown.json()["data"]
    assert set(known_body) == set(unknown_body)
    assert known_body["expires_in"] == unknown_body["expires_in"]
    assert known_body["retry_after"] == unknown_body["retry_after"]
    assert known_body["challenge_id"] != unknown_body["challenge_id"]


# ── T-PLT-01-7 API: the console backend writes a message log ─────────────────


def test_the_console_backend_writes_a_message_log_row(auth_client: Any) -> None:
    """T-PLT-01-7 / AC-5 / FR-3."""
    from apps.notifications.models import MessageLog

    auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543218"}, format="json")
    row = MessageLog.objects.get()
    assert (row.channel, row.template_code, row.provider, row.status) == (
        "sms",
        "otp",
        "console",
        "sent",
    )
    assert row.to_address == "+919876543218"
    assert row.tenant_id is None


def test_the_console_backend_logs_the_code_so_a_developer_can_read_it(
    auth_client: Any, caplog: Any, fixed_otp: str
) -> None:
    """AC-5 / FR-5: "the code appears in the backend log"."""
    import logging

    # `ub.*` loggers do not propagate to root (Part 20 §20.13.4), so caplog's
    # root handler has to be attached to the logger under test directly.
    logger = logging.getLogger("ub.notifications")
    logger.addHandler(caplog.handler)
    previous = logger.level
    logger.setLevel(logging.INFO)
    try:
        auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543219"}, format="json")
    finally:
        logger.removeHandler(caplog.handler)
        logger.setLevel(previous)

    bodies = [getattr(record, "body", "") for record in caplog.records]
    assert any(fixed_otp in body for body in bodies)
    assert not any("+919876543219" in body for body in bodies), "the full number was logged"


def test_no_backend_configured_still_returns_200_with_a_skipped_row(
    auth_client: Any, settings: Any
) -> None:
    """FR-3: the request still returns 200 and the developer sees `skipped`."""
    from apps.notifications.models import MessageLog

    settings.UB_SMS_BACKEND = ""
    response = auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543220"}, format="json")
    assert response.status_code == 200
    assert MessageLog.objects.get().status == "skipped"


# ── Edge cases ───────────────────────────────────────────────────────────────


def test_an_expired_challenge_is_refused_server_side(auth_client: Any, fixed_otp: str) -> None:
    """EC-3: expiry is evaluated server-side only; a client clock changes nothing."""
    from apps.platform_app.models import OtpChallenge

    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543221"}, format="json"
    ).json()["data"]
    OtpChallenge.objects.filter(pk=requested["challenge_id"]).update(
        expires_at=timezone.now() - dt.timedelta(seconds=1)
    )
    response = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["reason"] == "expired"


def test_an_older_challenge_is_superseded_by_a_newer_one(auth_client: Any, fixed_otp: str) -> None:
    """EC-4: only the newest unexpired challenge is valid."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    first = auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543222"}, format="json").json()[
        "data"
    ]
    RateLimit.objects.filter(scope=throttle.SCOPE_OTP_MOBILE).update(
        last_hit_at=timezone.now() - dt.timedelta(seconds=60)
    )
    auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543222"}, format="json")

    response = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": first["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["reason"] == "superseded"


def test_an_invited_only_user_verifies_with_no_active_tenant(
    auth_client: Any, fixed_otp: str, tenant: Any, system_roles: dict
) -> None:
    """EC-5 / AC-3: `active_tenant_id` is null and the tenant shows as `invited`."""
    from apps.platform_app.models import MembershipStatus
    from tests.factories.platform import MembershipFactory, UserFactory

    invitee = UserFactory()
    MembershipFactory(
        user=invitee,
        tenant=tenant,
        role=system_roles["staff"],
        status=MembershipStatus.INVITED,
        is_default=False,
        joined_at=None,
    )
    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": invitee.mobile}, format="json"
    ).json()["data"]
    data = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    ).json()["data"]

    assert data["active_tenant_id"] is None
    assert [row["status"] for row in data["tenants"]] == ["invited"]


def test_an_inactive_user_is_refused_with_the_generic_code(
    auth_client: Any, fixed_otp: str, user: Any
) -> None:
    """§12: `is_active=false` gets 401 `invalid_credentials`; the challenge is consumed."""
    from apps.platform_app.models import OtpChallenge

    user.is_active = False
    user.save(update_fields=["is_active"])
    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": user.mobile}, format="json"
    ).json()["data"]
    response = auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"
    assert OtpChallenge.objects.get(pk=requested["challenge_id"]).verified_at is not None


def test_a_malformed_mobile_is_a_field_level_validation_error(auth_client: Any) -> None:
    """§10: the message names the field, not the endpoint."""
    response = auth_client.post(reverse(REQUEST_URL), {"mobile": "12345"}, format="json")
    assert response.status_code == 400
    body = response.json()["error"]
    assert body["code"] == "validation_error"
    assert "mobile" in body["details"]


def test_an_unknown_purpose_is_refused(auth_client: Any) -> None:
    """§10: `purpose ∈ {login, signup, verify, reset}`."""
    response = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543223", "purpose": "banana"}, format="json"
    )
    assert response.status_code == 400
    assert "purpose" in response.json()["error"]["details"]


def test_the_locale_the_user_picked_is_persisted_on_verify(
    auth_client: Any, fixed_otp: str
) -> None:
    """FR-8: the language choice is persisted to `platform_user.locale` on first verify."""
    from apps.platform_app.models import User

    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": "9876543224", "locale": "hi"}, format="json"
    ).json()["data"]
    auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp, "locale": "hi"},
        format="json",
    )
    assert User.objects.get(mobile="+919876543224").locale == "hi"


def test_last_login_at_is_updated_on_every_verify(
    auth_client: Any, fixed_otp: str, user: Any
) -> None:
    """BR-6."""
    assert user.last_login_at is None
    requested = auth_client.post(
        reverse(REQUEST_URL), {"mobile": user.mobile}, format="json"
    ).json()["data"]
    auth_client.post(
        reverse(VERIFY_URL),
        {"challenge_id": requested["challenge_id"], "code": fixed_otp},
        format="json",
    )
    user.refresh_from_db()
    assert user.last_login_at is not None


def test_the_audit_trail_hashes_the_mobile_and_carries_no_tenant(auth_client: Any) -> None:
    """§16 / §19: "raw mobile never stored in metadata"."""
    import hashlib

    from apps.platform_app.models import AuditLog

    auth_client.post(reverse(REQUEST_URL), {"mobile": "9876543225"}, format="json")
    row = AuditLog.objects.get(action="auth.otp_requested")
    assert row.tenant_id is None
    assert row.metadata["mobile_sha256"] == hashlib.sha256(b"+919876543225").hexdigest()
    assert "9876543225" not in str(row.metadata)
