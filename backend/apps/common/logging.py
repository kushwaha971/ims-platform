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


#: URL paths that carry a raw secret as a path segment. Two:
#: `POST /invitations/{token}/accept` (PLT-05 FR-10), where the segment IS the
#: invitation token and only its sha256 is meant to exist at rest; and the public
#: share link, `GET /public/d/{token}` (and the page `/d/{token}`), whose
#: segment is the credential a customer holds — the access log wrote it in
#: full on every view until the Sprint 12 PII sweep. Every other token in the
#: product travels in a request body, which is never logged.
_SECRET_PATH_SEGMENTS = (
    re.compile(r"(/invitations/)(?!\[redacted\])[^/\s?#\"']+(/accept)"),
    re.compile(r"(/d/)(?!\[redacted\])[^/\s?#\"']+()"),
)
REDACTED = "[redacted]"

# ── PII and secret patterns (Part 27 §27.14 "Must never be logged") ──────────
#
# The enforcement §27.14 asks for: "A RedactingFilter on the root logger
# enforces this by key name and by pattern (E.164-shaped strings, JWT-shaped
# strings), so a careless `extra` cannot leak."
#: An `extra` whose NAME says it is a secret is dropped whatever its value.
_SECRET_KEY = re.compile(
    r"pass(word|wd)?|secret|token|authori[sz]ation|cookie|jwt|api_?key|otp|idempotency",
    re.IGNORECASE,
)
#: Names that match the rule above but carry no secret.
_SAFE_KEYS = frozenset({"token_suffix"})
_VALUE_PATTERNS: tuple[tuple[re.Pattern, str], ...] = (
    # A JWT: three base64url segments, the first a JSON header (`eyJ`).
    (re.compile(r"eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}"), "[jwt]"),
    # An Indian mobile, bare or with +91 / 91 / 0 — and any other E.164 number.
    (re.compile(r"(?<![\w+])(?:(?:\+|00)?91[\s-]?|0)?[6-9]\d{9}(?!\w)"), "[mobile]"),
    (re.compile(r"(?<![\w])\+\d{10,15}(?!\w)"), "[mobile]"),
    # An email address (the console mail adapter logs only `to_masked`).
    (re.compile(r"[\w.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+"), "[email]"),
)


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


def redact_pii(text: str) -> str:
    """Mask every mobile-, email- and JWT-shaped substring, and every secret path."""
    text = redact_secret_paths(text)
    for pattern, replacement in _VALUE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class PiiRedactingFilter(logging.Filter):
    """The last lock before a handler writes anything (Part 27 §27.14, Part 30 §30.4).

    By KEY: an `extra` named like a secret (`password`, `token`, `cookie`,
    `authorization`, `idempotency_key` …) is replaced outright, because its
    value may be in any shape. By PATTERN: the message, every string `extra`
    and the traceback text are scrubbed of mobile numbers, email addresses and
    JWTs, so a careless `extra={"to": party.mobile}` or an exception message
    quoting a row cannot put a customer's number in a log file. Party names and
    amounts have no shape a pattern can catch; they are kept out by the rule
    that log lines carry ids and counts, which the PII sweep test enforces over
    representative flows.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001 — a bad format string is not ours to fix here
            message = None
        if message is not None:
            scrubbed = redact_pii(message)
            if scrubbed != message:
                record.msg, record.args = scrubbed, ()
        for key, value in list(record.__dict__.items()):
            if key in _RESERVED or key.startswith("_") or key in ("request_id", "tenant_id"):
                continue
            if _SECRET_KEY.search(key) and key not in _SAFE_KEYS:
                if value not in (None, ""):
                    setattr(record, key, REDACTED)
                continue
            if isinstance(value, str):
                scrubbed = redact_pii(value)
                if scrubbed != value:
                    setattr(record, key, scrubbed)
            elif isinstance(value, (list, tuple, dict)) or (
                hasattr(value, "path") and hasattr(value, "method")
            ):
                text = str(value)
                scrubbed = redact_pii(text)
                if scrubbed != text:
                    setattr(record, key, scrubbed)
        if record.exc_info and not record.exc_text:
            record.exc_text = redact_pii(logging.Formatter().formatException(record.exc_info))
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
            # `exc_text` when a filter has already rendered (and scrubbed) it.
            text = record.exc_text or self.formatException(record.exc_info)
            payload["exc_info"] = text[:8192]
        return json.dumps(payload, default=str)


def build_logging_config(
    *, level: str = "INFO", fmt: str = "json", log_dir: str | None = None
) -> dict:
    """The `LOGGING` dict. `ub.<app>` loggers all hang off one `ub` parent."""
    handlers: dict[str, dict] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json" if fmt == "json" else "console",
            "filters": ["request_id", "secret_paths", "pii"],
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
            "filters": ["request_id", "secret_paths", "pii"],
        }
        app_handlers.append("file")

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "filters": {
            "request_id": {"()": "apps.common.logging.RequestIdFilter"},
            "secret_paths": {"()": "apps.common.logging.SecretPathFilter"},
            "pii": {"()": "apps.common.logging.PiiRedactingFilter"},
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
