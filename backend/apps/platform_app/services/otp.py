"""The OTP challenge (PLT-01 FR-2…FR-7, Part 20 §20.5.4, Part 27 §27.4.1).

Two entry points, both of which take Python values and return Python values:
`request_otp` and `consume_challenge`. Nothing here knows about HTTP.

The properties this module exists to hold:

* **Message Central issues and checks the code** (DEC-014): with
  `UB_OTP_PROVIDER=message_central` this module never sees a code it did not
  just receive from the person typing it, and stores only the provider's
  `verificationId`. The `console` provider — local runs, tests, e2e — makes a
  code here and prints it in the API log, because nobody is texted there;
* the code never appears in a response, in any environment (Part 27 §27.4.1);
* the provider's `verificationId` never appears in a response either: the
  browser holds our `challenge_id`, which binds the mobile, the attempts and
  the single use to it;
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
from apps.platform_app.services import fast2sms, message_central, meta_whatsapp, throttle

# Message Central's default length; the console provider matches it.
CODE_LENGTH = 4
RESEND_AFTER_SECONDS = throttle.OTP_RESEND_GAP_SECONDS


@dataclass(frozen=True, slots=True)
class OtpIssued:
    """What the view turns into `{challenge_id, expires_in, retry_after, code_length, channel}`.

    `code_length` and `channel` are here because the provider is chosen when the
    server RUNS (`UB_OTP_PROVIDER`), and the sign-in screen used to guess both
    when the site was BUILT. A build that guessed six while the server sent four
    was a sign-in screen nobody could get past (review G2, 12 Oct 2026).
    """

    challenge_id: Any
    expires_in: int
    retry_after: int
    code_length: int = 4
    channel: str = "sms"


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


class OtpNotSent(BusinessRuleViolation):
    """502 `provider_error` — the code could not be sent, or could not be checked."""

    def __init__(
        self,
        message: str = "We couldn't send the code right now. Please try again in a few minutes.",
    ) -> None:
        super().__init__("provider_error", message)


PROVIDER_MESSAGE_CENTRAL = "message_central"
PROVIDER_CONSOLE = "console"
PROVIDER_FAST2SMS = "fast2sms"
PROVIDER_META = "meta_whatsapp"


def _provider() -> str:
    """Fast2SMS is explicit and fails closed when its credentials are absent."""
    if getattr(settings, "UB_OTP_PROVIDER", PROVIDER_CONSOLE) == PROVIDER_META:
        return PROVIDER_META
    if getattr(settings, "UB_OTP_PROVIDER", PROVIDER_CONSOLE) == PROVIDER_FAST2SMS:
        return PROVIDER_FAST2SMS
    if (
        getattr(settings, "UB_OTP_PROVIDER", PROVIDER_CONSOLE) == PROVIDER_MESSAGE_CENTRAL
        and message_central.is_configured()
    ):
        return PROVIDER_MESSAGE_CENTRAL
    return PROVIDER_CONSOLE


# Direct Meta codes are six digits and are delivered on WhatsApp;
# every other provider sends our four digits (or Message Central's) by SMS.
META_CODE_LENGTH = 6


def code_shape() -> tuple[int, str]:
    """`(digits, channel)` for the provider this server is running with now."""
    if _provider() == PROVIDER_META:
        return META_CODE_LENGTH, "whatsapp"
    return CODE_LENGTH, "sms"


def _send_console_code(
    *, mobile: str, code: str, ttl: int, locale: str, purpose: str, challenge: Any
) -> None:
    """The local provider: the code goes to the API log through the SMS adapter."""
    from apps.platform_app.services.messaging import render_otp_sms, send_sms

    sent = send_sms(
        to=mobile,
        body=render_otp_sms(
            code=code, minutes=max(1, ttl // 60), app_name=_app_name(), locale=locale
        ),
        template_code="otp",
        payload={"purpose": purpose, "minutes": max(1, ttl // 60)},
        related_type="platform_otp_challenge",
        related_id=challenge.id,
    )
    if getattr(sent, "status", "sent") == "failed":
        raise message_central.MessageCentralError("The SMS adapter refused the code.")


def hash_code(code: str) -> str:
    """`sha256(code + UB_OTP_PEPPER)` (Part 27 §27.4.1).

    The pepper is a distinct secret from `SECRET_KEY`, so a leaked database
    gives no ability to pre-compute OTP hashes.
    """
    return hashlib.sha256(f"{code}{settings.UB_OTP_PEPPER}".encode()).hexdigest()


def generate_code() -> str:
    """The CONSOLE provider's code — `secrets.randbelow`, never `random`, never all zeroes.

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

    if _provider() in (
        PROVIDER_FAST2SMS,
        PROVIDER_MESSAGE_CENTRAL,
        PROVIDER_META,
    ) and purpose not in (
        OtpPurpose.LOGIN,
        OtpPurpose.SIGNUP,
    ):
        raise OtpNotSent("SMS OTP is available only for sign-in and sign-up.")
    _assert_not_throttled(mobile=mobile, ip=ip)

    ttl = int(settings.UB_OTP_TTL_SECONDS)
    provider = _provider()
    via_message_central = provider == PROVIDER_MESSAGE_CENTRAL
    external_code = via_message_central
    code = "" if external_code else (f"{secrets.randbelow(900000) + 100000}" if provider == PROVIDER_META else generate_code())

    with transaction.atomic():
        challenge = OtpChallenge.objects.create(
            mobile=mobile,
            purpose=purpose,
            code_hash="" if external_code else hash_code(code),
            attempts=0,
            expires_at=timezone.now() + dt.timedelta(seconds=ttl),
            ip=ip,
            device_hint=(device_hint or "")[:120] or None,
        )

    # The provider call is made with no transaction open, so no row lock is
    # held across an HTTP exchange (Part 20 §20.11.2).
    #
    # A code that was not sent must not answer 200: the owner's own first
    # sign-up (10 Oct 2026) sat on "Enter the code" waiting for a text the
    # provider had refused. The refusal is the same for every number, so it
    # says nothing about whether the mobile has an account. The challenge is
    # spent rather than deleted so the resend gap and the hourly budgets still
    # count the attempt.
    try:
        if via_message_central:
            verification_id = message_central.send_otp(mobile)
            OtpChallenge.objects.filter(pk=challenge.pk).update(
                provider_verification_id=verification_id
            )
        elif provider == PROVIDER_META:
            meta_whatsapp.send_otp(mobile, code)
        elif provider == PROVIDER_FAST2SMS:
            fast2sms.send_otp(mobile, code)
        else:
            _send_console_code(
                mobile=mobile,
                code=code,
                ttl=ttl,
                locale=locale,
                purpose=purpose,
                challenge=challenge,
            )
    except (
        message_central.MessageCentralError,
        fast2sms.Fast2SmsError,
        meta_whatsapp.MetaWhatsAppError,
    ) as exc:
        OtpChallenge.objects.filter(pk=challenge.pk).update(expires_at=timezone.now())
        if getattr(exc, "code", None) == message_central.REQUEST_ALREADY_EXISTS:
            # They hold their own 60-second gap; ours matches it, so this is a
            # race or a clock difference. Same answer as our own throttle.
            raise OtpThrottled(RESEND_AFTER_SECONDS) from exc
        raise OtpNotSent() from exc

    _audit(
        AuditAction.OTP_REQUESTED,
        mobile=mobile,
        request_id=request_id,
        ip=ip,
        metadata={"purpose": purpose, "challenge_id": str(challenge.id)},
    )
    length, channel = code_shape()
    return OtpIssued(
        challenge_id=challenge.id,
        expires_in=ttl,
        retry_after=RESEND_AFTER_SECONDS,
        code_length=length,
        channel=channel,
    )


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

    def checked(row: Any) -> Any:
        """Every refusal that needs no code: missing, spent, expired, burned, superseded."""
        if row is None:
            raise OtpInvalid("not_found")
        if purpose is not None and row.purpose != purpose:
            raise OtpInvalid("wrong_purpose")
        if row.verified_at is not None:
            raise OtpInvalid("used")
        if row.expires_at <= timezone.now():
            raise OtpInvalid("expired")
        if row.attempts >= max_attempts:
            raise OtpInvalid("burned", attempts_left=0)
        if _is_superseded(row):
            raise OtpInvalid("superseded")
        return row

    known = _looks_like_uuid(challenge_id)

    # Message Central checks its own codes, over HTTP, so that question is
    # asked BEFORE the row is locked (Part 20 §20.11.2: no lock across a
    # provider call). The same refusals run first, so a spent or expired
    # challenge never costs a provider request; they run again under the lock.
    provider_answer: message_central.Validation | None = None
    if known:
        peek = checked(OtpChallenge.objects.filter(pk=challenge_id).first())
        if peek.provider_verification_id:
            try:
                provider_answer = message_central.validate_otp(
                    peek.mobile, peek.provider_verification_id, str(code)
                )
            except message_central.MessageCentralError as exc:
                # Not the person's mistake: no attempt is counted against them.
                raise OtpNotSent(
                    "We couldn't check the code right now. Please try again in a moment."
                ) from exc

    with transaction.atomic():
        challenge = checked(
            OtpChallenge.objects.select_for_update().filter(pk=challenge_id).first()
            if known
            else None
        )

        if provider_answer is not None:
            matches = provider_answer.verified
            # Their word on why not ("expired" above all) is truer than ours.
            failure_reason = provider_answer.reason or "incorrect"
        else:
            matches = bool(challenge.code_hash) and hmac.compare_digest(
                challenge.code_hash, hash_code(str(code))
            )
            failure_reason = "incorrect"

        if not matches:
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
    raise OtpInvalid(failure_reason, attempts_left=attempts_left)


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
    "OtpNotSent",
    "OtpPurpose",
    "OtpThrottled",
    "RESEND_AFTER_SECONDS",
    "consume_challenge",
    "generate_code",
    "hash_code",
    "request_otp",
]
