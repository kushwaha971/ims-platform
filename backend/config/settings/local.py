"""Local development (Part 20 §20.13.1)."""

from __future__ import annotations

from .base import *  # noqa: F403

DEBUG = True
ENV_NAME = "local"
ALLOWED_HOSTS = ["*"]
CORS_ALLOW_ALL_ORIGINS = True
UB_LOG_FORMAT = "console"
LOGGING = build_logging_config(level="DEBUG", fmt="console")  # noqa: F405

# ── E2E: lift the shared per-IP auth budgets (local ONLY) ────────────────────
# Every e2e harness signs up and signs in from 127.0.0.1, so the budgets keyed
# on the caller's IP — 20 sign-ups an hour, 100 failed logins an hour, 20 reset
# requests an hour — are one pool shared by the whole regression run, and a
# concurrent run (`e2e/run-regression.mjs`) drains it in minutes. Those three
# ceilings are lifted when `UB_E2E_RELAX_THROTTLES=1`; nothing else is.
#
# What stays exactly as shipped, on purpose: the per-ACCOUNT login lockout (10
# failures per address), every DRF per-user rate (the aging harness asserts the
# 11th export in an hour is a 429), CSRF, authentication and permissions. The
# harnesses use fresh accounts per run, so per-account budgets never collide.
#
# Read here and nowhere else: `staging.py` and `prod.py` import `base`, never
# this module, so the variable is inert there — asserted by
# `tests/architecture/test_settings.py`. The budgets are module constants in
# `apps/platform_app/services/throttle.py`, read at call time as
# `throttle.<NAME>`, so rebinding them here is the whole mechanism.
UB_E2E_RELAX_THROTTLES = env.bool("UB_E2E_RELAX_THROTTLES", False)  # noqa: F405
if UB_E2E_RELAX_THROTTLES:
    from apps.platform_app.services import throttle as _ub_throttle

    _ub_throttle.REGISTRATIONS_PER_IP = 100_000
    _ub_throttle.LOGIN_FAILURES_PER_IP = 100_000
    _ub_throttle.RESET_REQUESTS_PER_IP = 100_000
