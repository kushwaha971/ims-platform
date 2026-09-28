"""Password policy, set, change, login and reset (PLT-02, Part 27 §27.4.2).

**Where the two chapters disagree, and what is built.** PLT-02 FR-2 and §10
require "at least one letter and one digit" and a 128-character ceiling.
Part 27 §27.4.2's table says composition rules: **none**, and adds a 10-character
minimum for `owner` and `admin` and `UserAttributeSimilarityValidator`. A
password that satisfies both is accepted by either reading, so this module
enforces the **union**: the FRD's regex, the FRD's "not the identifier", the
10-character floor for owners and admins, and Django's validator stack. Being
stricter than the client's mirrored regex costs an owner one retry on a
nine-character password; being laxer than the security standard costs an
account. `CR-LOG` carries the request to reconcile the two chapters.

Hashing is Django's default `PBKDF2PasswordHasher` at Django 5.2's iteration
count — never lowered, never replaced with a dependency ADR-021 does not admit.
A password is never logged, never audited and never echoed (BR-3).

**Reset without a mail provider (DEC-010).** Part 27 §27.4.2 says the reset
token is "single-use, 15-minute, hashed at rest" and says nothing about how it
travels; Sprint 1 sent an OTP to a mobile. There is no mail provider in this
deployment and none is being added, so the link travels through the same
adapter seam the SMS backend used, with a console backend that logs it. Every
property Part 27 names is a property of `platform_auth_token` and is therefore
true of whatever provider replaces the console one later.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
import unicodedata
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.contrib.auth.hashers import check_password, get_hasher, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import get_random_string

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app.services import throttle

MIN_LENGTH = 8
MIN_LENGTH_PRIVILEGED = 10  # Part 27 §27.4.2 — `owner` and `admin`
MAX_LENGTH = 128
PRIVILEGED_ROLES = ("owner", "admin")

POLICY_MESSAGE = "At least 8 characters with a letter and a number."
PRIVILEGED_POLICY_MESSAGE = (
    "Owners and admins need at least 10 characters, with a letter and a number."
)

RESET_TOKEN_BYTES = 32  # 256 bits from `secrets` — see `AuthToken`'s docstring


class InvalidCredentials(BusinessRuleViolation):
    """401 `invalid_credentials` — identical for an unknown email and a wrong password.

    PLT-02 FR-1, BR-1, AC-5 and Part 27 §27.4.2 all say the same thing in
    different words: the response must not distinguish the two cases. So there
    is exactly one exception and exactly one message.
    """

    def __init__(self) -> None:
        super().__init__("invalid_credentials", "Email or password is incorrect.")


class LoginThrottled(BusinessRuleViolation):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "login_throttled",
            "Too many attempts. Please try again later.",
            details={"retry_after": int(retry_after)},
        )


class RequestThrottled(BusinessRuleViolation):
    """429 `rate_limited` — the reset and sign-up budgets of Part 22 §22.1.

    Not `login_throttled`: that code is registered against "password login
    exceeded its per-identifier attempt budget", and a reset request is not a
    login attempt. `rate_limited` is the registered code for "a per-user or
    per-endpoint rate limit in Part 22 §22.1 was exceeded".
    """

    def __init__(self, retry_after: int, limit: int) -> None:
        super().__init__(
            "rate_limited",
            "Too many requests. Please wait a moment.",
            details={"retry_after": int(retry_after), "limit": int(limit)},
        )


def normalise(raw: str) -> str:
    """NFKC before hashing (PLT-02 EC-5), so a Unicode password is stable."""
    return unicodedata.normalize("NFKC", raw or "")


def is_privileged(user: Any) -> bool:
    """Does this person hold `owner` or `admin` anywhere? Then Part 27's floor applies."""
    from apps.platform_app.models import MembershipStatus

    return user.memberships.filter(
        status=MembershipStatus.ACTIVE, role__code__in=PRIVILEGED_ROLES
    ).exists()


def validate(*, user: Any, password: str) -> str:
    """Return the normalised password, or raise `validation_error` on `password`."""
    value = normalise(password)
    errors: list[str] = []
    floor = MIN_LENGTH_PRIVILEGED if (user.pk and is_privileged(user)) else MIN_LENGTH

    if len(value) < floor or len(value) > MAX_LENGTH:
        errors.append(
            PRIVILEGED_POLICY_MESSAGE if floor == MIN_LENGTH_PRIVILEGED else POLICY_MESSAGE
        )
    if not (any(c.isalpha() for c in value) and any(c.isdigit() for c in value)):
        errors.append(POLICY_MESSAGE)
    if _is_the_identifier(user=user, value=value):
        errors.append("Choose a less common password.")

    try:
        validate_password(value, user=user)
    except DjangoValidationError as exc:
        errors.extend(str(m) for m in exc.messages)

    if errors:
        raise ValidationFailed({"password": sorted(set(errors))})
    return value


def _is_the_identifier(*, user: Any, value: str) -> bool:
    """§10's "≠ the identifier", read against email as well as mobile.

    Django's `UserAttributeSimilarityValidator` catches most of the email cases
    because `email` is now `USERNAME_FIELD`; the explicit check stays because
    the mobile is not one of the attributes it inspects and because a rule this
    cheap should not depend on a validator's default attribute list.
    """
    stripped = value.strip()
    digits = "".join(c for c in (user.mobile or "") if c.isdigit())
    if digits and stripped in (digits, digits[-10:]):
        return True
    email = (getattr(user, "email", "") or "").lower()
    if not email:
        return False
    return stripped.lower() in (email, email.partition("@")[0])


# ── Setting and changing ─────────────────────────────────────────────────────


def set_password(
    *,
    user: Any,
    new_password: str,
    current_password: str | None = None,
    logout_other_devices: bool = False,
    current_session_id: Any = None,
    request_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """`POST /auth/password/set` — set or change (PLT-02 FR-3, FR-9).

    FR-3: `current_password` is **not** required while `password_hash IS NULL`
    and **is** required afterwards. Registration always sets a password, so at
    MVP the null case is reached only by a user created before DEC-010 or by an
    OTP-only account under the retired flag — both of which are real, so the
    branch stays. A change does not log the user out; FR-9 makes "log out other
    devices" an explicit tick rather than a surprise.
    """
    had_password = user.has_usable_password()
    if had_password and (
        not current_password or not user.check_password(normalise(current_password))
    ):
        raise InvalidCredentials()

    value = validate(user=user, password=new_password)

    with transaction.atomic():
        from apps.platform_app.services import credentials

        user.set_password(value)
        user.save(update_fields=["password", "updated_at"])
        # DEC-012: this is the moment an owner-issued temporary password stops
        # being one. Inside the same transaction as the hash, so there is no
        # window where the new password is live and the gate is still up.
        credentials.clear_on_chosen_password(user=user)
        revoked = 0
        if logout_other_devices:
            from apps.platform_app.services import sessions as session_service

            revoked = session_service.revoke_all(user=user, except_session_id=current_session_id)
        write_audit(
            ctx=_ctx(user=user, request_id=request_id, ip=ip, user_agent=user_agent),
            action=AuditAction.PASSWORD_CHANGED if had_password else AuditAction.PASSWORD_SET,
            entity_type="platform_user",
            entity_id=user.pk,
            metadata={"sessions_revoked": revoked},
        )
    return {"sessions_revoked": revoked, "was_change": had_password}


def reset_password(
    *,
    user: Any,
    new_password: str,
    request_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> int:
    """The write half of `POST /auth/password/reset/confirm` — FR-5, BR-2, AC-3.

    Revokes **all** existing sessions. The caller then issues a fresh one, so the
    person who completed the reset stays logged in and everybody else does not.
    `permissions_version` is untouched (BR-2: permissions are unaffected).
    """
    from apps.platform_app.services import sessions as session_service

    value = validate(user=user, password=new_password)
    with transaction.atomic():
        from apps.platform_app.services import credentials

        user.set_password(value)
        user.save(update_fields=["password", "updated_at"])
        # A reset is equally a chosen password, so it lowers the DEC-012 gate
        # too. Without this, someone who used "Forgot password" rather than the
        # change screen would set a password that works and still be refused
        # every route by it.
        credentials.clear_on_chosen_password(user=user)
        revoked = session_service.revoke_all(user=user)
        write_audit(
            ctx=_ctx(user=user, request_id=request_id, ip=ip, user_agent=user_agent),
            action=AuditAction.PASSWORD_RESET,
            entity_type="platform_user",
            entity_id=user.pk,
            metadata={"sessions_revoked": revoked},
        )
    throttle.clear_all_for(
        identifier=user.email,
        scopes=(throttle.SCOPE_LOGIN_EMAIL, throttle.SCOPE_RESET_EMAIL),
    )
    return revoked


# ── Password login ───────────────────────────────────────────────────────────


def authenticate(
    *,
    identifier: str,
    password: str,
    ip: str | None = None,
    request_id: str | None = None,
) -> Any:
    """`POST /auth/login`. Returns the user, or raises the one generic error.

    The throttle counters are keyed on the **normalised** identifier, so an
    attacker cannot reset the counter by alternating `Ramesh@x.com` and
    `ramesh@x.com`: the caller normalises before this is reached.

    ── Both budgets count FAILURES, and both are read BEFORE the hash ────────
    Part 27 §27.4.2: "10 attempts per mobile per 10 min, then 15-minute
    lockout; 100 per IP per hour", and its "On success" row clears "every
    failed-attempt counter". The per-IP half is the same kind of budget — it is
    the credential-stuffing control of Part 27 T4 — so it is charged by a wrong
    password and never by a right one (NEW-4: it used to be charged on every
    attempt, and a shop-market NAT was locked out by its hundredth successful
    sign-in of the hour). Neither spec asks for a separate ceiling on total
    attempts, so there is none.

    The order is check-then-verify-then-record. Both locks are read first, and
    while either holds the password is not checked at all, so a locked-out
    caller cannot use 200-versus-429 as an oracle for a right guess. A success
    clears the per-ACCOUNT counter only: clearing the per-IP one would let a
    stuffer who owns one real account refill the budget by signing into it.
    """
    from apps.platform_app.models import User

    locked = throttle.check_lock(scope=throttle.SCOPE_LOGIN_EMAIL, identifier=identifier)
    if not locked.allowed:
        raise LoginThrottled(locked.retry_after)
    if ip:
        per_ip = throttle.check_lock(scope=throttle.SCOPE_LOGIN_IP, identifier=ip)
        if not per_ip.allowed:
            raise LoginThrottled(per_ip.retry_after)

    user = User.objects.filter(email=identifier).first()

    if _verify(user=user, password=password):
        throttle.clear(scope=throttle.SCOPE_LOGIN_EMAIL, identifier=identifier)
        return user

    # EC-6 / FR-1: an inactive user, an unknown address, an account with no
    # password and a wrong password are one outcome — one body, and, because
    # `_verify` computes exactly one password hash on every one of those paths,
    # one cost as well.
    throttle.record_failure(
        scope=throttle.SCOPE_LOGIN_EMAIL,
        identifier=identifier,
        threshold=throttle.LOGIN_FAILURES_PER_IDENTIFIER,
        window_seconds=throttle.LOGIN_FAILURE_WINDOW_SECONDS,
        lockout_seconds=throttle.LOGIN_LOCKOUT_SECONDS,
    )
    if ip:
        throttle.record_failure(
            scope=throttle.SCOPE_LOGIN_IP,
            identifier=ip,
            threshold=throttle.LOGIN_FAILURES_PER_IP,
            window_seconds=throttle.LOGIN_IP_WINDOW_SECONDS,
            lockout_seconds=throttle.LOGIN_IP_LOCKOUT_SECONDS,
        )
    _audit_login_failed(identifier=identifier, request_id=request_id, ip=ip)
    # The attempt that *reaches* the threshold is still an attempt, and it gets
    # the generic credential error like the nine before it. Part 27 §27.4.2 reads
    # "10 attempts per identifier per 10 min, **then** 15-minute lockout", and
    # PLT-02 FR-6 counts the 11th as the throttled one. The lock this failure may
    # have just set is enforced by `check_lock` at the top of the next call.
    raise InvalidCredentials()


def _verify(*, user: Any, password: str) -> bool:
    """Check `password` against `user`, spending exactly ONE hash whatever the outcome.

    The body of a failed login never says whether the address has an account;
    this makes the wall clock agree. With PBKDF2 at Django 5.2's 1,000,000
    iterations a hash is tens to hundreds of milliseconds, and it used to be
    computed only when the address belonged to an active user with a password —
    so "fast 401" meant "no such account" to anyone with a stopwatch. Every
    miss path now burns one hash of the supplied password with the CURRENT
    default hasher, which is the same work `user.check_password` does for a
    wrong password (Django's `ModelBackend` does the same thing for the same
    reason). The caller still reads both throttle locks first, so a locked-out
    caller never reaches this and never costs the server a hash.
    """
    value = normalise(password)
    if user is not None and user.is_active and user.has_usable_password():
        return bool(user.check_password(value))
    _burn_one_hash(value)
    return False


#: One dummy encoded password per (algorithm, work factor) of the default
#: hasher, made on first use. Keyed rather than a single value so a settings
#: change — a raised iteration count, a swapped hasher, `override_settings` in
#: a test — gets a dummy that costs what a real verification now costs.
_DUMMY_ENCODED: dict[tuple, str] = {}


def _burn_one_hash(value: str) -> None:
    """Compute exactly one password hash with the current default hasher, and discard it.

    The dummy is a hash of a random string, never of anything a caller sent, so
    it cannot match anybody's password (and the result is thrown away anyway).
    The first miss after start-up pays its one hash MAKING the dummy; every
    later miss pays it VERIFYING against the dummy — one hash either way.
    """
    hasher = get_hasher("default")
    key = (hasher.algorithm, getattr(hasher, "iterations", None), getattr(hasher, "rounds", None))
    encoded = _DUMMY_ENCODED.get(key)
    if encoded is None:
        _DUMMY_ENCODED[key] = make_password(get_random_string(32))
        return
    check_password(value, encoded)


def record_login(*, user: Any) -> None:
    """BR-6 / Part 27 §27.4.2: `last_login_at` on every successful login."""
    user.last_login_at = timezone.now()
    user.save(update_fields=["last_login_at", "updated_at"])


# ── Reset links (Part 27 §27.4.2 "Reset", PLT-02 FR-4/FR-5) ──────────────────


@dataclass(frozen=True, slots=True)
class ResetRequested:
    """What the view turns into `{expires_in, retry_after}`.

    There is no token and no id in it, and there never will be: a body that
    differs between a known and an unknown address is an enumeration oracle,
    and a body that carries the token is a reset anyone who can read the
    response can complete.
    """

    expires_in: int
    retry_after: int


def hash_reset_token(raw: str) -> str:
    """`sha256(raw)`, 64 hex chars — what `platform_auth_token.token_hash` stores."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _assert_reset_not_throttled(*, email: str, ip: str | None) -> None:
    per_email = throttle.consume(
        scope=throttle.SCOPE_RESET_EMAIL,
        identifier=email,
        limit=throttle.RESET_REQUESTS_PER_EMAIL,
        window_seconds=throttle.RESET_EMAIL_WINDOW_SECONDS,
        min_gap_seconds=throttle.RESET_RESEND_GAP_SECONDS,
    )
    if not per_email.allowed:
        raise RequestThrottled(per_email.retry_after, throttle.RESET_REQUESTS_PER_EMAIL)
    if ip:
        per_ip = throttle.consume(
            scope=throttle.SCOPE_RESET_IP,
            identifier=ip,
            limit=throttle.RESET_REQUESTS_PER_IP,
            window_seconds=throttle.RESET_IP_WINDOW_SECONDS,
        )
        if not per_ip.allowed:
            raise RequestThrottled(per_ip.retry_after, throttle.RESET_REQUESTS_PER_IP)


def request_reset(
    *,
    email: str,
    ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> ResetRequested:
    """`POST /auth/password/reset/request` (PLT-02 FR-4).

    The throttle is consumed and the answer is built **before** the user is
    looked up, and the return value is computed from settings alone, so the
    endpoint behaves identically for an address nobody has ever registered. The
    only difference an attacker could observe is the cost of one indexed
    `SELECT` and one send, which is why the send happens for known addresses
    only — a mail nobody asked for is worse than a timing channel this coarse.
    """
    from apps.platform_app.models import AuthToken, AuthTokenPurpose, User

    _assert_reset_not_throttled(email=email, ip=ip)
    ttl = int(settings.UB_RESET_TOKEN_TTL_SECONDS)
    answer = ResetRequested(expires_in=ttl, retry_after=throttle.RESET_RESEND_GAP_SECONDS)

    user = User.objects.filter(email=email, is_active=True).first()
    if user is None:
        return answer

    with transaction.atomic():
        # FR-4 / BR-2: asking again invalidates the link already in flight, so a
        # merchant who requests twice cannot be confused about which mail works,
        # and a token read from an old mail is dead.
        AuthToken.objects.filter(
            user=user, purpose=AuthTokenPurpose.PASSWORD_RESET, used_at__isnull=True
        ).update(used_at=timezone.now(), updated_at=timezone.now())
        raw = secrets.token_urlsafe(RESET_TOKEN_BYTES)
        token = AuthToken.objects.create(
            user=user,
            purpose=AuthTokenPurpose.PASSWORD_RESET,
            token_hash=hash_reset_token(raw),
            expires_at=timezone.now() + dt.timedelta(seconds=ttl),
            ip=ip,
            user_agent=(user_agent or "")[:255] or None,
        )

    _deliver_reset(user=user, raw=raw, ttl=ttl, token_id=token.id)
    write_audit(
        ctx=_ctx(user=user, request_id=request_id, ip=ip, user_agent=user_agent),
        action=AuditAction.PASSWORD_RESET_REQUESTED,
        entity_type="platform_user",
        entity_id=user.pk,
        metadata={"email_sha256": hashlib.sha256(email.encode()).hexdigest()},
    )
    return answer


def _deliver_reset(*, user: Any, raw: str, ttl: int, token_id: Any) -> Any:
    from apps.platform_app.services import messaging

    subject, body = messaging.render_reset_email(
        link=reset_link(raw),
        minutes=max(1, ttl // 60),
        app_name=APP_NAME,
        locale=user.locale or "en",
    )
    return messaging.send_email(
        to=user.email,
        subject=subject,
        body=body,
        template_code="password_reset",
        payload={"minutes": max(1, ttl // 60)},  # never the link, never the token
        related_type="platform_auth_token",
        related_id=token_id,
    )


APP_NAME = "DigiKhaato"


def reset_link(raw: str) -> str:
    """The URL the merchant clicks. `UB_PUBLIC_BASE_URL` is the frontend origin."""
    base = (settings.UB_PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/reset-password?token={raw}"


def consume_reset_token(*, token: str) -> Any:
    """Spend a reset token. Returns the user, or raises `validation_error`.

    Single-use and expiry are both enforced under `SELECT … FOR UPDATE`, so two
    concurrent confirms of the same link cannot both succeed. The refusal is one
    message for every reason — unknown, expired, already spent, belonging to a
    deactivated user — because distinguishing them tells a holder of a stale
    link something about the account behind it.
    """
    from apps.platform_app.models import AuthToken, AuthTokenPurpose

    invalid = ValidationFailed({"token": ["This reset link is no longer valid."]})
    if not token or not isinstance(token, str):
        raise invalid

    with transaction.atomic():
        row = (
            AuthToken.objects.select_for_update(of=("self",))
            .select_related("user")
            .filter(token_hash=hash_reset_token(token))
            .first()
        )
        if (
            row is None
            or row.purpose != AuthTokenPurpose.PASSWORD_RESET
            or row.used_at is not None
            or row.expires_at <= timezone.now()
            or not row.user.is_active
        ):
            raise invalid
        row.used_at = timezone.now()
        row.save(update_fields=["used_at", "updated_at"])
        return row.user


def _ctx(*, user: Any, request_id: str | None, ip: str | None, user_agent: str | None) -> Ctx:
    return Ctx(
        tenant=None,
        actor=user,
        actor_type="user",
        request_id=request_id or "",
        ip=ip,
        user_agent=user_agent,
    )


def _audit_login_failed(*, identifier: str, request_id: str | None, ip: str | None) -> None:
    write_audit(
        ctx=Ctx(tenant=None, actor=None, actor_type="system", request_id=request_id or "", ip=ip),
        action=AuditAction.LOGIN_FAILED,
        entity_type="platform_user",
        metadata={
            "method": "password",
            "identifier_sha256": hashlib.sha256(identifier.encode()).hexdigest(),
        },
    )
