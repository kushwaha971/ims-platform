"""The app dependency matrix, enforced (Part 20 §20.1.4, §20.1.5, task S0-22).

Two walkers, on purpose.

The EXISTING apps are checked on their module-level imports only. Deferred
imports inside function bodies are deliberately invisible to that walker — rule
D5's one permitted cycle is broken exactly that way.

The SEVEN NEW apps of the platform expansion (three engines, four verticals;
ADR-041, 10-architecture §3 and §10.1, FRD 00 PLT-X14) are checked on the WHOLE
syntax tree: a deferred import, a `TYPE_CHECKING` import, a relative import and
an `importlib.import_module("apps.…")` are all imports (rule L2). A vertical
that reaches another vertical from inside a function is still coupled to it, and
the release gate of one module becomes the other's.

The matrix declares the seven apps before their folders exist. A row starts to
apply the moment the folder does, so no later task edits this file to add one;
`test_the_matrix_covers_every_app_on_disk` is what makes an unplanned app fail.
"""

from __future__ import annotations

import ast
import pathlib
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass

import pytest

APPS_ROOT = pathlib.Path(__file__).resolve().parents[2] / "apps"
FIXTURE_ROOT = pathlib.Path(__file__).resolve().parent / "fixtures" / "planted_apps"

EXISTING_APPS = frozenset(
    {
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
)

# ── A11 ── the platform expansion's apps (ADR-041) ────────────────────────────
ENGINES = frozenset({"dues", "bookings", "attendance"})
VERTICALS = frozenset({"lending", "library", "gym", "hospitality"})
NEW_APPS = ENGINES | VERTICALS
SHOP_AND_BILLING = frozenset({"sales", "purchases", "inventory", "expenses"})

#: 10-architecture §10.1. Engines and verticals may import these and nothing
#: else of core; `reports`, `imports` and `help` are not in it.
CORE = frozenset(
    {"common", "platform_app", "tax", "files", "parties", "ledger", "payments", "notifications"}
)

#: R27: the only modules of otherwise-forbidden apps a VERTICAL may import.
#: Engines get no such exception — none of them publishes a report or an
#: importer of its own; the verticals do, through these two registries.
VERTICAL_REGISTRY_MODULES = frozenset({"apps.reports.registry", "apps.imports.registry"})

ALL_APPS = EXISTING_APPS | NEW_APPS

# `reports` may import every EXISTING app's selectors (rule D4) — and is written
# out as a literal so that growing ALL_APPS cannot widen it (PLT-X14 BR-3). The
# verticals publish their sections and reports through `reports/registry.py`
# instead, which is the inversion that keeps `reports` below them.
REPORTS_ALLOWED = frozenset(
    {
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
    }
)

# app -> the apps it may import at module level (existing apps) or anywhere
# (the seven new apps).
ALLOWED: dict[str, frozenset[str] | set[str]] = {
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
    # ── A14 ── R72, ADR-056: core `payments` imports no Shop & billing app; the
    # sales and purchase targets are registered by their owners' `ready()`.
    "payments": {"common", "platform_app", "parties", "ledger"},
    "expenses": {"common", "platform_app", "tax", "parties", "ledger", "files"},
    "notifications": {"common", "platform_app", "parties"},
    "imports": {"common", "platform_app", "files", "parties", "inventory", "ledger"},
    "reports": REPORTS_ALLOWED,
    "help": {"common", "platform_app"},
    # ── A11 ── 10-architecture §10.1, verbatim ────────────────────────────────
    "dues": {
        "common",
        "platform_app",
        "tax",
        "files",
        "parties",
        "ledger",
        "payments",
        "notifications",
    },
    "bookings": {"common", "platform_app", "files", "parties"},
    "attendance": {"common", "platform_app", "parties"},
    "lending": CORE | {"dues"},
    "library": CORE | {"dues", "bookings", "attendance"},
    "gym": CORE | {"dues", "attendance", "bookings"},
    "hospitality": CORE | {"bookings", "dues"},
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


# ── A11 ── the whole-AST walker ──────────────────────────────────────────────


@dataclass(frozen=True)
class FoundImport:
    """One import, resolved to an absolute dotted name.

    `target` is the most specific name the statement reaches:
    `from apps.reports import registry` is `apps.reports.registry`, and
    `from apps.reports.registry import register_report` is
    `apps.reports.registry.register_report` — so a prefix test can tell the
    registry module from the rest of the app whichever way it is spelt.
    """

    path: pathlib.Path
    lineno: int
    target: str

    @property
    def app(self) -> str | None:
        parts = self.target.split(".")
        return parts[1] if parts[0] == "apps" and len(parts) > 1 else None


def _dotted_module(path: pathlib.Path, root: pathlib.Path) -> list[str]:
    """`<root>/gym/services/x.py` -> ["apps", "gym", "services", "x"]."""
    relative = path.relative_to(root)
    parts = ["apps", *relative.parts]
    parts[-1] = parts[-1].split(".", 1)[0]  # strip `.py` / `.py.fixture`
    return parts


def _resolve_relative(module: str | None, level: int, dotted: list[str], is_package: bool) -> str:
    # The package a relative import is relative to: the file's own package, or
    # the directory itself for an `__init__`.
    package = dotted if is_package else dotted[:-1]
    base = package[: len(package) - (level - 1)] if level > 1 else package
    return ".".join([*base, module] if module else base)


_IMPORT_FUNCTIONS = {"import_module", "__import__"}


def _string_import_target(node: ast.Call) -> str | None:
    """`importlib.import_module("apps.x")` / `import_module(...)` / `__import__(...)`."""
    func = node.func
    name = (
        func.attr
        if isinstance(func, ast.Attribute)
        else func.id if isinstance(func, ast.Name) else None
    )
    if name not in _IMPORT_FUNCTIONS or not node.args:
        return None
    first = node.args[0]
    if isinstance(first, ast.Constant) and isinstance(first.value, str):
        return first.value
    return None


def _imports_in(
    nodes: Iterable[ast.AST], path: pathlib.Path, root: pathlib.Path
) -> Iterator[FoundImport]:
    dotted = _dotted_module(path, root)
    is_package = dotted[-1] == "__init__"
    if is_package:
        dotted = dotted[:-1]
    for node in nodes:
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield FoundImport(path, node.lineno, alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = (
                _resolve_relative(node.module, node.level, dotted, is_package)
                if node.level
                else node.module or ""
            )
            for alias in node.names:
                yield FoundImport(path, node.lineno, f"{module}.{alias.name}")
        elif isinstance(node, ast.Call):
            target = _string_import_target(node)
            if target is not None:
                yield FoundImport(path, node.lineno, target)


def _all_imports(path: pathlib.Path, root: pathlib.Path) -> list[FoundImport]:
    """Every import anywhere in the file: function bodies, `if TYPE_CHECKING:`
    blocks and `try:` fallbacks included (PLT-X14 BR-1, EC-1)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return list(_imports_in(ast.walk(tree), path, root))


def _import_time_nodes(tree: ast.Module) -> Iterator[ast.AST]:
    """Every node that runs when the module is imported: everything except the
    bodies of functions and lambdas. Class bodies and `if` blocks DO run."""
    stack: list[ast.AST] = list(tree.body)
    while stack:
        node = stack.pop()
        yield node
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)):
            # The decorators and default values run at import time; the body does not.
            stack.extend(getattr(node, "decorator_list", []))
            stack.extend(node.args.defaults)
            stack.extend(d for d in node.args.kw_defaults if d is not None)
            continue
        stack.extend(ast.iter_child_nodes(node))


def _new_app_files(app: str, root: pathlib.Path, suffix: str = ".py") -> list[pathlib.Path]:
    # Tests are excluded (BR-1); migrations are not — a migration is code that runs.
    return sorted(
        path
        for path in (root / app).rglob(f"*{suffix}")
        if "tests" not in path.relative_to(root).parts
    )


def _allowed_for_new_app(app: str, found: FoundImport) -> bool:
    target_app = found.app
    if target_app is None or target_app == app:
        return True
    if target_app in ALLOWED[app]:
        return True
    if app in VERTICALS:
        return any(
            found.target == module or found.target.startswith(f"{module}.")
            for module in VERTICAL_REGISTRY_MODULES
        )
    return False


def _new_app_violations(app: str, root: pathlib.Path = APPS_ROOT, suffix: str = ".py") -> list[str]:
    violations = []
    for path in _new_app_files(app, root, suffix):
        for found in _all_imports(path, root):
            if not _allowed_for_new_app(app, found):
                violations.append(
                    f"{path.relative_to(root)}:{found.lineno} imports {found.target} — "
                    f"10-architecture §10.1 does not allow {app} to import {found.app}, "
                    f"deferred or not (rule L2)"
                )
    return violations


# ── The matrix itself ─────────────────────────────────────────────────────────


def test_the_matrix_covers_every_app_on_disk() -> None:
    """A folder under `apps/` that the matrix has never heard of is unchecked
    code; an existing app missing from disk means the matrix is stale. The seven
    planned apps are the only ones allowed to be declared and absent."""
    on_disk = {p.name for p in APPS_ROOT.iterdir() if p.is_dir() and not p.name.startswith("_")}
    assert set(ALLOWED) == ALL_APPS
    assert on_disk <= ALL_APPS, f"apps with no matrix row: {sorted(on_disk - ALL_APPS)}"
    missing = sorted(EXISTING_APPS - on_disk)
    assert on_disk >= EXISTING_APPS, f"matrix rows with no app: {missing}"


@pytest.mark.parametrize("app", sorted(EXISTING_APPS))
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


# ── A11 ── the seven new apps ─────────────────────────────────────────────────


def test_the_new_rows_are_the_architecture_matrix() -> None:
    """10-architecture §10.1 is the contract; a row edited here to make a
    failing import pass is a decision the architecture owner did not make.
    Engines import no engine and no vertical; verticals import no vertical;
    nobody new imports Shop & billing, `reports`, `imports` or `help`."""
    for engine in ENGINES:
        assert ALLOWED[engine] <= CORE, engine
    for vertical in VERTICALS:
        assert ALLOWED[vertical] <= CORE | ENGINES, vertical
        assert ALLOWED[vertical] >= CORE, vertical
    for app in NEW_APPS:
        assert not ALLOWED[app] & (SHOP_AND_BILLING | {"reports", "imports", "help"}), app
        assert app not in ALLOWED[app]
    assert ALLOWED["dues"] == CORE
    assert ALLOWED["bookings"] == {"common", "platform_app", "files", "parties"}
    assert ALLOWED["attendance"] == {"common", "platform_app", "parties"}
    assert ALLOWED["lending"] == CORE | {"dues"}
    assert ALLOWED["library"] == CORE | ENGINES
    assert ALLOWED["gym"] == CORE | ENGINES
    assert ALLOWED["hospitality"] == CORE | {"bookings", "dues"}


def test_reports_does_not_gain_the_new_apps() -> None:
    """PLT-X14 BR-3. `reports` may read every existing app's selectors; if it
    could read a vertical's, the vertical could never be switched off without
    `reports` breaking. The set is a literal for exactly this reason."""
    assert not ALLOWED["reports"] & NEW_APPS
    assert ALLOWED["reports"] == EXISTING_APPS - {"reports", "help"}


@pytest.mark.parametrize("app", sorted(NEW_APPS))
def test_new_apps_never_import_sideways_even_deferred(app: str) -> None:
    """Rule L1 checked the L2 way: the whole AST, not `tree.body`. Vacuous
    until the app's folder exists, and binding from its first file."""
    if not (APPS_ROOT / app).is_dir():
        pytest.skip(f"apps/{app} does not exist yet")
    assert _new_app_violations(app) == []


@pytest.mark.parametrize("app", sorted(EXISTING_APPS))
def test_no_existing_app_imports_an_engine_or_a_vertical_anywhere(app: str) -> None:
    """Rule L1 from the other side: core (and Shop & billing) never import an
    engine or a vertical, deferred or not — an upward call goes through a
    registry the higher app fills in `ready()` (rule L3). The module-level
    walker above cannot see a deferred one, so this walks the whole tree."""
    for path in _source_files(app):
        for found in _all_imports(path, APPS_ROOT):
            assert found.app not in NEW_APPS, (
                f"{path.relative_to(APPS_ROOT)}:{found.lineno} imports {found.target} — "
                f"{app} never imports an engine or a vertical (rule L1); register a hook instead"
            )


_STDLIB = frozenset(sys.stdlib_module_names) | {"__future__"}


@pytest.mark.parametrize("module", sorted(VERTICAL_REGISTRY_MODULES))
def test_the_two_registry_modules_import_only_common_and_django(module: str) -> None:
    """R27, contracts §1.9. A vertical may import these two modules because
    importing one executes nothing of `reports` or `imports` beyond the
    registry itself. If the registry grew an import-time dependency on the
    rest of its app (its selectors, which import sales), every vertical would
    load sales through it and the exception would be a hole."""
    path = APPS_ROOT / pathlib.Path(*module.split(".")[1:]).with_suffix(".py")
    if not path.exists():
        pytest.skip(f"{module} does not exist yet")  # reports.registry arrives with A10
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for found in _imports_in(_import_time_nodes(tree), path, APPS_ROOT):
        top = found.target.split(".")[0]
        if found.app is not None:
            assert found.app == "common", (
                f"{module}:{found.lineno} imports {found.target} at import time — "
                f"only apps.common is allowed (R27)"
            )
        else:
            assert top in _STDLIB or top == "django", (
                f"{module}:{found.lineno} imports {found.target} at import time — "
                f"only the standard library, Django and apps.common (R27)"
            )


def test_the_document_seam_imports_no_other_app_anywhere() -> None:
    """PLT-X14 BR-2, contracts §1.5: `common/seams/**` is the port verticals
    and engines call to get a tax invoice without importing sales. The day it
    imports sales — even inside a function — every caller imports sales too.
    Vacuous until A5 writes `documents.py`."""
    for path in sorted((APPS_ROOT / "common" / "seams").rglob("*.py")):
        for found in _all_imports(path, APPS_ROOT):
            assert found.app in (None, "common"), (
                f"{path.relative_to(APPS_ROOT)}:{found.lineno} imports {found.target} — "
                f"the document seam imports nothing from another app (rule D1)"
            )


# ── A11 ── the guard on the guard (T-PLT-X14-1) ───────────────────────────────


def test_the_whole_ast_walker_catches_every_planted_spelling() -> None:
    """The planted tree under `fixtures/planted_apps/` holds one fake vertical
    and one fake engine with a sideways import spelt every way this walker
    must see. If any of these goes missing, the real test above passes for the
    wrong reason — and a deferred import between two verticals, which is
    exactly the case the old walker could not see, ships green."""
    gym = _new_app_violations("gym", FIXTURE_ROOT, ".py.fixture")
    reported = sorted(line.split(" imports ")[1].split(" — ")[0] for line in gym)
    assert reported == sorted(
        [
            "apps.library.services.loans.issue_loan",  # deferred, inside a function
            "apps.hospitality.models.Stay",  # under `if TYPE_CHECKING:`
            "apps.sales.models",  # relative: `from ...sales import models`
            "apps.inventory.models",  # importlib.import_module("apps.inventory.models")
            "apps.lending",  # __import__("apps.lending")
            "apps.reports.selectors",  # reports, but not the registry (R27)
            "apps.imports.services.engine.run",  # imports, but not the registry
            "apps.reports.*",  # a star import is the whole app
        ]
    ), gym

    dues = _new_app_violations("dues", FIXTURE_ROOT, ".py.fixture")
    reported_dues = sorted(line.split(" imports ")[1].split(" — ")[0] for line in dues)
    assert reported_dues == sorted(
        [
            "apps.gym.selectors.members.member_label",  # engine -> vertical
            "apps.attendance.services",  # engine -> engine
            "apps.reports.registry.register_report",  # R27 is for verticals only
        ]
    ), dues


def test_the_planted_tree_exercises_what_it_must_allow() -> None:
    """The fixture's allowed imports (core, an engine the vertical uses, the
    two registries by every spelling, its own app relatively, a test file)
    must NOT be reported — otherwise the checker is refusing everything and
    the real test would fail loudly rather than quietly, which is the lesser
    defect but still a wrong guard."""
    gym_files = _new_app_files("gym", FIXTURE_ROOT, ".py.fixture")
    everything = [found.target for path in gym_files for found in _all_imports(path, FIXTURE_ROOT)]
    for allowed in (
        "apps.reports.registry.register_report",
        "apps.reports.registry",
        "apps.imports.registry",
        "apps.dues.services.schedules.create_schedule",
        "apps.gym.services.members",
        "apps.ledger.services.postings.post_source_entry",
    ):
        assert allowed in everything, f"the planted tree no longer contains {allowed}"
    assert all(path.name != "test_planted.py.fixture" for path in gym_files)
    assert (FIXTURE_ROOT / "gym" / "tests" / "test_planted.py.fixture").exists()


def test_the_import_time_walker_skips_function_bodies_only(tmp_path: pathlib.Path) -> None:
    """R27's purity check reads what runs on import: a deferred import inside a
    function is allowed there (imports.registry defers its mappers), but one
    under `if TYPE_CHECKING:` or in a class body is not deferred at all."""
    source = tmp_path / "registry.py"
    source.write_text(
        "from typing import TYPE_CHECKING\n"
        "if TYPE_CHECKING:\n"
        "    from apps.sales.models import SalesDocument\n"
        "class Spec:\n"
        "    from apps.purchases import models\n"
        "def later():\n"
        "    from apps.inventory import models\n",
        encoding="utf-8",
    )
    tree = ast.parse(source.read_text(encoding="utf-8"))
    targets = {f.target for f in _imports_in(_import_time_nodes(tree), source, tmp_path)}
    assert "typing.TYPE_CHECKING" in targets
    assert "apps.sales.models.SalesDocument" in targets
    assert "apps.purchases.models" in targets
    assert "apps.inventory.models" not in targets
