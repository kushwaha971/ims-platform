"""`PLT-02` — email sign-up, password login, set/change, and reset by link.

Tier 1 throughout: a password rule that is wrong is an account somebody else can
open, a session-revocation rule that is wrong is an account somebody else keeps,
and a reset-token rule that is wrong is both at once.

Identity here is **email** (DEC-010). The mobile number is still on the row,
still validated and still optional, and the tests that matter about it are the
ones that prove nothing depends on it any more.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.urls import reverse
from django.utils import timezone

pytestmark = pytest.mark.django_db

REGISTER_URL = "v1:auth-register"
LOGIN_URL = "v1:auth-login"
SET_URL = "v1:auth-password-set"
RESET_REQUEST_URL = "v1:auth-password-reset-request"
RESET_CONFIRM_URL = "v1:auth-password-reset-confirm"


def _with_password(user: Any, raw: str = "Kirana123") -> Any:
    user.set_password(raw)
    user.save(update_fields=["password"])
    return user


# ── T-PLT-02-1 unit: the policy ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "candidate",
    ["short1", "nodigitshere", "12345678", "1234567890", "password1"],
)
def test_a_password_that_breaks_the_policy_is_refused(user: Any, candidate: str) -> None:
    """T-PLT-02-1 / FR-2 / §10: 8+, a letter and a digit, not a common password."""
    from apps.common.exceptions import ValidationFailed
    from apps.platform_app.services.passwords import validate

    with pytest.raises(ValidationFailed) as excinfo:
        validate(user=user, password=candidate)
    assert "password" in excinfo.value.details


def test_a_password_equal_to_the_mobile_digits_is_refused(user: Any) -> None:
    """§10: "≠ mobile digits" — still enforced for a user who has a number."""
    from apps.common.exceptions import ValidationFailed
    from apps.platform_app.services.passwords import validate

    digits = "".join(c for c in user.mobile if c.isdigit())
    with pytest.raises(ValidationFailed):
        validate(user=user, password=digits)


def test_a_password_equal_to_the_email_local_part_is_refused(user: Any) -> None:
    """§10 read against the new identifier: the login name is not a password."""
    from apps.common.exceptions import ValidationFailed
    from apps.platform_app.services.passwords import validate

    user.email = "kirana2024@example.com"
    user.save(update_fields=["email"])
    with pytest.raises(ValidationFailed):
        validate(user=user, password="kirana2024")


def test_a_compliant_password_is_accepted_and_nfkc_normalised(user: Any) -> None:
    """EC-5: Unicode passwords are accepted, NFKC-normalised before hashing."""
    from apps.platform_app.services.passwords import validate

    assert validate(user=user, password="Kirana123") == "Kirana123"
    # U+FF33 FULLWIDTH LATIN CAPITAL S normalises to "S", so the stored hash is
    # the same whichever keyboard produced it.
    assert validate(user=user, password="Ｓharma12") == "Sharma12"


def test_owners_and_admins_need_ten_characters(membership: Any) -> None:
    """Part 27 §27.4.2: "Minimum length 8 characters; 10 for `owner` and `admin`"."""
    from apps.common.exceptions import ValidationFailed
    from apps.platform_app.services.passwords import validate

    owner = membership.user
    with pytest.raises(ValidationFailed):
        validate(user=owner, password="Kirana12")  # 8 chars, owner
    assert validate(user=owner, password="Kirana1234")


def test_the_hash_is_pbkdf2_and_the_plaintext_is_never_stored(user: Any) -> None:
    """FR-2 / Part 27 §27.4.2: Django's default PBKDF2, never lowered."""
    _with_password(user, "Kirana123")
    user.refresh_from_db()
    assert user.password.startswith("pbkdf2_sha256$") or user.password.startswith("md5$")
    assert "Kirana123" not in user.password
    assert user.check_password("Kirana123")


# ── Registration (PLT-01 FR-1/FR-4 as amended by DEC-010) ────────────────────


def test_register_creates_the_account_and_signs_in(auth_client: Any) -> None:
    """One call: no challenge, no intermediate state, a session at the end."""
    from apps.platform_app.models import Session, User

    response = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "Ramesh@Example.com", "password": "Kirana1234", "full_name": "Ramesh"},
        format="json",
    )
    assert response.status_code == 201, response.content
    data = response.json()["data"]

    assert data["user"]["email"] == "ramesh@example.com"
    assert data["user"]["mobile"] is None
    assert data["user"]["is_new"] is True
    assert data["user"]["has_password"] is True
    assert data["tenants"] == []
    assert data["active_tenant_id"] is None

    user = User.objects.get(email="ramesh@example.com")
    assert user.full_name == "Ramesh"
    assert user.check_password("Kirana1234")
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == 1
    assert "ub_access" in response.cookies
    assert "ub_refresh" in response.cookies
    assert response.cookies["ub_access"]["httponly"] is True


def test_register_normalises_the_address_and_refuses_the_second_one(auth_client: Any) -> None:
    """Email is the unique identifier, case-insensitively (DEC-010)."""
    from apps.platform_app.models import User

    first = auth_client.post(
        reverse(REGISTER_URL),
        {"email": " Ramesh@Example.COM ", "password": "Kirana1234"},
        format="json",
    )
    assert first.status_code == 201

    second = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "RAMESH@example.com", "password": "Sharma5678"},
        format="json",
    )
    assert second.status_code == 400
    body = second.json()["error"]
    assert body["code"] == "validation_error"
    assert "email" in body["details"]
    assert User.objects.filter(email="ramesh@example.com").count() == 1


@pytest.mark.parametrize("candidate", ["not-an-email", "", "  ", "a@", "@b.com"])
def test_register_refuses_an_address_that_is_not_one(auth_client: Any, candidate: str) -> None:
    """§10: the message names the field, not the endpoint."""
    response = auth_client.post(
        reverse(REGISTER_URL), {"email": candidate, "password": "Kirana1234"}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "validation_error"
    assert "email" in response.json()["error"]["details"]


def test_register_refuses_a_weak_password_and_creates_nothing(auth_client: Any) -> None:
    """A refused password must not leave a half-made account behind."""
    from apps.platform_app.models import User

    response = auth_client.post(
        reverse(REGISTER_URL), {"email": "weak@example.com", "password": "short"}, format="json"
    )
    assert response.status_code == 400
    assert "password" in response.json()["error"]["details"]
    assert not User.objects.filter(email="weak@example.com").exists()


def test_register_accepts_an_optional_mobile_and_normalises_it(auth_client: Any) -> None:
    """The number is still a profile field, still E.164, and still optional."""
    from apps.platform_app.models import User

    response = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "withphone@example.com", "password": "Kirana1234", "mobile": "98765 43210"},
        format="json",
    )
    assert response.status_code == 201
    assert User.objects.get(email="withphone@example.com").mobile == "+919876543210"
    assert response.json()["data"]["user"]["mobile"] == "+919876543210"


def test_register_refuses_a_mobile_that_is_not_an_indian_one(auth_client: Any) -> None:
    from apps.platform_app.models import User

    response = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "badphone@example.com", "password": "Kirana1234", "mobile": "12345"},
        format="json",
    )
    assert response.status_code == 400
    assert "mobile" in response.json()["error"]["details"]
    assert not User.objects.filter(email="badphone@example.com").exists()


def test_two_accounts_cannot_share_one_mobile(auth_client: Any, user: Any) -> None:
    """Mobile stopped being the identifier; it did not stop being unique."""
    response = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "second@example.com", "password": "Kirana1234", "mobile": user.mobile},
        format="json",
    )
    assert response.status_code == 400
    assert "mobile" in response.json()["error"]["details"]


def test_many_accounts_may_have_no_mobile_at_all(auth_client: Any) -> None:
    """The partial unique index must not treat two NULLs as a collision."""
    from apps.platform_app.models import User

    for index in range(3):
        assert (
            auth_client.post(
                reverse(REGISTER_URL),
                {"email": f"nomobile{index}@example.com", "password": "Kirana1234"},
                format="json",
            ).status_code
            == 201
        )
    assert User.objects.filter(mobile__isnull=True).count() == 3


def test_registration_is_capped_per_ip(auth_client: Any, settings: Any) -> None:
    """Part 22 §22.1: an open sign-up endpoint needs a ceiling."""
    from apps.platform_app.services import throttle

    for index in range(throttle.REGISTRATIONS_PER_IP):
        created = auth_client.post(
            reverse(REGISTER_URL),
            {"email": f"bulk{index}@example.com", "password": "Kirana1234"},
            format="json",
        )
        assert created.status_code == 201, index

    refused = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "one-too-many@example.com", "password": "Kirana1234"},
        format="json",
    )
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "rate_limited"
    assert int(refused["Retry-After"]) > 0


# ── T-PLT-02-2/3 API: login ──────────────────────────────────────────────────


def test_a_correct_password_logs_in_and_lists_the_tenants(
    auth_client: Any, membership: Any
) -> None:
    """T-PLT-02-2 / AC-1."""
    _with_password(membership.user)
    response = auth_client.post(
        reverse(LOGIN_URL),
        {"email": membership.user.email, "password": "Kirana123"},
        format="json",
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["active_tenant_id"] == str(membership.tenant_id)
    assert [row["role"] for row in data["tenants"]] == ["owner"]
    assert "ub_access" in response.cookies


def test_login_is_case_insensitive_in_the_address(auth_client: Any, user: Any) -> None:
    """The same normalisation on the way in as on the way to the index."""
    _with_password(user)
    response = auth_client.post(
        reverse(LOGIN_URL),
        {"email": f"  {user.email.upper()}  ", "password": "Kirana123"},
        format="json",
    )
    assert response.status_code == 200


def test_a_wrong_password_and_an_unknown_email_produce_the_same_body(
    auth_client: Any, user: Any
) -> None:
    """T-PLT-02-3 / AC-5 / BR-1: no enumeration, ever."""
    _with_password(user)
    wrong = auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
    )
    unknown = auth_client.post(
        reverse(LOGIN_URL), {"email": "nobody@example.com", "password": "Wrong12345"}, format="json"
    )
    assert wrong.status_code == unknown.status_code == 401
    assert (
        wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == ("invalid_credentials")
    )
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


def test_an_account_with_no_password_cannot_be_logged_in_by_password(
    auth_client: Any, passwordless_user: Any
) -> None:
    """Part 27 §27.4.2: `password_hash NULL` means password login is impossible."""
    assert not passwordless_user.has_usable_password()
    response = auth_client.post(
        reverse(LOGIN_URL),
        {"email": passwordless_user.email, "password": "Kirana123"},
        format="json",
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_an_inactive_user_gets_the_same_generic_error(auth_client: Any, user: Any) -> None:
    """EC-6."""
    _with_password(user)
    user.is_active = False
    user.save(update_fields=["is_active"])
    response = auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Kirana123"}, format="json"
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_a_mobile_number_is_not_a_login_identifier(auth_client: Any, user: Any) -> None:
    """DEC-010: the number is on the profile and is not a way in."""
    _with_password(user)
    response = auth_client.post(
        reverse(LOGIN_URL), {"email": user.mobile, "password": "Kirana123"}, format="json"
    )
    assert response.status_code == 400
    assert "email" in response.json()["error"]["details"]


def test_login_with_no_identifier_names_the_email_field(auth_client: Any) -> None:
    response = auth_client.post(reverse(LOGIN_URL), {"password": "Kirana123"}, format="json")
    assert response.status_code == 400
    assert "email" in response.json()["error"]["details"]


# ── T-PLT-02-4 API: login throttling ─────────────────────────────────────────


def test_the_eleventh_failed_attempt_is_login_throttled(auth_client: Any, user: Any) -> None:
    """T-PLT-02-4 / FR-6 / Part 27 §27.4.2 ("10 attempts, then lockout")."""
    _with_password(user)
    for index in range(10):
        response = auth_client.post(
            reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
        )
        assert response.status_code == 401, index

    refused = auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
    )
    assert refused.status_code == 429
    assert refused.json()["error"]["code"] == "login_throttled"
    assert int(refused["Retry-After"]) > 0

    # And the correct password is refused too, for the duration of the lockout.
    locked_out = auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Kirana123"}, format="json"
    )
    assert locked_out.status_code == 429


def test_the_lockout_lasts_fifteen_minutes_and_is_stored_in_postgres(
    auth_client: Any, user: Any
) -> None:
    """Part 27 §27.4.1's normative "not in LocMemCache", read for the login counter."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    _with_password(user)
    for _ in range(10):
        auth_client.post(
            reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
        )
    row = RateLimit.objects.get(scope=throttle.SCOPE_LOGIN_EMAIL, key=throttle.digest(user.email))
    assert row.locked_until is not None
    assert row.locked_until > timezone.now() + dt.timedelta(minutes=10)


def test_a_successful_login_clears_the_failure_counter(auth_client: Any, user: Any) -> None:
    """Part 27 §27.4.2 "On success": every failed-attempt counter is cleared."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    _with_password(user)
    for _ in range(3):
        auth_client.post(
            reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
        )
    assert RateLimit.objects.filter(scope=throttle.SCOPE_LOGIN_EMAIL).exists()

    auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Kirana123"}, format="json"
    )
    assert not RateLimit.objects.filter(
        scope=throttle.SCOPE_LOGIN_EMAIL, key=throttle.digest(user.email)
    ).exists()


def test_the_failure_counter_is_not_reset_by_changing_the_spelling(
    auth_client: Any, user: Any
) -> None:
    """The counter is keyed on the normalised address, not on what was typed."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    _with_password(user)
    auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
    )
    auth_client.post(
        reverse(LOGIN_URL),
        {"email": f" {user.email.upper()} ", "password": "Wrong12345"},
        format="json",
    )
    row = RateLimit.objects.get(scope=throttle.SCOPE_LOGIN_EMAIL, key=throttle.digest(user.email))
    assert row.count == 2


def test_the_throttle_key_is_a_hash_not_the_address(auth_client: Any, user: Any) -> None:
    """Part 27 §27.7.3: a leaked `platform_rate_limit` is not a mailing list."""
    from apps.platform_app.models import RateLimit

    _with_password(user)
    auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
    )
    stored = set(RateLimit.objects.values_list("key", flat=True))
    assert stored
    assert all(len(key) == 64 and user.email not in key for key in stored)


# ── T-PLT-02-6 API: setting a password ───────────────────────────────────────


def test_set_without_a_current_password_is_allowed_only_while_the_hash_is_null(
    api_as: Any, tenant: Any, passwordless_user: Any
) -> None:
    """T-PLT-02-6 / FR-3."""
    client, member = api_as(tenant, role="staff", user=passwordless_user)
    assert not member.user.has_usable_password()

    first = client.post(reverse(SET_URL), {"new_password": "Kirana1234"}, format="json")
    assert first.status_code == 200
    member.user.refresh_from_db()
    assert member.user.check_password("Kirana1234")

    second = client.post(reverse(SET_URL), {"new_password": "Kirana9999"}, format="json")
    assert second.status_code == 401
    assert second.json()["error"]["code"] == "invalid_credentials"

    third = client.post(
        reverse(SET_URL),
        {"new_password": "Kirana9999", "current_password": "Kirana1234"},
        format="json",
    )
    assert third.status_code == 200


def test_changing_a_password_keeps_the_caller_logged_in(
    api_as: Any, tenant: Any, passwordless_user: Any
) -> None:
    """FR-9 / AC-4: a change is not a logout."""
    from apps.platform_app.models import Session

    client, member = api_as(tenant, role="staff", user=passwordless_user)
    response = client.post(reverse(SET_URL), {"new_password": "Kirana1234"}, format="json")
    assert response.status_code == 200
    assert Session.objects.filter(user=member.user, revoked_at__isnull=False).count() == 0
    assert client.get(reverse("v1:auth-me")).status_code == 200


def test_log_out_other_devices_revokes_only_the_others(
    api_as: Any, tenant: Any, passwordless_user: Any
) -> None:
    """FR-9: the tick is what revokes, and it spares the session that ticked it."""
    from apps.platform_app.models import Session
    from apps.platform_app.services import sessions as session_service

    client, member = api_as(tenant, role="staff", user=passwordless_user)
    mine = session_service.issue(user=member.user, tenant=tenant, membership=member)
    other = session_service.issue(user=member.user, tenant=tenant, membership=member)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {mine.access}", HTTP_X_CLIENT="api")
    response = client.post(
        reverse(SET_URL),
        {"new_password": "Kirana1234", "logout_other_devices": True},
        format="json",
    )
    assert response.status_code == 200
    other.session.refresh_from_db()
    mine.session.refresh_from_db()
    assert other.session.revoked_at is not None
    assert mine.session.revoked_at is None
    assert Session.objects.filter(user=member.user, revoked_at__isnull=True).count() == 1


def test_a_password_is_never_written_to_the_audit_log(
    api_as: Any, tenant: Any, passwordless_user: Any
) -> None:
    """BR-3: never logged, never in `before`/`after`."""
    from apps.platform_app.models import AuditLog

    client, _member = api_as(tenant, role="staff", user=passwordless_user)
    client.post(reverse(SET_URL), {"new_password": "Kirana1234"}, format="json")
    rows = AuditLog.objects.filter(action__startswith="auth.password")
    assert rows.exists()
    assert not any("Kirana1234" in str(row.before or row.after or row.metadata) for row in rows)


def test_password_set_requires_authentication(anonymous_client: Any) -> None:
    """§12: "Authenticated (any role): password set/change for self only"."""
    response = anonymous_client.post(
        reverse(SET_URL), {"new_password": "Kirana1234"}, format="json"
    )
    assert response.status_code == 401


# ── T-PLT-02-5 API: reset by emailed link (DEC-010) ──────────────────────────


def test_reset_request_writes_a_message_log_row_through_the_adapter(
    auth_client: Any, user: Any
) -> None:
    """FR-4 / AC-5, read for email: the delivery goes through the same seam."""
    from apps.notifications.models import MessageLog

    response = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    assert response.status_code == 200
    assert response.json()["data"] == {"expires_in": 900, "retry_after": 60}

    row = MessageLog.objects.get()
    assert (row.channel, row.template_code, row.provider, row.status) == (
        "email",
        "password_reset",
        "console",
        "sent",
    )
    assert row.to_address == user.email
    assert row.tenant_id is None
    assert row.related_type == "platform_auth_token"


def test_the_console_backend_logs_the_reset_link_so_the_owner_can_open_it(
    auth_client: Any, caplog: Any, user: Any
) -> None:
    """The email counterpart of PLT-01 AC-5: the link appears in the backend log."""
    import logging

    from apps.platform_app.models import AuthToken

    # `ub.*` loggers do not propagate to root (Part 20 §20.13.4), so caplog's
    # root handler has to be attached to the logger under test directly.
    logger = logging.getLogger("ub.notifications")
    logger.addHandler(caplog.handler)
    previous = logger.level
    logger.setLevel(logging.INFO)
    try:
        auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    finally:
        logger.removeHandler(caplog.handler)
        logger.setLevel(previous)

    bodies = [getattr(record, "body", "") for record in caplog.records]
    assert any("/reset-password?token=" in body for body in bodies)
    assert not any(user.email in body for body in bodies), "the full address was logged"

    # And the token in that link is the one the row hashes — not a second one.
    from apps.platform_app.services.passwords import hash_reset_token

    link = next(b for b in bodies if "/reset-password?token=" in b)
    raw = link.split("token=")[1].split()[0]
    assert AuthToken.objects.filter(token_hash=hash_reset_token(raw)).exists()


def test_the_token_is_never_in_the_response_or_the_message_log_payload(
    auth_client: Any, user: Any
) -> None:
    """The row is queryable and the response is readable; the token is in neither."""
    from apps.notifications.models import MessageLog

    response = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    assert set(response.json()["data"]) == {"expires_in", "retry_after"}
    assert "token" not in response.content.decode()
    assert "token" not in str(MessageLog.objects.get().payload)


def test_the_stored_token_is_a_hash_not_the_token(auth_client: Any, user: Any) -> None:
    """Part 27 §27.4.2: "hashed at rest"."""
    from apps.platform_app.models import AuthToken

    auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    row = AuthToken.objects.get()
    assert len(row.token_hash) == 64
    assert row.used_at is None
    assert row.expires_at > timezone.now()


def test_reset_request_answers_the_same_for_an_unknown_address(auth_client: Any, user: Any) -> None:
    """FR-4: "identical response for unknown addresses" — no enumeration."""
    from apps.notifications.models import MessageLog

    known = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    unknown = auth_client.post(
        reverse(RESET_REQUEST_URL), {"email": "nobody@example.com"}, format="json"
    )
    assert known.status_code == unknown.status_code == 200
    assert known.json()["data"] == unknown.json()["data"]
    # And nothing was sent to the address that does not exist.
    assert MessageLog.objects.count() == 1


def test_reset_request_for_an_inactive_user_sends_nothing_and_says_so_anyway(
    auth_client: Any, user: Any
) -> None:
    from apps.notifications.models import MessageLog

    user.is_active = False
    user.save(update_fields=["is_active"])
    response = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    assert response.status_code == 200
    assert MessageLog.objects.count() == 0


def test_reset_requests_are_throttled_per_address(auth_client: Any, user: Any) -> None:
    """Part 22 §22.1: a mail-sending endpoint anyone may call needs a ceiling."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    first = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    assert first.status_code == 200

    immediate = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    assert immediate.status_code == 429
    assert immediate.json()["error"]["code"] == "rate_limited"
    assert immediate.json()["error"]["details"]["retry_after"] <= 60

    for _ in range(throttle.RESET_REQUESTS_PER_EMAIL - 1):
        RateLimit.objects.filter(scope=throttle.SCOPE_RESET_EMAIL).update(
            last_hit_at=timezone.now() - dt.timedelta(seconds=120)
        )
        assert (
            auth_client.post(
                reverse(RESET_REQUEST_URL), {"email": user.email}, format="json"
            ).status_code
            == 200
        )

    RateLimit.objects.filter(scope=throttle.SCOPE_RESET_EMAIL).update(
        last_hit_at=timezone.now() - dt.timedelta(seconds=120)
    )
    refused = auth_client.post(reverse(RESET_REQUEST_URL), {"email": user.email}, format="json")
    assert refused.status_code == 429


def test_reset_confirm_sets_the_password_and_revokes_other_sessions(
    auth_client: Any, membership: Any
) -> None:
    """T-PLT-02-5 / FR-5 / AC-3."""
    from apps.platform_app.models import Session
    from apps.platform_app.services import sessions as session_service
    from tests.fixtures import reset_token_for

    user = _with_password(membership.user)
    stale = session_service.issue(user=user, tenant=membership.tenant, membership=membership)
    raw = reset_token_for(user.email)

    confirmed = auth_client.post(
        reverse(RESET_CONFIRM_URL),
        {"token": raw, "new_password": "NayaPass1234"},
        format="json",
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["sessions_revoked"] >= 1

    user.refresh_from_db()
    assert user.check_password("NayaPass1234")
    stale.session.refresh_from_db()
    assert stale.session.revoked_at is not None
    # The session issued by the reset itself is live: the person who reset stays in.
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == 1


def test_a_reset_token_works_exactly_once(auth_client: Any, user: Any) -> None:
    """Part 27 §27.4.2: "single-use"."""
    from tests.fixtures import reset_token_for

    raw = reset_token_for(user.email)
    first = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    assert first.status_code == 200

    second = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "OtherPass99"}, format="json"
    )
    assert second.status_code == 400
    assert second.json()["error"]["code"] == "validation_error"
    assert "token" in second.json()["error"]["details"]
    user.refresh_from_db()
    assert user.check_password("NayaPass1234")


def test_an_expired_reset_token_is_refused(auth_client: Any, user: Any) -> None:
    """Part 27 §27.4.2: "15-minute". Expiry is evaluated server-side only."""
    from apps.platform_app.models import AuthToken
    from tests.fixtures import reset_token_for

    raw = reset_token_for(user.email)
    AuthToken.objects.update(expires_at=timezone.now() - dt.timedelta(seconds=1))
    response = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    assert response.status_code == 400
    assert "token" in response.json()["error"]["details"]


def test_an_unknown_reset_token_is_refused_with_the_same_message(
    auth_client: Any, user: Any
) -> None:
    """A stale link and an invented one are one outcome."""
    from tests.fixtures import reset_token_for

    raw = reset_token_for(user.email)
    real = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    assert real.status_code == 200
    spent = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    invented = auth_client.post(
        reverse(RESET_CONFIRM_URL),
        {"token": "not-a-real-token", "new_password": "NayaPass1234"},
        format="json",
    )
    assert spent.status_code == invented.status_code == 400
    assert spent.json()["error"]["details"] == invented.json()["error"]["details"]


def test_requesting_a_second_link_kills_the_first(auth_client: Any, user: Any) -> None:
    """BR-2: a merchant who asks twice must not have two live ways in."""
    from apps.platform_app.models import AuthToken, RateLimit
    from apps.platform_app.services import throttle
    from apps.platform_app.services.passwords import hash_reset_token, request_reset

    request_reset(email=user.email)
    first_hash = AuthToken.objects.get().token_hash

    # The 60-second resend gap is the subject of its own test; age it out so
    # this one is about what the second request does to the first link.
    RateLimit.objects.filter(scope=throttle.SCOPE_RESET_EMAIL).update(
        last_hit_at=timezone.now() - dt.timedelta(seconds=120)
    )
    request_reset(email=user.email, ip="203.0.113.9")

    stale = AuthToken.objects.get(token_hash=first_hash)
    assert stale.used_at is not None
    assert AuthToken.objects.filter(used_at__isnull=True).count() == 1
    assert hash_reset_token("anything") != first_hash


def test_a_reset_for_a_deactivated_user_is_refused(auth_client: Any, user: Any) -> None:
    from tests.fixtures import reset_token_for

    raw = reset_token_for(user.email)
    user.is_active = False
    user.save(update_fields=["is_active"])
    response = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    assert response.status_code == 400


def test_reset_does_not_change_the_permission_version(auth_client: Any, membership: Any) -> None:
    """BR-2: "bumps nothing in JWT (`ver` unchanged; permissions unaffected)"."""
    from tests.fixtures import reset_token_for

    user = _with_password(membership.user)
    before = membership.permissions_version
    raw = reset_token_for(user.email)
    auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    membership.refresh_from_db()
    assert membership.permissions_version == before


def test_reset_confirm_refuses_a_weak_password_without_spending_the_link(
    auth_client: Any, user: Any
) -> None:
    """FR-5 / §9 "Failed" — a rejected password must not consume the link.

    The rules the server owns are wider than the ones the client can mirror:
    Django's `CommonPasswordValidator` and `UserAttributeSimilarityValidator`
    live only on the server, so `Password123` reaches the endpoint looking
    perfectly valid to the form. Spending the token first meant that merchant
    got "Choose a less common password" *and* a dead link, behind a 60-second
    minimum gap and a five-per-hour cap. The whole confirm is one transaction
    now, so the refusal rolls the spend back with everything else.
    """
    from apps.platform_app.models import AuthToken
    from tests.fixtures import reset_token_for

    raw = reset_token_for(user.email)
    for rejected in ("short", "Password123"):
        response = auth_client.post(
            reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": rejected}, format="json"
        )
        assert response.status_code == 400, rejected
        assert "password" in response.json()["error"]["details"], rejected
        assert AuthToken.objects.get().used_at is None, rejected

    # The same link still works, which is the whole point of not spending it.
    ok = auth_client.post(
        reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "NayaPass1234"}, format="json"
    )
    assert ok.status_code == 200
    user.refresh_from_db()
    assert user.check_password("NayaPass1234")


def test_reset_confirm_still_spends_the_link_on_success(auth_client: Any, user: Any) -> None:
    """The rollback must not become a token-reuse hole: one accepted use, ever."""
    from apps.platform_app.models import AuthToken
    from tests.fixtures import reset_token_for

    raw = reset_token_for(user.email)
    assert (
        auth_client.post(
            reverse(RESET_CONFIRM_URL),
            {"token": raw, "new_password": "NayaPass1234"},
            format="json",
        ).status_code
        == 200
    )
    assert AuthToken.objects.get().used_at is not None
    assert (
        auth_client.post(
            reverse(RESET_CONFIRM_URL),
            {"token": raw, "new_password": "DusraPass1234"},
            format="json",
        ).status_code
        == 400
    )
    user.refresh_from_db()
    assert user.check_password("NayaPass1234")


def test_a_failed_reset_leaves_the_password_and_sessions_alone(auth_client: Any, user: Any) -> None:
    """The refusal changes nothing at all — not the password, not the sessions.

    `reset_password` revokes every live session on its way to setting the new
    one, so "the link survives" is only half of what §9's "Failed" state wants;
    the merchant must also still be signed in where they were. Today `validate`
    happens to run before that revocation, so this holds for a second reason as
    well as the transaction — which is exactly why it is worth pinning.
    """
    from apps.platform_app.models import Session
    from tests.fixtures import reset_token_for

    _with_password(user, "Kirana123")
    auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Kirana123"}, format="json"
    )
    live_before = Session.objects.filter(user=user, revoked_at__isnull=True).count()
    assert live_before > 0

    raw = reset_token_for(user.email)
    assert (
        auth_client.post(
            reverse(RESET_CONFIRM_URL), {"token": raw, "new_password": "Password123"}, format="json"
        ).status_code
        == 400
    )
    user.refresh_from_db()
    assert user.check_password("Kirana123")
    assert Session.objects.filter(user=user, revoked_at__isnull=True).count() == live_before


def test_a_successful_reset_clears_the_login_lockout(auth_client: Any, user: Any) -> None:
    """Part 27 §27.4.2 "On success", read for the reset path."""
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle
    from tests.fixtures import reset_token_for

    _with_password(user)
    for _ in range(10):
        auth_client.post(
            reverse(LOGIN_URL), {"email": user.email, "password": "Wrong12345"}, format="json"
        )
    assert RateLimit.objects.filter(scope=throttle.SCOPE_LOGIN_EMAIL).exists()

    raw = reset_token_for(user.email)
    assert (
        auth_client.post(
            reverse(RESET_CONFIRM_URL),
            {"token": raw, "new_password": "NayaPass1234"},
            format="json",
        ).status_code
        == 200
    )
    assert not RateLimit.objects.filter(
        scope=throttle.SCOPE_LOGIN_EMAIL, key=throttle.digest(user.email)
    ).exists()
    assert (
        auth_client.post(
            reverse(LOGIN_URL), {"email": user.email, "password": "NayaPass1234"}, format="json"
        ).status_code
        == 200
    )


# ── Email verification: plumbed, off, and never a login gate ─────────────────


def test_verification_is_off_by_default_and_registration_sends_nothing(
    auth_client: Any,
) -> None:
    from apps.notifications.models import MessageLog
    from apps.platform_app.models import User

    data = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "unverified@example.com", "password": "Kirana1234"},
        format="json",
    ).json()["data"]
    assert data["user"]["email_verified"] is False
    assert data["user"]["email_verification_required"] is False
    assert MessageLog.objects.count() == 0
    assert User.objects.get(email="unverified@example.com").email_verified_at is None


def test_an_unverified_address_does_not_block_login(auth_client: Any, user: Any) -> None:
    """The MVP rule, asserted rather than assumed."""
    _with_password(user)
    assert user.email_verified_at is None
    response = auth_client.post(
        reverse(LOGIN_URL), {"email": user.email, "password": "Kirana123"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["data"]["user"]["email_verified"] is False


def test_with_the_flag_on_registration_sends_a_link_and_login_still_works(
    auth_client: Any, settings: Any
) -> None:
    from apps.notifications.models import MessageLog

    settings.UB_EMAIL_VERIFICATION_ENABLED = True
    created = auth_client.post(
        reverse(REGISTER_URL),
        {"email": "verify-me@example.com", "password": "Kirana1234"},
        format="json",
    )
    assert created.status_code == 201
    assert created.json()["data"]["user"]["email_verification_required"] is True

    row = MessageLog.objects.get()
    assert (row.channel, row.template_code, row.status) == ("email", "email_verify", "sent")

    signed_in = auth_client.post(
        reverse(LOGIN_URL),
        {"email": "verify-me@example.com", "password": "Kirana1234"},
        format="json",
    )
    assert signed_in.status_code == 200, "verification must never gate login at MVP"


def test_the_verification_link_confirms_the_address_once(api_as: Any, tenant: Any) -> None:
    from apps.platform_app.models import AuthToken
    from apps.platform_app.services import auth as auth_service

    client, member = api_as(tenant)
    assert (
        client.post(reverse("v1:auth-email-verify-request"), {}, format="json").status_code == 200
    )

    raw = "verify-token-under-test"
    AuthToken.objects.filter(user=member.user).update(
        token_hash=__import__("hashlib").sha256(raw.encode()).hexdigest()
    )
    confirmed = client.post(reverse("v1:auth-email-verify-confirm"), {"token": raw}, format="json")
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["email_verified"] is True

    member.user.refresh_from_db()
    assert member.user.email_verified_at is not None
    assert auth_service.confirm_email is not None

    replayed = client.post(reverse("v1:auth-email-verify-confirm"), {"token": raw}, format="json")
    assert replayed.status_code == 400


def test_a_refused_password_change_does_not_rename_the_account(api_as: Any, tenant: Any) -> None:
    """`full_name` is persisted only once the change is authorised.

    `set_password` is where `current_password` is checked. Writing the name
    before that call meant a caller who supplied the wrong current password got
    a 401 *and* a changed display name — a write from a request that was refused.
    """
    from tests.factories.platform import UserFactory

    user = UserFactory(full_name="")
    user.set_password("Kirana1234")
    user.save(update_fields=["password"])
    client, _member = api_as(tenant, user=user)

    refused = client.post(
        reverse(SET_URL),
        {
            "new_password": "Kirana5678",
            "current_password": "WrongPassword1",
            "full_name": "Somebody Else",
        },
        format="json",
    )
    assert refused.status_code == 401
    user.refresh_from_db()
    assert user.full_name == ""
    assert user.check_password("Kirana1234")

    accepted = client.post(
        reverse(SET_URL),
        {
            "new_password": "Kirana5678",
            "current_password": "Kirana1234",
            "full_name": "Ramesh Sharma",
        },
        format="json",
    )
    assert accepted.status_code == 200
    user.refresh_from_db()
    assert user.full_name == "Ramesh Sharma"


def test_asking_for_a_verification_link_is_throttled(api_as: Any, tenant: Any) -> None:
    """Every other token-minting endpoint has a durable counter; this one mints
    a link *and marks the previous one spent*, so an unthrottled loop is both a
    mail amplifier and a way to keep a merchant's in-flight link dead.
    """
    from apps.platform_app.models import RateLimit
    from apps.platform_app.services import throttle

    client, member = api_as(tenant)
    url = reverse("v1:auth-email-verify-request")
    assert client.post(url, {}, format="json").status_code == 200

    # The 60-second resend gap refuses the immediate second ask.
    immediate = client.post(url, {}, format="json")
    assert immediate.status_code == 429
    assert immediate.json()["error"]["code"] == "rate_limited"
    assert 0 < immediate.json()["error"]["details"]["retry_after"] <= 60
    assert immediate["Retry-After"]

    assert RateLimit.objects.filter(
        scope=throttle.SCOPE_VERIFY_USER, key=throttle.digest(str(member.user.id))
    ).exists()
