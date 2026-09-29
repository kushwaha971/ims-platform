"""NTF-01 — raising, reading and pruning in-app notifications.

── One writer, one registry ──────────────────────────────────────────────────
`notify()` is the only function that writes `notifications_notification`
(FR-3), and it refuses any type not in `REGISTRY` (FR-2). That is what keeps
§19's guarantee enforceable: every type declares the permission a member must
hold to see it, so a broadcast can never show someone what they could not open.

── Broadcasts, and why read state is a list ──────────────────────────────────
A row with `user=NULL` is one row for the whole shop (FR-5). Per-member read
state is `read_by`, a JSON list of user-id strings, and the unread predicate is
`NOT read_by @> [me]`. Forty members accumulate forty ids in one row rather
than forty rows.

── Coalescing ────────────────────────────────────────────────────────────────
FR-6 / BR-3: a type with a `group_window` merges into an UNREAD row of the same
`(tenant, type, group_key)` inside the window — the count grows, `data.ids`
merges (capped), `created_at` moves to now so the row rises to the top. Once
anyone has read a broadcast it stops absorbing: a merchant who acknowledged
today's list still learns about tomorrow's.

── Localisation ─────────────────────────────────────────────────────────────
BR-10: the client renders the title from `type` and `data.params` through its
own catalogue, so a Hindi member reads Hindi. `title` is still written, in
English, for psql and for a client that has not shipped the key yet.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Mapping

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.notifications.constants import (
    COALESCE_MAX_COUNT,
    COALESCE_MAX_IDS,
    NOTIFICATION_RETENTION_DAYS,
    NotificationCategory,
    NotificationSeverity,
)
from apps.notifications.models import Notification

logger = logging.getLogger("ub.notifications")


class UnknownNotificationType(LookupError):
    """FR-2 / EC-12 — a programming error: raised under test, logged in production."""


@dataclass(frozen=True, slots=True)
class NotificationType:
    code: str
    category: str
    severity: str
    #: BR-1 — who may see a broadcast of this type, evaluated at read time.
    required_permission: str
    #: English title with `{placeholders}` from params (the client localises).
    title_en: str
    body_en: str = ""
    #: FR-6 — minutes during which an unread row of the same key absorbs a new one.
    group_window: int | None = None
    #: FR-7 — the in-app path the row opens. Must start with `/` (§19 allowlist).
    route: Callable[[Mapping[str, Any]], str] = lambda _params: "/notifications"


REGISTRY: dict[str, NotificationType] = {
    t.code: t
    for t in (
        # LED-05 §17 — raised by the 09:00 job; one coalesced row per day.
        NotificationType(
            code="reminder_due",
            category=NotificationCategory.REMINDERS,
            severity=NotificationSeverity.WARNING,
            required_permission="ledger.entry.read",
            title_en="{count} parties have a payment due today",
            body_en="Tap to see who to remind",
            group_window=24 * 60,
            route=lambda _p: "/ledger/reminders?bucket=today",
        ),
        # LED-07 FR-4 / BR-6 — an automated SMS that did not reach the customer.
        NotificationType(
            code="reminder_failed",
            category=NotificationCategory.REMINDERS,
            severity=NotificationSeverity.DANGER,
            required_permission="notifications.settings.manage",
            title_en="{count} automated SMS reminders could not be sent",
            body_en="Remind them yourself on WhatsApp",
            group_window=24 * 60,
            route=lambda _p: "/ledger/reminders?bucket=sent&status=failed",
        ),
        # INV-07 — registered so the inventory track can raise it through here.
        NotificationType(
            code="low_stock",
            category=NotificationCategory.STOCK,
            severity=NotificationSeverity.WARNING,
            required_permission="inventory.stock.read",
            title_en="{count} items are low on stock",
            body_en="Tap to see what to reorder",
            group_window=24 * 60,
            route=lambda _p: "/items?stock=low",
        ),
        # IMP-01 §17 — to the member who uploaded, never broadcast. The route
        # is the job page the wizard deep-links to.
        NotificationType(
            code="import_done",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.SUCCESS,
            required_permission="parties.party.read",
            title_en="Import finished — {count} records created",
            body_en="Tap to see what was imported",
            route=lambda p: f"/imports/{p.get('job_id', '')}",
        ),
        NotificationType(
            code="import_failed",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.DANGER,
            required_permission="parties.party.read",
            title_en="Import failed — nothing was saved",
            body_en="Tap to see why and try again",
            route=lambda p: f"/imports/{p.get('job_id', '')}",
        ),
        # IMP-02 FR-7 / FR-14 — the big export the request could not stream.
        NotificationType(
            code="export_ready",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.SUCCESS,
            required_permission="reports.export",
            title_en="Your export is ready — {count} rows",
            body_en="The link works for 7 days",
            route=lambda p: f"/imports?export={p.get('export_id', '')}",
        ),
        NotificationType(
            code="export_failed",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.DANGER,
            required_permission="reports.export",
            title_en="Your export could not be prepared",
            body_en="Try a smaller set of filters",
            route=lambda _p: "/imports",
        ),
        # PLT-10 §17 / PLT-14 §17 — the owner-facing platform events. All gated
        # on `platform.tenant.manage`, which admins also hold; the page they
        # route to answers owner-only actions, so an admin reading "support
        # asked for access" is informed, not empowered.
        NotificationType(
            code="data_export_ready",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.SUCCESS,
            required_permission="platform.tenant.manage",
            title_en="Your data export is ready to download",
            route=lambda _p: "/settings/data",
        ),
        NotificationType(
            code="deletion_requested",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.DANGER,
            required_permission="platform.tenant.manage",
            title_en="{actor} asked to delete this business on {date}",
            body_en="Not you? Cancel it from Settings → Your data",
            route=lambda _p: "/settings/data",
        ),
        NotificationType(
            code="deletion_cancelled",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.INFO,
            required_permission="platform.tenant.manage",
            title_en="{actor} cancelled the deletion of this business",
            route=lambda _p: "/settings/data",
        ),
        NotificationType(
            code="support_access_request",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.WARNING,
            required_permission="platform.tenant.manage",
            title_en="Support ({admin}) asked to access your business",
            body_en="{reason}",
            route=lambda _p: "/settings/data",
        ),
        NotificationType(
            code="support_session_started",
            category=NotificationCategory.SYSTEM,
            severity=NotificationSeverity.WARNING,
            required_permission="platform.tenant.manage",
            title_en="Support ({admin}) entered your business",
            route=lambda _p: "/settings/data",
        ),
    )
}


# ── A10 ── `register_notification_type` (ADR-042, contracts §1.9, R16) ───────
#
# The literal dict above is core's own types, whose codes predate the module
# convention and keep their names. A module's types are registered from its
# `AppConfig.ready()` with a `<module>.<event>` code (PLT-X13 BR-3) — which is
# also what keeps a module from ever claiming a core code. Idempotent for the
# same (or an equal) spec; a different spec under a used code raises.

_MODULE_TYPE_CODE = re.compile(r"^[a-z][a-z0-9_]*\.[a-z0-9][a-z0-9_]*$")
_REGISTRY_BASELINE: dict[str, NotificationType] | None = None


def register_notification_type(code: str, spec: NotificationType) -> None:
    if spec.code != code:
        raise ImproperlyConfigured(f"notification type {code!r} carries the spec of {spec.code!r}")
    if not _MODULE_TYPE_CODE.match(code):
        raise ImproperlyConfigured(
            f"notification type {code!r} must be '<module>.<event>' (PLT-X13 BR-3)"
        )
    existing = REGISTRY.get(code)
    if existing is not None and existing != spec:
        raise ImproperlyConfigured(f"notification type {code!r} is registered twice")
    REGISTRY[code] = spec


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    """Back to the start-up types (core's literal plus every `ready()`)."""
    global _REGISTRY_BASELINE
    if _REGISTRY_BASELINE is None:
        _REGISTRY_BASELINE = dict(REGISTRY)
    REGISTRY.clear()
    REGISTRY.update(_REGISTRY_BASELINE)


def _strict() -> bool:
    return bool(settings.DEBUG) or str(getattr(settings, "SETTINGS_MODULE", "")).endswith(".test")


def _render(text: str, params: Mapping[str, Any]) -> str:
    try:
        return text.format(**params)
    except (KeyError, IndexError, ValueError):
        return text


def notify(
    tenant: Any,
    type_code: str,
    *,
    user: Any = None,
    params: Mapping[str, Any] | None = None,
    group_key: str | None = None,
    ids: Iterable[str] = (),
) -> Notification | None:
    """FR-3 — raise (or coalesce into) one notification, inside the caller's transaction."""
    spec = REGISTRY.get(type_code)
    if spec is None:
        if _strict():
            raise UnknownNotificationType(type_code)
        logger.error("notify.unknown_type", extra={"type_code": type_code})
        return None

    params = dict(params or {})
    new_ids = [str(i) for i in ids]
    now = timezone.now()

    if spec.group_window and group_key:
        window_start = now - dt.timedelta(minutes=spec.group_window)
        unread = Q(read_at__isnull=True) & (Q(user__isnull=False) | Q(read_by=[]))
        existing = (
            Notification.objects.filter(
                tenant=tenant,
                type=type_code,
                group_key=group_key,
                user=user,
                created_at__gte=window_start,
            )
            .filter(unread)
            .select_for_update()
            .order_by("-created_at")
            .first()
        )
        if existing is not None:
            merged = list(dict.fromkeys([*existing.data.get("ids", []), *new_ids]))
            count = min(
                max(existing.count, len(merged)) if new_ids else existing.count + 1,
                COALESCE_MAX_COUNT,
            )
            merged_params = {**existing.data.get("params", {}), **params, "count": count}
            existing.count = count
            existing.title = _render(spec.title_en, merged_params)[:200]
            existing.data = {
                **existing.data,
                "params": merged_params,
                "ids": merged[:COALESCE_MAX_IDS],
            }
            existing.save(update_fields=["count", "title", "data", "updated_at"])
            Notification.objects.filter(pk=existing.pk).update(created_at=now)
            return existing

    count = max(len(new_ids), int(params.get("count", 1) or 1))
    params.setdefault("count", count)
    return Notification.objects.create(
        tenant=tenant,
        user=user,
        type=type_code,
        category=spec.category,
        severity=spec.severity,
        title=_render(spec.title_en, params)[:200],
        body=_render(spec.body_en, params)[:300],
        data={"route": spec.route(params), "params": params, "ids": new_ids[:COALESCE_MAX_IDS]},
        group_key=group_key,
        count=min(count, COALESCE_MAX_COUNT),
    )


# ── Reading (NTF-01 FR-5, BR-5) ──────────────────────────────────────────────


def visible_types(permissions: Iterable[str]) -> list[str]:
    held = set(permissions)
    return [code for code, spec in REGISTRY.items() if spec.required_permission in held]


def inbox(*, tenant: Any, user: Any, permissions: Iterable[str]) -> QuerySet:
    """Every row this member may see: their personal rows and the broadcasts they are entitled to."""
    return Notification.objects.filter(tenant=tenant).filter(
        Q(user=user) | Q(user__isnull=True, type__in=visible_types(permissions))
    )


def unread_q(user: Any) -> Q:
    uid = str(user.pk)
    return Q(user=user, read_at__isnull=True) | (Q(user__isnull=True) & ~Q(read_by__contains=[uid]))


def is_unread_for(row: Notification, user: Any) -> bool:
    if row.user_id is not None:
        return row.read_at is None
    return str(user.pk) not in (row.read_by or [])


@transaction.atomic
def mark_read(*, row: Notification, user: Any) -> None:
    """FR-8 — idempotent; a broadcast records this member only."""
    if row.user_id is not None:
        if row.read_at is None:
            Notification.objects.filter(pk=row.pk, read_at__isnull=True).update(
                read_at=timezone.now()
            )
        return
    locked = Notification.objects.select_for_update().get(pk=row.pk)
    uid = str(user.pk)
    if uid not in (locked.read_by or []):
        locked.read_by = [*(locked.read_by or []), uid]
        locked.save(update_fields=["read_by", "updated_at"])


@transaction.atomic
def mark_all_read(
    *, tenant: Any, user: Any, permissions: Iterable[str], category: str | None = None
) -> int:
    """FR-8 — everything unread for this member, optionally within one category."""
    rows = inbox(tenant=tenant, user=user, permissions=permissions).filter(unread_q(user))
    if category:
        rows = rows.filter(category=category)
    marked = rows.filter(user=user).update(read_at=timezone.now())
    uid = str(user.pk)
    for row in rows.filter(user__isnull=True).select_for_update():
        row.read_by = [*(row.read_by or []), uid]
        row.save(update_fields=["read_by", "updated_at"])
        marked += 1
    return marked


def purge_old(*, now: dt.datetime | None = None, batch: int = 5000) -> int:
    """FR-10 / BR-11 — 180 days and gone; batched so one run never holds a long lock."""
    cutoff = (now or timezone.now()) - dt.timedelta(days=NOTIFICATION_RETENTION_DAYS)
    removed = 0
    while True:
        ids = list(
            Notification.objects.filter(created_at__lt=cutoff).values_list("pk", flat=True)[:batch]
        )
        if not ids:
            return removed
        removed += Notification.objects.filter(pk__in=ids).delete()[0]
