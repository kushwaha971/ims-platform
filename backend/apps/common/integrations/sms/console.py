"""The MVP SMS backend: print the message (ADR-015)."""

from __future__ import annotations

import logging

from apps.common.integrations.sms.base import SmsResult

logger = logging.getLogger("ub.notifications")


class ConsoleSmsBackend:
    """Logs the message instead of sending it.

    The whole asynchronous surface is then visible in one terminal with no extra
    infrastructure, which is the point of ADR-012 and ADR-015.
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
            },
        )
        return SmsResult(status="sent", provider=self.name, provider_message_id=None)


def _mask(mobile: str) -> str:
    """Never log a full mobile number (Part 26 §26.9 R9.3)."""
    return f"{mobile[:3]}…{mobile[-3:]}" if len(mobile) > 6 else "…"
