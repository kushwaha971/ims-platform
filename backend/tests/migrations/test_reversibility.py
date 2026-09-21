"""Every migration must go forwards *and* backwards.

Part 20 §20.12.2 requires a migration to be reversible: a deploy that has to be
rolled back at 2 a.m. is not the moment to discover that `RunPython` was written
with one direction in mind. Two tests, at two costs:

* `test_every_migration_declares_a_backwards_path` compiles the reverse SQL of
  every migration in the project without touching a row. It is fast and runs in
  the fast band.
* `test_migrations_round_trip_on_a_scratch_database` actually applies every
  migration, unapplies every one of them, and applies them again, on a database
  created for the purpose and dropped afterwards. It is `slow`, so the fast band
  skips it and CI's dedicated `pytest tests/migrations` step runs it.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from django.conf import settings
from django.db.migrations.exceptions import IrreversibleError
from django.db.migrations.loader import MigrationLoader

BACKEND_DIR = Path(__file__).resolve().parents[2]

#: The project's own apps, as `config.settings.base` installs them.
LOCAL_APP_LABELS = (
    "common",
    "platform",
    "parties",
    "tax",
    "files",
    "help",
    "imports",
    "inventory",
    "ledger",
    "notifications",
    "payments",
    "purchases",
    "reports",
    "sales",
    "expenses",
)

SCRATCH_DB = "test_ub_migration_roundtrip"


def _local_migrations() -> list[tuple[str, str]]:
    # `connection=None` loads the migrations from disk without touching the
    # database, which matters because this runs at collection time.
    loader = MigrationLoader(None, ignore_no_migrations=True)
    return sorted(key for key in loader.disk_migrations if key[0] in LOCAL_APP_LABELS)


@pytest.mark.django_db
@pytest.mark.parametrize("app_label,name", _local_migrations(), ids=lambda v: v)
def test_every_migration_declares_a_backwards_path(app_label: str, name: str) -> None:
    """`sqlmigrate --backwards` compiles, so nothing in the tree is one-way."""
    from django.core.management import call_command

    try:
        call_command("sqlmigrate", app_label, name, backwards=True, stdout=open(os.devnull, "w"))
    except IrreversibleError as exc:  # pragma: no cover - the failure is the point
        pytest.fail(f"{app_label}.{name} cannot be reversed: {exc}")


def _psql_env(database: str) -> dict[str, str]:
    default = settings.DATABASES["default"]
    return {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings.test",
        "POSTGRES_DB": database,
        "POSTGRES_USER": default["USER"],
        "POSTGRES_PASSWORD": default["PASSWORD"],
        "POSTGRES_HOST": default["HOST"],
        "POSTGRES_PORT": str(default["PORT"]),
    }


def _manage(database: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(  # noqa: S603 - fixed argv, no shell
        [sys.executable, "manage.py", *args],
        cwd=BACKEND_DIR,
        env=_psql_env(database),
        capture_output=True,
        text=True,
        timeout=600,
    )


def _maintenance_sql(statement: str) -> None:
    import psycopg

    default = settings.DATABASES["default"]
    with psycopg.connect(
        dbname="postgres",
        user=default["USER"],
        password=default["PASSWORD"],
        host=default["HOST"],
        port=default["PORT"],
        autocommit=True,
    ) as conn:
        conn.execute(statement)


@pytest.mark.slow
@pytest.mark.postgres
def test_migrations_round_trip_on_a_scratch_database() -> None:
    """Forward from nothing, backward to nothing, forward again — on real PostgreSQL.

    The backward leg is the one that finds things. An index whose expression the
    database rejects, a `RunPython` with no reverse, an `AlterField` that cannot
    put back a value it dropped: all of them apply cleanly and only fail on the
    way out.
    """
    _maintenance_sql(f'DROP DATABASE IF EXISTS "{SCRATCH_DB}"')
    _maintenance_sql(f'CREATE DATABASE "{SCRATCH_DB}"')
    try:
        forward = _manage(SCRATCH_DB, "migrate", "--noinput")
        assert forward.returncode == 0, forward.stdout + forward.stderr

        for label in LOCAL_APP_LABELS:
            backward = _manage(SCRATCH_DB, "migrate", label, "zero", "--noinput")
            assert backward.returncode == 0, (
                f"{label} could not be unapplied:\n{backward.stdout}{backward.stderr}"
            )

        again = _manage(SCRATCH_DB, "migrate", "--noinput")
        assert again.returncode == 0, again.stdout + again.stderr
        assert "Applying parties.0001_initial" in again.stdout, (
            "nothing was re-applied, so nothing was actually unapplied:\n" + again.stdout
        )

        clean = _manage(SCRATCH_DB, "migrate", "--check", "--noinput")
        assert clean.returncode == 0, clean.stdout + clean.stderr
    finally:
        _maintenance_sql(f'DROP DATABASE IF EXISTS "{SCRATCH_DB}"')
