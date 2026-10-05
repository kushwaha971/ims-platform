"""Lending & collections' setup checklist (docs/platform/14 step 5).

A lender's first day: the routes the agents walk, the first loan, and the
agents themselves on the team. Facts read from the books, each a link.
"""

from __future__ import annotations

from typing import Any


def lending_setup(tenant: Any) -> list:
    from apps.lending.models import LendingLoan, LendingRoute
    from apps.platform_app.apps_registry import SetupStep
    from apps.platform_app.constants import MembershipStatus
    from apps.platform_app.models import Membership

    return [
        SetupStep(
            key="routes",
            label_id="lending.setup.routes",
            path="/lending/routes",
            done=LendingRoute.objects.filter(tenant=tenant).exists(),
            permission="lending.route.manage",
        ),
        SetupStep(
            key="loan",
            label_id="lending.setup.loan",
            path="/lending/loans/new",
            done=LendingLoan.objects.filter(tenant=tenant).exists(),
            permission="lending.loan.create",
        ),
        SetupStep(
            key="team",
            label_id="lending.setup.team",
            path="/settings/team",
            done=Membership.objects.filter(tenant=tenant, status=MembershipStatus.ACTIVE).count()
            > 1,
            permission="platform.members.manage",
        ),
    ]
