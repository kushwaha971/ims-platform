"""PLT-06 — reading and writing tenant settings (TSK-PLT-06-02…-05).

The settings object has two halves with different homes:

* **Keys** — `platform_tenant_setting` rows, one per key, validated by
  `settings_schema`. A key with no row reads as its preset, then the product
  default (TSK-PLT-06-02), so a tenant created before a key existed still gets
  a sensible value and the first save writes the row.
* **Numbering** — `platform_document_sequence` rows for the CURRENT financial
  year, where numbers are actually allocated, plus `reset_fy` per kind in the
  `numbering` setting row (CR-010). Editing a prefix changes only the numbers
  allocated after it (BR-1); `next_number` may rise and never fall (FR-3,
  409 `sequence_backwards`), because a lower number is a number that may
  already be printed on a bill.

**Concurrency (FR-8, CR-011).** The object carries an ETag — a hash of what a
GET returns — and a PUT with a stale `If-Match` is 412 `precondition_failed`
(EC-5: two admins editing). The check runs under a row lock on the tenant, so
two concurrent PUTs cannot both pass it.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.dates import fy_label_for, tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app import settings_schema as schema
from apps.platform_app.services import presets

#: Modules a tenant may never switch off: `platform` is how the others are
#: switched, and a khata product without parties and a ledger is nothing (WLB-02
#: §10 requires every partner to allow these three for the same reason).
CORE_MODULES: frozenset[str] = frozenset({"platform", "parties", "ledger"})

#: PLT-06 §10: "dependency `sales` requires `parties`,`ledger`". Both are core,
#: so the rule can never fire today; it is stated so a future non-core
#: dependency is one line here rather than an `if` in the service.
MODULE_DEPENDENCIES: dict[str, frozenset[str]] = {
    "sales": frozenset({"parties", "ledger"}),
    # ── A12 ── 10-architecture §2.3. Gym and hospitality need the sales MODULE
    # because their money is tax invoices — a runtime dependency, not an import.
    "lending": frozenset({"parties", "ledger", "payments"}),
    "library": frozenset({"parties", "ledger", "payments"}),
    "gym": frozenset({"parties", "ledger", "payments", "sales"}),
    "hospitality": frozenset({"parties", "ledger", "payments", "sales"}),
}

#: A12 (ADR-041, contracts §1.1) — which shared engines each module uses.
#: Engines have no module code and no switch: an engine is on exactly when an
#: effective module lists it here (`entitlements.engine_enabled`). Strings only
#: (L4); the engines' apps are never imported from here.
ENGINES_USED_BY: dict[str, frozenset[str]] = {
    "lending": frozenset({"dues"}),
    "library": frozenset({"dues"}),  # recurring fees; seats and visits come later
    "gym": frozenset({"dues", "attendance"}),
    "hospitality": frozenset({"bookings", "dues"}),  # dues only for long stays (later)
}

PUT_TOP_LEVEL_KEYS = frozenset({"values", "numbering"})

#: ── A8 ── owner Q14 (default adopted): settings the code stores but never reads
#: are removed from the settings payload until they are wired — a switch whose
#: effect nobody can see teaches a merchant the product is broken. The rows
#: stay where onboarding wrote them; a PUT still carrying one (an old client)
#: leaves it alone rather than refusing the whole save. `reset_fy` on the
#: numbering rows is the other half: every series resets each year whatever it
#: says (ADR-051), so it is neither shown nor written.
UNWIRED_KEYS: frozenset[str] = frozenset({"sales.default_kind"})


def _shown_specs(tenant: Any) -> dict[str, Any]:
    """Core keys and the keys of the tenant's effective modules (A10's
    `specs_for`), minus the unwired ones."""
    return {k: s for k, s in schema.specs_for(tenant).items() if k not in UNWIRED_KEYS}


class PreconditionFailed(BusinessRuleViolation):
    def __init__(self) -> None:
        super().__init__(
            "precondition_failed",
            _("Settings were changed elsewhere. Reload to continue."),
        )


# ── Reading ──────────────────────────────────────────────────────────────────


def _setting_rows(tenant: Any) -> dict[str, Any]:
    from apps.platform_app.models import TenantSetting

    return {row.key: row for row in TenantSetting.objects.filter(tenant=tenant)}


def _current_fy(tenant: Any) -> str:
    return fy_label_for(tenant, tenant_today(tenant))


def _sequences(tenant: Any, fy_label: str, *, lock: bool = False) -> dict[str, Any]:
    """The current year's rows, and (A8) the perpetual `'*'` rows, by kind.

    A kind is either `fy` or `perpetual`, never both, so one key per kind holds.
    """
    from apps.platform_app.models import DocumentSequence
    from apps.platform_app.services.sequences import PERPETUAL, number_kind

    qs = DocumentSequence.objects.filter(tenant=tenant, fy_label__in=(fy_label, PERPETUAL))
    if lock:
        qs = qs.select_for_update()
    rows: dict[str, Any] = {}
    for row in qs:
        spec = number_kind(row.kind)
        perpetual = spec is not None and spec.mode == "perpetual"
        if (row.fy_label == PERPETUAL) == perpetual:
            rows[row.kind] = row
    return rows


def _shown_kinds(tenant: Any) -> list[Any]:
    """A8 (FRD §2 flow 1): the registered number kinds of effective modules."""
    from apps.platform_app.services.entitlements import effective_modules
    from apps.platform_app.services.sequences import number_kinds

    kinds = number_kinds()
    if not kinds:
        return []
    effective = effective_modules(tenant)
    return [spec for spec in kinds if spec.module in effective]


def _numbering_view(tenant: Any, rows: dict[str, Any], sequences: dict[str, Any], fy: str) -> dict:
    from apps.platform_app.services.sequences import format_counter

    default_prefix = dict(presets.NUMBERING_PREFIXES)
    view: dict[str, dict] = {}
    for kind in schema.NUMBERING_KINDS:
        seq = sequences.get(kind)
        prefix = seq.prefix if seq is not None else default_prefix[kind]
        padding = seq.padding if seq is not None else presets.NUMBER_PADDING
        next_number = seq.next_number if seq is not None else 1
        view[kind] = {
            "mode": "fy",
            "prefix": prefix,
            "next_number": next_number,
            "padding": padding,
            "preview": schema.format_number(
                prefix=prefix, fy_label=fy, number=next_number, padding=padding
            ),
        }
    # A8: a module's kinds, only while the module is on (FRD §6).
    for spec in _shown_kinds(tenant):
        seq = sequences.get(spec.kind)
        prefix = seq.prefix if seq is not None else spec.default_prefix
        padding = seq.padding if seq is not None else spec.padding
        next_number = seq.next_number if seq is not None else 1
        preview = (
            format_counter(prefix=prefix, number=next_number, padding=padding)
            if spec.mode == "perpetual"
            else schema.format_number(
                prefix=prefix, fy_label=fy, number=next_number, padding=padding
            )
        )
        view[spec.kind] = {
            "kind": spec.kind,
            "module": spec.module,
            "mode": spec.mode,
            "label_id": spec.label_id,
            "prefix": prefix,
            "padding": padding,
            "next_number": next_number,
            "preview": preview,
        }
    return view


def _values_view(tenant: Any, rows: dict[str, Any]) -> tuple[dict, dict]:
    values: dict[str, Any] = {}
    versions: dict[str, int] = {}
    for key, spec in _shown_specs(tenant).items():
        row = rows.get(key)
        if row is None:
            values[key] = spec.default(tenant.business_type)
            versions[key] = spec.schema_version
        else:
            values[key] = schema.migrate_value(key, row.value, row.schema_version)
            versions[key] = max(row.schema_version, spec.schema_version)
    return values, versions


def compute_etag(values: dict, numbering: dict) -> str:
    """A strong validator over exactly what the client edits (previews excluded)."""
    editable = {
        kind: {k: v for k, v in row.items() if k != "preview"} for kind, row in numbering.items()
    }
    blob = json.dumps({"values": values, "numbering": editable}, sort_keys=True, default=str)
    return '"' + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:32] + '"'


def modules_view(tenant: Any) -> dict:
    """What the Features section draws (FR-4, T-PLT-06-8).

    `available` is `plan.modules ∩ partner.allowed_modules`; everything else in
    the canon module list is `locked` — shown with a lock and "Not included in
    your plan", never offered.
    """
    from apps.common.constants import ModuleCode
    from apps.platform_app.services.entitlements import for_tenant, hidden_modules

    # A1 (PLT-X11 BR-1): an unreleased module is neither available nor locked —
    # a locked "Gym" row is still an unbuilt feature on screen (vision §4).
    hidden = hidden_modules()
    available = set(for_tenant(tenant).modules) - hidden
    universe = [m.value for m in ModuleCode if m.value not in ("help",) and m.value not in hidden]
    return {
        "enabled": sorted(set(tenant.enabled_modules or []) & available | {"platform"}),
        "available": [m for m in universe if m in available],
        "locked": [m for m in universe if m not in available],
        "core": sorted(CORE_MODULES),
    }


def settings_payload(tenant: Any) -> dict:
    """`GET /tenants/current/settings` — FR-2."""
    rows = _setting_rows(tenant)
    fy = _current_fy(tenant)
    values, versions = _values_view(tenant, rows)
    numbering = _numbering_view(tenant, rows, _sequences(tenant, fy), fy)
    return {
        "values": values,
        "schema_versions": versions,
        "numbering": numbering,
        "fy_label": fy,
        "sections": {key: spec.section for key, spec in _shown_specs(tenant).items()},
        "modules": modules_view(tenant),
        "etag": compute_etag(values, numbering),
    }


def preset_payload(tenant: Any) -> dict:
    """FR-10: the PLT-03 preset values for this tenant's business type.

    The client merges a section of these into the object it holds and saves
    through the ordinary PUT — one write path, one audit shape, one ETag rule.
    Numbering's preset is the prefix, padding and `reset_fy`; the next number
    is never "reset", because that would be BR-1's forbidden renumbering.
    """
    values = {key: spec.default(tenant.business_type) for key, spec in _shown_specs(tenant).items()}
    numbering = {
        kind: {"prefix": prefix, "padding": presets.NUMBER_PADDING}
        for kind, prefix in presets.NUMBERING_PREFIXES
    }
    return {"values": values, "numbering": numbering, "business_type": tenant.business_type}


# ── Writing ──────────────────────────────────────────────────────────────────


def _validate_values(tenant: Any, incoming: Any) -> dict[str, Any]:
    if not isinstance(incoming, dict):
        raise ValidationFailed({"values": ["Expected an object of settings."]})
    errors: dict[str, list[str]] = {}
    cleaned: dict[str, Any] = {}
    kind_refused: str | None = None
    for key, value in incoming.items():
        if key in UNWIRED_KEYS:
            continue  # owner Q14: not shown, so not written; an old client is not refused
        spec = schema.spec_for(tenant, key)
        if spec is None:
            errors[key] = ["This is not a setting."]
            continue
        try:
            cleaned[key] = spec.validate(value, tenant)
        except schema.SettingError as exc:
            errors[key] = exc.messages
            if exc.code == "kind_not_allowed":
                kind_refused = key
    if kind_refused and len(errors) == 1:
        raise BusinessRuleViolation(
            "kind_not_allowed",
            str(_("Not allowed for your GST type.")),
            details={kind_refused: errors[kind_refused]},
        )
    if errors:
        raise ValidationFailed(errors)
    return cleaned


def _numbering_row_errors(*, kind: str, row: dict, fy: str) -> list[str]:
    """FR-3's rules for an FY series; A8's for a perpetual one (no year, so no
    Rule 46 length, and padding may be 0 — an accession number is `1024`)."""
    from apps.platform_app.services.sequences import MAX_NEXT_NUMBER, number_kind

    spec = number_kind(kind)
    if spec is None or spec.mode == "fy":
        return schema.numbering_row_errors(
            fy_label=fy, **{k: row[k] for k in ("prefix", "padding", "next_number")}
        )
    prefix, padding, next_number = row["prefix"], row["padding"], row["next_number"]
    if not isinstance(prefix, str) or not schema.NUMBERING_PREFIX_RE.match(prefix):
        return ["Use capital letters, numbers, / or - (max 12)."]
    if isinstance(padding, bool) or not isinstance(padding, int) or not 0 <= padding <= 10:
        return ["Choose 0–10 digits."]
    if (
        isinstance(next_number, bool)
        or not isinstance(next_number, int)
        or not 1 <= next_number <= MAX_NEXT_NUMBER
    ):
        return ["Enter a whole number of 1 or more."]
    return []


def _validate_numbering(incoming: Any, current: dict, fy: str) -> dict[str, dict]:
    """`current` is the numbering view: the core series plus the registered kinds
    of effective modules (A8), so a switched-off module's series is refused as
    "not a document series" like any unknown one. `reset_fy` is ignored (Q14)."""
    if not isinstance(incoming, dict):
        raise ValidationFailed({"numbering": ["Expected an object keyed by document kind."]})
    errors: dict[str, list[str]] = {}
    cleaned: dict[str, dict] = {}
    backwards: dict[str, int] = {}
    for kind, row in incoming.items():
        field = f"numbering.{kind}"
        if kind not in current or not isinstance(row, dict):
            errors[field] = ["This is not a document series."]
            continue
        now = current[kind]
        wanted = {
            "prefix": str(row.get("prefix", now["prefix"]) or "").strip().upper(),
            "next_number": row.get("next_number", now["next_number"]),
            "padding": row.get("padding", now["padding"]),
        }
        changed = any(wanted[k] != now[k] for k in ("prefix", "next_number", "padding"))
        if changed:
            # A row is re-validated only when it changes: a preset that already
            # breaks the 16-character rule (PAYOUT/26-27/0001) must not make every
            # unrelated save of the page fail.
            row_errors = _numbering_row_errors(kind=kind, row=wanted, fy=fy)
            if row_errors:
                errors[field] = row_errors
                continue
            if wanted["next_number"] < now["next_number"]:
                backwards[kind] = now["next_number"]
                continue
        cleaned[kind] = wanted
    if errors:
        raise ValidationFailed(errors)
    if backwards:
        kind, current_next = next(iter(backwards.items()))
        raise BusinessRuleViolation(
            "sequence_backwards",
            str(_("Cannot go below %(current)s.") % {"current": current_next}),
            details={f"numbering.{k}": [f"Cannot go below {v}."] for k, v in backwards.items()}
            | {"current": current_next, "kind": kind},
        )
    return cleaned


def save_settings(*, tenant: Any, body: Any, if_match: str | None, ctx: Ctx) -> dict:
    """`PUT /tenants/current/settings` — FR-2, FR-3, FR-8, FR-9.

    Keys absent from `values` and kinds absent from `numbering` are left as
    they are: the client merges a section into the object it fetched and sends
    the whole thing (FR-8), and a client that sends less has not asked for
    anything to be reset. Every PRESENT key is validated, and one bad key
    refuses the whole write.
    """
    from apps.platform_app.models import DocumentSequence, Tenant, TenantSetting

    if not isinstance(body, dict):
        raise ValidationFailed({"non_field_errors": ["Expected a settings object."]})
    unknown_top = set(body) - PUT_TOP_LEVEL_KEYS
    if unknown_top:
        raise ValidationFailed({key: ["This is not a setting."] for key in sorted(unknown_top)})

    with transaction.atomic():
        Tenant.objects.select_for_update().filter(pk=tenant.pk).first()
        rows = _setting_rows(tenant)
        fy = _current_fy(tenant)
        sequences = _sequences(tenant, fy, lock=True)
        values_before, _versions = _values_view(tenant, rows)
        numbering_before = _numbering_view(tenant, rows, sequences, fy)
        if if_match and if_match.strip() != compute_etag(values_before, numbering_before):
            raise PreconditionFailed()

        cleaned_values = _validate_values(tenant, body.get("values", {}))
        cleaned_numbering = _validate_numbering(body.get("numbering", {}), numbering_before, fy)

        changed_before: dict[str, Any] = {}
        changed_after: dict[str, Any] = {}
        for key, value in cleaned_values.items():
            if values_before.get(key) == value and key in rows:
                continue
            if values_before.get(key) != value:
                changed_before[key] = values_before.get(key)
                changed_after[key] = value
            TenantSetting.objects.update_or_create(
                tenant=tenant,
                key=key,
                defaults={
                    "value": value,
                    "schema_version": schema.spec_for(tenant, key).schema_version,
                },
            )

        numbering_changed_before: dict[str, Any] = {}
        numbering_changed_after: dict[str, Any] = {}
        from apps.platform_app.services.sequences import PERPETUAL

        for kind, wanted in cleaned_numbering.items():
            now = numbering_before[kind]
            if all(wanted[k] == now[k] for k in ("prefix", "next_number", "padding")):
                continue
            numbering_changed_before[kind] = {
                k: now[k] for k in ("prefix", "next_number", "padding")
            }
            numbering_changed_after[kind] = dict(wanted)
            seq = sequences.get(kind)
            if seq is None:
                DocumentSequence.objects.create(
                    tenant=tenant,
                    kind=kind,
                    # A8: a perpetual kind's one row is `'*'`, never the year.
                    fy_label=PERPETUAL if now["mode"] == "perpetual" else fy,
                    prefix=wanted["prefix"],
                    next_number=wanted["next_number"],
                    padding=wanted["padding"],
                )
            else:
                seq.prefix = wanted["prefix"]
                seq.next_number = wanted["next_number"]
                seq.padding = wanted["padding"]
                seq.save(update_fields=["prefix", "next_number", "padding", "updated_at"])

        if changed_after:
            write_audit(
                ctx=ctx,
                action=AuditAction.SETTINGS_UPDATED,
                entity_type="platform_tenant",
                entity_id=tenant.id,
                before=changed_before,
                after=changed_after,
                metadata={"keys": sorted(changed_after)},
            )
        if numbering_changed_after:
            write_audit(
                ctx=ctx,
                action=AuditAction.NUMBERING_UPDATED,
                entity_type="platform_tenant",
                entity_id=tenant.id,
                before=numbering_changed_before,
                after=numbering_changed_after,
                metadata={"fy_label": fy, "kinds": sorted(numbering_changed_after)},
            )
    return settings_payload(tenant)


def update_enabled_modules(*, tenant: Any, modules: Any, ctx: Ctx) -> Any:
    """FR-4 — `PATCH /tenants/current {enabled_modules}`.

    Core modules are always on; a module outside the plan and partner is
    refused rather than silently dropped (the client offers only `available`,
    so a locked module in the body is a client bug worth hearing about); a
    module with live data cannot be switched off (409 `module_has_data`, with
    the count). Switching off deletes nothing (BR-4).
    """
    from apps.platform_app.services.guards import module_off_blockers, run_module_enable_hooks

    if not isinstance(modules, list) or not all(isinstance(m, str) for m in modules):
        raise ValidationFailed({"enabled_modules": ["Expected a list of features."]})
    available = set(modules_view(tenant)["available"])
    wanted = set(modules) | CORE_MODULES
    outside = sorted(wanted - available - CORE_MODULES)
    if outside:
        raise ValidationFailed(
            {"enabled_modules": [f"'{outside[0]}' is not included in your plan."]}
        )
    for module, needs in MODULE_DEPENDENCIES.items():
        if module in wanted and not needs <= wanted:
            raise ValidationFailed(
                {"enabled_modules": [f"'{module}' needs {', '.join(sorted(needs))}."]}
            )

    before = sorted(set(tenant.enabled_modules or []))
    # A1 (PLT-X11 EC-1): a hidden module the tenant row already carries (a dev
    # database from a flagged run) is carried through untouched. The client
    # cannot send what it was never shown, so without this every ordinary
    # switch flip would silently switch that module off for good.
    from apps.platform_app.services.entitlements import hidden_modules

    wanted |= set(before) & hidden_modules()
    turning_off = sorted(set(before) - wanted)
    for module in turning_off:
        # A12 (R14): the breakdown names each open thing and its count, so the
        # screen can say "3 books out and 2 deposits held" rather than "still
        # has records". `count` stays the sum, as it always was.
        breakdown = module_off_blockers(tenant, module)
        count = sum(row["count"] for row in breakdown)
        if count:
            raise BusinessRuleViolation(
                "module_has_data",
                (
                    str(_("Turn off stock first."))
                    if module == "inventory"
                    else str(_("This feature still has records that need attention."))
                ),
                details={"module": module, "count": count, "breakdown": breakdown},
            )

    after = sorted(wanted)
    if after == before:
        return tenant
    turning_on = sorted(set(after) - set(before))
    with transaction.atomic():
        tenant.enabled_modules = after
        tenant.save(update_fields=["enabled_modules", "updated_at"])
        # The entitlement cache on the instance is keyed to the old switches,
        # and an enable hook may well ask `effective_modules` about the new one.
        if hasattr(tenant, "_ub_entitlement"):
            delattr(tenant, "_ub_entitlement")
        # A12 (R15, BR-6): each newly enabled module seeds its presets inside
        # this transaction, after the dependency check, so a failing seed
        # leaves the module off rather than on and half-seeded.
        run_module_enable_hooks(ctx=ctx, tenant=tenant, modules=turning_on)
        write_audit(
            ctx=ctx,
            action=AuditAction.TENANT_MODULES_CHANGED,
            entity_type="platform_tenant",
            entity_id=tenant.id,
            before={"enabled_modules": before},
            after={"enabled_modules": after},
        )
    # The entitlement cache on the instance is keyed to the old switches.
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant
