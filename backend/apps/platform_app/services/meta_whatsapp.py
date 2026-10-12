"""Direct Meta authentication templates. Codes are verified locally, never logged."""
from __future__ import annotations
import json
import re
import urllib.error
import urllib.request
from django.conf import settings

class MetaWhatsAppError(Exception):
    def __init__(self, code="provider_error"):
        super().__init__("WhatsApp delivery could not be confirmed.")
        self.code = code

def send_otp(mobile: str, code: str) -> str:
    key = getattr(settings, "META_WHATSAPP_ACCESS_TOKEN", "")
    phone = getattr(settings, "META_WHATSAPP_PHONE_NUMBER_ID", "")
    if not key or not re.fullmatch(r"[0-9]+", phone) or not re.fullmatch(r"\+91[6-9][0-9]{9}", mobile) or not re.fullmatch(r"[0-9]{6}", code):
        raise MetaWhatsAppError("invalid_configuration")
    payload = {"messaging_product": "whatsapp", "to": mobile[1:], "type": "template", "template": {
        "name": settings.META_WHATSAPP_TEMPLATE, "language": {"code": "en"}, "components": [
            {"type": "body", "parameters": [{"type": "text", "text": code}]},
            {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": code}]}]}}
    req = urllib.request.Request("https://graph.facebook.com/v23.0/" + phone + "/messages", data=json.dumps(payload).encode(), headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        try:
            error = json.loads(exc.read()).get("error", {}).get("code", "provider_error")
        except (ValueError, AttributeError):
            error = "provider_error"
        raise MetaWhatsAppError(str(error)) from exc
    except (urllib.error.URLError, OSError, ValueError, UnicodeDecodeError) as exc:
        raise MetaWhatsAppError() from exc
    try:
        message_id = body["messages"][0]["id"]
        if not isinstance(message_id, str) or not message_id.startswith("wamid."):
            raise ValueError()
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise MetaWhatsAppError() from exc
    return message_id
