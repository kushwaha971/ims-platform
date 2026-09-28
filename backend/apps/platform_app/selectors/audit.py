"""PLT-08 — reading the audit log (rule D8: never writes).

Three things make a raw `platform_audit_log` row readable by a shopkeeper, and
all three are done here, in bulk, rather than per row in a serializer:

* **Who.** The actor's name comes from `platform_user` (a removed member is
  still named — EC-2 — and flagged `is_former_member`), their role from their
  membership in THIS tenant. One query for the page's users, one for their
  memberships.
* **What it was about.** `entity_label` is the entity's CURRENT name (a party
  renamed since reads under its new name — FR-4), resolved with one query per
  entity type on the page. A row whose entity is gone falls back to the name
  its own snapshot carried (EC-1).
* **What changed.** `changed_keys` is computed from `before`/`after`, with
  nested jsonb flattened to dotted paths (EC-5, `address.city`), so the
  client's diff cell never has to walk JSON.

Tenant scoping is the first filter and is never optional: platform rows
(`tenant_id IS NULL`) cannot reach this function's output (BR-2).
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any, Iterable

from django.db.models import Q, QuerySet

#: FR-3's action groups → the action prefixes each one covers.
ACTION_GROUPS: dict[str, tuple[str, ...]] = {
    "parties": ("party.", "credit."),
    "ledger": ("ledger.",),
    "bills": ("invoice.", "sales.", "estimate.", "credit_note."),
    "payments": ("payment.", "payments."),
    "stock": ("inventory.", "item.", "stock."),
    "team": ("member.", "invitation."),
    "settings": ("settings.", "tenant.", "branding.", "numbering.", "plan."),
    "auth": ("auth.",),
}

ACTION_RE = re.compile(r"^[a-z_]+(\.[a-z_]+){1,2}$")
MAX_RANGE_DAYS = 366
CSV_MAX_ROWS = 50_000

#: Entity type → `(app_label, model, label field, page route template)`.
#: The route is FR-5's "Open" target; `None` means the entity has no page.
ENTITY_LABELS: dict[str, tuple[str, str, str, str | None]] = {
    "parties_party": ("parties", "Party", "name", "/parties/{id}"),
    "parties_tag": ("parties", "Tag", "name", "/parties/tags"),
    "platform_tenant": ("platform", "Tenant", "name", "/settings/profile"),
    "platform_membership": ("platform", "Membership", "user__full_name", "/settings/team"),
    "platform_user": ("platform", "User", "full_name", None),
}

_SNAPSHOT_LABEL_KEYS = ("name", "number", "display_name", "full_name", "email")


def audit_rows_for(
    *,
    tenant: Any,
    entity_type: str | None = None,
    entity_id: Any = None,
    actor_id: Any = None,
    action: str | None = None,
    group: str | None = None,
    q: str | None = None,
    starts: dt.datetime | None = None,
    ends: dt.datetime | None = None,
) -> QuerySet:
    """FR-1/FR-3's filtered set, newest first, for one tenant."""
    from apps.platform_app.models import AuditLog

    if tenant is None:
        return AuditLog.objects.none()
    qs = AuditLog.objects.filter(tenant=tenant).select_related("actor")
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    if entity_id:
        qs = qs.filter(entity_id=entity_id)
    if actor_id:
        qs = qs.filter(actor_id=actor_id)
    if action:
        qs = qs.filter(action=action)
    if group:
        prefixes = ACTION_GROUPS.get(group, ())
        condition = Q()
        for prefix in prefixes:
            condition |= Q(action__startswith=prefix)
        qs = qs.filter(condition) if prefixes else qs.none()
    if starts is not None:
        qs = qs.filter(created_at__gte=starts)
    if ends is not None:
        qs = qs.filter(created_at__lt=ends)
    if q:
        term = q.strip()
        if term:
            qs = qs.filter(
                Q(action__icontains=term)
                | Q(entity_type__icontains=term)
                | Q(after__name__icontains=term)
                | Q(before__name__icontains=term)
                | Q(actor__full_name__icontains=term)
            )
    return qs.order_by("-created_at", "-id")


def flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    """EC-5: `{"address": {"city": "Pune"}}` → `{"address.city": "Pune"}`."""
    if isinstance(value, dict) and value:
        out: dict[str, Any] = {}
        for key, inner in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            out |= flatten(inner, path)
        return out
    return {prefix: value} if prefix else {}


def _blank(value: Any) -> Any:
    """QA D5: `{}`, `[]` and `""` are all "nothing", the same as a missing key."""
    return None if value in ({}, [], "") else value


def changed_keys(before: Any, after: Any) -> list[str]:
    """Dotted paths whose value differs, in a stable order (T-PLT-08-5).

    An empty object on one side and nothing on the other is not a change
    (QA D5 — the drawer read "address Before: {} · After: —")."""
    flat_before = flatten(before or {})
    flat_after = flatten(after or {})
    keys = set(flat_before) | set(flat_after)
    return sorted(k for k in keys if _blank(flat_before.get(k)) != _blank(flat_after.get(k)))


def _labels(rows: Iterable[Any]) -> dict[tuple[str, str], str]:
    """One query per entity type present on the page (§15)."""
    from django.apps import apps

    wanted: dict[str, set[str]] = {}
    for row in rows:
        if row.entity_id and row.entity_type in ENTITY_LABELS:
            wanted.setdefault(row.entity_type, set()).add(str(row.entity_id))
    labels: dict[tuple[str, str], str] = {}
    for entity_type, ids in wanted.items():
        app_label, model_name, field, _route = ENTITY_LABELS[entity_type]
        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:  # pragma: no cover - the app is not installed
            continue
        manager = getattr(model, "all_objects", model.objects)
        for pk, label in manager.filter(pk__in=ids).values_list("pk", field):
            if label:
                labels[(entity_type, str(pk))] = str(label)
    return labels


def _roles(tenant: Any, user_ids: set[Any]) -> dict[str, tuple[str, str]]:
    from apps.platform_app.models import Membership

    if not user_ids:
        return {}
    return {
        str(user_id): (role, status)
        for user_id, role, status in Membership.objects.filter(
            tenant=tenant, user_id__in=user_ids
        ).values_list("user_id", "role__code", "status")
    }


def _snapshot_label(row: Any) -> str | None:
    for snapshot in (row.after, row.before):
        if isinstance(snapshot, dict):
            for key in _SNAPSHOT_LABEL_KEYS:
                if snapshot.get(key):
                    return str(snapshot[key])
    return None


def build_rows(rows: list[Any], *, tenant: Any, show_ip: bool) -> list[dict]:
    """FR-1's row shape for one page. Two to three queries, never one per row."""
    labels = _labels(rows)
    roles = _roles(tenant, {row.actor_id for row in rows if row.actor_id})
    out: list[dict] = []
    for row in rows:
        actor = None
        if row.actor_id:
            role, status = roles.get(str(row.actor_id), (None, None))
            actor = {
                "id": str(row.actor_id),
                "name": (row.actor.full_name or row.actor.email) if row.actor else None,
                "role": role,
                "is_former_member": status in (None, "removed", "left"),
            }
        route = None
        if row.entity_type in ENTITY_LABELS and row.entity_id:
            template = ENTITY_LABELS[row.entity_type][3]
            live = (row.entity_type, str(row.entity_id)) in labels
            route = template.format(id=row.entity_id) if template and live else None
        metadata = dict(row.metadata or {})
        meta_out = {
            "reason": metadata.get("reason"),
            "request_id": metadata.get("request_id"),
        }
        if show_ip:
            meta_out["ip"] = metadata.get("ip")
        out.append(
            {
                "id": str(row.id),
                "created_at": row.created_at,
                "actor": actor,
                "actor_type": row.actor_type,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": str(row.entity_id) if row.entity_id else None,
                "entity_label": labels.get((row.entity_type, str(row.entity_id)))
                or _snapshot_label(row),
                "entity_route": route,
                "before": row.before,
                "after": row.after,
                "changed_keys": changed_keys(row.before, row.after),
                "metadata": meta_out,
            }
        )
    return out


def active_actors(*, tenant: Any) -> list[dict]:
    """FR-3's "Who" options: everyone who ever acted in this tenant, removed included."""
    from apps.platform_app.models import AuditLog, Membership

    user_ids = set(
        AuditLog.objects.filter(tenant=tenant, actor__isnull=False)
        .values_list("actor_id", flat=True)
        .distinct()
    ) | set(Membership.objects.filter(tenant=tenant).values_list("user_id", flat=True))
    from apps.platform_app.models import User

    roles = _roles(tenant, user_ids)
    return [
        {
            "id": str(user.id),
            "name": user.full_name or user.email,
            "role": roles.get(str(user.id), (None, None))[0],
            "is_former_member": roles.get(str(user.id), (None, None))[1]
            in (None, "removed", "left"),
        }
        for user in User.objects.filter(pk__in=user_ids).order_by("full_name", "email")
    ]


# ---------------------------------------------------------------------------
# QA D5 — the export's words. The screen translates codes through the locale
# files (`audit.action.*`, `audit.entity.*`, `audit.field.*`); the CSV is
# written here, so it carries the same English labels, copied from
# `frontend/locales/en.json`. A code with no label still reads as words
# (`humanise`), never as `audit.exported` or `platform_audit_log`.
# ---------------------------------------------------------------------------

ACTION_LABELS: dict[str, str] = {
    "admin.access_requested": "Support asked for access",
    "admin.impersonation_ended": "Support left the business",
    "admin.impersonation_started": "Support opened the business",
    "admin.partner_created": "Support added a partner",
    "admin.partner_updated": "Support changed a partner",
    "admin.tenant_overrides_changed": "Support changed a limit",
    "admin.tenant_plan_changed": "Support changed the plan",
    "admin.tenant_reactivated": "Support reactivated the business",
    "admin.tenant_suspended": "Support suspended the business",
    "audit.exported": "Exported the activity log",
    "auth.email_verified": "Verified email",
    "auth.email_verify_requested": "Asked to verify email",
    "auth.logged_out": "Logged out",
    "auth.login_failed": "Login failed",
    "auth.login_succeeded": "Logged in",
    "auth.password_changed": "Changed password",
    "auth.password_reset": "Reset password",
    "auth.password_reset_requested": "Asked to reset password",
    "auth.password_set": "Set a password",
    "auth.refresh_reuse_detected": "Blocked a reused sign-in",
    "auth.session_renamed": "Renamed a device",
    "auth.session_revoked": "Logged out a device",
    "auth.sessions_revoked_all": "Logged out all devices",
    "auth.tenant_switched": "Switched business",
    "auth.user_created": "Created an account",
    "branding.signature_updated": "Changed signature",
    "branding.updated": "Changed branding",
    "credit.limit.set": "Changed credit limit",
    "expense.recorded": "Added expense",
    "expense.voided": "Cancelled expense",
    "export.requested": "Started an export",
    "import.cancelled": "Cancelled an import",
    "import.committed": "Imported from a spreadsheet",
    "import.failed": "Import failed",
    "import.requested": "Started an import",
    "import.validated": "Checked an import file",
    "invoice.draft_created": "Started a draft bill",
    "invoice.draft_deleted": "Deleted a draft bill",
    "invoice.draft_updated": "Changed a draft bill",
    "invoice.issued": "Issued bill",
    "invoice.share_link_created": "Shared a bill link",
    "invoice.share_link_regenerated": "Made a new bill link",
    "invoice.voided": "Cancelled bill",
    "item.archived": "Archived item",
    "item.created": "Added item",
    "item.restored": "Restored item",
    "item.updated": "Changed item",
    "ledger.aging.exported": "Exported the aging report",
    "ledger.credit_limit.overridden": "Went past a credit limit",
    "ledger.entry.corrected": "Corrected entry",
    "ledger.entry.created": "Added entry",
    "ledger.entry.reversed": "Reversed entry",
    "ledger.statement.exported": "Exported a statement",
    "member.accepted": "Joined the team",
    "member.created": "Added team member",
    "member.credentials_issued": "Issued a temporary password",
    "member.credentials_regenerated": "Issued a new temporary password",
    "member.default_changed": "Changed default business",
    "member.invite_revoked": "Cancelled an invitation",
    "member.invited": "Invited team member",
    "member.left": "Left the team",
    "member.removed": "Removed team member",
    "member.role_changed": "Changed role",
    "numbering.updated": "Changed bill numbering",
    "party.archived": "Archived party",
    "party.collection_date_cleared": "Cleared a promise date",
    "party.created": "Added party",
    "party.restored": "Restored party",
    "party.tag.created": "Added tag",
    "party.tag.deleted": "Deleted tag",
    "party.tag.merged": "Merged tags",
    "party.tag.updated": "Changed tag",
    "party.updated": "Changed party",
    "plan.limit_hit": "Reached a plan limit",
    "plan.modules_trimmed": "Turned off features outside the plan",
    "reminder.dismissed": "Dismissed a reminder",
    "reminder.done": "Marked a reminder done",
    "reminder.failed": "Reminder not sent",
    "reminder.sent": "Sent a reminder",
    "settings.updated": "Changed settings",
    "stock.adjustment_posted": "Adjusted stock",
    "stock.opening_posted": "Set opening stock",
    "tenant.created": "Created the business",
    "tenant.deleted": "Deleted the business",
    "tenant.deletion_cancelled": "Cancelled the deletion",
    "tenant.deletion_requested": "Asked to delete the business",
    "tenant.export_completed": "Full data download ready",
    "tenant.export_requested": "Started a full data download",
    "tenant.gst_type_changed": "Changed GST type",
    "tenant.modules_changed": "Turned features on or off",
    "tenant.preset_applied": "Applied starting defaults",
    "tenant.support_access_denied": "Denied support access",
    "tenant.support_access_granted": "Allowed support access",
    "tenant.support_access_revoked": "Ended support access",
    "tenant.updated": "Changed business profile",
}

ENTITY_TYPE_LABELS: dict[str, str] = {
    "expenses_category": "Expense category",
    "expenses_expense": "Expense",
    "imports_job": "Import",
    "inventory_category": "Item category",
    "inventory_item": "Item",
    "inventory_stock_adjustment": "Stock adjustment",
    "inventory_stock_movement": "Stock movement",
    "inventory_unit": "Unit",
    "invitation": "Invitation",
    "ledger_aging": "Aging report",
    "ledger_entry": "Udhaar entry",
    "ledger_reminder": "Reminder",
    "parties_party": "Party",
    "parties_tag": "Tag",
    "platform_audit_log": "Activity log",
    "platform_impersonation_session": "Support visit",
    "platform_job": "Background task",
    "platform_membership": "Team member",
    "platform_partner": "Partner",
    "platform_session": "Device",
    "platform_support_access": "Support access",
    "platform_tenant": "Business",
    "platform_tenant_setting": "Settings",
    "platform_user": "Person",
    "reports_export": "Export",
    "sales_document": "Bill",
}

FIELD_LABELS: dict[str, str] = {
    "account_name": "Account holder",
    "account_number": "Account number",
    "address": "Address",
    "amount": "Amount",
    "bank_details": "Bank details",
    "bank_name": "Bank",
    "branch": "Branch",
    "business_type": "Business type",
    "city": "City",
    "created_user": "New person",
    "credit_limit": "Credit limit",
    "email": "Email",
    "gst_type": "GST type",
    "gstin": "GSTIN",
    "ifsc": "IFSC",
    "legal_name": "Legal name",
    "line1": "Address line 1",
    "line2": "Address line 2",
    "mobile": "Mobile",
    "modules": "Features",
    "name": "Name",
    "note": "Note",
    "opening_balance": "Opening balance",
    "pan": "PAN",
    "phone": "Phone",
    "pincode": "PIN code",
    "reason": "Reason",
    "role": "Role",
    "state_code": "State",
    "status": "Status",
    "upi_vpa": "UPI ID",
}

_ENTITY_PREFIX_RE = re.compile(r"^(platform|parties|ledger|sales|inventory|expenses|imports)_")


def humanise(code: str) -> str:
    """`login_succeeded` → `Login succeeded`: separators to spaces, first letter up."""
    words = re.sub(r"[._]+", " ", code or "").strip()
    words = re.sub(r"\s+", " ", words)
    return words[:1].upper() + words[1:]


def action_label(action: str) -> str:
    """The action in words; unlabelled codes lose their domain prefix."""
    if action in ACTION_LABELS:
        return ACTION_LABELS[action]
    _, _, tail = action.partition(".")
    return humanise(tail if ("_" in tail or "." in tail) else action)


def entity_type_label(entity_type: str) -> str:
    if entity_type in ENTITY_TYPE_LABELS:
        return ENTITY_TYPE_LABELS[entity_type]
    return humanise(_ENTITY_PREFIX_RE.sub("", entity_type or ""))


#: Between the parts of a nested field's name, as the screen draws it.
FIELD_SEPARATOR = " \u203a "


def field_label(key: str) -> str:
    """`bank_details.ifsc` → "Bank details", separator, "IFSC", segment by segment."""
    return FIELD_SEPARATOR.join(FIELD_LABELS.get(part) or humanise(part) for part in key.split("."))
