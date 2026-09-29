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
MODULE_DEPENDENCIES: dict[str, frozenset[str]] = {"sales": frozenset({"parties", "ledger"})}

PUT_TOP_LEVEL_KEYS = frozenset({"values", "numbering"})


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
    from apps.platform_app.models import DocumentSequence

    qs = DocumentSequence.objects.filter(tenant=tenant, fy_label=fy_label)
    if lock:
        qs = qs.select_for_update()
    return {row.kind: row for row in qs}


def _reset_fy_map(rows: dict[str, Any]) -> dict[str, bool]:
    row = rows.get(schema.NUMBERING_KEY)
    stored = row.value if row is not None and isinstance(row.value, dict) else {}
    return {
        kind: bool((stored.get(kind) or {}).get("reset_fy", True))
        for kind in schema.NUMBERING_KINDS
    }


def _numbering_view(tenant: Any, rows: dict[str, Any], sequences: dict[str, Any], fy: str) -> dict:
    reset = _reset_fy_map(rows)
    default_prefix = dict(presets.NUMBERING_PREFIXES)
    view: dict[str, dict] = {}
    for kind in schema.NUMBERING_KINDS:
        seq = sequences.get(kind)
        prefix = seq.prefix if seq is not None else default_prefix[kind]
        padding = seq.padding if seq is not None else presets.NUMBER_PADDING
        next_number = seq.next_number if seq is not None else 1
        view[kind] = {
            "prefix": prefix,
            "next_number": next_number,
            "padding": padding,
            "reset_fy": reset[kind],
            "preview": schema.format_number(
                prefix=prefix, fy_label=fy, number=next_number, padding=padding
            ),
        }
    return view


def _values_view(tenant: Any, rows: dict[str, Any]) -> tuple[dict, dict]:
    values: dict[str, Any] = {}
    versions: dict[str, int] = {}
    for key, spec in schema.SETTINGS.items():
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
        "sections": {key: spec.section for key, spec in schema.SETTINGS.items()},
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
    values = {key: spec.default(tenant.business_type) for key, spec in schema.SETTINGS.items()}
    numbering = {
        kind: {"prefix": prefix, "padding": presets.NUMBER_PADDING, "reset_fy": True}
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
        spec = schema.SETTINGS.get(key)
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


def _validate_numbering(incoming: Any, current: dict, fy: str) -> dict[str, dict]:
    if not isinstance(incoming, dict):
        raise ValidationFailed({"numbering": ["Expected an object keyed by document kind."]})
    errors: dict[str, list[str]] = {}
    cleaned: dict[str, dict] = {}
    backwards: dict[str, int] = {}
    for kind, row in incoming.items():
        field = f"numbering.{kind}"
        if kind not in schema.NUMBERING_KINDS or not isinstance(row, dict):
            errors[field] = ["This is not a document series."]
            continue
        now = current[kind]
        wanted = {
            "prefix": str(row.get("prefix", now["prefix"]) or "").strip().upper(),
            "next_number": row.get("next_number", now["next_number"]),
            "padding": row.get("padding", now["padding"]),
            "reset_fy": row.get("reset_fy", now["reset_fy"]),
        }
        if not isinstance(wanted["reset_fy"], bool):
            errors[field] = ["Choose on or off for the yearly restart."]
            continue
        changed = any(wanted[k] != now[k] for k in ("prefix", "next_number", "padding"))
        if changed:
            # A row is re-validated only when it changes: a preset that already
            # breaks the 16-character rule (PAYOUT/26-27/0001) must not make every
            # unrelated save of the page fail.
            row_errors = schema.numbering_row_errors(
                fy_label=fy, **{k: wanted[k] for k in ("prefix", "padding", "next_number")}
            )
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
                defaults={"value": value, "schema_version": schema.SETTINGS[key].schema_version},
            )

        numbering_changed_before: dict[str, Any] = {}
        numbering_changed_after: dict[str, Any] = {}
        reset_map = _reset_fy_map(rows)
        reset_dirty = False
        for kind, wanted in cleaned_numbering.items():
            now = numbering_before[kind]
            if all(wanted[k] == now[k] for k in ("prefix", "next_number", "padding", "reset_fy")):
                continue
            numbering_changed_before[kind] = {k: v for k, v in now.items() if k != "preview"}
            numbering_changed_after[kind] = dict(wanted)
            if any(wanted[k] != now[k] for k in ("prefix", "next_number", "padding")):
                seq = sequences.get(kind)
                if seq is None:
                    DocumentSequence.objects.create(
                        tenant=tenant,
                        kind=kind,
                        fy_label=fy,
                        prefix=wanted["prefix"],
                        next_number=wanted["next_number"],
                        padding=wanted["padding"],
                    )
                else:
                    seq.prefix = wanted["prefix"]
                    seq.next_number = wanted["next_number"]
                    seq.padding = wanted["padding"]
                    seq.save(update_fields=["prefix", "next_number", "padding", "updated_at"])
            if wanted["reset_fy"] != reset_map[kind]:
                reset_map[kind] = wanted["reset_fy"]
                reset_dirty = True
        if reset_dirty:
            row = rows.get(schema.NUMBERING_KEY)
            stored = dict(row.value) if row is not None and isinstance(row.value, dict) else {}
            for kind, flag in reset_map.items():
                entry = dict(stored.get(kind) or {})
                entry["reset_fy"] = flag
                stored[kind] = entry
            TenantSetting.objects.update_or_create(
                tenant=tenant, key=schema.NUMBERING_KEY, defaults={"value": stored}
            )

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
    from apps.platform_app.services.guards import blocking_rows_for_module_off

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
        count = blocking_rows_for_module_off(tenant, module)
        if count:
            raise BusinessRuleViolation(
                "module_has_data",
                (
                    str(_("Turn off stock first."))
                    if module == "inventory"
                    else str(_("This feature still has records that need attention."))
                ),
                details={"module": module, "count": count},
            )

    after = sorted(wanted)
    if after == before:
        return tenant
    with transaction.atomic():
        tenant.enabled_modules = after
        tenant.save(update_fields=["enabled_modules", "updated_at"])
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
