"""Platform routes — tenants, memberships, invitations (canon §0.8).

`/roles`, `/permissions/me`, `/audit-logs` and `/memberships` (list) land with
`PLT-05`, `PLT-06` and `PLT-11`. What is here is what `PLT-03`, `PLT-04` and
`PLT-15` need, plus `PLT-05`'s invitation endpoints.

The collection is `/invitations`, not `/memberships/invite` as PLT-05 FR-2
spells it: an invitation is its own resource with its own lifecycle, it is
already addressed as `/invitations/{token}/accept` by the endpoint Sprint 1
shipped, and FR-2's spelling belongs to the mobile-identity design DEC-010
retired. `CR-LOG` carries it.

`POST /tenants` is a canon change request (PLT-03 §14 CCR-1): canon §0.8 lists
`GET`/`PATCH /tenants/current` and no creator. `CR-LOG` carries it.
"""

from __future__ import annotations

from django.urls import path

from apps.platform_app.views.admin import (
    AdminAccessRequestView,
    AdminHealthView,
    AdminImpersonateView,
    AdminImpersonationEndView,
    AdminOverviewView,
    AdminPartnerListView,
    AdminPlanListView,
    AdminTenantDetailView,
    AdminTenantListView,
)
from apps.platform_app.views.data import (
    DeleteCancelView,
    DeleteRequestView,
    DeletionView,
    SupportAccessDecisionView,
    SupportAccessListView,
    TenantExportDetailView,
    TenantExportDownloadView,
    TenantExportListView,
    TenantExportView,
)
from apps.platform_app.views.settings import (
    AuditActorsView,
    AuditLogListView,
    MemberRevokeSessionsView,
    TenantBrandingView,
    TenantSettingsDefaultsView,
    TenantSettingsView,
)
from apps.platform_app.views.tenant import (
    InvitationAcceptView,
    InvitationDetailView,
    InvitationListCreateView,
    MemberCredentialsView,
    MemberListCreateView,
    MembershipDetailView,
    TenantCreateView,
    TenantCurrentView,
    TenantResumableView,
)

urlpatterns = [
    path("tenants", TenantCreateView.as_view(), name="tenant-create"),
    path("tenants/current", TenantCurrentView.as_view(), name="tenant-current"),
    path("tenants/resumable", TenantResumableView.as_view(), name="tenant-resumable"),
    # PLT-06, WLB-01, PLT-08, PLT-09 (Track T1).
    path("tenants/current/settings", TenantSettingsView.as_view(), name="tenant-settings"),
    path(
        "tenants/current/settings/defaults",
        TenantSettingsDefaultsView.as_view(),
        name="tenant-settings-defaults",
    ),
    path("tenants/current/branding", TenantBrandingView.as_view(), name="tenant-branding"),
    # PLT-10 (Track W2-C) — owner only.
    path("tenants/current/export", TenantExportView.as_view(), name="tenant-export"),
    path("tenants/current/exports", TenantExportListView.as_view(), name="tenant-export-list"),
    path(
        "tenants/current/exports/<uuid:export_id>",
        TenantExportDetailView.as_view(),
        name="tenant-export-detail",
    ),
    path(
        "tenants/current/exports/<uuid:export_id>/download",
        TenantExportDownloadView.as_view(),
        name="tenant-export-download",
    ),
    path("tenants/current/deletion", DeletionView.as_view(), name="tenant-deletion"),
    path(
        "tenants/current/delete-request", DeleteRequestView.as_view(), name="tenant-delete-request"
    ),
    path("tenants/current/delete-cancel", DeleteCancelView.as_view(), name="tenant-delete-cancel"),
    # PLT-14 FR-6 (CCR-12) — the owner's side of support consent.
    path("support/access-requests", SupportAccessListView.as_view(), name="support-access-list"),
    path(
        "support/access-requests/<uuid:access_id>/allow",
        SupportAccessDecisionView.as_view(decision="allow"),
        name="support-access-allow",
    ),
    path(
        "support/access-requests/<uuid:access_id>/deny",
        SupportAccessDecisionView.as_view(decision="deny"),
        name="support-access-deny",
    ),
    path(
        "support/access-requests/<uuid:access_id>/revoke",
        SupportAccessDecisionView.as_view(decision="revoke"),
        name="support-access-revoke",
    ),
    # PLT-14 — the super-admin console (IsSuperAdmin on every view).
    path("admin/overview", AdminOverviewView.as_view(), name="admin-overview"),
    path("admin/tenants", AdminTenantListView.as_view(), name="admin-tenant-list"),
    path("admin/tenants/<uuid:tenant_id>", AdminTenantDetailView.as_view(), name="admin-tenant"),
    path(
        "admin/tenants/<uuid:tenant_id>/access-requests",
        AdminAccessRequestView.as_view(),
        name="admin-tenant-access-request",
    ),
    path(
        "admin/tenants/<uuid:tenant_id>/impersonate",
        AdminImpersonateView.as_view(),
        name="admin-tenant-impersonate",
    ),
    path("admin/impersonation/end", AdminImpersonationEndView.as_view(), name="admin-imp-end"),
    path("admin/partners", AdminPartnerListView.as_view(), name="admin-partner-list"),
    path("admin/plans", AdminPlanListView.as_view(), name="admin-plan-list"),
    path("admin/health", AdminHealthView.as_view(), name="admin-health"),
    path("audit-logs", AuditLogListView.as_view(), name="audit-log-list"),
    path("audit-logs/actors", AuditActorsView.as_view(), name="audit-log-actors"),
    path(
        "memberships/<uuid:membership_id>/revoke-sessions",
        MemberRevokeSessionsView.as_view(),
        name="membership-revoke-sessions",
    ),
    path(
        "memberships/<uuid:membership_id>",
        MembershipDetailView.as_view(),
        name="membership-detail",
    ),
    path("members", MemberListCreateView.as_view(), name="member-list"),
    path(
        "members/<uuid:membership_id>/credentials",
        MemberCredentialsView.as_view(),
        name="member-credentials",
    ),
    path("invitations", InvitationListCreateView.as_view(), name="invitation-list"),
    # Ordered before the token route for the reader only — Django matches whole
    # patterns, and `<uuid:…>` refuses anything that is not one, so a raw token
    # can never be read as an id nor an id as a token.
    path(
        "invitations/<uuid:invitation_id>",
        InvitationDetailView.as_view(),
        name="invitation-detail",
    ),
    path(
        "invitations/<str:token>/accept",
        InvitationAcceptView.as_view(),
        name="invitation-accept",
    ),
]
