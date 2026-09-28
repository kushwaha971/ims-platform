"""Registration, sign-in and the session that follows (PLT-01, PLT-02 FR-1).

This is the seam between "we believe who you are" and "here is a session".
Every path that establishes identity — registration, password login, password
reset, and the OTP verify that survives behind `UB_AUTH_OTP_ENABLED` — converges
on `start_session`, so `tenants[]`, `active_tenant_id`, the audit row and the
session row are produced once rather than four times.

**Email verification is plumbed and is not a gate.** `register` mints a
verification link when `UB_EMAIL_VERIFICATION_ENABLED` is on, and
`confirm_email` spends it, but nothing in `authenticate` or `start_session`
reads `email_verified_at`. Making it a gate needs an error code Part 22 §22.1.1
does not yet register (`member_email_unverified` is listed there as a Phase 2
spelling, not a registered code), and inventing one is exactly what the
registry exists to prevent. `CR-LOG` carries the request; until it lands, the
flag's whole effect is that the link is sent and the client is told the address
is unconfirmed.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.platform_app.selectors.memberships import active_membership, default_membership
from apps.platform_app.services import passwords, sessions, throttle

VERIFY_TOKEN_BYTES = 32


@dataclass(frozen=True, slots=True)
class LoggedIn:
    """What a view needs to build the response and set the cookies."""

    user: Any
    membership: Any | None
    tokens: sessions.IssuedTokens
    is_new: bool


def register(
    *,
    email: str,
    password: str,
    full_name: str = "",
    mobile: str | None = None,
    locale: str = "en",
    ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> Any:
    """Create the account. One `platform_user` per email (PLT-01 BR-1, DEC-010).

    There is no challenge step: at MVP an address is an identifier, not a proof,
    and pretending otherwise without a mail provider would have meant a sign-up
    nobody could complete. The password is validated before the row exists, so a
    refused password leaves no half-made account behind.

    A duplicate address is a `validation_error` on `email` — Part 22 §22.1.2
    rule 4 is explicit that `duplicate_*` spellings map to `validation_error`
    with the field in `details`. It does reveal that the address is taken, which
    is unavoidable for a sign-up form that has to say "you already have an
    account"; the *login* and *reset* endpoints, where enumeration actually
    costs something, reveal nothing.
    """
    from apps.platform_app.models import User

    if ip:
        per_ip = throttle.consume(
            scope=throttle.SCOPE_REGISTER_IP,
            identifier=ip,
            limit=throttle.REGISTRATIONS_PER_IP,
            window_seconds=throttle.REGISTER_IP_WINDOW_SECONDS,
        )
        if not per_ip.allowed:
            raise passwords.RequestThrottled(per_ip.retry_after, throttle.REGISTRATIONS_PER_IP)

    taken = ValidationFailed({"email": ["An account already exists for this email address."]})
    if User.objects.filter(email=email).exists():
        raise taken

    # `validate` reads `user.pk` and `user.mobile`, so it is given the unsaved
    # row rather than a `None`: the privileged 10-character floor cannot apply
    # to an account that holds no membership yet, and the "not the identifier"
    # rule must see the address being registered.
    candidate = User(email=email, mobile=mobile or None, full_name=full_name.strip()[:120])
    value = passwords.validate(user=candidate, password=password)

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                email=email,
                password=value,
                mobile=mobile or None,
                full_name=full_name.strip()[:120],
                locale=locale or "en",
            )
            write_audit(
                ctx=Ctx(
                    tenant=None,
                    actor=user,
                    actor_type="user",
                    request_id=request_id or "",
                    ip=ip,
                    user_agent=user_agent,
                ),
                action=AuditAction.USER_CREATED,
                entity_type="platform_user",
                entity_id=user.pk,
                metadata={"email_sha256": hashlib.sha256(email.encode()).hexdigest()},
            )
    except IntegrityError as exc:
        # Two sign-ups for one address raced past the `exists()` above. The
        # unique index is the thing that decides, and the loser gets the same
        # answer they would have got a millisecond earlier.
        if "uq_user_mobile_notnull" in str(exc):
            raise ValidationFailed(
                {"mobile": ["This mobile number is already on another account."]}
            ) from exc
        raise taken from exc

    if settings.UB_EMAIL_VERIFICATION_ENABLED:
        send_verification(user=user, ip=ip, user_agent=user_agent, request_id=request_id)
    return user


def get_or_create_user(*, mobile: str, locale: str = "en", request_id: str | None = None) -> tuple:
    """The OTP path's account creation. Reachable only when `UB_AUTH_OTP_ENABLED=1`.

    Kept because the OTP flow is retired, not deleted. A user created this way
    has no email, which the column now forbids, so one is synthesised from the
    number and marked unverified; the merchant sets a real one from the profile.
    A synthesised address can never receive mail and can never be signed in to
    by the reset flow, which is correct: the OTP account's proof is the number.
    """
    from apps.platform_app.models import User

    user = User.objects.filter(mobile=mobile).first()
    if user is not None:
        if user.locale != locale and locale:
            user.locale = locale
            user.save(update_fields=["locale", "updated_at"])
        return user, False

    user = User.objects.create_user(
        email=synthetic_email_for(mobile),
        password=None,
        mobile=mobile,
        full_name="",
        locale=locale,
    )
    write_audit(
        ctx=Ctx(tenant=None, actor=user, actor_type="user", request_id=request_id or ""),
        action=AuditAction.USER_CREATED,
        entity_type="platform_user",
        entity_id=user.pk,
        metadata={"mobile_sha256": hashlib.sha256(mobile.encode()).hexdigest()},
    )
    return user, True


def synthetic_email_for(mobile: str) -> str:
    """`+919876543210` → `919876543210@mobile.invalid`.

    `.invalid` is reserved by RFC 2606 §2 precisely so that an address built
    from it can never be routed anywhere by accident.
    """
    return f"{''.join(c for c in mobile if c.isdigit())}@mobile.invalid"


# ── Email verification (plumbed, off by default) ─────────────────────────────


def send_verification(
    *,
    user: Any,
    ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> Any:
    """Mint and deliver a verification link. Never a login gate — see the module docstring.

    Throttled like every other token-minting endpoint. This one needs it for a
    reason of its own as well as the usual ones: minting a link marks the
    previous link spent, so an attacker — or a client with a retry loop — can
    keep a merchant's in-flight link permanently dead just by asking for
    another.
    """
    from django.utils import timezone

    from apps.platform_app.models import AuthToken, AuthTokenPurpose
    from apps.platform_app.services import messaging

    decision = throttle.consume(
        scope=throttle.SCOPE_VERIFY_USER,
        identifier=str(user.id),
        limit=throttle.VERIFY_REQUESTS_PER_USER,
        window_seconds=throttle.VERIFY_USER_WINDOW_SECONDS,
        min_gap_seconds=throttle.VERIFY_RESEND_GAP_SECONDS,
    )
    if not decision.allowed:
        raise passwords.RequestThrottled(decision.retry_after, throttle.VERIFY_REQUESTS_PER_USER)

    ttl = int(settings.UB_VERIFY_TOKEN_TTL_SECONDS)
    with transaction.atomic():
        AuthToken.objects.filter(
            user=user, purpose=AuthTokenPurpose.EMAIL_VERIFY, used_at__isnull=True
        ).update(used_at=timezone.now(), updated_at=timezone.now())
        raw = secrets.token_urlsafe(VERIFY_TOKEN_BYTES)
        token = AuthToken.objects.create(
            user=user,
            purpose=AuthTokenPurpose.EMAIL_VERIFY,
            token_hash=passwords.hash_reset_token(raw),
            expires_at=timezone.now() + dt.timedelta(seconds=ttl),
            ip=ip,
            user_agent=(user_agent or "")[:255] or None,
        )

    subject, body = messaging.render_verify_email(
        link=verify_link(raw),
        hours=max(1, ttl // 3600),
        app_name=passwords.APP_NAME,
        locale=user.locale or "en",
    )
    messaging.send_email(
        to=user.email,
        subject=subject,
        body=body,
        template_code="email_verify",
        payload={"hours": max(1, ttl // 3600)},
        related_type="platform_auth_token",
        related_id=token.id,
    )
    write_audit(
        ctx=Ctx(
            tenant=None,
            actor=user,
            actor_type="user",
            request_id=request_id or "",
            ip=ip,
            user_agent=user_agent,
        ),
        action=AuditAction.EMAIL_VERIFY_REQUESTED,
        entity_type="platform_user",
        entity_id=user.pk,
        metadata={},
    )
    return token


def verify_link(raw: str) -> str:
    base = (settings.UB_PUBLIC_BASE_URL or "").rstrip("/")
    return f"{base}/verify-email?token={raw}"


def confirm_email(*, token: str, request_id: str | None = None, ip: str | None = None) -> Any:
    """Spend a verification token and stamp `email_verified_at`. Idempotent per token."""
    from django.utils import timezone

    from apps.platform_app.models import AuthToken, AuthTokenPurpose

    invalid = ValidationFailed({"token": ["This confirmation link is no longer valid."]})
    if not token or not isinstance(token, str):
        raise invalid

    with transaction.atomic():
        row = (
            AuthToken.objects.select_for_update(of=("self",))
            .select_related("user")
            .filter(token_hash=passwords.hash_reset_token(token))
            .first()
        )
        if (
            row is None
            or row.purpose != AuthTokenPurpose.EMAIL_VERIFY
            or row.used_at is not None
            or row.expires_at <= timezone.now()
            or not row.user.is_active
        ):
            raise invalid
        row.used_at = timezone.now()
        row.save(update_fields=["used_at", "updated_at"])
        user = row.user
        if user.email_verified_at is None:
            user.email_verified_at = timezone.now()
            user.save(update_fields=["email_verified_at", "updated_at"])
        write_audit(
            ctx=Ctx(tenant=None, actor=user, actor_type="user", request_id=request_id or "", ip=ip),
            action=AuditAction.EMAIL_VERIFIED,
            entity_type="platform_user",
            entity_id=user.pk,
            metadata={},
        )
    return user


# ── Sessions ─────────────────────────────────────────────────────────────────


def start_session(
    *,
    user: Any,
    method: str,
    tenant_id: Any = None,
    device_label: str | None = None,
    user_agent: str | None = None,
    ip: str | None = None,
    request_id: str | None = None,
    is_new: bool = False,
) -> LoggedIn:
    """Open a session and pick the landing tenant (PLT-01 FR-9, PLT-04 FR-9).

    Landing rule, in order: the tenant explicitly asked for (invitation accept
    routes this way), else the `is_default` membership, else the single active
    membership, else none — and "none" is a legitimate answer that routes the
    client to onboarding or to the chooser.
    """
    membership = None
    if tenant_id is not None:
        membership = active_membership(user=user, tenant_id=tenant_id)
    if membership is None:
        membership = default_membership(user=user)

    with transaction.atomic():
        issued = sessions.issue(
            user=user,
            tenant=membership.tenant if membership is not None else None,
            membership=membership,
            device_label=device_label,
            user_agent=user_agent,
            ip=ip,
        )
        passwords.record_login(user=user)
        write_audit(
            ctx=Ctx(
                tenant=membership.tenant if membership is not None else None,
                actor=user,
                actor_type="user",
                request_id=request_id or "",
                ip=ip,
                user_agent=user_agent,
            ),
            action=AuditAction.LOGIN_SUCCEEDED,
            entity_type="platform_session",
            entity_id=issued.session.id,
            metadata={"method": method, "device_label": issued.session.device_label},
        )
    return LoggedIn(user=user, membership=membership, tokens=issued, is_new=is_new)


def logout(
    *,
    user: Any,
    claims: dict,
    everywhere: bool = False,
    request_id: str | None = None,
    ip: str | None = None,
) -> int:
    """`POST /auth/logout` (`?all=true`) — Part 27 §27.4.3."""
    session = sessions.session_for_claims(user=user, claims=claims)
    if everywhere:
        revoked = sessions.revoke_all(user=user)
        # PLT-09 AC-3: "all my devices including this one are logged out" —
        # now, not when each device's access token runs out. The epoch is what
        # the authentication class compares on every request.
        from apps.platform_app.services.devices import bump_token_epoch

        bump_token_epoch(user=user)
    else:
        revoked = sessions.revoke(session=session) if session is not None else 0
    write_audit(
        ctx=Ctx(tenant=None, actor=user, actor_type="user", request_id=request_id or "", ip=ip),
        action=AuditAction.LOGGED_OUT,
        entity_type="platform_session",
        entity_id=session.id if session is not None else None,
        metadata={"all_devices": bool(everywhere), "sessions_revoked": revoked},
    )
    return revoked
