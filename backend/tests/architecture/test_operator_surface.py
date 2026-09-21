"""Every `manage.py` command the operator surface names must exist.

This guards a class of defect that has now shipped five times, and it is the
worst class the project has produced, because the whole test suite stays green
while the documented first-run path is broken end to end:

  * `seed_all`, `seed_demo`, `seed_e2e` — named by the Makefile, `bootstrap.sh`
    and Part 29 §29.4; none existed. A clean clone could register an account and
    then not create a business, because no partner had been seeded.
  * `create_superadmin` — `bootstrap.sh` step 7. Never existed, so under
    `set -euo pipefail` the script aborted there every time.
  * `GET /api/healthz` — the frontend container's healthcheck and §29.4.3's
    verification both target it; the route did not exist, so the container never
    reported healthy while serving pages perfectly well.

The reason none of it was caught: tests build fixtures directly and never walk
the operator path, so the only thing that exercises these names is a human
running them — and a human who has run them once has a database that never needs
them again. The names drift, and the drift is silent until someone clones the
repository fresh.

So this test reads the operator surface as text and asserts that every command
it names is real. It is deliberately dumb: a regex over the files an operator
actually runs. The frontend's `/api/healthz` route is asserted alongside them,
because it belongs to the same surface and failed for the same reason.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.core.management import get_commands

REPO = Path(__file__).resolve().parents[3]

#: The files an operator runs, or that run on their behalf.
OPERATOR_FILES = (
    "Makefile",
    "scripts/bootstrap.sh",
    "docker-compose.yml",
    "docker-compose.override.yml",
    "docker-compose.prod.yml",
    "docker-compose.staging.yml",
)

#: `manage.py <name>`, in any of the spellings those files use.
_COMMAND = re.compile(
    r"""manage\.py["']?[,\s]+["']?([a-z_][a-z0-9_]*)""",
    re.VERBOSE,
)

#: Django's own commands are legitimate targets and are not ours to define.
_DJANGO_BUILTINS = frozenset(get_commands())


def _named_commands() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()
    for rel in OPERATOR_FILES:
        path = REPO / rel
        if not path.exists():
            continue
        for name in _COMMAND.findall(path.read_text()):
            found.add((rel, name))
    return found


def test_the_regex_still_finds_commands() -> None:
    """A test that silently matches nothing proves nothing."""
    assert len(_named_commands()) >= 5


@pytest.mark.parametrize("rel,name", sorted(_named_commands()))
def test_every_named_command_exists(rel: str, name: str) -> None:
    """One case per (file, command) so a failure names both."""
    assert name in _DJANGO_BUILTINS, (
        f"{rel} runs `manage.py {name}`, which is not a registered command. "
        f"Either the command was renamed and this call site was not, or it was "
        f"never written. This is exactly how `make bootstrap` came to be broken "
        f"from a clean clone while every test passed."
    )


def test_the_frontend_health_route_the_compose_healthcheck_targets_exists() -> None:
    """`docker-compose.yml` probes `/api/healthz`; the route must be there.

    Without it the frontend container never reports healthy, `bootstrap.sh`
    waits out its five-minute loop at step 9 and then fails two §29.4.3 checks —
    on a frontend that is serving correctly.
    """
    compose = (REPO / "docker-compose.yml").read_text()
    assert "/api/healthz" in compose, "the healthcheck no longer probes /api/healthz"

    route = REPO / "frontend" / "app" / "api" / "healthz" / "route.ts"
    assert route.exists(), f"{route.relative_to(REPO)} is missing"
    assert re.search(r"export\s+(async\s+)?function\s+GET", route.read_text()), (
        "the healthz route file exists but exports no GET handler"
    )


# ── Build targets ────────────────────────────────────────────────────────────
# `docker-compose.override.yml` built backend and scheduler with `target: dev`
# and `backend/Dockerfile` had no such stage — it was a single `runtime` stage.
# So `docker compose up` locally failed at BUILD, before anything ran. Only the
# frontend image had a `dev`. `docker compose config` cannot catch this: it
# interpolates and validates the YAML without resolving a Dockerfile, which is
# why the compose files "validated" for weeks while the path could not start.

_TARGET = re.compile(r"target:\s*(?:\$\{[A-Z_]+:-)?([a-z][a-z0-9_-]*)\}?")
_STAGE = re.compile(r"^\s*FROM\s+\S+\s+AS\s+(\S+)", re.MULTILINE | re.IGNORECASE)

COMPOSE_FILES = tuple(f for f in OPERATOR_FILES if f.startswith("docker-compose"))


def _declared_stages(dockerfile: Path) -> set[str]:
    return {m.lower() for m in _STAGE.findall(dockerfile.read_text())}


def _build_targets() -> set[tuple[str, str, str]]:
    """(compose file, dockerfile context, target) for every `target:` under a build."""
    found: set[tuple[str, str, str]] = set()
    for rel in (*COMPOSE_FILES, "docker-compose.backend.yml"):
        path = REPO / rel
        if not path.exists():
            continue
        text = path.read_text()
        # `context:` and `target:` travel together under `build:`; pair each
        # target with the nearest context above it.
        context = None
        for line in text.splitlines():
            ctx = re.match(r"\s*context:\s*(\S+)", line)
            if ctx:
                context = ctx.group(1).strip("./") or "."
                continue
            tgt = _TARGET.search(line)
            if tgt and context and "ports" not in line:
                found.add((rel, context, tgt.group(1)))
    return found


def test_build_targets_were_found() -> None:
    assert len(_build_targets()) >= 3


@pytest.mark.parametrize("rel,context,target", sorted(_build_targets()))
def test_every_build_target_is_a_real_dockerfile_stage(
    rel: str, context: str, target: str
) -> None:
    dockerfile = REPO / context / "Dockerfile"
    assert dockerfile.exists(), f"{rel} builds {context}, which has no Dockerfile"

    stages = _declared_stages(dockerfile)
    assert target in stages, (
        f"{rel} builds {context} with `target: {target}`, and "
        f"{context}/Dockerfile declares only {sorted(stages)}. "
        f"`docker compose config` passes on this because it never resolves a "
        f"Dockerfile — the failure only appears at build time."
    )
