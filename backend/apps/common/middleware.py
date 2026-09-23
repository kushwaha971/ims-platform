"""Middleware (Part 20 §20.4.3)."""

from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Any, Callable

from apps.common.logging import _current_request_id, redact_secret_paths
from apps.common.tenancy import _current_tenant

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

access_logger = logging.getLogger("ub.access")


class RequestIdMiddleware:
    """Accept or mint `X-Request-Id`, bind it, and echo it on every response.

    The header is a correlation hint only: it is sanitised to
    `[A-Za-z0-9._-]{1,64}` and regenerated when malformed, and it is never used
    for authorisation (Part 20 §20.4.6).
    """

    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response

    def __call__(self, request: Any) -> Any:
        incoming = request.headers.get("X-Request-Id", "")
        request_id = incoming if _REQUEST_ID_RE.match(incoming or "") else uuid.uuid4().hex
        request.request_id = request_id
        request.client_ip = _client_ip(request)
        token = _current_request_id.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            _current_request_id.reset(token)
        response["X-Request-Id"] = request_id
        return response


class TenantContextMiddleware:
    """Guarantee `_ub_tenant` is present and reset the contextvar on the way out.

    DRF authenticates lazily inside the view, so the authoritative binding of the
    tenant contextvar happens in `CookieOrBearerJWTAuthentication.authenticate()`
    — the earliest point at which the tenant is knowable. This middleware exists
    so the attribute always exists and so the contextvar is reset even when the
    view raises (Part 20 §20.4.3).

    It is also the one place that can honour PLT-04 FR-4 / CCR-3 — "every
    tenant-scoped response echoes the token's `tid` as `X-Tenant-Id`". The
    client's stale-tab guard compares that echo against the tab's own active
    tenant and discards a response that disagrees, which is what stops a tab
    whose cookie was moved by a switch in another tab from rendering (or
    writing) another business's rows. A guard that only fires on some responses
    is a guard that does not fire; so the header goes here, once, for every
    response whose tenant resolved — never per-view.

    The header is an *echo of the resolved tenant*, not an input: `tenancy.py`
    never reads `X-Tenant-Id` from the request.
    """

    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response

    def __call__(self, request: Any) -> Any:
        request._ub_tenant = "unset"
        token = _current_tenant.set(None)
        try:
            response = self.get_response(request)
        finally:
            _current_tenant.reset(token)
        tenant = getattr(request, "_ub_tenant", None)
        if tenant not in (None, "unset"):
            response["X-Tenant-Scope"] = "1"  # debugging aid, never the tenant id
            # A view that moves the caller to a *different* tenant (switch-tenant,
            # tenant-create) has already set this to the tenant it moved them to.
            # That value is the authority; the memoised request tenant is the
            # pre-switch one, so it must not overwrite it.
            if "X-Tenant-Id" not in response:
                response["X-Tenant-Id"] = str(tenant.id)
        return response


class AccessLogMiddleware:
    """One structured line per request. Never logs PII or a request body."""

    def __init__(self, get_response: Callable) -> None:
        self.get_response = get_response

    def __call__(self, request: Any) -> Any:
        started = time.monotonic()
        response = self.get_response(request)
        access_logger.info(
            "http.request",
            extra={
                "method": request.method,
                # Scrubbed at source: `/invitations/{token}/accept` carries a raw
                # invitation token in the path (`SecretPathFilter` is the second lock).
                "path": redact_secret_paths(request.path),
                "status": response.status_code,
                "duration_ms": int((time.monotonic() - started) * 1000),
                "request_id": getattr(request, "request_id", ""),
            },
        )
        return response


def _client_ip(request: Any) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    remote = request.META.get("REMOTE_ADDR")
    return remote[:45] if remote else None
