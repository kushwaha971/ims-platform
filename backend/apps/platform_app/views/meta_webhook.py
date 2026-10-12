"""Signed Meta delivery receipts; never persist message bodies, codes or phone numbers."""
import hashlib
import hmac
import json
import logging
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

logger = logging.getLogger("ub.platform")

@csrf_exempt
@require_http_methods(["GET", "POST"])
def meta_webhook(request):
    if request.method == "GET":
        expected = getattr(settings, "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN", "")
        if expected and request.GET.get("hub.mode") == "subscribe" and hmac.compare_digest(request.GET.get("hub.verify_token", ""), expected):
            return HttpResponse(request.GET.get("hub.challenge", ""), content_type="text/plain")
        return HttpResponse(status=403)
    secret = getattr(settings, "META_WHATSAPP_APP_SECRET", "")
    if not secret or len(request.body) > 262144:
        return HttpResponse(status=403)
    signature = "sha256=" + hmac.new(secret.encode(), request.body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(request.headers.get("X-Hub-Signature-256", ""), signature):
        return HttpResponse(status=403)
    try:
        body = json.loads(request.body)
        for entry in body.get("entry", []):
            if str(entry.get("id")) != settings.META_WHATSAPP_WABA_ID:
                continue
            for change in entry.get("changes", []):
                value = change.get("value", {})
                if str(value.get("metadata", {}).get("phone_number_id")) != settings.META_WHATSAPP_PHONE_NUMBER_ID:
                    continue
                for status in value.get("statuses", []):
                    state = status.get("status")
                    if state not in ("sent", "delivered", "read", "failed"):
                        continue
                    errors = [e.get("code") for e in status.get("errors", []) if isinstance(e.get("code"), int)]
                    logger.info("meta.delivery", extra={"delivery_state": state, "delivery_ref": hashlib.sha256(str(status.get("id", "")).encode()).hexdigest()[:20], "error_codes": errors})
    except (ValueError, TypeError, AttributeError):
        return HttpResponse(status=400)
    return JsonResponse({"received": True})
