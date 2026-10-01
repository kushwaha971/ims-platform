"""DUE-01 plans: `create_plan`, `update_plan` and the plan table's CHECKs (T-DUE-01-1, -7)."""

from __future__ import annotations

import datetime as dt
from typing import Any

import pytest
from django.db import IntegrityError, transaction

from apps.common.db.recurrence import RECURRENCE_CHECKS
from apps.common.exceptions import ModuleDisabled, StaleVersion, ValidationFailed
from apps.dues.models import DuesPlan, DuesSchedule
from apps.dues.services.plans import create_plan, update_plan
from apps.dues.tests.conftest import monthly
from apps.dues.tests.subject import TEST_MODULE, entitle
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


def test_plan_checks_refuse_taxable_ledger_and_expectation_document(
    ctx: Any, make_plan: Any, tenant: Any
) -> None:
    """T-DUE-01-1 — a taxable fee posted as a raw ledger line is not a tax
    invoice (ADR-045), and an expectation never posts a document. Refused by the
    service (400) AND by the database, so a second writer cannot store either."""
    with pytest.raises(ValidationFailed) as caught:
        create_plan(ctx=ctx, module=TEST_MODULE, data=monthly(hsn_sac="999723"))
    assert "posting" in caught.value.details
    with pytest.raises(ValidationFailed) as caught:
        create_plan(ctx=ctx, module=TEST_MODULE, data=monthly(mode="expectation"))
    assert "posting" in caught.value.details

    plan = make_plan()
    for changes in ({"hsn_sac": "999723"}, {"mode": "expectation", "posting": "document"}):
        with pytest.raises(IntegrityError), transaction.atomic():
            DuesPlan.objects.filter(pk=plan.pk).update(**changes)


def test_every_recurrence_check_survives_on_plan_and_schedule() -> None:
    """A child `Meta` declaring `constraints` REPLACES the mixin's list; the six
    recurrence CHECKs must be on both engine tables by name."""
    for model, prefix in ((DuesPlan, "dues_duesplan_"), (DuesSchedule, "dues_duesschedule_")):
        names = {c.name for c in model._meta.constraints}
        assert {prefix + suffix for suffix in RECURRENCE_CHECKS} <= names


def test_document_plan_with_sales_off_is_module_disabled_sales(
    ctx: Any, tenant: Any, dues_subject: Any
) -> None:
    """T-DUE-01-7 / BR-2 — a document plan while sales is off could never post."""
    entitle(tenant, "sales", enabled=False)
    with pytest.raises(ModuleDisabled) as caught:
        create_plan(ctx=ctx, module=TEST_MODULE, data=monthly(posting="document"))
    assert caught.value.details == {"module": "sales"}


def test_a_plan_for_a_module_not_using_dues_is_module_disabled(ctx: Any, dues_subject: Any) -> None:
    """BR-1 — a plan for `sales` (which uses no engine) would be rows no screen reads."""
    with pytest.raises(ModuleDisabled) as caught:
        create_plan(ctx=ctx, module="sales", data=monthly())
    assert caught.value.details == {"module": "sales"}


def test_fixed_plan_heads_must_add_up(ctx: Any, dues_subject: Any) -> None:
    """R16 — heads are rows, and a fixed plan's parts summing to something other
    than its amount is a bill whose lines disagree with its total."""
    with pytest.raises(ValidationFailed) as caught:
        create_plan(
            ctx=ctx,
            module=TEST_MODULE,
            data=monthly(heads=[{"label": "Tuition", "amount": "1000.00"}]),
        )
    assert "heads" in caught.value.details
    plan = create_plan(
        ctx=ctx,
        module=TEST_MODULE,
        data=monthly(
            heads=[
                {"label": "Tuition", "amount": "1000.00"},
                {"label": "Locker", "amount": "200.00"},
            ]
        ),
    )
    assert [(h.seq, h.label, str(h.amount)) for h in plan.heads.order_by("seq")] == [
        (1, "Tuition", "1000.00"),
        (2, "Locker", "200.00"),
    ]


def test_bad_terms_are_field_errors_not_500s(ctx: Any, dues_subject: Any) -> None:
    """Every vertical relays this 400; an unknown key or a bad rule must name its field."""
    with pytest.raises(ValidationFailed) as caught:
        create_plan(
            ctx=ctx,
            module=TEST_MODULE,
            data=monthly(
                recurrence={"freq": "weekly", "by_month_day": 5},
                amount="-1",
                penalty_kind="flat_once",
                surprise=1,
            ),
        )
    details = caught.value.details
    assert {"recurrence.by_month_day", "amount", "penalty_value", "surprise"} <= set(details)


def test_a_split_total_needs_a_number_of_parts(ctx: Any, dues_subject: Any) -> None:
    """A `total_split` with no bound cannot say what each part is."""
    with pytest.raises(ValidationFailed) as caught:
        create_plan(
            ctx=ctx,
            module=TEST_MODULE,
            data=monthly(amount_rule="total_split", amount=None, total="10000.00"),
        )
    assert "recurrence.count" in caught.value.details


def test_update_plan_checks_the_version_and_audits(ctx: Any, make_plan: Any) -> None:
    """Two people editing one plan: the second save must not silently win."""
    plan = make_plan()
    updated = update_plan(ctx=ctx, plan_id=plan.id, data={"amount": "1500.00", "version": 1})
    assert (str(updated.amount), updated.version) == ("1500.00", 2)
    with pytest.raises(StaleVersion):
        update_plan(ctx=ctx, plan_id=plan.id, data={"amount": "1600.00", "version": 1})
    actions = list(
        AuditLog.objects.filter(entity_id=plan.id).values_list("action", flat=True).order_by("id")
    )
    assert sorted(actions) == ["dues.plan.created", "dues.plan.updated"]


def test_plan_names_are_unique_per_module_among_active_plans(ctx: Any, make_plan: Any) -> None:
    """Two active "Gym monthly" plans would be indistinguishable in a picker;
    a deactivated one frees the name (EC-2)."""
    plan = make_plan()
    with pytest.raises(ValidationFailed):
        make_plan(name="gym MONTHLY")
    update_plan(ctx=ctx, plan_id=plan.id, data={"is_active": False})
    assert make_plan().is_active


def test_the_plan_anchor_is_a_template_value(make_plan: Any) -> None:
    """C-4 — the anchor column is NOT NULL but no computation reads a plan's;
    an `until` earlier than that template date is not an error."""
    plan = make_plan(recurrence={"freq": "monthly", "by_month_day": 1, "until": "2026-01-01"})
    assert plan.until == dt.date(2026, 1, 1)
