"""Meta sends only six-digit auth codes; signatures protect delivery receipts."""
import hashlib
import hmac
import json
from unittest.mock import MagicMock
import pytest
from django.urls import reverse
from apps.platform_app.services import meta_whatsapp, otp

def test_template_payload_and_secret_header(settings, monkeypatch):
    settings.META_WHATSAPP_ACCESS_TOKEN = "test-key"
    settings.META_WHATSAPP_PHONE_NUMBER_ID = "12345"
    settings.META_WHATSAPP_TEMPLATE = "yourkhata_login_otp"
    calls = []
    def send(req, timeout):
        calls.append(req)
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"messages":[{"id":"wamid.test"}]}'
        return response
    monkeypatch.setattr(meta_whatsapp.urllib.request, "urlopen", send)
    assert meta_whatsapp.send_otp("+919794620535", "123456") == "wamid.test"
    body = json.loads(calls[0].data)
    assert calls[0].get_header("Authorization") == "Bearer test-key"
    assert body["template"]["components"][0]["parameters"][0]["text"] == "123456"
    assert "test-key" not in calls[0].full_url
    for mobile, code in [("+14155552671", "123456"), ("+919794620535", "1234"), ("+919794620535,+919794620536", "123456")]:
        with pytest.raises(meta_whatsapp.MetaWhatsAppError):
            meta_whatsapp.send_otp(mobile, code)
    assert len(calls) == 1

@pytest.mark.django_db
def test_meta_code_is_local_hashed_and_single_use(auth_client, settings, monkeypatch):
    settings.UB_OTP_PROVIDER = "meta_whatsapp"
    calls = []
    monkeypatch.setattr(meta_whatsapp, "send_otp", lambda mobile, code: calls.append((mobile, code)))
    result = auth_client.post(reverse("v1:auth-otp-request"), {"mobile":"9794620535"}, format="json")
    assert result.status_code == 200
    from apps.platform_app.models import OtpChallenge
    row = OtpChallenge.objects.get(pk=result.json()["data"]["challenge_id"])
    code = calls[0][1]
    assert len(code) == 6 and row.code_hash == otp.hash_code(code)
    assert not row.provider_verification_id
    with pytest.raises(otp.OtpInvalid):
        otp.consume_challenge(challenge_id=row.pk, code="000000")
    otp.consume_challenge(challenge_id=row.pk, code=code)
    with pytest.raises(otp.OtpInvalid):
        otp.consume_challenge(challenge_id=row.pk, code=code)

def test_missing_configuration_fails_closed(settings):
    settings.UB_OTP_PROVIDER = "meta_whatsapp"
    settings.META_WHATSAPP_ACCESS_TOKEN = ""
    assert otp._provider() == "meta_whatsapp"
    with pytest.raises(meta_whatsapp.MetaWhatsAppError):
        meta_whatsapp.send_otp("+919794620535", "123456")

def test_signed_receipts_only_and_no_private_payload(client, settings, monkeypatch):
    settings.META_WHATSAPP_APP_SECRET = "test-secret"
    settings.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-test"
    settings.META_WHATSAPP_WABA_ID = "waba1"
    settings.META_WHATSAPP_PHONE_NUMBER_ID = "12345"
    url = reverse("v1:meta-whatsapp-webhook")
    assert client.get(url, {"hub.mode":"subscribe", "hub.verify_token":"wrong"}).status_code == 403
    assert client.get(url, {"hub.mode":"subscribe", "hub.verify_token":"verify-test", "hub.challenge":"hello"}).content == b"hello"
    body = json.dumps({"entry":[{"id":"waba1", "changes":[{"value":{"metadata":{"phone_number_id":"12345"},"statuses":[{"id":"wamid.test", "status":"failed", "recipient_id":"919794620535", "errors":[{"code":131026}]}]}}]}]})
    assert client.post(url, body, content_type="application/json").status_code == 403
    signature = "sha256=" + hmac.new(b"test-secret", body.encode(), hashlib.sha256).hexdigest()
    from apps.platform_app.views import meta_webhook
    records = []
    monkeypatch.setattr(meta_webhook.logger, "info", lambda message, **kw: records.append(kw["extra"]))
    assert client.post(url, body, content_type="application/json", HTTP_X_HUB_SIGNATURE_256=signature).status_code == 200
    assert records[0]["error_codes"] == [131026]
    assert records[0]["delivery_state"] == "failed"
    assert "9794620535" not in json.dumps(records)
