"""`create_plan`, `update_plan` (contracts §2.1, FRD 00 DUE-01 BR-1, BR-2, BR-3).

The engine has no write endpoint (ADR-041): a vertical's own endpoint parses
its body and calls these with `data`, a plain dict. Validation therefore lives
HERE, once, and reports field errors keyed as the API reports them
(`recurrence.by_month_day`, `heads.0.amount`), so every vertical's 400 reads
alike.

A plan edit affects NEW schedules only: a schedule holds its own typed
snapshot (BR-3), and nothing here touches `dues_schedule`. Deactivating is
`is_active=False` (EC-2); running schedules continue.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import ModuleDisabled, NotFound, StaleVersion, ValidationFailed
from apps.common.money import ROUNDING_RULES, ZERO, q2, sum_money
from apps.common.recurrence import FREQS, Recurrence, validate_recurrence
from apps.common.seams.documents import issuer_available
from apps.dues.constants import (
    HEAD_LABEL_MAX,
    PLAN_NAME_MAX,
    AllocationOrder,
    AmountRule,
    ClosedDayRule,
    JoinPolicy,
    LeavePolicy,
    Mode,
    PenaltyKind,
    Posting,
)
from apps.dues.models import DuesPlan, DuesPlanHead

#: The keys `data` may carry. Anything else is a 400, so a typo is not a
#: silently-ignored term.
PLAN_FIELDS = frozenset(
    {
        "name",
        "mode",
        "posting",
        "recurrence",
        "amount_rule",
        "amount",
        "total",
        "split_weights",
        "join_policy",
        "leave_policy",
        "grace_days",
        "penalty_kind",
        "penalty_value",
        "penalty_cap",
        "pause_max_days",
        "pause_min_days",
        "pause_max_count",
        "hsn_sac",
        "tax_code",
        "tax_inclusive",
        "rounding_rule",
        "allocation_order",
        "auto_apply_advance",
        "closed_day_rule",
        "is_active",
        "heads",
        "version",
    }
)
_CHOICES = {
    "mode": Mode,
    "posting": Posting,
    "amount_rule": AmountRule,
    "join_policy": JoinPolicy,
    "leave_policy": LeavePolicy,
    "penalty_kind": PenaltyKind,
    "allocation_order": AllocationOrder,
    "closed_day_rule": ClosedDayRule,
}
_MONEY = ("amount", "total", "penalty_cap")
_SMALL = ("grace_days", "pause_max_days", "pause_min_days", "pause_max_count")
_SNAPSHOT = (
    "module", "name", "mode", "posting", "amount_rule", "amount", "total", "join_policy",
    "leave_policy", "grace_days", "penalty_kind", "penalty_value", "penalty_cap", "hsn_sac",
    "tax_code", "tax_inclusive", "rounding_rule", "allocation_order", "auto_apply_advance",
    "closed_day_rule", "is_active", "freq", "interval", "by_weekday", "by_month_day", "count",
    "until", "explicit_dates", "version",
)  # fmt: skip


def _snapshot(plan: DuesPlan) -> dict:
    data = {name: getattr(plan, name) for name in _SNAPSHOT}
    data["heads"] = [
        {"label": h.label, "amount": str(h.amount)} for h in plan.heads.all().order_by("seq")
    ]
    return data


def _assert_module(tenant: Any, module: str) -> None:
    """BR-1 — the module is effective AND uses the dues engine."""
    from apps.platform_app.services.entitlements import enabled_modules_using

    if module not in enabled_modules_using(tenant, "dues"):
        raise ModuleDisabled(details={"module": module})


def _decimal(value: Any) -> Decimal:
    if isinstance(value, float):
        raise InvalidOperation
    return Decimal(str(value))


def _date(value: Any) -> dt.date:
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value))


def _rule(raw: Any, errors: dict, *, anchor: dt.date) -> Recurrence | None:
    if not isinstance(raw, dict):
        errors.setdefault("recurrence", []).append("Choose how often this repeats.")
        return None
    try:
        rule = Recurrence(
            freq=raw.get("freq"),
            interval=int(raw.get("interval", 1)),
            by_weekday=int(raw.get("by_weekday", 0) or 0),
            by_month_day=(None if raw.get("by_month_day") is None else int(raw["by_month_day"])),
            anchor=anchor,
            count=None if raw.get("count") is None else int(raw["count"]),
            until=None if raw.get("until") is None else _date(raw["until"]),
            explicit_dates=tuple(_date(d) for d in raw.get("explicit_dates") or ()),
        )
    except (TypeError, ValueError):
        errors.setdefault("recurrence", []).append("Choose how often this repeats.")
        return None
    if rule.freq not in FREQS:
        errors.setdefault("recurrence.freq", []).append(
            "Choose once, daily, weekly, monthly or yearly."
        )
        return None
    # The anchor is a template value (C-4); an `until` before it is not the plan's error.
    for key, messages in validate_recurrence(rule).items():
        if key != "recurrence.until":
            errors.setdefault(key, []).extend(messages)
    return rule


def _clean(tenant: Any, data: dict, base: dict) -> tuple[dict, list[dict] | None]:
    """Merge `data` over `base` (the plan's current values) and validate the whole."""
    errors: dict[str, list[str]] = {}
    unknown = sorted(set(data) - PLAN_FIELDS)
    for key in unknown:
        errors.setdefault(key, []).append("Not a plan field.")
    merged = {**base, **{k: v for k, v in data.items() if k in PLAN_FIELDS}}

    name = str(merged.get("name") or "").strip()
    if not name:
        errors.setdefault("name", []).append("Enter a name.")
    elif len(name) > PLAN_NAME_MAX:
        errors.setdefault("name", []).append(f"Use at most {PLAN_NAME_MAX} characters.")
    merged["name"] = name

    for key, choices in _CHOICES.items():
        if key in merged and merged[key] not in choices.values:
            errors.setdefault(key, []).append(f"Choose one of {', '.join(choices.values)}.")
    if merged.get("rounding_rule", "rupee") not in ROUNDING_RULES:
        errors.setdefault("rounding_rule", []).append(f"Choose one of {', '.join(ROUNDING_RULES)}.")

    for key in _MONEY:
        value = merged.get(key)
        if value is None or value == "":
            merged[key] = None
            continue
        try:
            amount = _decimal(value)
            if amount != q2(amount) or amount < 0:
                raise InvalidOperation
            merged[key] = q2(amount)
        except (InvalidOperation, ValueError):
            errors.setdefault(key, []).append("Enter an amount of zero or more, to the paisa.")
    if merged.get("total") is not None and merged["total"] <= 0:
        errors.setdefault("total", []).append("Enter a total above zero.")
    if merged.get("penalty_value") in (None, ""):
        merged["penalty_value"] = None
    else:
        try:
            merged["penalty_value"] = _decimal(merged["penalty_value"])
            if merged["penalty_value"] < 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            errors.setdefault("penalty_value", []).append("Enter a value of zero or more.")
    for key in _SMALL:
        value = merged.get(key)
        if value is None:
            continue
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= 365:
            errors.setdefault(key, []).append("Enter a whole number of days from 0 to 365.")
    try:
        merged["split_weights"] = [_decimal(w) for w in merged.get("split_weights") or []]
        if any(w < 0 for w in merged["split_weights"]) or (
            merged["split_weights"] and sum(merged["split_weights"]) == 0
        ):
            raise InvalidOperation
    except (InvalidOperation, ValueError, TypeError):
        errors.setdefault("split_weights", []).append("Enter weights of zero or more.")

    for key in ("hsn_sac", "tax_code"):
        merged[key] = (str(merged.get(key)).strip() or None) if merged.get(key) else None
    if merged["hsn_sac"] and len(merged["hsn_sac"]) > 8:
        errors.setdefault("hsn_sac", []).append("Use at most 8 characters.")

    mode, posting = merged.get("mode"), merged.get("posting")
    pairs = {Mode.CHARGE: {Posting.DOCUMENT, Posting.LEDGER}, Mode.EXPECTATION: {Posting.NONE}}
    if mode in pairs and posting in Posting.values and posting not in pairs[mode]:
        errors.setdefault("posting", []).append(
            "A charge posts as a document or a ledger line; an expectation posts none."
        )
    if (merged["tax_code"] or merged["hsn_sac"]) and posting != Posting.DOCUMENT:
        errors.setdefault("posting", []).append("A taxable fee must be invoiced (document posting).")
    if merged["tax_code"]:
        from apps.tax.selectors.rates import code_exists

        if not code_exists(tenant=tenant, code=merged["tax_code"]):
            errors.setdefault("tax_code", []).append("Choose a tax rate that exists.")
    if merged.get("tax_inclusive") and posting != Posting.DOCUMENT:
        errors.setdefault("tax_inclusive", []).append("Only an invoiced fee can include tax.")

    rule = _rule(merged.get("recurrence"), errors, anchor=merged["anchor"])
    merged["rule"] = rule
    amount_rule = merged.get("amount_rule")
    if amount_rule == AmountRule.FIXED and merged.get("amount") is None:
        errors.setdefault("amount", []).append("Enter the amount of each due.")
    if amount_rule == AmountRule.TOTAL_SPLIT:
        if merged.get("total") is None:
            errors.setdefault("total", []).append("Enter the total to split.")
        if rule is not None and not (rule.count or rule.explicit_dates or merged["split_weights"]):
            errors.setdefault("recurrence.count", []).append("A split total needs a number of parts.")
        if (
            rule is not None
            and rule.count
            and merged["split_weights"]
            and len(merged["split_weights"]) != rule.count
        ):
            errors.setdefault("split_weights", []).append("Give one weight per instalment.")

    penalty_kind = merged.get("penalty_kind", PenaltyKind.NONE)
    if penalty_kind == PenaltyKind.NONE and merged["penalty_value"] is not None:
        errors.setdefault("penalty_value", []).append("No late fee is set; leave this empty.")
    if penalty_kind not in (PenaltyKind.NONE, None) and merged["penalty_value"] is None:
        errors.setdefault("penalty_value", []).append("Enter the late fee.")

    heads = None
    if "heads" in data:
        heads = []
        for index, head in enumerate(data.get("heads") or []):
            label = str((head or {}).get("label") or "").strip()
            if not label or len(label) > HEAD_LABEL_MAX:
                errors.setdefault(f"heads.{index}.label", []).append(
                    f"Enter a label of at most {HEAD_LABEL_MAX} characters."
                )
            try:
                value = _decimal((head or {}).get("amount"))
                if value != q2(value) or value < 0:
                    raise InvalidOperation
            except (InvalidOperation, ValueError):
                errors.setdefault(f"heads.{index}.amount", []).append("Enter an amount.")
                continue
            heads.append({"label": label, "amount": q2(value)})
    check_heads = heads if heads is not None else base.get("_heads")
    if check_heads and amount_rule == AmountRule.FIXED and merged.get("amount") is not None:
        if sum_money(h["amount"] for h in check_heads) != merged["amount"]:
            errors.setdefault("heads", []).append("The parts must add up to the amount.")
    if check_heads and amount_rule != AmountRule.FIXED:
        errors.setdefault("heads", []).append("Parts are for a fixed amount only.")
    if errors:
        raise ValidationFailed(errors)
    return merged, heads


def _assert_issuer(tenant: Any, posting: str) -> None:
    """BR-2 — a document plan needs sales on (403 `module_disabled`, module `sales`)."""
    if posting == Posting.DOCUMENT and not issuer_available(tenant):
        raise ModuleDisabled(details={"module": "sales"})


def _write(plan: DuesPlan, merged: dict) -> None:
    for name in (
        "name", "mode", "posting", "amount_rule", "amount", "total", "split_weights",
        "join_policy", "leave_policy", "grace_days", "penalty_kind", "penalty_value",
        "penalty_cap", "pause_max_days", "pause_min_days", "pause_max_count", "hsn_sac",
        "tax_code", "tax_inclusive", "rounding_rule", "allocation_order", "auto_apply_advance",
        "closed_day_rule", "is_active",
    ):  # fmt: skip
        if name in merged:
            setattr(plan, name, merged[name])
    rule = merged["rule"]
    if rule.until is not None and rule.until < rule.anchor:
        # C-4: the template anchor never computes anything, but the mixin's CHECK
        # wants `until >= anchor`; the earliest date the rule names will do.
        rule = dataclasses.replace(rule, anchor=rule.until)
    plan.set_recurrence(rule)


def _name_taken(exc: IntegrityError) -> bool:
    return "uq_dues_plan_name" in str(exc)


def _defaults(tenant: Any) -> dict:
    return {
        "join_policy": JoinPolicy.FULL.value,
        "leave_policy": LeavePolicy.NO_REFUND.value,
        "grace_days": 0,
        "penalty_kind": PenaltyKind.NONE.value,
        "rounding_rule": "rupee",
        "allocation_order": AllocationOrder.OLDEST_FIRST.value,
        "auto_apply_advance": True,
        "closed_day_rule": ClosedDayRule.IGNORE.value,
        "tax_inclusive": False,
        "is_active": True,
        "anchor": tenant_today(tenant),
    }


@transaction.atomic
def create_plan(*, ctx: Any, module: str, data: dict) -> DuesPlan:
    """Contracts §2.1 — a new plan for `module`."""
    _assert_module(ctx.tenant, module)
    merged, heads = _clean(ctx.tenant, dict(data), _defaults(ctx.tenant))
    _assert_issuer(ctx.tenant, merged["posting"])
    plan = DuesPlan(tenant=ctx.tenant, module=module, created_by=_actor(ctx))
    _write(plan, merged)
    try:
        with transaction.atomic():
            plan.save()
    except IntegrityError as exc:
        if _name_taken(exc):
            raise ValidationFailed({"name": ["A plan with this name already exists."]}) from None
        raise
    for seq, head in enumerate(heads or [], start=1):
        DuesPlanHead.objects.create(
            tenant=ctx.tenant, plan=plan, seq=seq, label=head["label"], amount=head["amount"]
        )
    write_audit(
        ctx=ctx,
        action=AuditAction.DUES_PLAN_CREATED,
        entity_type="dues_plan",
        entity_id=plan.id,
        after=_snapshot(plan),
        metadata={"module": module},
    )
    return plan


@transaction.atomic
def update_plan(*, ctx: Any, plan_id: Any, data: dict) -> DuesPlan:
    """Contracts §2.1 — affects new schedules only (BR-3). `data["version"]` is checked."""
    plan = (
        DuesPlan.objects.for_tenant(ctx.tenant).select_for_update().filter(pk=plan_id).first()
        if ctx.tenant is not None
        else None
    )
    if plan is None:
        raise NotFound()
    _assert_module(ctx.tenant, plan.module)
    version = data.get("version")
    if version is not None and int(version) != plan.version:
        raise StaleVersion(plan.version)
    before = _snapshot(plan)
    base = {name: getattr(plan, name) for name in _SNAPSHOT}
    base["split_weights"] = list(plan.split_weights or [])
    base["pause_max_days"] = plan.pause_max_days
    base["pause_min_days"] = plan.pause_min_days
    base["pause_max_count"] = plan.pause_max_count
    base["anchor"] = plan.anchor
    base["recurrence"] = {
        "freq": plan.freq,
        "interval": plan.interval,
        "by_weekday": plan.by_weekday,
        "by_month_day": plan.by_month_day,
        "count": plan.count,
        "until": plan.until,
        "explicit_dates": list(plan.explicit_dates or []),
    }
    base["_heads"] = [{"label": h.label, "amount": h.amount} for h in plan.heads.all()]
    merged, heads = _clean(ctx.tenant, {k: v for k, v in data.items() if k != "version"}, base)
    if merged["posting"] != plan.posting or plan.posting == Posting.DOCUMENT:
        _assert_issuer(ctx.tenant, merged["posting"])
    _write(plan, merged)
    plan.version += 1
    try:
        with transaction.atomic():
            plan.save()
    except IntegrityError as exc:
        if _name_taken(exc):
            raise ValidationFailed({"name": ["A plan with this name already exists."]}) from None
        raise
    if heads is not None:
        plan.heads.all().delete()
        for seq, head in enumerate(heads, start=1):
            DuesPlanHead.objects.create(
                tenant=ctx.tenant, plan=plan, seq=seq, label=head["label"], amount=head["amount"]
            )
    write_audit(
        ctx=ctx,
        action=AuditAction.DUES_PLAN_UPDATED,
        entity_type="dues_plan",
        entity_id=plan.id,
        before=before,
        after=_snapshot(plan),
        metadata={"module": plan.module},
    )
    return plan


def _actor(ctx: Any) -> Any:
    return ctx.actor if getattr(ctx, "actor_type", "user") == "user" else None


__all__ = ["create_plan", "update_plan", "ZERO"]
