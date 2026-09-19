"""Minting and reading the access / refresh pair (Part 20 §20.5.1, Part 22 §22.2).

This module is deliberately *not* under `services/`: rule D6 forbids a service
importing the HTTP layer, and `rest_framework_simplejwt` matches the check that
enforces it. Minting a JWT is a pure string operation over Python values, so the
services import this module and nothing about it reaches back into HTTP.

| Token | Lifetime | Claims |
|---|---|---|
| access | 15 min | `sub`, `tid`, `rol`, `sid`, `ver`, `epo`, `typ="access"`, `exp`, `iat`, `jti` |
| refresh | 30 d | `sub`, `sid`, `fam`, `epo`, `typ="refresh"`, `exp`, `jti` |

`epo` is `platform_user.token_epoch`. Part 21 §21.3.1 requires that "access
tokens carry the epoch they were minted under; the authentication class rejects
a token whose epoch is behind the row" — it is the only mechanism that cuts an
access token before its fifteen minutes elapse — but Part 20 §20.5.1's claim
table does not name the claim. `epo` is the spelling this repository uses and
`CR-LOG` carries the request to add it to that table.
"""

from __future__ import annotations

import hashlib
from typing import Any

from django.conf import settings
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

ACCESS_COOKIE = "ub_access"
REFRESH_COOKIE = "ub_refresh"
CSRF_COOKIE = "ub_csrf"
REFRESH_COOKIE_PATH = "/api/v1/auth/refresh"


def hash_token(raw: str) -> str:
    """`platform_session.token_hash` — sha256 hex, 64 chars (Part 21 §21.3.1)."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def mint_access(
    *,
    user: Any,
    session_id: Any,
    tenant_id: Any = None,
    role_code: str | None = None,
    permissions_version: int | None = None,
    impersonated_tenant_id: Any = None,
) -> str:
    """The 15-minute access token. `tid` is absent when the user has no tenant."""
    token = AccessToken.for_user(user)
    token["sid"] = str(session_id)
    token["epo"] = int(user.token_epoch)
    if tenant_id is not None:
        token["tid"] = str(tenant_id)
    if role_code is not None:
        token["rol"] = role_code
    if permissions_version is not None:
        token["ver"] = int(permissions_version)
    if impersonated_tenant_id is not None:
        token["imp"] = str(impersonated_tenant_id)
    return str(token)


def mint_refresh(*, user: Any, session_id: Any, family_id: Any) -> str:
    """The 30-day refresh token. Its sha256 is what `platform_session` stores."""
    token = RefreshToken()
    token[settings.SIMPLE_JWT["USER_ID_CLAIM"]] = str(user.pk)
    token["sid"] = str(session_id)
    token["fam"] = str(family_id)
    token["epo"] = int(user.token_epoch)
    return str(token)


def read_refresh(raw: str) -> dict:
    """Validate signature and expiry; return the claims. Raises on anything else."""
    return dict(RefreshToken(raw).payload)


def set_auth_cookies(response: Any, *, access: str, refresh: str, csrf: str) -> Any:
    """Browser transport (Part 22 §22.1 "Auth transport").

    `ub_access` and `ub_refresh` are httpOnly so JavaScript cannot exfiltrate
    them; `ub_csrf` is deliberately readable, because the double-submit defence
    requires the client to echo it in `X-CSRF-Token`.
    """
    secure = bool(settings.UB_COOKIE_SECURE)
    domain = settings.UB_COOKIE_DOMAIN
    response.set_cookie(
        ACCESS_COOKIE,
        access,
        max_age=settings.UB_ACCESS_TOKEN_MINUTES * 60,
        httponly=True,
        secure=secure,
        samesite="Lax",
        domain=domain,
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        max_age=settings.UB_REFRESH_TOKEN_DAYS * 86400,
        httponly=True,
        secure=secure,
        samesite="Lax",
        domain=domain,
        path=REFRESH_COOKIE_PATH,
    )
    response.set_cookie(
        CSRF_COOKIE,
        csrf,
        max_age=settings.UB_REFRESH_TOKEN_DAYS * 86400,
        httponly=False,
        secure=secure,
        samesite="Lax",
        domain=domain,
        path="/",
    )
    return response


def clear_auth_cookies(response: Any) -> Any:
    domain = settings.UB_COOKIE_DOMAIN
    response.delete_cookie(ACCESS_COOKIE, domain=domain, path="/")
    response.delete_cookie(REFRESH_COOKIE, domain=domain, path=REFRESH_COOKIE_PATH)
    response.delete_cookie(CSRF_COOKIE, domain=domain, path="/")
    return response
