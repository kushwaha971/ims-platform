"""`/public/in/{token}` — a student checks themself in from the door's QR (Library P0).

No session: the poster is the credential's half, the student's number and the last
four of their mobile the other. The public-link budgets apply (per IP and per token),
which is what limits guessing; every response carries the public-link headers.
"""

from __future__ import annotations

from typing import Any

from apps.common.public_views import PublicLinkView
from apps.common.responses import StandardResponse
from apps.library.services import self_checkin


class SelfCheckInView(PublicLinkView):
    scope_exempt = "A public poster's page: it reads one student by number and mobile, no list."

    def get(self, request: Any, token: str) -> Any:
        return StandardResponse.ok(self_checkin.page(token))

    def post(self, request: Any, token: str) -> Any:
        data = request.data if isinstance(request.data, dict) else {}
        return StandardResponse.ok(
            self_checkin.check_in(
                token=token,
                member_number=data.get("member_number"),
                mobile_last4=data.get("mobile_last4"),
            )
        )
