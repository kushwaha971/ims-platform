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

from apps.platform_app.views.tenant import (
    InvitationAcceptView,
    InvitationDetailView,
    InvitationListCreateView,
    MemberCredentialsView,
    MemberListCreateView,
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
