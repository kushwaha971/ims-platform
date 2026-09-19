"""Authentication (Part 20 §20.5.1)."""

from __future__ import annotations

from typing import Any

from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.tenancy import _current_tenant, get_effective_tenant


class CookieOrBearerJWTAuthentication(JWTAuthentication):
    """Accept the access token from the Authorization header or the `ub_access` cookie.

    Browsers use the cookie (httpOnly, so JavaScript cannot exfiltrate it) and
    must additionally present `X-CSRF-Token` on unsafe methods. API clients use
    the header and are exempt from CSRF because they are not cookie-driven.
    """

    def authenticate(self, request: Any) -> tuple[Any, Any] | None:
        header_result = super().authenticate(request)
        if header_result is None:
            raw = request.COOKIES.get("ub_access")
            if not raw:
                return None
            validated = self.get_validated_token(raw)
            user = self.get_user(validated)
            request._ub_cookie_auth = True
        else:
            user, validated = header_result

        request.auth_claims = dict(validated.payload)
        if validated.payload.get("typ") != "access":
            raise exceptions.AuthenticationFailed("invalid_token")

        # Bind the tenant contextvar as early as the tenant is knowable (§20.4.3).
        request.user = user
        tenant = get_effective_tenant(request)
        if tenant is not None:
            _current_tenant.set(tenant)
        return user, validated
