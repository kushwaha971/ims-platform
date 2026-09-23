"""Structured logging (Part 20 §20.2.2, Part 30 §30.2).

One logger per app, named `ub.<app>`. Every record carries `request_id` and,
where one is bound, `tenant_id`, so a request can be grepped end to end across
services (Sprint 0 task S0-74).
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
from typing import Any

_current_request_id: contextvars.ContextVar = contextvars.ContextVar(
    "ub_current_request_id", default=None
)

_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {
    "message",
    "asctime",
    "taskName",
}


def current_request_id() -> str | None:
    return _current_request_id.get()


class RequestIdFilter(logging.Filter):
    """Stamp `request_id` and `tenant_id` on every record."""

    def filter(self, record: logging.LogRecord) -> bool:
        from apps.common.tenancy import current_tenant

        if not getattr(record, "request_id", None):
            record.request_id = _current_request_id.get() or ""
        if not getattr(record, "tenant_id", None):
            tenant = current_tenant()
            record.tenant_id = str(getattr(tenant, "id", "")) if tenant is not None else ""
        return True


#: URL paths that carry a raw secret as a path segment. One today:
#: `POST /invitations/{token}/accept` (PLT-05 FR-10), where the segment IS the
#: invitation token and only its sha256 is meant to exist at rest. Every other
#: token in the product travels in a request body, which is never logged.
_SECRET_PATH_SEGMENTS = (re.compile(r"(/invitations/)(?!\[redacted\])[^/\s?#\"']+(/accept)"),)
REDACTED = "[redacted]"


def redact_secret_paths(text: str) -> str:
    """Replace the secret segment of any token-bearing path in `text`."""
    for pattern in _SECRET_PATH_SEGMENTS:
        text = pattern.sub(rf"\g<1>{REDACTED}\g<2>", text)
    return text


class SecretPathFilter(logging.Filter):
    """Scrub invitation tokens out of every record before any handler sees it.

    Three emitters put the path on a record: `AccessLogMiddleware` (`path`,
    already scrubbed at source — this is the second lock), Django's own
    `django.server` line under `runserver` ("POST /api/v1/invitations/<token>/
    accept 200", in the message AND as a `request` attribute the JSON formatter
    would stringify), and `django.request` on a 5xx. A log file every operator
    can read is at rest just as surely as a database column is, so a raw token
    in it is a live seat in it — the thing `invite()` keeps out of the audit
    trail and the idempotency store for exactly this reason.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001 — a bad format string is not ours to fix here
            message = None
        if message is not None:
            scrubbed = redact_secret_paths(message)
            if scrubbed != message:
                record.msg, record.args = scrubbed, ()
        for key, value in list(record.__dict__.items()):
            if key in _RESERVED or key.startswith("_"):
                continue
            if isinstance(value, str):
                scrubbed = redact_secret_paths(value)
                if scrubbed != value:
                    setattr(record, key, scrubbed)
            elif hasattr(value, "path") and hasattr(value, "method"):
                # An HttpRequest riding on the record. Its repr names the path.
                text = str(value)
                scrubbed = redact_secret_paths(text)
                if scrubbed != text:
                    setattr(record, key, scrubbed)
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Never interpolates data into the message."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
            "request_id": getattr(record, "request_id", ""),
            "tenant_id": getattr(record, "tenant_id", ""),
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED or key in payload or key.startswith("_"):
                continue
            payload[key] = (
                value if isinstance(value, (str, int, float, bool, type(None))) else str(value)
            )
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)[:8192]
        return json.dumps(payload, default=str)


def build_logging_config(
    *, level: str = "INFO", fmt: str = "json", log_dir: str | None = None
) -> dict:
    """The `LOGGING` dict. `ub.<app>` loggers all hang off one `ub` parent."""
    handlers: dict[str, dict] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json" if fmt == "json" else "console",
            "filters": ["request_id", "secret_paths"],
        }
    }
    app_handlers = ["console"]
    if log_dir:
        handlers["file"] = {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": f"{log_dir}/digikhaato.log",
            "maxBytes": 20 * 1024 * 1024,
            "backupCount": 10,
            "formatter": "json",
            "filters": ["request_id", "secret_paths"],
        }
        app_handlers.append("file")

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "request_id": {"()": "apps.common.logging.RequestIdFilter"},
            "secret_paths": {"()": "apps.common.logging.SecretPathFilter"},
        },
        "formatters": {
            "json": {"()": "apps.common.logging.JsonFormatter"},
            "console": {
                "format": "%(levelname)s %(name)s %(request_id)s %(message)s",
            },
        },
        "handlers": handlers,
        "loggers": {
            "ub": {"handlers": app_handlers, "level": level, "propagate": False},
            "django": {"handlers": app_handlers, "level": "INFO", "propagate": False},
            "django.request": {"handlers": app_handlers, "level": "ERROR", "propagate": False},
            # `runserver`'s per-request line. Django's DEFAULT_LOGGING gives it a
            # handler of its own that bypasses ours, so without this entry the
            # raw request line — invitation token and all — goes to stderr
            # unscrubbed.
            "django.server": {"handlers": app_handlers, "level": "INFO", "propagate": False},
        },
        "root": {"handlers": ["console"], "level": "WARNING"},
    }
