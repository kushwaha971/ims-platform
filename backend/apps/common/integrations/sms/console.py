"""The MVP SMS backend: print the message (ADR-015)."""

from __future__ import annotations

import logging

from apps.common.integrations.sms.base import SmsResult

logger = logging.getLogger("ub.notifications")


class ConsoleSmsBackend:
    """Logs the message instead of sending it.

    The whole asynchronous surface is then visible in one terminal with no extra
    infrastructure, which is the point of ADR-012 and ADR-015.

    The **body is logged in full**, including any OTP in it. `PLT-01` FR-5 and
    AC-5 make that the acceptance criterion ("the code appears in the backend
    log"), and Part 20 §20.5.4 names this as the documented developer path. The
    recipient stays masked (Part 26 §26.9 R9.3): the pairing of a full number
    with a code is what a log must never hold, and either half alone is useless.
    This backend is refused in production by `check --deploy` unless
    `UB_ALLOW_CONSOLE_SMS` is set (`PLT-01` EC-6).
    """

    name = "console"

    def send(
        self, *, to: str, body: str, sender_id: str, template_id: str | None = None
    ) -> SmsResult:
        logger.info(
            "sms.console",
            extra={
                "to_masked": _mask(to),
                "sender_id": sender_id,
                "template_id": template_id or "",
                "body": body,
            },
        )
        return SmsResult(status="sent", provider=self.name, provider_message_id=None)


def _mask(mobile: str) -> str:
    """Never log a full mobile number (Part 26 §26.9 R9.3)."""
    return f"{mobile[:3]}…{mobile[-3:]}" if len(mobile) > 6 else "…"
