"""The error envelope and the code registry (Part 22 §22.1, §22.1.1)."""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework import exceptions as drf_exc
from rest_framework.test import APIRequestFactory

from apps.common.error_codes import ERROR_CODES, REGISTRY, RETRYABLE_CODES, http_status_for
from apps.common.exceptions import (
    BusinessRuleViolation,
    DomainError,
    IdempotencyConflict,
    ModuleDisabled,
    NotFound,
    PermissionDenied,
    StaleVersion,
    ValidationFailed,
    drf_exception_handler,
)


def _handle(exc: Exception, request_id: str = "req-123") -> tuple[dict, int]:
    factory = APIRequestFactory()
    request = factory.get("/api/v1/parties")
    request.request_id = request_id
    response = drf_exception_handler(exc, {"request": request})
    return response.data, response.status_code


def test_registry_is_closed_and_complete() -> None:
    """150 codes in Part 22 §22.1.1, plus `unauthenticated` (Part 26 R8.2)."""
    assert len(REGISTRY) == 151
    assert "unauthenticated" in ERROR_CODES


def test_every_retryable_code_is_one_the_spec_marks_retryable() -> None:
    assert RETRYABLE_CODES == {
        "idempotency_in_progress",
        "service_busy",
        "rate_limited",
        "otp_throttled",
        "login_throttled",
        "token_stale",
        "server_error",
        "provider_error",
        "email_quota_exceeded",
        "export_queue_full",
    }


def test_business_rule_violation_rejects_an_unregistered_code() -> None:
    with pytest.raises(ValueError, match="Unregistered error code"):
        BusinessRuleViolation("cant_do_that", "Nope")


def test_business_rule_violation_takes_its_status_from_the_registry() -> None:
    exc = BusinessRuleViolation("insufficient_stock", "Not enough stock.")
    assert exc.http_status == http_status_for("insufficient_stock") == 409

    exc = BusinessRuleViolation("export_queue_full", "Busy.")
    assert exc.http_status == 503


def test_envelope_shape_is_exactly_the_canon_one() -> None:
    body, status = _handle(NotFound())
    assert status == 404
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details", "request_id"}
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"] == "req-123"


def test_validation_error_carries_the_field_map() -> None:
    body, status = _handle(ValidationFailed({"amount": ["Enter an amount greater than 0"]}))
    assert status == 400
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["details"] == {"amount": ["Enter an amount greater than 0"]}


def test_drf_validation_error_becomes_validation_error() -> None:
    body, status = _handle(drf_exc.ValidationError({"name": ["This field is required."]}))
    assert status == 400
    assert body["error"]["code"] == "validation_error"


def test_http404_becomes_not_found_never_permission_denied() -> None:
    from django.http import Http404

    body, status = _handle(Http404())
    assert status == 404
    assert body["error"]["code"] == "not_found"


def test_not_authenticated_becomes_unauthenticated_401() -> None:
    body, status = _handle(drf_exc.NotAuthenticated())
    assert status == 401
    assert body["error"]["code"] == "unauthenticated"


def test_token_stale_travels_through_authentication_failed() -> None:
    body, status = _handle(drf_exc.AuthenticationFailed("token_stale"))
    assert status == 401
    assert body["error"]["code"] == "token_stale"
    assert body["error"]["message"] == "Your permissions changed. Reloading."


def test_an_unvalidatable_token_is_invalid_token_not_a_leaked_dict() -> None:
    """SimpleJWT raises with a dict detail; stringifying it leaks internals."""
    exc = drf_exc.AuthenticationFailed(
        {"detail": "Given token not valid", "code": "token_not_valid"}
    )
    body, status = _handle(exc)
    assert status == 401
    assert body["error"]["code"] == "invalid_token"
    assert body["error"]["message"] == "Your session is not valid. Please sign in again."
    assert "ErrorDetail" not in body["error"]["message"]


def test_permission_denied_is_403() -> None:
    body, status = _handle(PermissionDenied())
    assert status == 403
    assert body["error"]["code"] == "permission_denied"


def test_module_disabled_carries_the_module_in_details() -> None:
    body, status = _handle(ModuleDisabled("off", details={"module": "sales"}))
    assert status == 403
    assert body["error"]["details"] == {"module": "sales"}


def test_stale_version_is_409() -> None:
    body, status = _handle(StaleVersion(current_version=7))
    assert status == 409
    assert body["error"]["code"] == "stale_version"
    assert body["error"]["details"] == {"current_version": 7}


def test_idempotency_conflict_is_409() -> None:
    body, status = _handle(IdempotencyConflict())
    assert status == 409
    assert body["error"]["code"] == "idempotency_conflict"


def test_throttled_becomes_rate_limited_429_with_retry_after() -> None:
    body, status = _handle(drf_exc.Throttled(wait=30))
    assert status == 429
    assert body["error"]["code"] == "rate_limited"
    assert body["error"]["details"]["retry_after"] == 30


def test_unhandled_exception_becomes_server_error_500() -> None:
    body, status = _handle(RuntimeError("something exploded"))
    assert status == 500
    assert body["error"]["code"] == "server_error"
    # The traceback never reaches the client.
    assert body["error"]["details"] == {}
    assert "exploded" not in body["error"]["message"]


def test_base_domain_error_defaults_to_server_error() -> None:
    assert DomainError.code == "server_error"
    assert DomainError.http_status == 500


@pytest.mark.django_db
def test_request_id_is_echoed_on_an_error_response(two_tenants_full: dict) -> None:
    a, b = two_tenants_full["a"], two_tenants_full["b"]
    response = a["client"].get(
        reverse("v1:party-detail", args=[b["party"].id]), HTTP_X_REQUEST_ID="trace-me-42"
    )
    assert response.status_code == 404
    assert response["X-Request-Id"] == "trace-me-42"
    assert response.json()["error"]["request_id"] == "trace-me-42"
