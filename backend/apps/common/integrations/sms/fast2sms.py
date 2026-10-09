"""Fast2SMS — the SMS provider the owner chose (9 Oct 2026), for the sign-in OTP.

`POST https://www.fast2sms.com/dev/bulkV2` with the account's key in the
`authorization` header. Standard library only (`urllib`): one POST does not
justify an HTTP client dependency (ADR-021).

**Only the OTP is sent.** Fast2SMS's `otp` route takes the digits alone and
sends its own fixed text ("Your OTP is 123456"), so this adapter reads the code
from the front of the body `render_otp_sms` builds (`"{code} is your …"`).
Every OTHER message — a payment reminder, a fee reminder — goes through the
`q` (quick) route, which is charged per message and needs DLT registration in
India; it is refused here as `skipped` unless `UB_FAST2SMS_ALLOW_QUICK=1`, so
setting the key for sign-in cannot quietly start billing for reminders.

Fast2SMS delivers to Indian numbers only; anything else is `failed` with a
reason rather than a provider error. A provider failure is never raised to the
caller: `messaging.send_sms` writes it as a `failed` row and the sign-in screen
answers exactly as it does for a success (no account enumeration).
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request

from django.conf import settings

from apps.common.integrations.sms.base import SmsResult

logger = logging.getLogger("ub.notifications")

ENDPOINT = "https://www.fast2sms.com/dev/bulkV2"
TIMEOUT_SECONDS = 10
OTP_TEMPLATE = "otp"
_LEADING_CODE = re.compile(r"^\s*(\d{4,8})\b")
_INDIAN = re.compile(r"^\+91([6-9]\d{9})$")


class Fast2SmsBackend:
    name = "fast2sms"

    def send(
        self, *, to: str, body: str, sender_id: str, template_id: str | None = None
    ) -> SmsResult:
        key = getattr(settings, "UB_FAST2SMS_API_KEY", "") or ""
        if not key:
            return SmsResult(status="skipped", provider=self.name, error="UB_FAST2SMS_API_KEY is not set.")
        indian = _INDIAN.match(to or "")
        if not indian:
            return SmsResult(
                status="failed", provider=self.name, error="Fast2SMS delivers to Indian mobiles only."
            )
        number = indian.group(1)

        if template_id == OTP_TEMPLATE:
            code = _LEADING_CODE.match(body or "")
            if not code:
                return SmsResult(status="failed", provider=self.name, error="No code found in the OTP body.")
            payload = {"route": "otp", "variables_values": code.group(1), "numbers": number}
        elif getattr(settings, "UB_FAST2SMS_ALLOW_QUICK", False):
            payload = {"route": "q", "message": body, "numbers": number, "flash": 0}
        else:
            return SmsResult(
                status="skipped",
                provider=self.name,
                error="Only the sign-in code is sent by Fast2SMS (UB_FAST2SMS_ALLOW_QUICK is off).",
            )
        return self._post(key, payload)

    def _post(self, key: str, payload: dict) -> SmsResult:
        request = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(payload).encode(),
            headers={
                "authorization": key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "cache-control": "no-cache",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 - fixed https URL
                answer = json.loads(response.read().decode() or "{}")
        except urllib.error.HTTPError as exc:
            answer = _json_or_empty(exc.read())
            return SmsResult(status="failed", provider=self.name, error=_reason(answer, f"HTTP {exc.code}"))
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            logger.error("sms.fast2sms_unreachable")
            return SmsResult(status="failed", provider=self.name, error=f"Fast2SMS unreachable: {exc}"[:500])

        if answer.get("return") is True:
            return SmsResult(
                status="sent", provider=self.name, provider_message_id=str(answer.get("request_id") or "") or None
            )
        return SmsResult(status="failed", provider=self.name, error=_reason(answer, "Fast2SMS refused the message"))


def _json_or_empty(raw: bytes) -> dict:
    try:
        value = json.loads(raw.decode() or "{}")
    except (ValueError, UnicodeDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _reason(answer: dict, fallback: str) -> str:
    """Fast2SMS answers `{"return": false, "status_code": 412, "message": "…"}`."""
    message = answer.get("message")
    if isinstance(message, list):
        message = "; ".join(str(m) for m in message)
    code = answer.get("status_code")
    text = f"{code}: {message}" if code and message else (message or fallback)
    return str(text)[:500]
