"""The domain exception hierarchy and the one DRF handler (Part 20 §20.3.5).

Services raise `DomainError` subclasses, never DRF exceptions (rule D6). One
handler translates them into the canon envelope and the canon error codes
(Part 22 §22.1, §22.1.1). No view ever constructs an error body (Part 26 R8.1).
"""

from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions as drf_exc
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

from apps.common.error_codes import ERROR_CODES, http_status_for

logger = logging.getLogger("ub.api")


class DomainError(Exception):
    """Base for every error a service may raise. Never raised directly."""

    code = "server_error"
    http_status = 500
    message = "Something went wrong."

    def __init__(self, message: str | None = None, *, details: Any = None) -> None:
        self.message = message or self.message
        self.details = details if details is not None else {}
        super().__init__(str(self.message))


class ValidationFailed(DomainError):
    code, http_status = "validation_error", 400
    message = _("Please check the highlighted fields.")

    def __init__(self, details: dict, message: str | None = None) -> None:
        super().__init__(message, details=details)


class NotFound(DomainError):
    code, http_status = "not_found", 404
    message = _("Not found.")


class PermissionDenied(DomainError):
    code, http_status = "permission_denied", 403
    message = _("You do not have permission to do this.")


class ModuleDisabled(DomainError):
    code, http_status = "module_disabled", 403
    message = _("This module is switched off for your business.")


class PlanLimitReached(DomainError):
    code, http_status = "plan_limit_reached", 403
    message = _("Your plan's limit has been reached.")


class NoActiveTenant(DomainError):
    code, http_status = "no_active_tenant", 403
    message = _("Choose a business first.")


class ServiceBusy(DomainError):
    code, http_status = "service_busy", 503
    message = _("We are busy right now. Please try again.")

    def __init__(self, retry_after: int = 1) -> None:
        super().__init__(details={"retry_after": retry_after})


class BusinessRuleViolation(DomainError):
    """A registered canon error code chosen by the caller (Part 26 R8.2).

    The HTTP status comes from the registry, not from the call site, so two
    modules raising the same code cannot disagree about the status.
    """

    def __init__(self, code: str, message: str, *, details: Any = None) -> None:
        if code not in ERROR_CODES:
            raise ValueError(f"Unregistered error code {code!r} (Part 22 §22.1.1)")
        self.code = code
        self.http_status = http_status_for(code)
        super().__init__(message, details=details)


class StaleVersion(BusinessRuleViolation):
    def __init__(self, current_version: int | None = None) -> None:
        super().__init__(
            "stale_version",
            _("Somebody else changed this. Reload and try again."),
            details={"current_version": current_version} if current_version is not None else {},
        )


class IdempotencyConflict(BusinessRuleViolation):
    def __init__(self) -> None:
        super().__init__(
            "idempotency_conflict",
            _("This request was already sent with different details."),
        )


class IdempotencyInProgress(BusinessRuleViolation):
    def __init__(self, retry_after: int = 1) -> None:
        super().__init__(
            "idempotency_in_progress",
            _("Still processing your previous request. Try again in a moment."),
            details={"retry_after": retry_after},
        )


class PermanentJobError(Exception):
    """A job handler raises this when retrying cannot help (Part 20 §20.8.8)."""


def drf_exception_handler(exc: Exception, context: dict) -> Response | None:
    """The only producer of the error envelope (Part 22 §22.1).

    Every exception becomes `{"error": {code, message, details, request_id}}`.
    Cross-tenant access has already become `Http404` in the queryset layer, so it
    lands here as `not_found` — never `permission_denied` (canon §0.11 rule 2).
    """
    request = context.get("request")
    request_id = getattr(request, "request_id", None)

    if isinstance(exc, DomainError):
        if isinstance(exc, PlanLimitReached):
            _record_plan_limit_hit(exc, request)
        payload, http_status = _from_domain(exc), exc.http_status
    elif isinstance(exc, Http404):
        payload, http_status = {"code": "not_found", "message": "Not found.", "details": {}}, 404
    elif isinstance(exc, drf_exc.ValidationError):
        payload, http_status = {
            "code": "validation_error",
            "message": "Please check the highlighted fields.",
            "details": exc.detail,
        }, 400
    elif isinstance(exc, (drf_exc.NotAuthenticated, drf_exc.AuthenticationFailed)):
        code, message = _auth_code_and_message(exc)
        payload, http_status = {"code": code, "message": message, "details": {}}, 401
    elif isinstance(exc, drf_exc.PermissionDenied):
        payload, http_status = {
            "code": "permission_denied",
            "message": str(exc.detail),
            "details": {},
        }, 403
    elif isinstance(exc, drf_exc.Throttled):
        # Part 22 §22.1.1 registers `rate_limited` as `D retry_after`: one named
        # key at the top level of `details`, "with their natural JSON types
        # (amounts as strings, counts as numbers)". `Throttled.__init__` already
        # `math.ceil`s its argument, so `wait` is a whole number of seconds —
        # the same scalar shape the domain throttles send (`LoginThrottled`,
        # `RequestThrottled`), so a client reads one shape from every 429 the
        # product can produce.
        payload, http_status = {
            "code": "rate_limited",
            "message": "Too many requests. Please wait a moment.",
            "details": {"retry_after": exc.wait},
        }, 429
    elif isinstance(exc, DjangoValidationError):
        payload, http_status = {
            "code": "validation_error",
            "message": "Please check the highlighted fields.",
            "details": getattr(exc, "message_dict", {"non_field_errors": list(exc.messages)}),
        }, 400
    else:
        response = drf_default_handler(exc, context)
        if response is None:
            logger.exception("unhandled_exception", extra={"request_id": request_id})
            payload, http_status = {
                "code": "server_error",
                "message": "Something went wrong. Quote this reference to support.",
                "details": {},
            }, 500
        else:
            payload, http_status = {
                "code": "server_error",
                "message": str(response.data),
                "details": {},
            }, response.status_code

    payload["request_id"] = request_id
    payload["message"] = str(payload["message"])
    response = Response({"error": payload}, status=http_status)
    if request_id:
        response["X-Request-Id"] = request_id
    retry_after = (payload.get("details") or {}).get("retry_after")
    if isinstance(retry_after, (int, float)):
        response["Retry-After"] = str(int(retry_after))
    return response


# The registered codes an authentication failure may carry, and their copy
# (Part 22 §22.1.1 group B). A raiser signals one by making it the exception's
# detail — `raise AuthenticationFailed("token_stale")` — which is how the
# permission class reports a stale `ver` claim (Part 20 §20.5.5).
_AUTH_MESSAGES: dict[str, str] = {
    "token_stale": "Your permissions changed. Reloading.",
    "invalid_token": "Your session is not valid. Please sign in again.",
    "session_revoked": "You were signed out. Please sign in again.",
    # DEC-010 made email the identifier, so the registered copy of
    # `invalid_credentials` ("Mobile number or password is incorrect.") now
    # names a field the sign-in form does not have. `CR-LOG` carries the copy
    # change to Part 22 §22.1.1; the code itself is unchanged.
    "invalid_credentials": "Email or password is incorrect.",
    # DRF's own phrasing ("Authentication credentials were not provided.") is
    # written for the developer holding the curl, and this string is what a
    # merchant reads in a toast — every other entry in this table is
    # merchant-facing. It is also the copy Part 22 §22.1.1's row for
    # `unauthenticated` now registers.
    "unauthenticated": "Please sign in to continue.",
}


def _auth_code_and_message(exc: Exception) -> tuple[str, str]:
    """Pick a registered code for an authentication failure.

    DRF's own `detail` is sometimes a dict (SimpleJWT returns `{detail, code}`),
    and stringifying it leaks internals into a user-facing message. So the
    detail is only trusted when it names a registered code; anything else from
    `AuthenticationFailed` is a token the server could not validate, which is
    `invalid_token`, and `NotAuthenticated` is `unauthenticated`.
    """
    detail = getattr(exc, "detail", "")
    named = str(detail) if not isinstance(detail, dict) else str(detail.get("code", ""))
    if named in ERROR_CODES and named in _AUTH_MESSAGES:
        return named, _AUTH_MESSAGES[named]
    if isinstance(exc, drf_exc.NotAuthenticated):
        return "unauthenticated", _AUTH_MESSAGES["unauthenticated"]
    return "invalid_token", _AUTH_MESSAGES["invalid_token"]


def _record_plan_limit_hit(exc: "PlanLimitReached", request: Any) -> None:
    """PLT-15 §16: the `plan.limit_hit` row is written even though the request failed.

    It has to happen here rather than at the raise site: PLT-15 BR-7 makes the
    check run inside a transaction with the tenant row locked, so a row written
    there rolls back with the refusal it is meant to record. By the time the
    handler runs, that transaction has unwound and the connection is in
    autocommit again.
    """
    from apps.platform_app.services.entitlements import record_limit_hit

    actor = getattr(request, "user", None)
    record_limit_hit(exc, actor=actor if getattr(actor, "is_authenticated", False) else None)


def _from_domain(exc: DomainError) -> dict:
    return {"code": exc.code, "message": exc.message, "details": exc.details}
