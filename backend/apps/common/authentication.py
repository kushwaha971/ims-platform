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

        self._assert_password_usable(request, user)

        # Bind the tenant contextvar as early as the tenant is knowable (§20.4.3).
        request.user = user
        tenant = get_effective_tenant(request)
        if validated.payload.get("imp"):
            self._assert_impersonation_scope(request, tenant)
        if tenant is not None:
            _current_tenant.set(tenant)
            self._assert_partner_active(request, tenant)
            self._assert_tenant_writable(request, tenant)
        return user, validated

    # ── PLT-10 FR-3 / BR-2: a business awaiting deletion is read-only ─────────
    #
    # Every write answers 409 `tenant_pending_deletion` except the four things
    # the owner must still be able to do in the cool-off: take another export,
    # cancel, answer a support request, and sign in or out. Reads all work, so
    # the books stay visible for thirty days. Lives here for the reason the
    # password gate does: one door, not a permission class every view must
    # remember.
    PENDING_DELETION_WRITABLE = (
        "/api/v1/tenants/current/export",
        "/api/v1/tenants/current/delete-cancel",
        "/api/v1/auth/",
        "/api/v1/support/",
        "/api/v1/notifications",
        "/api/v1/admin/impersonation/end",
    )

    @classmethod
    def _assert_tenant_writable(cls, request: Any, tenant: Any) -> None:
        if getattr(tenant, "status", None) != "pending_deletion":
            return
        if request.method in SAFE_METHODS:
            return
        if request.path.startswith(cls.PENDING_DELETION_WRITABLE):
            return
        from apps.common.exceptions import BusinessRuleViolation

        raise BusinessRuleViolation(
            "tenant_pending_deletion",
            "This business is scheduled for deletion and is read-only. Cancel the deletion to make changes.",
        )

    # ── PLT-14 FR-5: what a support token may NOT do ─────────────────────────
    #
    # Writes are allowed — reproducing a fault needs them — except deleting the
    # business, changing who owns or works in it, its bank details, taking the
    # whole book away, answering its own consent request, and anything in the
    # console. `/admin/impersonation/end` is the one console route it needs.
    IMPERSONATION_FORBIDDEN_ANY = (
        "/api/v1/admin/",
        "/api/v1/auth/switch-tenant",
        "/api/v1/auth/password/",
        "/api/v1/auth/sessions",
        "/api/v1/tenants/current/delete-",
        "/api/v1/tenants/current/export",
        "/api/v1/support/",
    )
    IMPERSONATION_FORBIDDEN_WRITES = (
        "/api/v1/members",
        "/api/v1/memberships/",
        "/api/v1/invitations",
    )
    IMPERSONATION_FORBIDDEN_FIELDS = frozenset({"bank_details", "upi_vpa", "pan"})

    @classmethod
    def _assert_impersonation_scope(cls, request: Any, tenant: Any) -> None:
        if tenant is None:
            # Ended, revoked or expired: a 401 sends the client through refresh,
            # which brings back the operator's OWN session. Never a fall-through
            # to the `tid` claim.
            raise exceptions.AuthenticationFailed("session_revoked")
        path = request.path
        if path == "/api/v1/admin/impersonation/end":
            return
        forbidden = path.startswith(cls.IMPERSONATION_FORBIDDEN_ANY)
        if not forbidden and request.method not in SAFE_METHODS:
            forbidden = path.startswith(cls.IMPERSONATION_FORBIDDEN_WRITES)
            if not forbidden and path.rstrip("/") == "/api/v1/tenants/current":
                body = getattr(request, "data", None)
                forbidden = isinstance(body, dict) and bool(
                    cls.IMPERSONATION_FORBIDDEN_FIELDS & set(body)
                )
        if forbidden:
            from apps.common.exceptions import BusinessRuleViolation

            raise BusinessRuleViolation(
                "impersonation_forbidden", "Support sessions cannot do this."
            )

    @classmethod
    def _assert_partner_active(cls, request: Any, tenant: Any) -> None:
        """WLB-02 FR-5: a suspended partner's tenants are read-only.

        Reads keep working so a merchant can still see what customers owe and
        the banner can name who to call; every write answers 403
        `partner_suspended`. Signing out is always allowed. The tenant is NOT
        marked suspended (BR-4: reversible and non-destructive) — lifting the
        partner's suspension restores every tenant at once. `tenant.partner` is
        already loaded by tenancy's `select_related`, so this costs no query.
        """
        partner = getattr(tenant, "partner", None)
        if getattr(partner, "status", None) != "suspended" or request.method in SAFE_METHODS:
            return
        if request.path in cls.PASSWORD_CHANGE_ALLOWED:
            return
        from apps.common.exceptions import BusinessRuleViolation

        raise BusinessRuleViolation(
            "partner_suspended",
            "This service is paused. Contact your provider's support.",
            details={"partner": partner.name},
        )

    # Reachable while the account is on an owner-issued temporary password
    # (DEC-012). Everything else answers `password_change_required` until the
    # person has picked their own.
    #
    # `me` is here because the client has to be able to read the state that is
    # blocking it; `logout` because someone handed the wrong credentials must be
    # able to get out; `refresh` because a fifteen-minute access token expiring
    # mid-password-change would strand them on the one screen they are allowed
    # to be on. The reset paths are here so "I would rather set it by email" is
    # not a dead end. Nothing that reads or writes business data is here.
    PASSWORD_CHANGE_ALLOWED = frozenset(
        {
            "/api/v1/auth/password/set",
            "/api/v1/auth/password/reset/request",
            "/api/v1/auth/password/reset/confirm",
            "/api/v1/auth/me",
            "/api/v1/auth/logout",
            "/api/v1/auth/refresh",
        }
    )

    @classmethod
    def _assert_password_usable(cls, request: Any, user: Any) -> None:
        """Fail closed: the gate is an allowlist, checked before any view runs.

        This lives in `authenticate()` rather than in a permission class on
        purpose. Every view in this product declares its own
        `permission_classes`, which *overrides* `DEFAULT_PERMISSION_CLASSES` —
        so a permission class would have to be remembered on every view ever
        added, and the one place it was forgotten would be the hole. There is
        exactly one door into an authenticated request and this is it.

        An expired temporary password is refused outright rather than routed to
        the change screen: the window has passed, and the way back is the owner
        regenerating it, not the holder of a week-old WhatsApp message using it.
        """
        # Imported here, not at module level: `common.exceptions` pulls in
        # `rest_framework.views`, and DRF resolves DEFAULT_AUTHENTICATION_CLASSES
        # while `rest_framework.views` is still initialising -- a module-level
        # import deadlocks the whole app at startup. Measured exactly that way.
        from apps.common.exceptions import BusinessRuleViolation

        if not getattr(user, "must_change_password", False):
            return
        if user.is_temporary_password_expired:
            raise BusinessRuleViolation(
                "password_expired",
                "This temporary password has expired. Ask the business owner to issue a new one.",
            )
        if request.path.rstrip("/") in cls.PASSWORD_CHANGE_ALLOWED:
            return
        raise BusinessRuleViolation(
            "password_change_required",
            "Choose your own password before continuing.",
        )

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
