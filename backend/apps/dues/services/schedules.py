"""`preview_schedule`, `create_schedule` (contracts §2.1, FRD 00 DUE-01 BR-1…BR-9).

── Order inside `create_schedule` ────────────────────────────────────────────
1. The subject type is registered, and for `module` (else `ImproperlyConfigured`
   — engine rows pointing at nothing are a programming error, ADR-042).
2. `lock_party` (contracts §2.1 lock order: party → schedule → dues). Unknown
   → 404; archived → 409 `party_archived` (EC-4).
3. The plan: this tenant's, active, same module (BR-1); document posting needs
   sales (BR-2).
4. The dues are COMPUTED (`compute_dues`, the same function as the preview).
5. Any due dated before today without `confirm_backdated` → 409
   `schedule_backdated_unconfirmed` with that preview and its total — raised
   BEFORE a row is written (BR-7).
6. Insert the schedule (snapshot, BR-3), its heads and its dues; then post every
   due with `due_on <= today`, each with its own date (BR-7; C-11 for today).

A second live schedule for the subject is the `uq_dues_schedule_live_subject`
`IntegrityError`, propagated for the vertical to map to its own code (C-16).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import fy_bounds, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ModuleDisabled, NotFound, ValidationFailed
from apps.common.money import ZERO, q2, sum_money
from apps.common.seams.documents import issuer_available
from apps.dues.constants import DueStatus, Posting, ScheduleStatus
from apps.dues.models import DuesDue, DuesDueComponent, DuesPlan, DuesSchedule, DuesScheduleHead
from apps.dues.registry import subject_for, subject_labels
from apps.dues.services.posting import post_due
from apps.dues.services.preview import (
    Computed,
    DuePreview,
    ScheduleInputError,
    Terms,
    compute_dues,
    preview_json,
    terms_of_plan,
)


@dataclass
class ScheduleResult:
    schedule: DuesSchedule
    dues: list[DuesDue]
    posted: list[Any] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)


def preview_schedule(
    *,
    tenant: Any,
    plan: DuesPlan,
    start_on: dt.date,
    end_on: dt.date | None = None,
    supplied: list | None = None,
    join_on: dt.date | None = None,
    subject_type: str | None = None,
) -> list[DuePreview]:
    """Contracts §2.1, plus the additive v1.1 `subject_type` (Q-D3): when given,
    the subject's `amount_hook` prices the rows exactly as `create_schedule`
    will (BR-9). Without it, hooks are not applied."""
    hook = None
    if subject_type is not None:
        subject = subject_for(subject_type)
        if subject is None:
            raise ImproperlyConfigured(f"dues subject {subject_type!r} is not registered")
        hook = subject.amount_hook
    return _compute(
        tenant=tenant,
        terms=terms_of_plan(plan),
        start_on=start_on,
        end_on=end_on,
        supplied=supplied,
        join_on=join_on,
        amount_hook=hook,
    ).rows


def _compute(*, tenant: Any, terms: Terms, **kwargs: Any) -> Computed:
    try:
        return compute_dues(tenant=tenant, terms=terms, today=tenant_today(tenant), **kwargs)
    except ScheduleInputError as exc:
        raise ValidationFailed(exc.errors) from None


def _total(rows: list[DuePreview]) -> Decimal:
    return sum_money(r["amount"] for r in rows if r["status"] != DueStatus.SKIPPED)


def _terms_json(plan: DuesPlan) -> dict:
    """Non-money policy strings only (R16): the rest of the snapshot is typed."""
    return {
        "amount_rule": plan.amount_rule,
        "join_policy": plan.join_policy,
        "leave_policy": plan.leave_policy,
        "pause_max_days": plan.pause_max_days,
        "pause_min_days": plan.pause_min_days,
        "pause_max_count": plan.pause_max_count,
        "hsn_sac": plan.hsn_sac,
        "tax_code": plan.tax_code,
        "tax_inclusive": plan.tax_inclusive,
        "auto_apply_advance": plan.auto_apply_advance,
        "split_weights": [str(w) for w in plan.split_weights or []],
    }


@transaction.atomic
def create_schedule(
    *,
    ctx: Any,
    module: str,
    plan_id: Any,
    party_id: Any,
    subject_type: str,
    subject_id: Any,
    start_on: dt.date,
    end_on: dt.date | None = None,
    beneficiary_party_id: Any = None,
    supplied: list | None = None,
    confirm_backdated: bool = False,
    join_on: dt.date | None = None,
) -> ScheduleResult:
    """Contracts §2.1 (plus the additive v1.1 `join_on`, Q-D3)."""
    from apps.parties.services.balance import lock_party
    from apps.platform_app.services.entitlements import enabled_modules_using

    tenant = ctx.tenant
    subject = subject_for(subject_type)
    if subject is None or subject.module != module:
        raise ImproperlyConfigured(
            f"dues subject {subject_type!r} is not registered for module {module!r}"
        )
    if module not in enabled_modules_using(tenant, "dues"):
        raise ModuleDisabled(details={"module": module})

    party = lock_party(tenant=tenant, party_id=party_id)
    if party is None:
        raise NotFound()
    if party.status == "archived":
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them or choose another party.",
            details={"party_id": str(party.id)},
        )
    beneficiary = None
    if beneficiary_party_id is not None:
        from apps.parties.models import Party

        beneficiary = Party.objects.for_tenant(tenant).filter(pk=beneficiary_party_id).first()
        if beneficiary is None:
            raise ValidationFailed({"beneficiary_party_id": ["Choose a party of this business."]})

    plan = DuesPlan.objects.for_tenant(tenant).filter(pk=plan_id).first()
    if plan is None:
        raise ValidationFailed({"plan_id": ["Choose a plan."]})
    if plan.module != module or not plan.is_active:
        raise ValidationFailed({"plan_id": ["This plan cannot start anything new."]})
    if plan.posting == Posting.DOCUMENT and not issuer_available(tenant):
        raise ModuleDisabled(details={"module": "sales"})
    heads = list(plan.heads.all().order_by("seq"))

    today = tenant_today(tenant)
    computed = _compute(
        tenant=tenant,
        terms=terms_of_plan(plan),
        start_on=start_on,
        end_on=end_on,
        supplied=supplied,
        join_on=join_on,
        amount_hook=subject.amount_hook,
    )
    rows = computed.rows
    to_post = [r for r in rows if r["due_on"] <= today and r["status"] != DueStatus.SKIPPED]
    past = [r for r in to_post if r["due_on"] < today]
    if plan.posting != Posting.LEDGER and any(r["amount"] > 0 for r in to_post):
        # C-10: the document and expectation branches of `post_due` are DUE-02's.
        raise ValidationFailed({"start_on": ["This plan cannot start before today yet."]})
    if plan.posting == Posting.DOCUMENT and past:
        fy_start = fy_bounds(tenant, fy_bounds(tenant, today)[0] - dt.timedelta(days=1))[0]
        if min(r["due_on"] for r in past) < fy_start:  # C-13: sales refuses those dates
            raise ValidationFailed({"start_on": ["Invoices cannot be dated that far back."]})
    if past and not confirm_backdated:
        raise BusinessRuleViolation(
            "schedule_backdated_unconfirmed",
            "This adds dues dated before today. Confirm to add them.",
            details={
                "dues": [preview_json(r) for r in past],
                "total": str(q2(_total(past))),
            },
        )

    rule = computed.rule
    schedule = DuesSchedule(
        tenant=tenant,
        created_by=ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None,
        module=module,
        plan=plan,
        party=party,
        beneficiary_party=beneficiary,
        mode=plan.mode,
        posting=plan.posting,
        amount=plan.amount,
        total=plan.total,
        grace_days=plan.grace_days,
        penalty_kind=plan.penalty_kind,
        penalty_value=plan.penalty_value,
        penalty_cap=plan.penalty_cap,
        allocation_order=plan.allocation_order,
        closed_day_rule=plan.closed_day_rule,
        rounding_rule=plan.rounding_rule,
        terms=_terms_json(plan),
        subject_type=subject_type,
        subject_id=subject_id,
        start_on=start_on,
        end_on=end_on,
        status=ScheduleStatus.ACTIVE,
        materialised_until=computed.horizon,
    )
    schedule.set_recurrence(rule)
    schedule.save()
    for head in heads:
        DuesScheduleHead.objects.create(
            tenant=tenant, schedule=schedule, seq=head.seq, label=head.label, amount=head.amount
        )
    dues = _insert_dues(tenant=tenant, schedule=schedule, rows=rows)

    label = subject_labels(subject_type, {subject_id}).get(subject_id)
    posted: list[Any] = []
    for due in dues:
        if due.status == DueStatus.SCHEDULED and due.due_on <= today:
            due.schedule = schedule
            post_due(ctx=ctx, due=due, party=party, today=today, subject_label=label)
            posted.append(due.id)

    write_audit(
        ctx=ctx,
        action=AuditAction.DUES_SCHEDULE_CREATED,
        entity_type="dues_schedule",
        entity_id=schedule.id,
        after={
            "module": module,
            "plan_id": str(plan.id),
            "party_id": str(party.id),
            "subject_type": subject_type,
            "subject_id": str(subject_id),
            "start_on": start_on,
            "end_on": end_on,
            "dues": len(dues),
            "materialised_until": computed.horizon,
        },
        metadata={"confirm_backdated": bool(confirm_backdated), "posted": len(posted)},
    )
    return ScheduleResult(schedule=schedule, dues=dues, posted=posted, warnings=computed.warnings)


def _insert_dues(*, tenant: Any, schedule: DuesSchedule, rows: list[DuePreview]) -> list[DuesDue]:
    """The computed rows, written as they were shown (shared with DUE-02's extend)."""
    dues = DuesDue.objects.bulk_create(
        [
            DuesDue(
                tenant=tenant,
                schedule=schedule,
                module=schedule.module,
                party_id=schedule.party_id,
                seq=row["seq"],
                period_start=row["period_start"],
                period_end=row["period_end"],
                period_label=row["period_label"],
                due_on=row["due_on"],
                amount=q2(row["amount"]),
                status=row["status"],
            )
            for row in rows
        ]
    )
    components = [
        DuesDueComponent(
            tenant=tenant, due=due, component=comp["component"], amount=q2(comp["amount"])
        )
        for due, row in zip(dues, rows, strict=True)
        for comp in row.get("components") or []
    ]
    if components:
        DuesDueComponent.objects.bulk_create(components)
    return dues


__all__ = ["ScheduleResult", "create_schedule", "preview_schedule", "ZERO"]
