"""The OTP challenge (PLT-01 FR-2…FR-7, Part 20 §20.5.4, Part 27 §27.4.1).

Two entry points, both of which take Python values and return Python values:
`request_otp` and `consume_challenge`. Nothing here knows about HTTP.

The properties this module exists to hold:

* the code never appears in a response, in any environment (Part 27 §27.4.1);
* the response to `request_otp` is identical for a known and an unknown mobile,
  so the endpoint cannot be used to enumerate accounts (PLT-01 FR-2, BR-2);
* comparison is constant time (`hmac.compare_digest`);
* a verified challenge is single-use (BR-3);
* only the newest unexpired challenge for a (mobile, purpose) is valid — an
  older one answers `superseded` rather than succeeding (EC-4);
* expiry is evaluated server-side only, so a skewed client clock changes nothing
  (EC-3).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.exceptions import BusinessRuleViolation
from apps.platform_app.constants import OtpPurpose
from apps.platform_app.services import throttle

CODE_LENGTH = 6
RESEND_AFTER_SECONDS = throttle.OTP_RESEND_GAP_SECONDS


@dataclass(frozen=True, slots=True)
class OtpIssued:
    """What the view turns into `{challenge_id, expires_in, retry_after}`."""

    challenge_id: Any
    expires_in: int
    retry_after: int


class OtpThrottled(BusinessRuleViolation):
    """429 `otp_throttled` — per-mobile, per-IP, or the §27.4.1 lockout."""

    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "otp_throttled",
            "Too many attempts. Please try again later.",
            details={"retry_after": int(retry_after)},
        )


class OtpInvalid(BusinessRuleViolation):
    """400 `otp_invalid` — always carries `attempts_left` and a `reason`."""

    def __init__(self, reason: str, attempts_left: int = 0) -> None:
        super().__init__(
            "otp_invalid",
            "Incorrect or expired code.",
            details={"reason": reason, "attempts_left": int(attempts_left)},
        )


def hash_code(code: str) -> str:
    """`sha256(code + UB_OTP_PEPPER)` (Part 27 §27.4.1).

    The pepper is a distinct secret from `SECRET_KEY`, so a leaked database
    gives no ability to pre-compute OTP hashes.
    """
    return hashlib.sha256(f"{code}{settings.UB_OTP_PEPPER}".encode()).hexdigest()


def generate_code() -> str:
    """Six digits from `secrets.randbelow` — never `random`, never `000000`.

    PLT-01 BR-4 forbids the all-zero code because it is the value a broken
    generator produces and the value a guesser tries first.
    """
    while True:
        code = f"{secrets.randbelow(10**CODE_LENGTH):0{CODE_LENGTH}d}"
        if code != "0" * CODE_LENGTH:
            return code


def _assert_not_throttled(*, mobile: str, ip: str | None) -> None:
    """Order matters: the lockout is checked before any counter is consumed."""
    locked = throttle.check_lock(scope=throttle.SCOPE_OTP_FAILURES, identifier=mobile)
    if not locked.allowed:
        raise OtpThrottled(locked.retry_after)

    per_mobile = throttle.consume(
        scope=throttle.SCOPE_OTP_MOBILE,
        identifier=mobile,
        limit=throttle.OTP_REQUESTS_PER_MOBILE,
        window_seconds=throttle.OTP_REQUEST_WINDOW_SECONDS,
        min_gap_seconds=RESEND_AFTER_SECONDS,
    )
    if not per_mobile.allowed:
        raise OtpThrottled(per_mobile.retry_after)

    if ip:
        per_ip = throttle.consume(
            scope=throttle.SCOPE_OTP_IP,
            identifier=ip,
            limit=throttle.OTP_REQUESTS_PER_IP,
            window_seconds=throttle.OTP_IP_WINDOW_SECONDS,
        )
        if not per_ip.allowed:
            raise OtpThrottled(per_ip.retry_after)


def request_otp(
    *,
    mobile: str,
    purpose: str,
    ip: str | None = None,
    device_hint: str | None = None,
    locale: str = "en",
    request_id: str | None = None,
) -> OtpIssued:
    """Create a challenge and dispatch the code. Never reveals whether the mobile exists."""
    from apps.platform_app.models import OtpChallenge
    from apps.platform_app.services.messaging import render_otp_sms, send_sms

    _assert_not_throttled(mobile=mobile, ip=ip)

    ttl = int(settings.UB_OTP_TTL_SECONDS)
    code = generate_code()

    with transaction.atomic():
        challenge = OtpChallenge.objects.create(
            mobile=mobile,
            purpose=purpose,
            code_hash=hash_code(code),
            attempts=0,
            expires_at=timezone.now() + dt.timedelta(seconds=ttl),
            ip=ip,
            device_hint=(device_hint or "")[:120] or None,
        )

    send_sms(
        to=mobile,
        body=render_otp_sms(
            code=code,
            minutes=max(1, ttl // 60),
            app_name=_app_name(),
            locale=locale,
        ),
        template_code="otp",
        payload={"purpose": purpose, "minutes": max(1, ttl // 60)},
        related_type="platform_otp_challenge",
        related_id=challenge.id,
    )

    _audit(
        AuditAction.OTP_REQUESTED,
        mobile=mobile,
        request_id=request_id,
        ip=ip,
        metadata={"purpose": purpose, "challenge_id": str(challenge.id)},
    )
    return OtpIssued(challenge_id=challenge.id, expires_in=ttl, retry_after=RESEND_AFTER_SECONDS)


def consume_challenge(
    *,
    challenge_id: Any,
    code: str,
    purpose: str | None = None,
    request_id: str | None = None,
    ip: str | None = None,
) -> Any:
    """Verify and burn a challenge. Returns the `OtpChallenge` on success.

    The whole check runs under `SELECT … FOR UPDATE` on the challenge row, so
    two concurrent verifies of the same challenge cannot both succeed and cannot
    both write `attempts + 1` over each other (Part 20 §20.5.4).
    """
    from apps.platform_app.models import OtpChallenge

    max_attempts = int(settings.UB_OTP_MAX_ATTEMPTS)

    with transaction.atomic():
        challenge = (
            OtpChallenge.objects.select_for_update().filter(pk=challenge_id).first()
            if _looks_like_uuid(challenge_id)
            else None
        )
        if challenge is None:
            raise OtpInvalid("not_found")
        if purpose is not None and challenge.purpose != purpose:
            raise OtpInvalid("wrong_purpose")
        if challenge.verified_at is not None:
            raise OtpInvalid("used")
        if challenge.expires_at <= timezone.now():
            raise OtpInvalid("expired")
        if challenge.attempts >= max_attempts:
            raise OtpInvalid("burned", attempts_left=0)
        if _is_superseded(challenge):
            raise OtpInvalid("superseded")

        if not hmac.compare_digest(challenge.code_hash, hash_code(str(code))):
            challenge.attempts += 1
            burned = challenge.attempts >= max_attempts
            if burned:
                # Part 27 §27.4.1: the 5th failure burns the challenge.
                challenge.verified_at = timezone.now()
            challenge.save(update_fields=["attempts", "verified_at", "updated_at"])
            attempts_left = max(0, max_attempts - challenge.attempts)
            failed_mobile, failed_purpose = challenge.mobile, challenge.purpose
        else:
            challenge.verified_at = timezone.now()
            challenge.save(update_fields=["verified_at", "updated_at"])
            throttle.clear_all_for(
                identifier=challenge.mobile,
                scopes=(throttle.SCOPE_OTP_FAILURES, throttle.SCOPE_OTP_MOBILE),
            )
            return challenge

    # Outside the transaction: a failure counter must survive the caller's rollback.
    throttle.record_failure(
        scope=throttle.SCOPE_OTP_FAILURES,
        identifier=failed_mobile,
        threshold=throttle.OTP_FAILURES_BEFORE_LOCKOUT,
        window_seconds=throttle.OTP_FAILURE_WINDOW_SECONDS,
        lockout_seconds=throttle.OTP_LOCKOUT_SECONDS,
    )
    _audit(
        AuditAction.OTP_FAILED,
        mobile=failed_mobile,
        request_id=request_id,
        ip=ip,
        metadata={"purpose": failed_purpose, "attempts_left": attempts_left},
    )
    # FR-6 is explicit that the fifth wrong code is `400 otp_invalid` with
    # `attempts_left=0`, not a 429 — the UI offers "Request a new code" off the
    # back of it. The lockout this failure may have just set is enforced by
    # `_assert_not_throttled` on the next *request*, which is where Part 27
    # §27.4.1 puts it ("further `otp/request` calls return 429").
    raise OtpInvalid("incorrect", attempts_left=attempts_left)


def _is_superseded(challenge: Any) -> bool:
    """EC-4: only the newest unexpired, unverified challenge of a pair is valid."""
    from apps.platform_app.models import OtpChallenge

    return (
        OtpChallenge.objects.filter(
            mobile=challenge.mobile,
            purpose=challenge.purpose,
            verified_at__isnull=True,
            expires_at__gt=timezone.now(),
            created_at__gt=challenge.created_at,
        )
        .exclude(pk=challenge.pk)
        .exists()
    )


def _looks_like_uuid(value: Any) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return False
    return True


def _app_name() -> str:
    return "YourKhata"


def _audit(
    action: str,
    *,
    mobile: str,
    request_id: str | None,
    ip: str | None,
    metadata: dict,
) -> None:
    """Auth audit rows carry `tenant = NULL` and a **hashed** mobile (§16, §19)."""
    from apps.common.context import Ctx

    ctx = Ctx(
        tenant=None,
        actor=None,
        actor_type="system",
        request_id=request_id or "",
        ip=ip,
    )
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="platform_user",
        entity_id=None,
        metadata={"mobile_sha256": hashlib.sha256(mobile.encode()).hexdigest(), **metadata},
    )


__all__ = [
    "OtpIssued",
    "OtpInvalid",
    "OtpPurpose",
    "OtpThrottled",
    "RESEND_AFTER_SECONDS",
    "consume_challenge",
    "generate_code",
    "hash_code",
    "request_otp",
]
