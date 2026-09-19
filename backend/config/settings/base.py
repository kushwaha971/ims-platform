"""Shared settings (Part 20 §20.13.1, §20.13.4).

`base.py` never branches on DEBUG; each environment module only overrides.
Every application variable is read from a `UB_`-prefixed environment variable
(Part 29 §29.2.4); third-party images keep their own names (`POSTGRES_*`,
`DJANGO_SETTINGS_MODULE`, `GUNICORN_*`).
"""

from __future__ import annotations

from pathlib import Path

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

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
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
        "rest_framework.filters.OrderingFilter",
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
UB_OTP_PEPPER = env.str("UB_OTP_PEPPER", "dev-otp-pepper")
UB_OTP_TTL_SECONDS = env.int("UB_OTP_TTL_SECONDS", 300)
UB_OTP_MAX_ATTEMPTS = env.int("UB_OTP_MAX_ATTEMPTS", 5)

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

# ── Misc feature flags / ops ─────────────────────────────────────────────────
UB_SUPER_ADMIN_MOBILES = env.list("UB_SUPER_ADMIN_MOBILES", [])
UB_FEATURE_FLAGS = env.json("UB_FEATURE_FLAGS", "{}")
UB_E2E_MODE = env.bool("UB_E2E_MODE", False)
UB_ALLOW_PARTNER_HEADER = env.bool("UB_ALLOW_PARTNER_HEADER", False)

# ── Logging (Part 20 §20.13.4, Part 30 §30.2) ────────────────────────────────
UB_LOG_LEVEL = env.str("UB_LOG_LEVEL", "INFO")
UB_LOG_FORMAT = env.str("UB_LOG_FORMAT", "json")
UB_LOG_DIR = env.str("UB_LOG_DIR", str(BASE_DIR / "logs"))
UB_LOG_SQL = env.bool("UB_LOG_SQL", False)

from apps.common.logging import build_logging_config  # noqa: E402

LOGGING = build_logging_config(level=UB_LOG_LEVEL, fmt=UB_LOG_FORMAT)
