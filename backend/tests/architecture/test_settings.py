"""Settings posture (task S0-20, Part 28 §28.3.9)."""

from __future__ import annotations

import ast
import importlib
import json
import os
import pathlib
import subprocess
import sys

import pytest
from django.conf import settings

SETTINGS_DIR = pathlib.Path(__file__).resolve().parents[2] / "config" / "settings"


def test_the_four_settings_modules_are_the_only_spellings() -> None:
    """Part 29 §29.2.4: `config.settings.{local,staging,prod,test}` and no other."""
    modules = {p.stem for p in SETTINGS_DIR.glob("*.py")} - {"__init__"}
    assert modules == {"base", "local", "staging", "prod", "test"}


def test_test_settings_have_debug_off() -> None:
    assert settings.DEBUG is False


def test_atomic_requests_is_off() -> None:
    """Part 20 §20.11.1: the service opens the transaction, never the request."""
    assert settings.ATOMIC_REQUESTS is False
    assert settings.DATABASES["default"].get("ATOMIC_REQUESTS") is False


def test_storage_is_utc_and_the_business_timezone_is_india() -> None:
    assert settings.USE_TZ is True
    assert settings.TIME_ZONE == "UTC"
    assert settings.UB_DEFAULT_TIMEZONE == "Asia/Kolkata"


def test_the_exception_handler_and_pagination_are_ours() -> None:
    assert settings.REST_FRAMEWORK["EXCEPTION_HANDLER"] == (
        "apps.common.exceptions.drf_exception_handler"
    )
    assert settings.REST_FRAMEWORK["DEFAULT_PAGINATION_CLASS"] == (
        "apps.common.pagination.PagePagination"
    )
    assert settings.REST_FRAMEWORK["PAGE_SIZE"] == 25
    assert settings.REST_FRAMEWORK["COERCE_DECIMAL_TO_STRING"] is True


def test_the_middleware_order_is_the_normative_one() -> None:
    """Part 20 §20.4.3: request id first, tenant context after authentication."""
    order = list(settings.MIDDLEWARE)
    assert order[0] == "apps.common.middleware.RequestIdMiddleware"
    assert order.index("apps.common.middleware.TenantContextMiddleware") > order.index(
        "django.contrib.auth.middleware.AuthenticationMiddleware"
    )
    assert order[-1] == "apps.common.middleware.AccessLogMiddleware"


def test_the_user_model_is_the_platform_one() -> None:
    assert settings.AUTH_USER_MODEL == "platform.User"


def test_every_app_of_part_20_is_installed() -> None:
    expected = {
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
    }
    assert expected <= set(settings.INSTALLED_APPS)


def test_environment_is_read_only_inside_the_settings_package() -> None:
    """Part 26 §26.10 R10.1: application code never reads os.environ."""
    apps_root = pathlib.Path(__file__).resolve().parents[2] / "apps"
    offenders = []
    for path in apps_root.rglob("*.py"):
        if "tests" in path.parts or "migrations" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if "os.environ" in text or "os.getenv" in text:
            # `apps/common/apps.py` compares the environment against the Part 29
            # catalogue, which is the one place that must see it (§20.13.2).
            if path.name != "apps.py":
                offenders.append(str(path.relative_to(apps_root)))
    assert offenders == []


def test_every_ub_variable_a_settings_module_reads_is_in_the_catalogue() -> None:
    """Part 28 §28.3.9, the converse direction of the startup warning."""
    from apps.common.env_catalogue import KNOWN_UB_VARIABLES

    read: set[str] = set()
    for path in SETTINGS_DIR.glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                if node.value.startswith("UB_") and node.value.isupper():
                    read.add(node.value)
    unknown = read - KNOWN_UB_VARIABLES
    assert unknown == set(), f"not in the Part 29 §29.2.4 catalogue: {sorted(unknown)}"


def test_prod_settings_refuse_the_development_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    """A production process that boots with a development key must fail."""
    monkeypatch.setenv("UB_SECRET_KEY", "dev-insecure-change-me-not-for-production")
    monkeypatch.setenv("UB_DEBUG", "0")
    with pytest.raises(AssertionError, match="UB_SECRET_KEY"):
        importlib.reload(importlib.import_module("config.settings.prod"))


def test_the_custom_response_headers_are_exposed_cross_origin() -> None:
    """`django-cors-headers` defaults `CORS_EXPOSE_HEADERS` to `[]`.

    Dev is cross-origin (frontend :3000, API :8000) and production is
    same-origin behind nginx, so an unexposed header is one that works in one
    topology and silently does nothing in the other — the worst shape a bug can
    have. Every header the client actually reads has to be on this list.
    """
    exposed = set(settings.CORS_EXPOSE_HEADERS)
    assert {
        "X-Request-Id",
        "X-Tenant-Id",
        "Idempotent-Replayed",
        "Retry-After",
    } <= exposed


# ── UB_E2E_RELAX_THROTTLES: a local-only lever ──────────────────────────────
# Each case imports a settings module in a FRESH interpreter, because the lever
# works by rebinding module constants in `throttle.py` and importing `local` in
# this process would leak the relaxed budgets into every later test.
_PROD_LIKE_ENV = {
    "UB_SECRET_KEY": "not-a-dev-key-" + "x" * 40,
    "UB_DEBUG": "0",
    "UB_ALLOWED_HOSTS": "shop.example.com",
    "UB_CORS_ALLOWED_ORIGINS": "https://shop.example.com",
    "POSTGRES_PASSWORD": "not-the-dev-password",
    "UB_E2E_MODE": "0",
    "UB_ALLOW_PARTNER_HEADER": "0",
}
_PROBE = """
import json, sys, importlib
mod = importlib.import_module(sys.argv[1])
from apps.platform_app.services import throttle as t
print(json.dumps({
    "attr": getattr(mod, "UB_E2E_RELAX_THROTTLES", None),
    "register_ip": t.REGISTRATIONS_PER_IP,
    "login_ip_fail": t.LOGIN_FAILURES_PER_IP,
    "reset_ip": t.RESET_REQUESTS_PER_IP,
    "login_email": t.LOGIN_FAILURES_PER_IDENTIFIER,
    "rates": mod.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
}))
"""
_SHIPPED = {"register_ip": 20, "login_ip_fail": 100, "reset_ip": 20, "login_email": 10}


def _settings_probe(module: str, relax: str | None) -> dict:
    env = {k: v for k, v in os.environ.items() if k != "UB_E2E_RELAX_THROTTLES"}
    env.update(_PROD_LIKE_ENV)
    env["DJANGO_SETTINGS_MODULE"] = module
    if relax is not None:
        env["UB_E2E_RELAX_THROTTLES"] = relax
    out = subprocess.run(
        [sys.executable, "-c", _PROBE, module],
        cwd=SETTINGS_DIR.parents[1],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    return json.loads(out.stdout.strip().splitlines()[-1])


@pytest.mark.parametrize("module", ["config.settings.prod", "config.settings.staging"])
def test_prod_and_staging_ignore_the_e2e_throttle_relaxation(module: str) -> None:
    """`UB_E2E_RELAX_THROTTLES=1` must change nothing outside local settings."""
    relaxed = _settings_probe(module, "1")
    shipped = _settings_probe(module, None)
    assert relaxed["attr"] is None, f"{module} reads UB_E2E_RELAX_THROTTLES"
    assert {k: relaxed[k] for k in _SHIPPED} == _SHIPPED
    assert relaxed["rates"] == shipped["rates"]


def test_local_settings_relax_only_the_per_ip_auth_budgets() -> None:
    """The positive control: the lever works in local, and only on the per-IP budgets."""
    off = _settings_probe("config.settings.local", None)
    on = _settings_probe("config.settings.local", "1")
    assert off["attr"] is False and {k: off[k] for k in _SHIPPED} == _SHIPPED
    assert on["attr"] is True
    assert on["register_ip"] > 1000 and on["login_ip_fail"] > 1000 and on["reset_ip"] > 1000
    # The per-account lockout and every DRF per-user rate are untouched.
    assert on["login_email"] == _SHIPPED["login_email"]
    assert on["rates"] == off["rates"]


def test_only_the_local_settings_module_names_the_e2e_lever() -> None:
    names = {
        p.stem
        for p in SETTINGS_DIR.glob("*.py")
        if "UB_E2E_RELAX_THROTTLES" in p.read_text(encoding="utf-8")
    }
    assert names == {"local"}
