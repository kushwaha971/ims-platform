"""Shared settings (Part 20 §20.13.1, §20.13.4).

`base.py` never branches on DEBUG; each environment module only overrides.
Every application variable is read from a `UB_`-prefixed environment variable
(Part 29 §29.2.4); third-party images keep their own names (`POSTGRES_*`,
`DJANGO_SETTINGS_MODULE`, `GUNICORN_*`).
"""

from __future__ import annotations

from pathlib import Path

from corsheaders.defaults import default_headers as default_cors_headers
from environs import Env

BASE_DIR = Path(__file__).resolve().parents[2]

env = Env()
env.read_env(str(BASE_DIR / ".env"), recurse=False)

# ── Identity and posture ─────────────────────────────────────────────────────
SECRET_KEY = env.str("UB_SECRET_KEY", "dev-insecure-change-me-not-for-production")
DEBUG = env.bool("UB_DEBUG", False)
ENV_NAME = env.str("UB_ENV_NAME", "local")
UB_VERSION = env.str("UB_VERSION", "dev")
ALLOWED_HOSTS = env.list("UB_ALLOWED_HOSTS", ["localhost", "127.0.0.1", "backend", "testserver"])

# ── Applications (Part 20 §20.13.4) ──────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.admin",
    # Not for its models — it has none. `django.contrib.postgres`'s AppConfig is
    # what registers `OpClass` (and `OrderBy`, `Collate`) as index-expression
    # wrappers; without it `GinIndex(OpClass(Upper("name"), name="gin_trgm_ops"))`
    # renders as `USING gin ((UPPER(name) gin_trgm_ops))` — the opclass inside the
    # expression's parentheses — which Postgres rejects with a syntax error. The
    # functional trigram index of `parties/migrations/0002` needs it, and any
    # future expression index with an opclass will too.
    "django.contrib.postgres",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "apps.common",
    "apps.platform_app",
    "apps.tax",
    "apps.files",
    "apps.parties",
    "apps.ledger",
    "apps.inventory",
    "apps.sales",
    "apps.purchases",
    "apps.payments",
    "apps.expenses",
    "apps.notifications",
    "apps.imports",
    "apps.reports",
    "apps.help",
]

AUTH_USER_MODEL = "platform.User"

# ── Middleware (Part 20 §20.4.3 — order is normative) ─────────────────────────
MIDDLEWARE = [
    "apps.common.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    # Not in the Part 20 §20.4.3 list, and required: `prod.py` sets
    # X_FRAME_OPTIONS = "DENY", which does nothing without this middleware, and
    # `check --deploy` reports security.W002 without it. It sits here because the
    # three positions §20.4.3 fixes — request id first, tenant context after
    # authentication, access log last — are unaffected.
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "apps.common.middleware.TenantContextMiddleware",
    "apps.common.middleware.AccessLogMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ── Database (Part 20 §20.13.4) ──────────────────────────────────────────────
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env.str("POSTGRES_DB", "udhaarbook"),
        "USER": env.str("POSTGRES_USER", "udhaarbook"),
        "PASSWORD": env.str("POSTGRES_PASSWORD", "udhaarbook"),
        "HOST": env.str("POSTGRES_HOST", "127.0.0.1"),
        "PORT": env.int("POSTGRES_PORT", 5432),
        "CONN_MAX_AGE": env.int("UB_DB_CONN_MAX_AGE", 60),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "options": (
                f"-c statement_timeout={env.int('UB_DB_STATEMENT_TIMEOUT_MS', 15000)} "
                f"-c lock_timeout={env.int('UB_DB_LOCK_TIMEOUT_MS', 5000)} "
                f"-c idle_in_transaction_session_timeout=30000"
            ),
        },
    }
}

ATOMIC_REQUESTS = False  # Part 20 §20.11.1 — services own the transaction boundary.
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"  # unused; every model declares a UUID pk.
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024

# Part 27 §27.4.2's blocklist row, in full: the bundled common-password list,
# similarity to the user's own name / mobile / email, and all-numeric. The
# length floors (8, and 10 for owners and admins) are applied by
# `platform.services.passwords.validate`, which knows the caller's roles;
# `MinimumLengthValidator` keeps the 8 here so a path that bypasses the service
# still cannot set a four-character password.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("full_name", "mobile", "email")},
    },
]

# ── i18n / tz (Part 20 §20.13.4) ─────────────────────────────────────────────
USE_TZ = True
TIME_ZONE = "UTC"  # storage is UTC; the tenant timezone is applied in selectors.
USE_I18N = True
LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("hi", "हिन्दी")]
LOCALE_PATHS = [BASE_DIR / "locale"]
UB_DEFAULT_TIMEZONE = env.str("UB_DEFAULT_TIMEZONE", "Asia/Kolkata")
UB_DEFAULT_LOCALE = env.str("UB_DEFAULT_LOCALE", "en")

# ── Static and media (ADR-013) ───────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = env.str("UB_STATIC_ROOT", str(BASE_DIR / "staticfiles"))
MEDIA_URL = "/media/"
MEDIA_ROOT = env.str("UB_MEDIA_ROOT", str(BASE_DIR / "media"))
UB_MEDIA_MAX_UPLOAD_MB = env.int("UB_MEDIA_MAX_UPLOAD_MB", 10)

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ── DRF (Part 20 §20.3.5) ────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "apps.common.exceptions.drf_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.common.authentication.CookieOrBearerJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.PagePagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        # Not `rest_framework.filters.OrderingFilter`: that one *replaces* the
        # selector's ordering with the single key the client sent, and a sort
        # that is not total makes `LIMIT/OFFSET` paging non-deterministic — a
        # tied row can appear on two pages or on none. The subclass appends the
        # primary key so every ordering this product serves is total.
        "apps.common.filters.StableOrderingFilter",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "user": env.str("UB_RATE_LIMIT_USER", "600/min"),
        "otp": env.str("UB_RATE_LIMIT_OTP", "5/10min"),
        "otp_ip": "20/hour",
        "export": env.str("UB_RATE_LIMIT_EXPORT", "10/hour"),
        "public_link": "60/min",
    },
    "UNAUTHENTICATED_USER": None,
    "COERCE_DECIMAL_TO_STRING": True,
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# ── Auth / tokens (ADR-011, Part 20 §20.5.1) ─────────────────────────────────
UB_ACCESS_TOKEN_MINUTES = env.int("UB_ACCESS_TOKEN_MINUTES", 15)
UB_REFRESH_TOKEN_DAYS = env.int("UB_REFRESH_TOKEN_DAYS", 30)
# DEC-010: identity at MVP is email + password. Mobile OTP, the SMS adapters and
# everything that needs a telecom provider sit behind this flag, which is off.
# With it off the OTP routes are not registered at all, so they 404, and no
# module on the default path imports the OTP service.
UB_AUTH_OTP_ENABLED = env.bool("UB_AUTH_OTP_ENABLED", False)

# The OTP settings below are read only when that flag is on.
UB_OTP_PEPPER = env.str("UB_OTP_PEPPER", "dev-otp-pepper")
UB_OTP_TTL_SECONDS = env.int("UB_OTP_TTL_SECONDS", 300)
UB_OTP_MAX_ATTEMPTS = env.int("UB_OTP_MAX_ATTEMPTS", 5)

# Password reset: single-use, 15-minute, hashed at rest (Part 27 §27.4.2).
UB_RESET_TOKEN_TTL_SECONDS = env.int("UB_RESET_TOKEN_TTL_SECONDS", 900)
# Address verification is plumbed and **off**: nothing blocks login on it
# (see `services/auth.py` and `NOTES-FOR-REVIEW.md`).
UB_EMAIL_VERIFICATION_ENABLED = env.bool("UB_EMAIL_VERIFICATION_ENABLED", False)
UB_VERIFY_TOKEN_TTL_SECONDS = env.int("UB_VERIFY_TOKEN_TTL_SECONDS", 86400)

from datetime import timedelta  # noqa: E402  (kept next to the settings it feeds)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=UB_ACCESS_TOKEN_MINUTES),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=UB_REFRESH_TOKEN_DAYS),
    "ROTATE_REFRESH_TOKENS": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "sub",
    "TOKEN_TYPE_CLAIM": "typ",
    "ACCESS_TOKEN_CLASS": "rest_framework_simplejwt.tokens.AccessToken",
}

UB_COOKIE_ACCESS_NAME = "ub_access"
UB_COOKIE_REFRESH_NAME = "ub_refresh"
UB_COOKIE_DOMAIN = env.str("UB_COOKIE_DOMAIN", "") or None
UB_COOKIE_SECURE = env.bool("UB_COOKIE_SECURE", False)
UB_PUBLIC_BASE_URL = env.str("UB_PUBLIC_BASE_URL", "http://localhost:3000")
UB_API_BASE_PATH = env.str("UB_API_BASE_PATH", "/api/v1")

# ── CORS / CSRF ──────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list("UB_CORS_ALLOWED_ORIGINS", ["http://localhost:3000"])
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = env.list("UB_CSRF_TRUSTED_ORIGINS", ["http://localhost:3000"])
# `django-cors-headers` defaults this to `[]`, which makes every response header
# below invisible to a cross-origin browser — and the deployment topologies are
# split: dev is cross-origin (frontend :3000, API :8000) while production is
# same-origin behind nginx. Without this list a header-based guard passes in
# production and silently does nothing in dev, or the reverse. Each entry is a
# header some client code actually reads:
#   X-Request-Id        — `toApiError` quotes it to support.
#   X-Tenant-Id         — PLT-04 FR-4 / CCR-3 stale-tab guard.
#   X-Tenant-Scope      — the debugging aid `TenantContextMiddleware` sets.
#   Idempotent-Replayed — tells the client its retry was a replay, not a new write.
#   Retry-After         — the throttle countdown (Part 22 §22.1).
CORS_EXPOSE_HEADERS = [
    "X-Request-Id",
    "X-Tenant-Id",
    "X-Tenant-Scope",
    "Idempotent-Replayed",
    "Retry-After",
]

# The same split, in the other direction — and this is the half that stops the
# product working rather than merely blinding a client. `CORS_EXPOSE_HEADERS`
# above governs which response headers a cross-origin browser may *read*;
# `CORS_ALLOW_HEADERS` governs which request headers it may *send*. A header
# outside this list does not arrive stripped: the preflight fails and the
# request is never made at all.
#
# Found by running the two tiers together for the first time. Every browser call
# carries `X-Request-Id` (`AxiosInstances` mints one per request), so in dev —
# frontend :3000, API :8000, genuinely cross-origin — *every* request failed
# preflight and sign-in was impossible. Nothing caught it earlier because the
# backend tests use Django's test client, which never performs a preflight, and
# production is same-origin behind nginx, where CORS does not apply. So the
# configuration was wrong in exactly the topology every developer runs and right
# in the one the tests and production use.
#
# `django-cors-headers` defaults cover accept, authorization, content-type,
# origin, user-agent, x-requested-with and `x-csrftoken`. The four below are the
# ones this client actually sends and that the defaults miss. Note `X-CSRF-Token`
# is *not* `x-csrftoken`: the default list carries Django's own spelling, and the
# client uses the conventional one, so the two do not cover each other.
CORS_ALLOW_HEADERS = (
    *default_cors_headers,
    "X-Request-Id",      # every request; quoted back to support by `toApiError`
    "X-CSRF-Token",      # double-submit cookie guard (§20.4.6)
    "Idempotency-Key",   # replay-safe writes (§22.3)
    "X-Client",          # `web` | `api`, read by throttling and audit
)

# ── Jobs and scheduler (ADR-012, Part 20 §20.8) ──────────────────────────────
UB_JOBS_EAGER = env.bool("UB_JOBS_EAGER", False)
UB_SCHEDULER_INTERVAL = env.int("UB_SCHEDULER_INTERVAL", 60)
UB_SCHEDULER_BATCH = env.int("UB_SCHEDULER_BATCH", 50)
UB_SCHEDULER_ENQUEUE_LOCK_ID = env.int("UB_SCHEDULER_ENQUEUE_LOCK_ID", 918273645)

# ── Integrations (ADR-015/016) ───────────────────────────────────────────────
UB_SMS_BACKEND = env.str("UB_SMS_BACKEND", "apps.common.integrations.sms.console.ConsoleSmsBackend")
UB_SMS_SENDER_ID = env.str("UB_SMS_SENDER_ID", "UDHAAR")
UB_WHATSAPP_BACKEND = env.str(
    "UB_WHATSAPP_BACKEND", "apps.common.integrations.whatsapp.deep_link.WaMeBackend"
)
UB_EMAIL_BACKEND = env.str("UB_EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_BACKEND = UB_EMAIL_BACKEND
# The outbound-email *adapter* (our `MessageLog`-writing interface), which is a
# different thing from Django's `EMAIL_BACKEND` above: this is the seam a real
# provider is dropped into, and swapping it is a settings change, not a refactor.
UB_EMAIL_ADAPTER = env.str(
    "UB_EMAIL_ADAPTER", "apps.common.integrations.email.console.ConsoleEmailBackend"
)
UB_EMAIL_FROM = env.str("UB_EMAIL_FROM", "no-reply@digikhaato.local")

# ── Misc feature flags / ops ─────────────────────────────────────────────────
UB_SUPER_ADMIN_MOBILES = env.list("UB_SUPER_ADMIN_MOBILES", [])
UB_FEATURE_FLAGS = env.json("UB_FEATURE_FLAGS", "{}")
UB_E2E_MODE = env.bool("UB_E2E_MODE", False)
UB_ALLOW_PARTNER_HEADER = env.bool("UB_ALLOW_PARTNER_HEADER", False)
# PLT-01 EC-6: `ConsoleSmsBackend` with DEBUG=False is a deployment defect
# unless the operator says otherwise (the single-user local deployment).
UB_ALLOW_CONSOLE_SMS = env.bool("UB_ALLOW_CONSOLE_SMS", False)

# ── Logging (Part 20 §20.13.4, Part 30 §30.2) ────────────────────────────────
UB_LOG_LEVEL = env.str("UB_LOG_LEVEL", "INFO")
UB_LOG_FORMAT = env.str("UB_LOG_FORMAT", "json")
UB_LOG_DIR = env.str("UB_LOG_DIR", str(BASE_DIR / "logs"))
UB_LOG_SQL = env.bool("UB_LOG_SQL", False)

from apps.common.logging import build_logging_config  # noqa: E402

LOGGING = build_logging_config(level=UB_LOG_LEVEL, fmt=UB_LOG_FORMAT)
