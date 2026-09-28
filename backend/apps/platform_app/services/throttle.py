"""Durable rate limiting and lockout (Part 27 §27.4.1, Part 22 §22.1).

Every counter that has to be *correct* lives in PostgreSQL, not in
`LocMemCache`: there is no shared cache (ADR-012) and a per-process counter is
bypassed by opening a second connection to a second gunicorn worker. DRF's
throttle classes remain in place for the cosmetic per-user ceiling; this module
is what the authentication endpoints actually enforce.

Identifiers are hashed before storage (Part 27 §27.7.3) — a leaked
`platform_rate_limit` is not a phone book.

Every function here takes and returns Python values and opens its own short
transaction. Callers must not hold the counter row across their own work: the
counter is deliberately outside the business transaction so that a rolled-back
attempt still counts as an attempt.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

# ── Scopes (Part 22 §22.1 rate limits, Part 27 §27.4.1/§27.4.2) ──────────────
#
# Part 27 §27.4.2 writes its budgets "per mobile" because it was written when
# the identifier was a mobile number. DEC-010 changes the identifier, not the
# budget: the numbers below are Part 27's, keyed on the email address instead.
SCOPE_LOGIN_EMAIL = "login_email"  # 10 per identifier per 10 min → 15 min lockout
# NEW-4: FAILED logins per IP. Was `login_ip`, charged on every attempt, so a
# shared NAT was locked out by its hundredth *successful* sign-in of the hour.
# The scope was renamed with the meaning so that `login_ip` rows written by the
# old rule — counts of successes — are inert rather than an instant lockout.
SCOPE_LOGIN_IP = "login_ip_fail"  # 100 failures per IP per hour → locked for the hour
SCOPE_RESET_EMAIL = "reset_email"  # 5 per address per hour, 60 s apart
SCOPE_RESET_IP = "reset_ip"  # 20 per IP per hour
SCOPE_REGISTER_IP = "register_ip"  # 20 sign-ups per IP per hour
SCOPE_RESET_CONFIRM_IP = "reset_confirm_ip"  # 30 link confirmations per IP per hour
SCOPE_VERIFY_USER = "verify_user"  # 5 verification links per user per hour, 60 s apart

# Reachable only when `UB_AUTH_OTP_ENABLED=1` (DEC-010).
SCOPE_OTP_MOBILE = "otp_mobile"  # 5 per mobile per 10 min
SCOPE_OTP_IP = "otp_ip"  # 20 per IP per hour
SCOPE_OTP_FAILURES = "otp_fail"  # 5 failed challenges/hour → 30 min lockout

OTP_REQUESTS_PER_MOBILE = 5
OTP_REQUEST_WINDOW_SECONDS = 600
OTP_REQUESTS_PER_IP = 20
OTP_IP_WINDOW_SECONDS = 3600
OTP_RESEND_GAP_SECONDS = 30  # PLT-01 FR-7 "Resend is allowed after retry_after"

OTP_FAILURES_BEFORE_LOCKOUT = 5
OTP_FAILURE_WINDOW_SECONDS = 3600
OTP_LOCKOUT_SECONDS = 1800

LOGIN_FAILURES_PER_IDENTIFIER = 10
LOGIN_FAILURE_WINDOW_SECONDS = 600
LOGIN_LOCKOUT_SECONDS = 900
LOGIN_FAILURES_PER_IP = 100
LOGIN_IP_WINDOW_SECONDS = 3600
LOGIN_IP_LOCKOUT_SECONDS = 3600

RESET_REQUESTS_PER_EMAIL = 5
RESET_EMAIL_WINDOW_SECONDS = 3600
RESET_RESEND_GAP_SECONDS = 60
RESET_REQUESTS_PER_IP = 20
RESET_IP_WINDOW_SECONDS = 3600

REGISTRATIONS_PER_IP = 20
REGISTER_IP_WINDOW_SECONDS = 3600

# `POST /auth/password/reset/confirm` was the one unauthenticated auth route
# with no budget. A 256-bit link is not guessable, so this is not about
# guessing: each accepted confirm costs a full password hash, and each refused
# one a token lookup, so it bounds what one address can make the server do.
RESET_CONFIRMS_PER_IP = 30
RESET_CONFIRM_IP_WINDOW_SECONDS = 3600

# `POST /auth/email/verify/request` mints a link and invalidates the previous
# one, so an unthrottled loop is both a mail amplifier and a way to keep a
# merchant's in-flight link permanently dead. Same shape as the reset budget,
# keyed on the caller's own user id — the endpoint is authenticated and
# self-only, so there is nothing to enumerate and no IP dimension to add.
VERIFY_REQUESTS_PER_USER = 5
VERIFY_USER_WINDOW_SECONDS = 3600
VERIFY_RESEND_GAP_SECONDS = 60


@dataclass(frozen=True, slots=True)
class Decision:
    """`allowed=False` always carries the seconds the caller must wait."""

    allowed: bool
    retry_after: int = 0
    count: int = 0


def digest(identifier: str) -> str:
    """The stored key. Never the raw mobile number or IP."""
    return hashlib.sha256(identifier.encode("utf-8")).hexdigest()


def _model() -> Any:
    from apps.platform_app.models import RateLimit

    return RateLimit


def _seconds(delta: dt.timedelta) -> int:
    return max(1, int(delta.total_seconds() + 0.999))


def check_lock(*, scope: str, identifier: str, now: dt.datetime | None = None) -> Decision:
    """Is this (scope, identifier) currently locked out? No counter is consumed."""
    now = now or timezone.now()
    row = _model().objects.filter(scope=scope, key=digest(identifier)).first()
    if row is None or row.locked_until is None or row.locked_until <= now:
        return Decision(allowed=True)
    return Decision(allowed=False, retry_after=_seconds(row.locked_until - now), count=row.count)


def consume(
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
    min_gap_seconds: int = 0,
    now: dt.datetime | None = None,
) -> Decision:
    """Count one attempt against a fixed window. Refuses when the window is full.

    The row is locked `FOR UPDATE` so two workers cannot both see `count = 4`
    and both write `5`. The window is fixed rather than sliding because a fixed
    window is the one a user can be told the truth about ("try again in N
    seconds") without a second query.
    """
    now = now or timezone.now()
    key = digest(identifier)
    model = _model()
    window = dt.timedelta(seconds=window_seconds)

    with transaction.atomic():
        row, _created = model.objects.get_or_create(
            scope=scope,
            key=key,
            defaults={"window_start": now, "count": 0},
        )
        row = model.objects.select_for_update().get(pk=row.pk)

        if row.locked_until and row.locked_until > now:
            return Decision(False, _seconds(row.locked_until - now), row.count)

        if now - row.window_start >= window:
            row.window_start, row.count = now, 0

        if min_gap_seconds and row.last_hit_at:
            elapsed = now - row.last_hit_at
            if elapsed < dt.timedelta(seconds=min_gap_seconds):
                gap = dt.timedelta(seconds=min_gap_seconds) - elapsed
                return Decision(False, _seconds(gap), row.count)

        if row.count >= limit:
            return Decision(False, _seconds(row.window_start + window - now), row.count)

        row.count += 1
        row.last_hit_at = now
        row.save(update_fields=["window_start", "count", "last_hit_at", "updated_at"])
        return Decision(True, 0, row.count)


def record_failure(
    *,
    scope: str,
    identifier: str,
    threshold: int,
    window_seconds: int,
    lockout_seconds: int,
    now: dt.datetime | None = None,
) -> Decision:
    """Count a *failure* and lock the identifier out once the threshold is met.

    Returns the lock decision that now applies: `allowed=False` means the caller
    is locked out from this moment, which is what Part 27 §27.4.1's "after 5
    failed challenges … further calls return 429 for 30 minutes" describes.
    """
    now = now or timezone.now()
    key = digest(identifier)
    model = _model()
    window = dt.timedelta(seconds=window_seconds)

    with transaction.atomic():
        row, _created = model.objects.get_or_create(
            scope=scope,
            key=key,
            defaults={"window_start": now, "count": 0},
        )
        row = model.objects.select_for_update().get(pk=row.pk)

        if now - row.window_start >= window and not (row.locked_until and row.locked_until > now):
            row.window_start, row.count = now, 0

        row.count += 1
        row.last_hit_at = now
        if row.count >= threshold:
            row.locked_until = now + dt.timedelta(seconds=lockout_seconds)
        row.save(
            update_fields=["window_start", "count", "last_hit_at", "locked_until", "updated_at"]
        )

    if row.locked_until and row.locked_until > now:
        return Decision(False, _seconds(row.locked_until - now), row.count)
    return Decision(True, 0, row.count)


def clear(*, scope: str, identifier: str) -> None:
    """Forget the counter. Part 27 §27.4.2: a successful login clears them all."""
    _model().objects.filter(scope=scope, key=digest(identifier)).delete()


def clear_all_for(*, identifier: str, scopes: tuple[str, ...]) -> None:
    _model().objects.filter(scope__in=scopes, key=digest(identifier)).delete()
