"""Authentication OTP only, using Fast2SMS's numeric OTP Message route.

https://www.fast2sms.com/otp-sms/ — POST /dev/bulkV2, route=otp.
Never used as UB_SMS_BACKEND: reminders and bulk messaging cannot call this adapter.
Codes are generated and verified locally, with the existing expiry/attempt budgets.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings


class Fast2SmsError(Exception):
    """Delivery could not be confirmed. Never expose provider bodies or credentials."""


def send_otp(mobile: str, code: str) -> str:
    """Send one numeric OTP to one Indian mobile; never send arbitrary text."""
    key = getattr(settings, "FAST2SMS_API_KEY", "")
    if not key:
        raise Fast2SmsError("Fast2SMS credentials are missing.")
    if not re.fullmatch(r"\+91[6-9][0-9]{9}", mobile):
        raise Fast2SmsError("An Indian mobile number is required.")
    if not re.fullmatch(r"[0-9]{4,6}", code):
        raise Fast2SmsError("A numeric OTP is required.")
    payload = urllib.parse.urlencode(
        {
            "route": "otp",
            "variables_values": code,
            "numbers": mobile[3:],
            "flash": "0",
        }
    ).encode()
    request = urllib.request.Request(
        "https://www.fast2sms.com/dev/bulkV2",
        data=payload,
        method="POST",
        headers={
            "authorization": key,
            "content-type": "application/x-www-form-urlencoded",
            "accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310
            status = response.status
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, UnicodeDecodeError) as exc:
        raise Fast2SmsError("Fast2SMS delivery could not be confirmed.") from exc
    if status != 200 or not isinstance(body, dict) or body.get("return") is not True:
        raise Fast2SmsError("Fast2SMS refused delivery.")
    return str(body.get("request_id") or "")
