"""Production (Part 20 §20.13.1, §20.13.4)."""

from __future__ import annotations

from .base import *  # noqa: F403

DEBUG = False
ENV_NAME = env.str("UB_ENV_NAME", "production")  # noqa: F405

SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
UB_COOKIE_SECURE = True

LOGGING = build_logging_config(  # noqa: F405
    level=UB_LOG_LEVEL,  # noqa: F405
    fmt="json",
    log_dir=UB_LOG_DIR,  # noqa: F405
)

# Startup assertions (Part 20 §20.13.1): a production process that boots with a
# development default must fail loudly rather than serve traffic insecurely.
assert not DEBUG, "DEBUG must be False in production."
assert (
    SECRET_KEY != "dev-insecure-change-me-not-for-production"
), "UB_SECRET_KEY must be set in production."
assert ALLOWED_HOSTS and ALLOWED_HOSTS != ["*"], "UB_ALLOWED_HOSTS must be set in production."
assert (
    DATABASES["default"]["PASSWORD"] != "udhaarbook"  # noqa: F405
), "POSTGRES_PASSWORD must be set in production."
assert "*" not in CORS_ALLOWED_ORIGINS, "UB_CORS_ALLOWED_ORIGINS must not be '*' in production."
assert not UB_E2E_MODE, "UB_E2E_MODE must be 0 in production."  # noqa: F405
assert not UB_ALLOW_PARTNER_HEADER, "UB_ALLOW_PARTNER_HEADER must be 0 in production."  # noqa: F405
