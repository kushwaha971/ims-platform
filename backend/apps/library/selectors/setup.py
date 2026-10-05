"""The Library's setup checklist (docs/platform/14 step 5).

Three facts a reading room needs before its first day at the desk: what it
charges (a fee plan), where people sit (seats), and someone enrolled. Each is
read from the books, never ticked, and each links to the page that does it.
"""

from __future__ import annotations

from typing import Any


def library_setup(tenant: Any) -> list:
    from apps.library.models import LibraryMembership, LibraryMembershipType, LibrarySeat
    from apps.platform_app.apps_registry import SetupStep

    return [
        SetupStep(
            key="plans",
            label_id="library.setup.plans",
            path="/library/fees",
            done=LibraryMembershipType.objects.filter(tenant=tenant, is_active=True).exists(),
            permission="library.settings.manage",
        ),
        SetupStep(
            key="seats",
            label_id="library.setup.seats",
            path="/library/seats",
            done=LibrarySeat.objects.filter(tenant=tenant, is_active=True).exists(),
            permission="library.settings.manage",
        ),
        SetupStep(
            key="student",
            label_id="library.setup.student",
            path="/library/members",
            done=LibraryMembership.objects.filter(tenant=tenant).exists(),
            permission="library.member.write",
        ),
    ]
