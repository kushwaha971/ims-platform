"""Authentication (Part 20 §20.5.1, Part 27 §27.4.3, §27.4.4)."""

from __future__ import annotations

from typing import Any

from rest_framework import exceptions
from rest_framework.permissions import SAFE_METHODS
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.common.tenancy import _current_tenant, get_effective_tenant

CSRF_COOKIE = "ub_csrf"
CSRF_HEADER = "X-CSRF-Token"


class CookieOrBearerJWTAuthentication(JWTAuthentication):
    """Accept the access token from the Authorization header or the `ub_access` cookie.

    Browsers use the cookie (httpOnly, so JavaScript cannot exfiltrate it) and
    must additionally present `X-CSRF-Token` on unsafe methods. API clients use
    the header and are exempt from CSRF because they are not cookie-driven.

    Two checks beyond SimpleJWT's own, both of which exist so that a revocation
    takes effect *now* rather than at the end of a fifteen-minute token life:

    * **`typ`** must be `access` — a refresh token is not a credential for
      anything but `/auth/refresh`.
    * **`epo`** must equal `platform_user.token_epoch`. Part 21 §21.3.1 makes
      this the no-Redis answer to immediate global revocation, and Part 27
      §27.4.4 step 2 makes bumping it the containment action for a stolen token.
      A token with no `epo` claim at all is refused: an absent claim must never
      be read as a passing one.
    """

    def authenticate(self, request: Any) -> tuple[Any, Any] | None:
        header_result = super().authenticate(request)
        cookie_auth = False
        if header_result is None:
            raw = request.COOKIES.get("ub_access")
            if not raw:
                return None
            validated = self.get_validated_token(raw)
            user = self.get_user(validated)
            request._ub_cookie_auth = True
            cookie_auth = True
        else:
            user, validated = header_result

        request.auth_claims = dict(validated.payload)
        if validated.payload.get("typ") != "access":
            raise exceptions.AuthenticationFailed("invalid_token")

        claimed_epoch = validated.payload.get("epo")
        if claimed_epoch is None or int(claimed_epoch) != int(user.token_epoch):
            raise exceptions.AuthenticationFailed("session_revoked")

        if cookie_auth and request.method not in SAFE_METHODS:
            self._assert_csrf(request)

        # Bind the tenant contextvar as early as the tenant is knowable (§20.4.3).
        request.user = user
        tenant = get_effective_tenant(request)
        if tenant is not None:
            _current_tenant.set(tenant)
        return user, validated

    @staticmethod
    def _assert_csrf(request: Any) -> None:
        """Double-submit (Part 22 §22.1 "Auth transport").

        The cookie is readable by the page and the header is not settable
        cross-origin, so a request that carries both and matches cannot have
        been forged by another site.
        """
        cookie = request.COOKIES.get(CSRF_COOKIE) or ""
        header = request.headers.get(CSRF_HEADER) or ""
        if not cookie or not header or cookie != header:
            raise exceptions.PermissionDenied("CSRF token missing or incorrect.")
