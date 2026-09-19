"""The WhatsApp backend protocol (ADR-015, Part 20 §20.10.2)."""

from __future__ import annotations

from typing import Protocol


class WhatsAppBackend(Protocol):
    def build_share_url(self, *, to: str, body: str) -> str: ...
