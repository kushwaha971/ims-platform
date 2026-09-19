"""Refresh families, rotation and revocation (Part 20 §20.5.2–§20.5.3, Part 27 §27.4.3).

One `platform_session` row per issued refresh token, chained by `family_id` and
`replaced_by_id`. Rotation is unconditional — there is no reuse window — and
presenting a refresh token that has already been rotated revokes **the entire
family**. That is the whole token-theft response at MVP and it is deliberate: it
costs a stolen-token holder the account immediately (Part 27 §27.4.4 step 2).

The session id is minted *before* the token, because the token carries `sid` and
the row stores `sha256(token)`; generating the id first is what lets both halves
be written in one pass instead of an insert followed by an update.
"""

from __future__ import annotations

import datetime as dt
import secrets
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.db.fields import uuid7
from apps.common.exceptions import BusinessRuleViolation
from apps.platform_app import tokens


@dataclass(frozen=True, slots=True)
class IssuedTokens:
    """Everything the view needs to answer a login, a refresh or a switch."""

    session: Any
    access: str
    refresh: str
    csrf: str


class InvalidToken(BusinessRuleViolation):
    def __init__(self) -> None:
        super().__init__("invalid_token", "Your session is not valid. Please sign in again.")


class SessionRevoked(BusinessRuleViolation):
    def __init__(self) -> None:
        super().__init__("session_revoked", "You were signed out. Please sign in again.")


def issue(
    *,
    user: Any,
    tenant: Any = None,
    membership: Any = None,
    device_label: str | None = None,
    user_agent: str | None = None,
    ip: str | None = None,
    family_id: Any = None,
) -> IssuedTokens:
    """Open a new session and mint the pair. A new `family_id` unless one is given."""
    from apps.platform_app.models import Session

    session_id = uuid7()
    family = family_id or uuid7()
    refresh = tokens.mint_refresh(user=user, session_id=session_id, family_id=family)

    session = Session.objects.create(
        id=session_id,
        user=user,
        tenant=tenant,
        family_id=family,
        token_hash=tokens.hash_token(refresh),
        device_label=(device_label or "")[:120] or None,
        user_agent=(user_agent or "")[:255] or None,
        ip=ip,
        expires_at=timezone.now() + dt.timedelta(days=settings.UB_REFRESH_TOKEN_DAYS),
    )
    access = tokens.mint_access(
        user=user,
        session_id=session_id,
        tenant_id=tenant.id if tenant is not None else None,
        role_code=membership.role.code if membership is not None else None,
        permissions_version=(membership.permissions_version if membership is not None else None),
    )
    return IssuedTokens(
        session=session, access=access, refresh=refresh, csrf=secrets.token_urlsafe(32)
    )


def rotate(
    *,
    raw_refresh: str,
    ip: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> IssuedTokens:
    """`POST /auth/refresh`. Rotates within the family; reuse kills the family.

    The shape of this function is dictated by one thing: **a revocation must
    survive the refusal that accompanies it.** Raising inside the transaction
    that performed the revocation rolls the revocation back, and the token-theft
    response of Part 20 §20.5.2 becomes a 401 and nothing else. So the refusal
    reasons are decided in a read pass, any revocation they imply is committed in
    its own transaction, and only then does the exception leave.
    """
    from apps.platform_app.models import Membership, MembershipStatus, Session

    try:
        claims = tokens.read_refresh(raw_refresh)
    except Exception as exc:  # noqa: BLE001 - any decode failure is one answer
        raise InvalidToken() from exc

    token_hash = tokens.hash_token(raw_refresh)

    with transaction.atomic():
        session = (
            # `of=("self",)` because `tenant` is nullable: the `select_related`
            # makes it a LEFT JOIN, and PostgreSQL refuses `FOR UPDATE` on the
            # nullable side of an outer join. The lock belongs on the session row
            # anyway — nothing here mutates the tenant or the user.
            Session.objects.select_for_update(of=("self",))
            .select_related("user", "tenant")
            .filter(token_hash=token_hash)
            .first()
        )
        if session is None:
            raise InvalidToken()

        reused = session.revoked_at is not None or session.replaced_by_id is not None
        expired = session.expires_at <= timezone.now()
        user, tenant = session.user, session.tenant
        stale_epoch = int(claims.get("epo", -1)) != int(user.token_epoch)
        membership = (
            Membership.objects.select_related("role", "tenant")
            .filter(user=user, tenant=tenant, status=MembershipStatus.ACTIVE)
            .first()
            if tenant is not None
            else None
        )
        lost_membership = tenant is not None and membership is None

        if not (reused or expired or stale_epoch or lost_membership or not user.is_active):
            issued = issue(
                user=user,
                tenant=tenant,
                membership=membership,
                device_label=session.device_label,
                user_agent=user_agent or session.user_agent,
                ip=ip or session.ip,
                family_id=session.family_id,
            )
            session.replaced_by = issued.session
            session.revoked_at = timezone.now()
            session.save(update_fields=["replaced_by", "revoked_at", "updated_at"])
            return issued

    if reused:
        # Part 20 §20.5.2 step 3 — the classic replay signal. Every device in
        # this family logs in again; that is the whole token-theft response at
        # MVP and it is deliberate.
        revoked = Session.objects.filter(
            family_id=session.family_id, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        _audit_family_reuse(session=session, revoked=revoked, request_id=request_id, ip=ip)
        raise SessionRevoked()

    if expired:
        raise InvalidToken()

    if lost_membership:
        # PLT-04 EC-1: the membership went away while the session lived.
        Session.objects.filter(pk=session.pk, revoked_at__isnull=True).update(
            revoked_at=timezone.now()
        )
    raise SessionRevoked()


def revoke(*, session: Any) -> int:
    """Revoke exactly one session. Returns the number of rows changed."""
    from apps.platform_app.models import Session

    return Session.objects.filter(pk=session.pk, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def revoke_all(*, user: Any, except_session_id: Any = None) -> int:
    """Revoke every live session of a user (`logout?all=true`, password reset)."""
    from apps.platform_app.models import Session

    qs = Session.objects.filter(user=user, revoked_at__isnull=True)
    if except_session_id is not None:
        qs = qs.exclude(pk=except_session_id)
    return qs.update(revoked_at=timezone.now())


def revoke_family(*, family_id: Any) -> int:
    from apps.platform_app.models import Session

    return Session.objects.filter(family_id=family_id, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )


def session_for_claims(*, user: Any, claims: dict) -> Any:
    """The live session a request's access token names, or `None`."""
    from apps.platform_app.models import Session

    sid = (claims or {}).get("sid")
    if not sid:
        return None
    return Session.objects.filter(pk=sid, user=user, revoked_at__isnull=True).first()


def _audit_family_reuse(
    *, session: Any, revoked: int, request_id: str | None, ip: str | None
) -> None:
    ctx = Ctx(
        tenant=session.tenant,
        actor=session.user,
        actor_type="user",
        request_id=request_id or "",
        ip=ip,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.REFRESH_REUSE_DETECTED,
        entity_type="platform_session",
        entity_id=session.id,
        metadata={"family_id": str(session.family_id), "sessions_revoked": revoked},
    )
