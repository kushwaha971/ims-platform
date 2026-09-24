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


def changed_keys(before: Any, after: Any) -> list[str]:
    """Dotted paths whose value differs, in a stable order (T-PLT-08-5)."""
    flat_before = flatten(before or {})
    flat_after = flatten(after or {})
    keys = set(flat_before) | set(flat_after)
    return sorted(k for k in keys if flat_before.get(k) != flat_after.get(k))


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
