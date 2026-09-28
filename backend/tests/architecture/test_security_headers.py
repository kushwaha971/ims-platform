"""Security headers and the production posture (Part 27 §27.6.4, §27.7.2, Sprint 12).

Two layers: what every Django API response carries in every environment, and
what `config.settings.prod` switches on — proved in a fresh interpreter by the
same `manage.py check --deploy` an operator runs, so a setting that silently
stopped applying fails the build instead of a security review.
"""

from __future__ import annotations

import os
import pathlib
import subprocess
import sys
from typing import Any

import pytest
from django.urls import reverse

BACKEND = pathlib.Path(__file__).resolve().parents[2]

_PROD_ENV = {
    "DJANGO_SETTINGS_MODULE": "config.settings.prod",
    "UB_SECRET_KEY": "prod-like-" + "k" * 60,
    "UB_ALLOWED_HOSTS": "app.example.in",
    "UB_CORS_ALLOWED_ORIGINS": "https://app.example.in",
    "POSTGRES_PASSWORD": "not-the-dev-password",
    "UB_E2E_MODE": "0",
    "UB_ALLOW_PARTNER_HEADER": "0",
}


@pytest.mark.django_db
def test_an_api_response_carries_the_baseline_headers(anonymous_client: Any) -> None:
    """nosniff, DENY, a referrer policy and a CSP that loads nothing — on JSON."""
    response = anonymous_client.get(reverse("health"))
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["X-Frame-Options"] == "DENY"
    assert response["Referrer-Policy"] == "same-origin"
    assert response["Content-Security-Policy"].startswith("default-src 'none'")
    assert "frame-ancestors 'none'" in response["Content-Security-Policy"]


@pytest.mark.django_db
def test_an_error_response_carries_them_too(anonymous_client: Any) -> None:
    response = anonymous_client.get(reverse("v1:party-list"))
    assert response.status_code == 401
    assert response["X-Frame-Options"] == "DENY"
    assert "Content-Security-Policy" in response


def _prod(code: str) -> subprocess.CompletedProcess:
    import tempfile

    env = {**os.environ, **_PROD_ENV, "UB_LOG_DIR": tempfile.mkdtemp(prefix="ub-prod-check-")}
    return subprocess.run(
        [sys.executable, *code.split("\0")],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_check_deploy_is_clean_under_production_settings() -> None:
    """The operator's gate: `manage.py check --deploy` with prod settings, zero issues."""
    result = _prod("manage.py\0check\0--deploy\0--fail-level\0WARNING")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "no issues" in result.stdout, result.stdout


def test_production_turns_on_hsts_and_secure_cookies() -> None:
    """§27.7.2 — HSTS a year with subdomains and preload; every cookie Secure."""
    probe = (
        "import django, json; django.setup(); from django.conf import settings as s; "
        "print(json.dumps([s.SECURE_HSTS_SECONDS, s.SECURE_HSTS_INCLUDE_SUBDOMAINS, "
        "s.SECURE_HSTS_PRELOAD, s.SECURE_SSL_REDIRECT, s.SESSION_COOKIE_SECURE, "
        "s.CSRF_COOKIE_SECURE, s.UB_COOKIE_SECURE, s.X_FRAME_OPTIONS, "
        "s.SECURE_CONTENT_TYPE_NOSNIFF, s.DEBUG]))"
    )
    result = _prod(f"-c\0{probe}")
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip().splitlines()[-1] == (
        "[31536000, true, true, true, true, true, true, \"DENY\", true, false]"
    )
