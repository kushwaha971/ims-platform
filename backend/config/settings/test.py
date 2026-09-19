"""Test settings (Part 20 §20.13.1).

Runs against PostgreSQL, which the suite needs for arrays, partial unique
indexes and `FOR UPDATE SKIP LOCKED`. Tests that cannot run without those are
marked `@pytest.mark.postgres`.
"""

from __future__ import annotations

from .base import *  # noqa: F403

DEBUG = False
ENV_NAME = "test"
ALLOWED_HOSTS = ["*", "testserver"]

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

UB_JOBS_EAGER = True

import tempfile  # noqa: E402

MEDIA_ROOT = tempfile.mkdtemp(prefix="ub-test-media-")

DATABASES["default"]["ATOMIC_REQUESTS"] = False  # noqa: F405
# `lock_timeout` must stay short so the concurrency tests fail fast rather than hang.
DATABASES["default"]["OPTIONS"] = {"options": "-c lock_timeout=5000"}  # noqa: F405

LOGGING = build_logging_config(level="CRITICAL", fmt="console")  # noqa: F405
