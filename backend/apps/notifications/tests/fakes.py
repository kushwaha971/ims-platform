"""NTF-02 §5 — `FakeSmsBackend`: a provider that records calls and never opens a socket.

Point `UB_SMS_BACKEND` at `apps.notifications.tests.fakes.FakeSmsBackend` and
every send lands in `FakeSmsBackend.sent`. `FakeSmsBackend.fail_with` makes the
next sends raise, which is how a retryable provider failure is simulated.
"""

from __future__ import annotations

from typing import Any, ClassVar

from apps.common.integrations.sms.base import SmsResult

FAKE_PATH = "apps.notifications.tests.fakes.FakeSmsBackend"


class FakeSmsBackend:
    name = "fake"
    sent: ClassVar[list[dict[str, Any]]] = []
    fail_with: ClassVar[Exception | None] = None

    def send(
        self, *, to: str, body: str, sender_id: str, template_id: str | None = None
    ) -> SmsResult:
        if FakeSmsBackend.fail_with is not None:
            raise FakeSmsBackend.fail_with
        FakeSmsBackend.sent.append({"to": to, "body": body, "template_id": template_id})
        return SmsResult(
            status="sent", provider=self.name, provider_message_id=f"fake-{len(self.sent)}"
        )

    @classmethod
    def reset(cls) -> None:
        cls.sent = []
        cls.fail_with = None
