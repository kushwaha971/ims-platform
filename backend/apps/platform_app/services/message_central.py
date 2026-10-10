"""Message Central VerifyNow — the SMS OTP behind mobile sign-in (DEC-014).

Message Central GENERATES the code, texts it and VALIDATES it. This module is
the only place that talks to it, and it runs only in Django: the browser never
sees the customer id, the password, the auth token or the verification id.

Three calls, as their API documents them
(https://messagecentral.com/en-in/product/verify-now/api):

* ``get_auth_token()`` — ``GET /auth/v1/authentication/token`` with the
  customer id and the base64 of the password. Cached for thirty minutes and
  refreshed once when a call answers 401.
* ``send_otp(mobile)`` — ``POST /verification/v3/send``; returns the
  ``verificationId`` the validation needs.
* ``validate_otp(mobile, verification_id, code)`` — ``GET
  /verification/v3/validateOtp``; success is
  ``verificationStatus == "VERIFICATION_COMPLETED"``.

Standard library only (ADR-021 admits no HTTP client package): ``urllib`` with
a ten-second timeout. Nothing here logs a mobile, a code or a credential — a
refusal is logged by its response code and message alone.
"""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger("ub.notifications")

TIMEOUT_SECONDS = 10
TOKEN_CACHE_KEY = "message_central:auth_token"
TOKEN_CACHE_SECONDS = 30 * 60
COUNTRY_CODE = "91"
VERIFIED = "VERIFICATION_COMPLETED"

# Their response codes that mean something to the person typing the code.
WRONG_OTP = 702
ALREADY_VERIFIED = 703
EXPIRED = 705
REQUEST_ALREADY_EXISTS = 506
MAXIMUM_LIMIT_REACHED = 800


class MessageCentralError(Exception):
    """Message Central could not be reached, or refused the call."""

    def __init__(self, message: str, *, code: int | None = None) -> None:
        super().__init__(message)
        self.code = code


class NotConfigured(MessageCentralError):
    """``MC_CUSTOMER_ID`` / ``MC_PASSWORD`` are not set."""


@dataclass(frozen=True, slots=True)
class Validation:
    """The answer to one typed code."""

    verified: bool
    #: ``incorrect`` | ``expired`` | ``used`` | ``burned`` when not verified.
    reason: str = ""


def is_configured() -> bool:
    return bool(
        settings.MC_CUSTOMER_ID and (settings.MC_PASSWORD or getattr(settings, "MC_AUTH_TOKEN", ""))
    )


def national_number(mobile: str) -> str:
    """``+919876543210`` → ``9876543210``: the API takes the country code apart."""
    digits = "".join(ch for ch in str(mobile) if ch.isdigit())
    return digits[-10:]


def _url(path: str, params: dict[str, str]) -> str:
    return f"{settings.MC_BASE_URL.rstrip('/')}{path}?{urllib.parse.urlencode(params)}"


def _call(method: str, url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any]]:
    """One HTTP exchange → ``(status, json body)``. Raises when unreachable."""
    request = urllib.request.Request(  # noqa: S310 — a fixed https base URL
        url, method=method, headers={"accept": "*/*", **headers}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.error("message_central.unreachable")
        raise MessageCentralError("Message Central could not be reached.") from exc
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        body = {}
    return status, body if isinstance(body, dict) else {}


def get_auth_token(*, force: bool = False) -> str:
    """The cached auth token, fetched when missing or when ``force`` is set."""
    if not is_configured():
        raise NotConfigured("MC_CUSTOMER_ID and MC_PASSWORD are not set.")
    configured_token = getattr(settings, "MC_AUTH_TOKEN", "")
    if configured_token:
        return str(configured_token)
    if not force:
        cached = cache.get(TOKEN_CACHE_KEY)
        if cached:
            return str(cached)
    key = base64.b64encode(settings.MC_PASSWORD.encode("utf-8")).decode("ascii")
    status, body = _call(
        "GET",
        _url(
            "/auth/v1/authentication/token",
            {"customerId": settings.MC_CUSTOMER_ID, "key": key, "scope": "NEW"},
        ),
        {},
    )
    token = body.get("token")
    if status != 200 or not token:
        logger.error("message_central.token_refused status=%s", status)
        raise MessageCentralError("Message Central refused the credentials.", code=status)
    cache.set(TOKEN_CACHE_KEY, token, TOKEN_CACHE_SECONDS)
    return str(token)


def _authorised(method: str, path: str, params: dict[str, str]) -> tuple[int, dict[str, Any]]:
    """Call with the token; on a 401 fetch a fresh token and try exactly once more."""
    url = _url(path, params)
    status, body = _call(method, url, {"authToken": get_auth_token()})
    if status == 401:
        status, body = _call(method, url, {"authToken": get_auth_token(force=True)})
    return status, body


def _response_code(status: int, body: dict[str, Any]) -> int:
    """Their own code: top-level ``responseCode``, else the one inside ``data``."""
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    for candidate in (body.get("responseCode"), data.get("responseCode"), status):
        try:
            return int(candidate)
        except (TypeError, ValueError):
            continue
    return status


def send_otp(mobile: str) -> str:
    """Ask Message Central to text a code; returns its ``verificationId``."""
    status, body = _authorised(
        "POST",
        "/verification/v3/send",
        {
            "countryCode": COUNTRY_CODE,
            "customerId": settings.MC_CUSTOMER_ID,
            "flowType": "SMS",
            "mobileNumber": national_number(mobile),
        },
    )
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    verification_id = data.get("verificationId")
    code = _response_code(status, body)
    if status != 200 or code != 200 or not verification_id:
        logger.error(
            "message_central.send_refused status=%s code=%s message=%s",
            status,
            code,
            str(body.get("message") or "")[:80],
        )
        raise MessageCentralError("Message Central did not send the code.", code=code)
    return str(verification_id)


def validate_otp(mobile: str, verification_id: str, code: str) -> Validation:
    """Check a typed code. A wrong or expired code is an answer, not an error."""
    status, body = _authorised(
        "GET",
        "/verification/v3/validateOtp",
        {
            "countryCode": COUNTRY_CODE,
            "mobileNumber": national_number(mobile),
            "verificationId": str(verification_id),
            "customerId": settings.MC_CUSTOMER_ID,
            "code": str(code),
        },
    )
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    if data.get("verificationStatus") == VERIFIED:
        return Validation(verified=True)

    response_code = _response_code(status, body)
    reasons = {
        WRONG_OTP: "incorrect",
        EXPIRED: "expired",
        ALREADY_VERIFIED: "used",
        MAXIMUM_LIMIT_REACHED: "burned",
    }
    if response_code in reasons:
        return Validation(verified=False, reason=reasons[response_code])

    logger.error(
        "message_central.validate_refused status=%s code=%s message=%s",
        status,
        response_code,
        str(body.get("message") or "")[:80],
    )
    raise MessageCentralError("Message Central could not check the code.", code=response_code)


__all__ = [
    "MessageCentralError",
    "NotConfigured",
    "Validation",
    "get_auth_token",
    "is_configured",
    "national_number",
    "send_otp",
    "validate_otp",
]
