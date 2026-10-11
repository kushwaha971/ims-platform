"""MiniMoth WhatsApp-first OTP delivery and verification; YourKhata owns sessions.

Only the backend holds X-Api-Key. Provider session tokens are discarded.
The provider automatically falls back to SMS if WhatsApp delivery fails.
"""

from __future__ import annotations
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from django.conf import settings


class MiniMothError(Exception):
    def __init__(self, code: str = "PROVIDER_ERROR", status: int = 502):
        super().__init__("OTP delivery or verification could not be confirmed.")
        self.code = code
        self.status = status


@dataclass(frozen=True, slots=True)
class Validation:
    verified: bool
    reason: str = ""


def _call(path: str, payload: dict) -> dict:
    key = getattr(settings, "MINIMOTH_API_KEY", "")
    if not key:
        raise MiniMothError("NOT_CONFIGURED")
    request = urllib.request.Request(
        "https://api.minimoth.dev/v1/otp/" + path,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "X-Api-Key": key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "YourKhata/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:  # noqa: S310
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            error = json.loads(exc.read().decode())
            code = (
                str(error.get("code", "PROVIDER_ERROR"))
                if isinstance(error, dict)
                else "PROVIDER_ERROR"
            )
        except (ValueError, UnicodeDecodeError):
            code = "PROVIDER_ERROR"
        raise MiniMothError(code, exc.code) from exc
    except (urllib.error.URLError, OSError, TimeoutError, ValueError, UnicodeDecodeError) as exc:
        raise MiniMothError() from exc
    if not isinstance(body, dict):
        raise MiniMothError()
    return body


def send_otp(mobile: str) -> str:
    body = _call("send", {"phone": mobile})
    request_id = body.get("otp_id")
    if not isinstance(request_id, str) or not request_id or len(request_id) > 55:
        raise MiniMothError()
    return request_id


def validate_otp(mobile: str, code: str) -> Validation:
    try:
        body = _call("verify", {"phone": mobile, "code": code})
    except MiniMothError as exc:
        reasons = {
            "INVALID_OTP": "incorrect",
            "OTP_NOT_FOUND": "expired",
            "VERIFY_RATE_LIMITED": "burned",
        }
        if exc.code in reasons:
            return Validation(False, reasons[exc.code])
        raise
    if not isinstance(body.get("access_token"), str) or not body["access_token"]:
        raise MiniMothError()
    return Validation(True)
