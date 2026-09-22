"""The app dependency matrix, enforced (Part 20 §20.1.4, §20.1.5, task S0-22).

Walks the AST of every module under `apps/` and checks module-level imports
against the declared matrix. Deferred imports inside function bodies are
deliberately invisible to this walker — rule D5's one permitted cycle is broken
exactly that way.
"""

from __future__ import annotations

import ast
import pathlib

import pytest

APPS_ROOT = pathlib.Path(__file__).resolve().parents[2] / "apps"

ALL_APPS = {
    "common",
    "platform_app",
    "tax",
    "files",
    "parties",
    "ledger",
    "inventory",
    "sales",
    "purchases",
    "payments",
    "expenses",
    "notifications",
    "imports",
    "reports",
    "help",
}

# app -> the apps it may import at module level.
ALLOWED: dict[str, set[str]] = {
    "common": set(),  # rule D1 — common depends on nothing
    "platform_app": {"common"},
    "tax": {"common", "platform_app"},
    "files": {"common", "platform_app"},
    # `tax` added for PTY-01. `parties_party.gstin` and `.state_code` are in
    # the canonical schema (Part 21 §21.3.3), so validating a party's GSTIN is
    # work this app cannot avoid — and `tax` is the app that owns the checksum,
    # the state-code table and the PAN extraction. The alternative was a second
    # copy of the check-digit algorithm inside `parties`, which is how two
    # implementations of the same rule start disagreeing.
    #
    # No cycle: `tax` depends on `{common, platform_app}` only, and `inventory`,
    # `sales` and `purchases` already reach it the same way.
    "parties": {"common", "platform_app", "tax", "files"},
    "ledger": {"common", "platform_app", "parties", "files"},
    "inventory": {"common", "platform_app", "tax", "files"},
    "sales": {"common", "platform_app", "tax", "files", "parties", "ledger", "inventory"},
    "purchases": {"common", "platform_app", "tax", "files", "parties", "ledger", "inventory"},
    "payments": {"common", "platform_app", "parties", "ledger", "sales", "purchases"},
    "expenses": {"common", "platform_app", "tax", "parties", "ledger", "files"},
    "notifications": {"common", "platform_app", "parties"},
    "imports": {"common", "platform_app", "files", "parties", "inventory", "ledger"},
    "reports": ALL_APPS - {"reports", "help"},
    "help": {"common", "platform_app"},
}


def _module_level_imports(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in tree.body:  # top level only — deferred imports live inside functions
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            found.add(node.module)
    return found


def _source_files(app: str) -> list[pathlib.Path]:
    return [
        path
        for path in (APPS_ROOT / app).rglob("*.py")
        if "migrations" not in path.parts and "tests" not in path.parts
    ]


def test_the_matrix_covers_every_app_on_disk() -> None:
    on_disk = {p.name for p in APPS_ROOT.iterdir() if p.is_dir() and not p.name.startswith("_")}
    assert on_disk == ALL_APPS == set(ALLOWED)


@pytest.mark.parametrize("app", sorted(ALLOWED))
def test_app_only_imports_allowed_apps(app: str) -> None:
    allowed = ALLOWED[app] | {app}
    for path in _source_files(app):
        for module in _module_level_imports(path):
            if not module.startswith("apps."):
                continue
            target = module.split(".")[1]
            assert target in allowed, (
                f"{path.relative_to(APPS_ROOT)} imports apps.{target} at module level, "
                f"which the Part 20 §20.1.4 matrix does not allow for {app}"
            )


def test_common_imports_no_other_app_at_module_level() -> None:
    """Rule D1, stated separately because it is the one that holds the rest up."""
    for path in _source_files("common"):
        for module in _module_level_imports(path):
            assert not module.startswith("apps.") or module.startswith("apps.common"), (
                f"{path.relative_to(APPS_ROOT)} imports {module} — `common` depends on nothing "
                f"(rule D1). Use django.apps.apps.get_model() inside the function."
            )


def test_services_never_import_the_http_layer() -> None:
    """Rule D6: a service takes Python values and returns Python values."""
    for path in APPS_ROOT.rglob("services/**/*.py"):
        text = path.read_text(encoding="utf-8")
        assert "rest_framework" not in text, f"{path} imports DRF — services are HTTP-free (D6)"
        assert "django.http" not in text, f"{path} imports django.http — services are HTTP-free"


def test_selectors_never_write() -> None:
    """Rule D8."""
    banned = (".save(", ".create(", ".update(", ".delete(", "transaction.atomic")
    for path in APPS_ROOT.rglob("selectors/**/*.py"):
        text = path.read_text(encoding="utf-8")
        for token in banned:
            assert token not in text, f"{path} contains {token!r} — selectors are read-only (D8)"


def test_reports_imports_no_services() -> None:
    """Rule D4: `reports` may import any app's selectors and no app's services."""
    for path in _source_files("reports"):
        for module in _module_level_imports(path):
            assert (
                ".services" not in module
            ), f"{path.relative_to(APPS_ROOT)} imports {module} — reports is read-only"


def test_the_walker_actually_catches_a_bad_import(tmp_path: pathlib.Path) -> None:
    """The guard on the guard: a deliberately-bad file must fail the check."""
    bad = tmp_path / "bad.py"
    bad.write_text("from apps.sales.models import SalesDocument\n")
    assert _module_level_imports(bad) == {"apps.sales.models"}

    deferred = tmp_path / "deferred.py"
    deferred.write_text("def f():\n    from apps.sales.models import SalesDocument\n")
    assert _module_level_imports(deferred) == set()
