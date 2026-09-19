"""Local development (Part 20 §20.13.1)."""

from __future__ import annotations

from .base import *  # noqa: F403

DEBUG = True
ENV_NAME = "local"
ALLOWED_HOSTS = ["*"]
CORS_ALLOW_ALL_ORIGINS = True
UB_LOG_FORMAT = "console"
LOGGING = build_logging_config(level="DEBUG", fmt="console")  # noqa: F405
