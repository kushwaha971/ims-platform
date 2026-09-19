"""Settings posture (task S0-20, Part 28 §28.3.9)."""

from __future__ import annotations

import ast
import importlib
import pathlib

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
