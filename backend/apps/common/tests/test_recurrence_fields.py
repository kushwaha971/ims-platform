"""`RecurrenceFields`, the persisted form of a rule (ADR-055, FRD 00 PLT-X09 §5).

A recurrence is typed columns plus a `date[]`, never JSON: the database refuses a
rule no code could run. These tests build a throwaway table from the mixin in an
isolated app registry (so it never reaches `makemigrations`) and prove each
CHECK refuses what it names — the defect being an engine table that inherits the
columns but not the constraints, which is exactly what a child `Meta` that sets
its own `constraints` does silently.
"""

from __future__ import annotations

from datetime import date

import pytest
from django.apps import apps as global_apps
from django.db import IntegrityError, connection, models, transaction
from django.test.utils import isolate_apps

from apps.common.db.recurrence import RECURRENCE_CHECKS, RecurrenceFields
from apps.common.recurrence import Recurrence

pytestmark = pytest.mark.django_db


@pytest.fixture
def probe_model():
    with isolate_apps("apps.common"):

        class RecurrenceProbe(RecurrenceFields):
            label = models.CharField(max_length=10, default="")

            class Meta(RecurrenceFields.Meta):
                app_label = "common"
                db_table = "common_recurrence_probe"

        with connection.schema_editor() as editor:
            editor.create_model(RecurrenceProbe)
        yield RecurrenceProbe
        with connection.schema_editor() as editor:
            editor.delete_model(RecurrenceProbe)


def _row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {"freq": "monthly", "anchor": date(2026, 1, 31)}
    row.update(overrides)
    return row


@pytest.mark.parametrize(
    "bad",
    [
        {"freq": "hourly"},
        {"interval": 0},
        {"interval": 367},
        {"by_weekday": -1},
        {"by_weekday": 128},
        {"by_month_day": 0},
        {"by_month_day": 32},
        {"by_month_day": -2},
        {"count": 0},
        {"count": 1001},
        {"until": date(2026, 1, 30)},
    ],
)
def test_each_check_refuses_what_it_names(probe_model, bad: dict[str, object]) -> None:
    """T-PLT-X09-7."""
    with pytest.raises(IntegrityError), transaction.atomic():
        probe_model.objects.create(**_row(**bad))


def test_a_good_rule_round_trips_through_the_columns(probe_model) -> None:
    """`.set_recurrence()` writes, `.recurrence` reads, and explicit dates are
    a real `date[]` rather than text."""
    rule = Recurrence(
        freq="once",
        anchor=date(2026, 10, 1),
        count=2,
        until=date(2027, 1, 1),
        explicit_dates=(date(2026, 12, 1), date(2026, 10, 1)),
    )
    row = probe_model()
    row.set_recurrence(rule)
    row.save()
    fresh = probe_model.objects.get(pk=row.pk)
    assert fresh.explicit_dates == [date(2026, 10, 1), date(2026, 12, 1)]
    assert fresh.recurrence == Recurrence(
        freq="once",
        anchor=date(2026, 10, 1),
        count=2,
        until=date(2027, 1, 1),
        explicit_dates=(date(2026, 10, 1), date(2026, 12, 1)),
    )
    for good in ({"by_month_day": -1}, {"by_month_day": 31}, {"interval": 366}, {"count": 1000}):
        probe_model.objects.create(**_row(**good))


def test_the_constraint_names_carry_the_table(probe_model) -> None:
    """Two engine tables including the mixin must not collide on a constraint
    name (Postgres names are per schema)."""
    names = {c.name for c in probe_model._meta.constraints}
    assert names == {f"common_recurrenceprobe_{suffix}" for suffix in RECURRENCE_CHECKS}


def test_every_concrete_model_with_the_mixin_carries_every_check() -> None:
    """The guard for the silent failure: a child `Meta` that declares its own
    `constraints` REPLACES the mixin's. Every installed model built on
    `RecurrenceFields` must carry all of them. Vacuous until the first engine
    table; binding from then on."""
    for model in global_apps.get_models():
        if issubclass(model, RecurrenceFields):
            names = {c.name for c in model._meta.constraints}
            prefix = f"{model._meta.app_label}_{model._meta.model_name}_"
            missing = {suffix for suffix in RECURRENCE_CHECKS if prefix + suffix not in names}
            assert not missing, f"{model.__name__} lost the recurrence CHECKs {sorted(missing)}"
