"""What a business owns in `platform` — read by PLT-10's export and deletion.

Most platform tables are not simply deleted, and the reasons are written beside
each one:

* **audit log** — anonymised, never deleted (BR-3, BR-7): the security trail
  outlives the business, with the actor and every personal value removed.
* **jobs** — the export and deletion jobs are kept: the final export is the
  merchant's retention copy for thirty days after deletion (BR-4), and the
  deletion job is the row that is doing the deleting.
* **sessions** — belong to a PERSON, not to the business. A session whose active
  business is this one is revoked and unpointed; the person keeps their account.
* **users** — never deleted here. `temp_password_tenant` is cleared, because it
  names this business as the one allowed to reissue a password.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.common.tenant_data import TenantTable, register

#: Job types the deletion job leaves in place (see the module docstring).
KEPT_JOB_TYPES = ("platform.tenant_export", "platform.delete_tenant")


def _members(tenant: Any) -> tuple[list[str], Iterable[Iterable[Any]]]:
    from apps.platform_app.models import Membership

    header = ["membership_id", "name", "email", "mobile", "role", "status", "joined_at"]
    rows = (
        Membership.objects.filter(tenant=tenant)
        .select_related("user", "role")
        .order_by("created_at")
    )
    return header, (
        [
            m.id,
            m.user.full_name,
            m.user.email,
            m.user.mobile or "",
            m.role.code,
            m.status,
            m.joined_at,
        ]
        for m in rows.iterator(chunk_size=500)
    )


def _anonymise_audit(tenant: Any, queryset: Any) -> int:
    # `QuerySet.update` because `AuditLog.save()` refuses every change: the one
    # permitted rewrite of this table is this one, and it removes rather than
    # alters evidence — the action, entity and time survive.
    return int(queryset.update(actor=None, before=None, after=None, metadata={"anonymised": True}))


def _purge_jobs(tenant: Any, queryset: Any) -> int:
    doomed = queryset.exclude(job_type__in=KEPT_JOB_TYPES).exclude(status="running")
    return int(doomed._raw_delete(doomed.db) or 0)


def _unpoint_sessions(tenant: Any, queryset: Any) -> int:
    now = timezone.now()
    return int(queryset.update(tenant=None, revoked_at=Coalesce("revoked_at", now)))


def _unpoint_users(tenant: Any, queryset: Any) -> int:
    return int(queryset.update(temp_password_tenant=None))


register(
    TenantTable("platform.Membership", export_name="members.csv", rows=_members),
    TenantTable(
        "platform.Invitation", export_name="invitations.csv", exclude_fields=("token_hash",)
    ),
    TenantTable("platform.Role", export_name="roles.csv"),
    TenantTable("platform.TenantSetting"),  # exported as settings.json by the export itself
    TenantTable("platform.DocumentSequence"),
    TenantTable("platform.IdempotencyKey"),
    TenantTable("platform.Session", purge=_unpoint_sessions),
    TenantTable("platform.User", tenant_path="temp_password_tenant", purge=_unpoint_users),
    TenantTable("platform.Job", purge=_purge_jobs),
    TenantTable("platform.AuditLog", export_name="audit_log.csv", purge=_anonymise_audit),
    TenantTable("platform.ImpersonationSession"),
    TenantTable("platform.SupportAccess"),
)
