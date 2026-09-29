"""The `UB_`-prefixed variables this application reads.

Mirrors the normative catalogue in Part 29 §29.2.4. Part 20 §20.13.2 makes this
list the thing `CommonConfig.ready()` compares the environment against, so a
typo'd variable produces a startup warning instead of silence.
"""

from __future__ import annotations

KNOWN_UB_VARIABLES: frozenset[str] = frozenset(
    {
        "UB_SECRET_KEY",
        "UB_SECRET_KEY_FALLBACKS",
        "UB_DEBUG",
        "UB_ENV_NAME",
        "UB_ALLOWED_HOSTS",
        "UB_CORS_ALLOWED_ORIGINS",
        "UB_CSRF_TRUSTED_ORIGINS",
        "UB_COOKIE_DOMAIN",
        "UB_COOKIE_SECURE",
        "UB_PUBLIC_BASE_URL",
        "UB_API_BASE_PATH",
        "UB_DB_CONN_MAX_AGE",
        "UB_DB_STATEMENT_TIMEOUT_MS",
        "UB_DB_LOCK_TIMEOUT_MS",
        "UB_ACCESS_TOKEN_MINUTES",
        # PLT-05 FR-11 — invitation lifetime in days.
        "UB_INVITATION_DAYS",
        "UB_REFRESH_TOKEN_DAYS",
        "UB_AUTH_OTP_ENABLED",
        "UB_OTP_PEPPER",
        "UB_OTP_TTL_SECONDS",
        "UB_OTP_MAX_ATTEMPTS",
        "UB_RESET_TOKEN_TTL_SECONDS",
        "UB_EMAIL_VERIFICATION_ENABLED",
        "UB_VERIFY_TOKEN_TTL_SECONDS",
        "UB_SMS_BACKEND",
        "UB_SMS_SENDER_ID",
        # Per-worktree test database (scripts/worktree-bootstrap.sh), read by
        # config/settings/test.py so parallel tracks never share one.
        "UB_TEST_DB_NAME",
        "UB_WHATSAPP_BACKEND",
        "UB_EMAIL_BACKEND",
        "UB_EMAIL_ADAPTER",
        "UB_EMAIL_FROM",
        "UB_MEDIA_ROOT",
        "UB_STATIC_ROOT",
        "UB_MEDIA_MAX_UPLOAD_MB",
        "UB_LOG_LEVEL",
        "UB_LOG_FORMAT",
        "UB_LOG_DIR",
        "UB_LOG_SQL",
        "UB_JOBS_EAGER",
        "UB_SCHEDULER_INTERVAL",
        "UB_SCHEDULER_BATCH",
        "UB_SCHEDULER_ENQUEUE_LOCK_ID",
        "UB_RATE_LIMIT_USER",
        "UB_RATE_LIMIT_OTP",
        "UB_RATE_LIMIT_EXPORT",
        "UB_RATE_LIMIT_PARTY_WRITE",
        "UB_RATE_LIMIT_PARTY_SEARCH",
        "UB_RATE_LIMIT_LEDGER_WRITE",
        "UB_DEFAULT_TIMEZONE",
        "UB_DEFAULT_LOCALE",
        "UB_SUPER_ADMIN_MOBILES",
        "UB_FEATURE_FLAGS",
        "UB_VERSION",
        "UB_E2E_MODE",
        "UB_E2E_RELAX_THROTTLES",
        "UB_TEST_DB_NAME",
        "UB_ALLOW_PARTNER_HEADER",
        "UB_ALLOW_CONSOLE_SMS",
        "UB_ROLE",
        # A1 (PLT-X11) — show modules that are built but not yet released.
        "UB_UNRELEASED_MODULES",
    }
)
