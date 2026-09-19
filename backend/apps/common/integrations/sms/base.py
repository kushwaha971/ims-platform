"""The SMS backend protocol (ADR-015, Part 20 §20.10.1)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class SmsResult:
    status: str  # "sent" | "skipped" | "failed" — Part 21 §21.3.2 message_log.status
    provider: str
    provider_message_id: str | None = None
    error: str | None = None


class SmsBackend(Protocol):
    """Every SMS provider adapter implements exactly this."""

    def send(
        self, *, to: str, body: str, sender_id: str, template_id: str | None = None
    ) -> SmsResult: ...
