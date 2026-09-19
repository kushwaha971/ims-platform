"""The ADR-021 allow-list is closed (canon §0.4, task S0-03).

Every distribution named in `requirements/*.txt` must appear in the allow-list,
and the allow-list is the one in canon §0.4 verbatim. Anything else needs an ADR,
not a pip install.
"""

from __future__ import annotations

import pathlib
import re

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[2]
REQUIREMENTS = BACKEND_ROOT / "requirements"

# canon §0.4, ADR-021: "Backend allowed at MVP: Django, djangorestframework,
# djangorestframework-simplejwt, psycopg[binary], django-filter,
# django-cors-headers, Pillow, python-decouple/environs, pytest, pytest-django,
# black, isort, flake8, factory-boy."
ADR_021_BACKEND = {
    "django",
    "djangorestframework",
    "djangorestframework-simplejwt",
    "psycopg",
    "django-filter",
    "django-cors-headers",
    "pillow",
    "python-decouple",
    "environs",
    "pytest",
    "pytest-django",
    "black",
    "isort",
    "flake8",
    "factory-boy",
}

# ADR-019 / Part 20 §20.13.5 name gunicorn as the production server; it is the
# process manager rather than a library and is listed here so `prod.txt` passes.
PRODUCTION_SERVER = {"gunicorn"}

_LINE = re.compile(r"^(?P<name>[A-Za-z0-9._-]+)(?P<extras>\[[^\]]*\])?==(?P<version>.+)$")


def _declared(path: pathlib.Path) -> set[tuple[str, str]]:
    found = set()
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("-r"):
            continue
        match = _LINE.match(line)
        assert match, f"{path.name}: {line!r} is not `name==version` — every pin is exact (R13.3)"
        found.add((match["name"].lower(), match["version"]))
    return found


def test_every_requirement_is_pinned_exactly() -> None:
    for path in REQUIREMENTS.glob("*.txt"):
        _declared(path)  # the assertion is inside the parser


def test_base_requirements_are_a_subset_of_the_allow_list() -> None:
    names = {name for name, _ in _declared(REQUIREMENTS / "base.txt")}
    assert names <= ADR_021_BACKEND, f"outside ADR-021: {sorted(names - ADR_021_BACKEND)}"


def test_dev_requirements_are_a_subset_of_the_allow_list() -> None:
    names = {name for name, _ in _declared(REQUIREMENTS / "dev.txt")}
    assert names <= ADR_021_BACKEND, f"outside ADR-021: {sorted(names - ADR_021_BACKEND)}"


def test_prod_requirements_add_only_the_production_server() -> None:
    names = {name for name, _ in _declared(REQUIREMENTS / "prod.txt")}
    extra = names - ADR_021_BACKEND
    assert extra <= PRODUCTION_SERVER, f"outside ADR-021: {sorted(extra - PRODUCTION_SERVER)}"


def test_uuid7_is_implemented_in_house_not_installed() -> None:
    """Part 32 §32.3.8 pre-decided this: RFC 9562 in ~20 lines, no dependency.

    Part 20 §20.13.4 proposes `uuid6` as an ADR-021a addition; the sprint plan's
    risk register answers it the other way, and this test is which answer the
    repository implements.
    """
    all_names = set()
    for path in REQUIREMENTS.glob("*.txt"):
        all_names |= {name for name, _ in _declared(path)}
    assert "uuid6" not in all_names

    from apps.common.db.fields import uuid7

    assert uuid7().version == 7


def test_every_declared_runtime_requirement_is_installed_at_the_pinned_version() -> None:
    """A requirements file that does not describe the environment is decoration."""
    from importlib.metadata import PackageNotFoundError, version

    for name, pinned in _declared(REQUIREMENTS / "base.txt"):
        try:
            found = version(name)
        except PackageNotFoundError:  # pragma: no cover - a broken environment
            raise AssertionError(f"{name} is declared in base.txt but is not installed") from None
        assert found == pinned, f"{name}: pinned {pinned}, installed {found}"
