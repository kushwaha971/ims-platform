"""CORS preflight — the check every other backend test skips (Part 20 §20.13.1).

Django's test client calls the view directly and never performs an OPTIONS
preflight, so the entire CORS configuration was unexercised by 676 passing
tests. It was also invisible in production, which is same-origin behind nginx
and so never triggers CORS at all. That left exactly one topology where it
mattered — frontend :3000, API :8000, the one every developer runs — and there
it was broken: `X-Request-Id` is minted per request by `AxiosInstances`, was not
in `CORS_ALLOW_HEADERS`, and a request header outside that list does not arrive
stripped. The preflight fails and the browser never sends the request. Sign-in
was impossible.

These tests drive the middleware the way a browser does, so the gap cannot
reopen silently.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

ORIGIN = "http://localhost:3000"

#: Every custom request header the browser client sends. `AxiosInstances` mints
#: `X-Request-Id` on every call and `Idempotency-Key` on writes; `X-CSRF-Token`
#: is the double-submit guard. `X-Client` is read by throttling and audit.
#: `If-Match` is the settings page's optimistic lock (PLT-06 FR-8, CR-011).
CLIENT_REQUEST_HEADERS = (
    "X-Request-Id",
    "X-CSRF-Token",
    "Idempotency-Key",
    "X-Client",
    "If-Match",
)


def _preflight(client: Any, path: str, header: str) -> Any:
    return client.options(
        path,
        HTTP_ORIGIN=ORIGIN,
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS=header,
    )


@pytest.mark.django_db
@pytest.mark.parametrize("header", CLIENT_REQUEST_HEADERS)
def test_preflight_allows_every_header_the_client_sends(client: Any, header: str) -> None:
    """One case per header, so a failure names the header rather than the set."""
    response = _preflight(client, reverse("v1:auth-login"), header)

    assert response.status_code == 200
    allowed = {h.strip().lower() for h in response["Access-Control-Allow-Headers"].split(",")}
    assert header.lower() in allowed


@pytest.mark.django_db
def test_preflight_allows_them_together_as_a_real_request_would(client: Any) -> None:
    """A browser sends the whole set in one preflight, not one at a time."""
    response = _preflight(client, reverse("v1:auth-login"), ", ".join(CLIENT_REQUEST_HEADERS))

    assert response.status_code == 200
    allowed = {h.strip().lower() for h in response["Access-Control-Allow-Headers"].split(",")}
    assert {h.lower() for h in CLIENT_REQUEST_HEADERS} <= allowed


@pytest.mark.django_db
def test_credentials_are_allowed_because_the_session_rides_on_cookies(client: Any) -> None:
    """Without this the refresh cookie is dropped and the session dies at 15 min."""
    response = _preflight(client, reverse("v1:auth-login"), "X-Request-Id")

    assert response["Access-Control-Allow-Credentials"] == "true"
