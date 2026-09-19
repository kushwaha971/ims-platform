"""The MVP email backend: print the message (ADR-015 by analogy).

There is no mail provider in this deployment and none is being added: the
product runs locally for its owner first, with as few third-party dependencies
as the feature set allows. So the password-reset link goes where the OTP used
to go — into one terminal, in full — and the whole flow is exercisable with no
infrastructure at all.

The **body is logged in full**, including the reset link and therefore the
reset token. That is the same trade `ConsoleSmsBackend` makes with the OTP code
and it is made for the same reason: a developer (here, the owner) must be able
to complete the flow, and the acceptance criterion for the feature is that the
link appears in the backend log. The recipient stays masked (Part 26 §26.9
R9.3) — the pairing of a full address with a live token is what a log must
never hold, and either half alone is useless.

Swapping in a real provider is `UB_EMAIL_ADAPTER=…` and nothing else.
"""

from __future__ import annotations

import logging

from apps.common.integrations.email.base import EmailResult

logger = logging.getLogger("ub.notifications")


class ConsoleEmailBackend:
    """Logs the message instead of sending it."""

    name = "console"

    def send(
        self, *, to: str, subject: str, body: str, sender: str, template_id: str | None = None
    ) -> EmailResult:
        logger.info(
            "email.console",
            extra={
                "to_masked": _mask(to),
                "sender": sender,
                "template_id": template_id or "",
                "subject": subject,
                "body": body,
            },
        )
        return EmailResult(status="sent", provider=self.name, provider_message_id=None)


def _mask(address: str) -> str:
    """Never log a full email address (Part 26 §26.9 R9.3).

    Spelled out here rather than imported from `apps.platform_app.email`
    because rule D1 says `common` depends on nothing — including through a
    deferred import the dependency walker would not see.
    """
    local, _, domain = (address or "").partition("@")
    if not domain:
        return "…"
    if len(local) <= 2:
        return f"{local[:1]}…@{domain}"
    return f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}@{domain}"
