"""Platform routes — tenants, memberships, invitations (canon §0.8).

`/roles`, `/permissions/me`, `/audit-logs`, `/memberships` (list) and
`/memberships/invite` land with `PLT-05`, `PLT-06` and `PLT-11`. What is here is
exactly what `PLT-03`, `PLT-04` and `PLT-15` need.

`POST /tenants` is a canon change request (PLT-03 §14 CCR-1): canon §0.8 lists
`GET`/`PATCH /tenants/current` and no creator. `CR-LOG` carries it.
"""

from __future__ import annotations

from django.urls import path

from apps.platform_app.views.tenant import (
    InvitationAcceptView,
    MembershipDetailView,
    TenantCreateView,
    TenantCurrentView,
)

urlpatterns = [
    path("tenants", TenantCreateView.as_view(), name="tenant-create"),
    path("tenants/current", TenantCurrentView.as_view(), name="tenant-current"),
    path(
        "memberships/<uuid:membership_id>",
        MembershipDetailView.as_view(),
        name="membership-detail",
    ),
    path(
        "invitations/<str:token>/accept",
        InvitationAcceptView.as_view(),
        name="invitation-accept",
    ),
]
