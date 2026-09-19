"""The email backend protocol (ADR-015 by analogy, Part 20 §20.10.1).

Deliberately the same shape as `integrations/sms/base.py`. A password-reset
link and an OTP are the same problem — a secret that has to reach one person
through a provider this product does not own — and giving them one interface is
what makes "swap in a real provider" a settings change rather than a refactor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class EmailResult:
    status: str  # "sent" | "skipped" | "failed" — Part 21 §21.3.2 message_log.status
    provider: str
    provider_message_id: str | None = None
    error: str | None = None


class EmailBackend(Protocol):
    """Every email provider adapter implements exactly this."""

    def send(
        self, *, to: str, subject: str, body: str, sender: str, template_id: str | None = None
    ) -> EmailResult: ...
