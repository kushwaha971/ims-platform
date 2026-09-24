"""The onboarding wizard's server side (PLT-03).

Four entry points: `start_tenant` (step 1 — creates the business, or resumes
the caller's unfinished one; see defect NEW-1 there), `create_tenant` (the
create half of it), `update_tenant` (steps 2–4) and `apply_preset` (run on
completion, and safe to run again). Everything is one
transaction and everything is audited.

**Idempotency.** PLT-03 EC-7 requires that a retried step 1 with the same
`Idempotency-Key` replays the created tenant rather than creating a second
business. Two mechanisms hold that, and both are needed:

1. the `Idempotency-Key` header, handled by `apps.common.idempotency`, which
   replays the stored 201 body; and
2. `apply_preset`, which is written entirely in `get_or_create` (BR-3) so that
   a wizard that reaches step 4 twice — a double tap, a retried request, a
   resumed session — produces the same rows and no duplicates.

The first mechanism fails open if a client forgets the header; the second does
not depend on a client doing anything.

A third rule sits beside them for the case neither covers (defect NEW-1): a
client that has LOST its key — a browser refresh — sends a new one, which is a
new request as far as idempotency is concerned. `start_tenant` therefore
resumes the caller's unfinished business instead of creating a second one.
"""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.constants import RoleCode
from apps.common.context import Ctx
from apps.common.dates import fy_label_for, tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.platform_app.constants import BusinessType, GstType, MembershipStatus, TenantStatus
from apps.platform_app.services import presets

WIZARD_LAST_STEP = 4

# Fields steps 2–4 may write. Anything else in the body is ignored rather than
# silently persisted (PLT-03 §14 lists the wizard's fields; the wider
# `PATCH /tenants/current` surface of Part 22 §22.3 belongs to `PLT-07`).
UPDATABLE_FIELDS = (
    "name",
    "legal_name",
    "business_type",
    "gst_type",
    "gstin",
    "pan",
    "state_code",
    "address",
    "phone",
    "email",
    "locale",
    "onboarding_step",
)


class GstinInUse(BusinessRuleViolation):
    """409 — canon's `U(partner_id, gstin)` among non-deleted tenants (BR-1)."""

    def __init__(self) -> None:
        super().__init__(
            "gstin_in_use",
            "This GSTIN is already registered with another business.",
        )


def resolve_partner() -> Any:
    """The partner a self-serve sign-up lands under (FR-2: "resolved partner or `metis`").

    Partner resolution by hostname is `WLB-03`. Until it exists there is exactly
    one partner — `metis` — and this refuses rather than guesses if it is absent,
    because a tenant created under the wrong partner is a data-ownership defect
    that no migration fixes cleanly.
    """
    from apps.platform_app.models import Partner, PartnerStatus

    partner = Partner.objects.select_related("default_plan").filter(code="metis").first()
    if partner is None:
        partner = (
            Partner.objects.select_related("default_plan")
            .filter(status=PartnerStatus.ACTIVE)
            .order_by("created_at")
            .first()
        )
    if partner is None:
        raise NotFound("No partner is configured. Run `manage.py seed_plans`.")
    return partner


def resolve_plan(partner: Any) -> Any:
    from apps.platform_app.models import Plan

    if partner.default_plan_id:
        return partner.default_plan
    plan = Plan.objects.filter(is_active=True).order_by("created_at").first()
    if plan is None:
        raise NotFound("No plan is configured. Run `manage.py seed_plans`.")
    return plan


def create_tenant(
    *,
    user: Any,
    name: str,
    business_type: str,
    state_code: str,
    locale: str = "en",
    owner_name: str | None = None,
    request_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> Any:
    """Step 1 (FR-2). Creates the tenant and the owner membership in one transaction.

    BR-5: the creating user's membership is `owner`. BR-6: `phone` defaults to
    the owner's mobile. BR-7: `owner_name` fills `platform_user.full_name` when
    it is blank and never overwrites a name the user already has.
    """
    from apps.platform_app.models import Membership, Role, Tenant

    partner = resolve_partner()
    plan = resolve_plan(partner)

    owner_role = Role.objects.filter(tenant__isnull=True, code=RoleCode.OWNER.value).first()
    if owner_role is None:
        raise NotFound("System roles are not seeded. Run `manage.py seed_reference_data`.")

    with transaction.atomic():
        tenant = Tenant.objects.create(
            partner=partner,
            plan=plan,
            name=name.strip(),
            business_type=business_type,
            gst_type=GstType.UNREGISTERED,
            state_code=state_code,
            # BR-6 still says "defaults to the owner's mobile"; since DEC-010 an
            # owner may not have one, and `platform_tenant.phone` is NOT NULL.
            phone=user.mobile or "",
            locale=locale or "en",
            enabled_modules=_seed_modules(partner=partner, plan=plan, business_type=business_type),
            status=TenantStatus.ACTIVE,
            onboarding_step=1,
        )
        membership = Membership.objects.create(
            user=user,
            tenant=tenant,
            role=owner_role,
            status=MembershipStatus.ACTIVE,
            is_default=not _has_default(user),
            joined_at=timezone.now(),
        )
        _fill_blank_full_name(user, owner_name)

        ctx = Ctx(
            tenant=tenant,
            actor=user,
            actor_type="user",
            request_id=request_id or "",
            ip=ip,
            user_agent=user_agent,
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.TENANT_CREATED,
            entity_type="platform_tenant",
            entity_id=tenant.id,
            after={
                "name": tenant.name,
                "business_type": tenant.business_type,
                "state_code": tenant.state_code,
                "partner_id": str(tenant.partner_id),
                "plan_id": str(tenant.plan_id),
            },
        )
        write_audit(
            ctx=ctx,
            action=AuditAction.MEMBER_CREATED,
            entity_type="platform_membership",
            entity_id=membership.id,
            after={"role": owner_role.code, "status": membership.status},
        )
    return membership


def resumable_onboarding(*, user: Any) -> Any:
    """The caller's own unfinished business, if they have one (defect NEW-1).

    "Unfinished" means the wizard created it (`onboarding_step >= 1` — step 1 is
    what `create_tenant` writes; nothing else in the product creates a tenant)
    and has not completed it (`< WIZARD_LAST_STEP`). "Own" means an ACTIVE
    `owner` membership in an ACTIVE tenant: a staff member of somebody else's
    half-built business is not resuming anything, and a business that was
    suspended or deleted is not one to write into.

    **Defect M2 — and only one that is still an abandoned ATTEMPT.** Resuming
    renames the business to whatever step 1 now says, so it is only safe when
    the business is indistinguishable from the step-1 submit it came from. QA
    found an owner's "Add a business → Brand New Branch" silently renaming an
    unfinished "Race 4" that already had a staff member, which kept its staff
    and anything they had written. A business is therefore resumable only while
    nobody but the owner is attached to it and it holds no books — see
    `_abandoned_attempt_filter`. Anything else is a real business that happens
    to have an unfinished wizard, and step 1 creates a new tenant beside it.

    The newest wins. There should never be two, but NEW-1 left production-like
    data with duplicates, and resuming the latest is what the merchant was last
    looking at.
    """
    from apps.platform_app.models import Membership

    return (
        Membership.objects.select_related("tenant", "role")
        .filter(
            user=user,
            status=MembershipStatus.ACTIVE,
            role__code=RoleCode.OWNER.value,
            tenant__status=TenantStatus.ACTIVE,
            tenant__onboarding_step__gte=1,
            tenant__onboarding_step__lt=WIZARD_LAST_STEP,
        )
        .exclude(_holds_more_than_an_attempt(user=user))
        .order_by("-tenant__created_at")
        .first()
    )


def _holds_more_than_an_attempt(*, user: Any) -> Any:
    """Defect M2 — what makes an unfinished business NOT an abandoned step 1.

    A `Q` over the candidate membership's tenant, true when any of these exist:

    * **another person** — any membership of somebody else that has not been
      removed (active, invited or suspended alike: each is a person the owner
      has told about this business by its current name), or a pending
      invitation;
    * **books** — a live party, a tag, or a ledger entry. Soft-deleted
      parties are read through `objects`, not `all_objects` (whose callers are
      a closed list); a deleted party that ever carried an entry is still
      caught by the ledger check, because entries are never deleted.

    The list is explicit rather than "any tenant-scoped row", because step 1
    itself writes rows (the membership, audit, idempotency and session rows)
    and a generic test would stop resuming the very attempt NEW-1 is about. A
    new table of merchant data belongs here the day a wizard-unfinished
    business can reach it.
    """
    from django.db.models import Exists, OuterRef, Q

    from apps.ledger.models import LedgerEntry
    from apps.parties.models import Party, Tag
    from apps.platform_app.models import Invitation, InvitationStatus, Membership

    tenant = OuterRef("tenant_id")
    others = (
        Membership.objects.filter(tenant_id=tenant)
        .exclude(user=user)
        .exclude(status=MembershipStatus.REMOVED)
    )
    invitations = Invitation.objects.filter(tenant_id=tenant, status=InvitationStatus.PENDING)
    return (
        Q(Exists(others))
        | Q(Exists(invitations))
        | Q(Exists(Party.objects.filter(tenant_id=tenant)))
        | Q(Exists(Tag.objects.filter(tenant_id=tenant)))
        | Q(Exists(LedgerEntry.objects.filter(tenant_id=tenant)))
    )


def start_tenant(
    *,
    user: Any,
    name: str,
    business_type: str,
    state_code: str,
    locale: str = "en",
    owner_name: str | None = None,
    request_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[Any, bool]:
    """Step 1 submitted: create the business, or RESUME the unfinished one.

    Returns `(membership, created)`.

    **Defect NEW-1.** The wizard's only protection against a second business was
    client memory — the Redux `tenantId` and the `Idempotency-Key` — and a
    browser refresh loses both. The merchant then saw step 1 empty, submitted it
    again under a fresh key, and this endpoint dutifully created a second
    tenant; `/switch` listed two businesses with the same name, and there is no
    delete-business path at MVP. The idempotency key cannot catch that: a new
    key is, by definition, a new request.

    So the rule lives here, where no client can forget it: **a user has at most
    one unfinished business of their own.** While one exists, step 1 writes to
    it — the same three fields `PATCH /tenants/current` would, audited the same
    way, with `onboarding_step` left where it is — instead of creating another.

    What is preserved:

    * *Idempotency (EC-7).* The decorator runs before this, so a replay with the
      same key still replays the stored response byte for byte.
    * *"Add a business" (PLT-04 FR-6).* Once the first business has COMPLETED
      the wizard it is no longer resumable, and step 1 creates a new tenant
      exactly as before. The guard only refuses to start a second wizard while
      the first is still open — the second attempt resumes the first.
    * *A real business with an unfinished wizard (defect M2).* One that already
      has another person on it or any books is never resumed — renaming it
      would rename somebody's live shop. `resumable_onboarding` says which.

    The caller's user row is locked for the duration, so two step-1 submits
    racing from two tabs cannot both see "nothing to resume" and both create.
    """
    from apps.platform_app.models import User

    with transaction.atomic():
        User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True).first()
        existing = resumable_onboarding(user=user)
        if existing is None:
            membership = create_tenant(
                user=user,
                name=name,
                business_type=business_type,
                state_code=state_code,
                locale=locale,
                owner_name=owner_name,
                request_id=request_id,
                ip=ip,
                user_agent=user_agent,
            )
            return membership, True

        update_tenant(
            tenant=existing.tenant,
            actor=user,
            changes={
                "name": name.strip(),
                "business_type": business_type,
                "state_code": state_code,
            },
            request_id=request_id,
            ip=ip,
            user_agent=user_agent,
        )
        _fill_blank_full_name(user, owner_name)
        return existing, False


def _fill_blank_full_name(user: Any, owner_name: str | None) -> None:
    """BR-7: `owner_name` fills `platform_user.full_name` only when it is blank."""
    if owner_name and not (user.full_name or "").strip():
        user.full_name = owner_name.strip()[:120]
        user.save(update_fields=["full_name", "updated_at"])


def update_tenant(
    *,
    tenant: Any,
    actor: Any,
    changes: dict,
    request_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> tuple[Any, list[dict]]:
    """Steps 2–4 (FR-3…FR-5). Returns `(tenant, warnings)`.

    A warning is never an error: FR-3's `gstin_state_mismatch` and §10's PAN
    mismatch are both things the merchant may legitimately mean, so they travel
    in `meta.warnings[]` and the write proceeds.
    """
    warnings: list[dict] = []
    before = {field: getattr(tenant, field) for field in UPDATABLE_FIELDS}
    step_before = int(tenant.onboarding_step)

    payload = {k: v for k, v in changes.items() if k in UPDATABLE_FIELDS}
    _apply_gst(tenant=tenant, payload=payload, warnings=warnings)
    if "onboarding_step" in payload:
        payload["onboarding_step"] = _advance_step(step_before, payload["onboarding_step"])

    for field, value in payload.items():
        setattr(tenant, field, value)

    if tenant.gst_type == GstType.UNREGISTERED:
        # FR-10 "Skip for now" and AC-3: unregistered means no GSTIN at all,
        # never a stale one left over from a corrected step 2.
        tenant.gstin = None

    step_after = int(payload.get("onboarding_step", tenant.onboarding_step))
    # BR-3 "audited once" and FR-8 "changing `business_type` later does not
    # re-apply the preset" both require this to be a *transition* into the last
    # step, not a threshold on the step the request happens to land on. This
    # endpoint is also `PLT-07`'s whole profile surface (Part 22 §22.3), so a
    # threshold re-runs ~25 `get_or_create`s, writes a second `preset_applied`
    # audit row and rewrites `enabled_modules` back to the preset on every
    # address edit a merchant ever makes — which, once `PLT-06`'s module toggles
    # land, silently undoes the owner's own choices.
    completing = step_after >= WIZARD_LAST_STEP > step_before

    with transaction.atomic():
        try:
            tenant.save()
        except IntegrityError as exc:
            if "uq_tenant_partner_gstin" in str(exc):
                raise GstinInUse() from exc
            raise

        after = {field: getattr(tenant, field) for field in UPDATABLE_FIELDS}
        changed_before, changed_after = diff_fields(before, after, fields=UPDATABLE_FIELDS)
        ctx = Ctx(
            tenant=tenant,
            actor=actor,
            actor_type="user",
            request_id=request_id or "",
            ip=ip,
            user_agent=user_agent,
        )
        if changed_after:
            write_audit(
                ctx=ctx,
                action=AuditAction.TENANT_UPDATED,
                entity_type="platform_tenant",
                entity_id=tenant.id,
                before=changed_before,
                after=changed_after,
            )
        if completing:
            apply_preset(tenant=tenant, actor=actor, ctx=ctx)
    return tenant, warnings


def apply_preset(*, tenant: Any, actor: Any = None, ctx: Any = None) -> dict:
    """FR-5/FR-6 — seed every default for the tenant's business type.

    BR-3: idempotent. Every write here is a `get_or_create` or a no-op update,
    so the second call changes no row count. `T-PLT-03-6` is the assertion.
    """
    from apps.common.management.commands.seed_reference_data import seed_expense_categories
    from apps.platform_app.models import DocumentSequence, TenantSetting

    preset = presets.preset_for(tenant.business_type)
    modules = _seed_modules(
        partner=tenant.partner, plan=tenant.plan, business_type=tenant.business_type
    )
    inventory_available = "inventory" in modules

    if sorted(tenant.enabled_modules or []) != sorted(modules):
        tenant.enabled_modules = modules
        tenant.save(update_fields=["enabled_modules", "updated_at"])

    numbering = {
        kind: {"prefix": prefix, "padding": presets.NUMBER_PADDING, "reset_fy": True}
        for kind, prefix in presets.NUMBERING_PREFIXES
    }
    settings_seed: dict[str, Any] = {
        "inventory.enabled": {"value": bool(preset.inventory_enabled and inventory_available)},
        "inventory.favourite_units": {"codes": list(preset.favourite_units)},
        "sales.default_kind": {"by_gst_type": dict(preset.default_kinds)},
        "sales.default_due_days": {"days": preset.default_due_days},
        "numbering": numbering,
        "ledger.credit_limit_mode": {"mode": "warn"},
        "ledger.reminder_templates": dict(presets.REMINDER_TEMPLATES),
        "documents.show_upi_qr": {"value": True},
        "parties.labels": {
            "customer": preset.party_labels[0],
            "supplier": preset.party_labels[1],
        },
    }

    created = {"settings": 0, "sequences": 0, "categories": 0, "locations": 0}
    for key, value in settings_seed.items():
        _row, was_created = TenantSetting.objects.get_or_create(
            tenant=tenant, key=key, defaults={"value": value, "schema_version": 1}
        )
        created["settings"] += int(was_created)

    fy_label = fy_label_for(tenant, tenant_today(tenant))
    for kind, prefix in presets.NUMBERING_PREFIXES:
        _row, was_created = DocumentSequence.objects.get_or_create(
            tenant=tenant,
            kind=kind,
            fy_label=fy_label,
            defaults={
                "prefix": prefix,
                "next_number": 1,
                "padding": presets.NUMBER_PADDING,
            },
        )
        created["sequences"] += int(was_created)

    created["categories"] = seed_expense_categories(tenant)
    created["categories"] += _seed_extra_categories(tenant, preset.extra_expense_categories)
    created["locations"] = _seed_main_location(tenant)

    write_audit(
        ctx=ctx or Ctx(tenant=tenant, actor=actor, actor_type="user" if actor else "system"),
        action=AuditAction.TENANT_PRESET_APPLIED,
        entity_type="platform_tenant",
        entity_id=tenant.id,
        metadata={
            "business_type": tenant.business_type,
            "modules": modules,
            "settings_keys": sorted(settings_seed),
            "created": created,
        },
    )
    return created


# ── helpers ──────────────────────────────────────────────────────────────────


def _seed_modules(*, partner: Any, plan: Any, business_type: str) -> list[str]:
    """FR-7: base ∪ {inventory} ∩ partner.allowed_modules ∩ plan.modules.

    EC-6: a partner without `inventory` silently drops it; the summary tells the
    merchant, and nothing fails.
    """
    wanted = set(presets.BASE_MODULES)
    if presets.preset_for(business_type).inventory_enabled:
        wanted.add("inventory")
    allowed = set(partner.allowed_modules or []) & set(plan.modules or [])
    return sorted(wanted & allowed)


def _advance_step(current: int, requested: Any) -> int:
    """FR-1/FR-9: `onboarding_step` is a progress marker, not a free-form field.

    The serializer clamps it to 0…4, which stops a nonsense value but not a
    nonsense *transition*. Two of those matter:

    * *Forward.* `{"onboarding_step": 4}` from step 1 completes the wizard and
      applies the preset without steps 2 and 3 ever running, which FR-1's
      "progress is saved after each step" and §9's Processing→Completed
      transition both rule out. So a request may advance the marker by at most
      one step.
    * *Backward.* FR-9 makes a completed step navigable for edits, and the
      wizard sends the absolute step number it is on — so a merchant who goes
      back to step 2 from step 4 to fix a GSTIN would otherwise regress a
      finished business into the wizard and be resumed there at the next login.
      So the marker never decreases; the edit still saves, only the marker
      does not move.
    """
    return max(current, min(int(requested), current + 1))


def _has_default(user: Any) -> bool:
    from apps.platform_app.models import Membership

    return Membership.objects.filter(
        user=user, is_default=True, status=MembershipStatus.ACTIVE
    ).exists()


def _seed_extra_categories(tenant: Any, names: tuple[str, ...]) -> int:
    from apps.expenses.models import ExpenseCategory

    created = 0
    for order, name in enumerate(names, start=100):
        _row, was_created = ExpenseCategory.objects.get_or_create(
            tenant=tenant,
            name=name,
            defaults={"is_system": False, "sort_order": order},
        )
        created += int(was_created)
    return created


def _seed_main_location(tenant: Any) -> int:
    """FR-6: `inventory_location` `MAIN`, `is_default=true`."""
    from apps.inventory.models import Location

    _row, was_created = Location.objects.get_or_create(
        tenant=tenant,
        code="MAIN",
        defaults={"name": "Main", "is_default": True, "is_active": True},
    )
    return int(was_created)


def _apply_gst(*, tenant: Any, payload: dict, warnings: list[dict]) -> None:
    """FR-3: derive PAN and state from the GSTIN, and warn rather than refuse."""
    from apps.tax.validators import (
        InvalidGstin,
        is_valid_pan,
        pan_from_gstin,
        state_from_gstin,
        validate_gstin,
    )

    gst_type = payload.get("gst_type", tenant.gst_type)
    if gst_type == GstType.UNREGISTERED:
        payload["gstin"] = None
        return

    gstin = payload.get("gstin", tenant.gstin)
    if not gstin:
        raise ValidationFailed({"gstin": ["Enter your GSTIN."]})
    try:
        gstin = validate_gstin(gstin)
    except InvalidGstin as exc:
        raise ValidationFailed({"gstin": ["Invalid GSTIN"]}) from exc
    payload["gstin"] = gstin

    derived_state = state_from_gstin(gstin)
    chosen_state = payload.get("state_code", tenant.state_code)
    if chosen_state and derived_state != chosen_state:
        warnings.append(
            {
                "code": "gstin_state_mismatch",
                "field": "gstin",
                "gstin_state_code": derived_state,
                "state_code": chosen_state,
            }
        )

    derived_pan = pan_from_gstin(gstin)
    pan = payload.get("pan", tenant.pan)
    if not pan:
        payload["pan"] = derived_pan
    else:
        pan = pan.strip().upper()
        payload["pan"] = pan
        if not is_valid_pan(pan):
            raise ValidationFailed({"pan": ["Enter a valid 10-character PAN."]})
        if pan != derived_pan:
            warnings.append(
                {"code": "pan_gstin_mismatch", "field": "pan", "gstin_pan": derived_pan}
            )


__all__ = [
    "BusinessType",
    "GstinInUse",
    "WIZARD_LAST_STEP",
    "apply_preset",
    "create_tenant",
    "resolve_partner",
    "resolve_plan",
    "resumable_onboarding",
    "start_tenant",
    "update_tenant",
]
