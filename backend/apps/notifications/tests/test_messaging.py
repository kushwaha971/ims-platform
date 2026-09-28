"""NTF-02 / NTF-03 — the adapter layer, the template registry and the deep links.

What these protect, in one sentence each: a message never reaches a customer
without consent; a tenant with no provider never "sends"; the words resolve
tenant → partner → global → code; a crafted value cannot break out of the
`wa.me` query string; and the amount is always `Rs 1,24,300`, never `₹`.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from apps.notifications.models import MessageLog, MessageTemplate
from apps.notifications.services.dispatch import deliver_sms, sms_configured, whatsapp_digits
from apps.notifications.services.templates import (
    DEFAULT_TEMPLATES,
    TemplateRenderError,
    format_rs,
    render,
    resolve_template,
)
from apps.notifications.services.whatsapp_text import compose_reminder, wa_url
from apps.notifications.tests.fakes import FAKE_PATH, FakeSmsBackend
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _reset_fake() -> Any:
    FakeSmsBackend.reset()
    yield
    FakeSmsBackend.reset()


PARAMS = {
    "shop": "Sharma Store",
    "amount": "500",
    "date": "18/09",
    "balance": "2,800",
    "label": "you will give",
    "notice": "",
}


# ── money in a message ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2800.00", "2,800"),
        ("124300", "1,24,300"),
        ("12345678.50", "1,23,45,678.50"),
        ("-99.5", "99.50"),
    ],
)
def test_amounts_are_grouped_the_indian_way_and_drop_zero_paise(value: str, expected: str) -> None:
    """LED-06 BR-3 / T-LED-06-2 — `Rs 1,24,300`, not `124300.00` and never a minus."""
    assert format_rs(Decimal(value)) == expected


def test_no_default_template_carries_the_rupee_glyph() -> None:
    """NTF-02 FR-7 — one `₹` turns a 160-char GSM-7 SMS into a 70-char UCS-2 one."""
    assert all("₹" not in body for body in DEFAULT_TEMPLATES.values())


def test_every_template_exists_in_english_and_hindi() -> None:
    """Sprint 5 exit criterion: every template in `en` and `hi`."""
    keys = {(code, channel) for code, channel, _locale in DEFAULT_TEMPLATES}
    for code, channel in keys:
        assert (code, channel, "en") in DEFAULT_TEMPLATES
        assert (code, channel, "hi") in DEFAULT_TEMPLATES


# ── rendering ───────────────────────────────────────────────────────────────


def test_a_missing_placeholder_refuses_rather_than_half_rendering() -> None:
    """NTF-02 FR-7 — "Rs {{balance}}" must never reach a customer literally."""
    with pytest.raises(TemplateRenderError):
        render("{{shop}}: Rs {{balance}}", {"shop": "Sharma"})


def test_a_value_cannot_inject_a_placeholder() -> None:
    """§19 — single-pass substitution: a party named `{{balance}}` stays text."""
    assert render("Hi {{name}}", {"name": "{{balance}}"}) == "Hi {{balance}}"


# ── resolution ──────────────────────────────────────────────────────────────


def test_resolution_prefers_tenant_then_partner_then_global_then_code(tenant: Any) -> None:
    """NTF-02 BR-4 / T-NTF-02-2 — the most specific scope that has a body wins."""
    code, channel = "LEDGER_ENTRY_GAVE", "sms"
    assert (
        resolve_template(tenant=tenant, code=code, channel=channel, locale="en").origin == "default"
    )

    MessageTemplate.objects.create(
        code=code, channel=channel, locale="en", body="G {{shop}}", dlt_template_id="1107"
    )
    got = resolve_template(tenant=tenant, code=code, channel=channel, locale="en")
    assert (got.origin, got.dlt_template_id) == ("global", "1107")

    MessageTemplate.objects.create(
        partner=tenant.partner, code=code, channel=channel, locale="en", body="P"
    )
    assert (
        resolve_template(tenant=tenant, code=code, channel=channel, locale="en").origin == "partner"
    )

    MessageTemplate.objects.create(tenant=tenant, code=code, channel=channel, locale="en", body="T")
    assert resolve_template(tenant=tenant, code=code, channel=channel, locale="en").body == "T"


def test_an_unknown_locale_falls_back_to_english(tenant: Any) -> None:
    got = resolve_template(tenant=tenant, code="REMINDER_D0", channel="sms", locale="ta")
    assert got.locale == "en"


# ── deliver_sms: the consent gate and the console ───────────────────────────


def test_console_backend_writes_skipped_and_logs_no_party_data(
    tenant: Any, settings: Any, caplog: Any
) -> None:
    """NTF-02 AC-2 / LED-07 BR-6 — no provider means `skipped`, and the party's
    name and balance never enter the application log (the console backend
    prints bodies in full, so it is not called for party messages at all)."""
    settings.UB_SMS_BACKEND = "apps.common.integrations.sms.console.ConsoleSmsBackend"
    party = PartyFactory(tenant=tenant, name="Ramesh Traders")
    assert sms_configured() is False
    with caplog.at_level(logging.DEBUG):
        outcome = deliver_sms(
            tenant=tenant, party=party, template_code="LEDGER_ENTRY_GAVE", params=PARAMS
        )
    assert (outcome.log.status, outcome.log.error) == ("skipped", "channel_not_configured")
    assert "Ramesh" not in caplog.text and "2,800" not in caplog.text
    assert outcome.log.payload["body"].startswith("Sharma Store: Rs 500 udhaar added")


def test_an_opted_out_party_is_never_messaged(tenant: Any, settings: Any) -> None:
    """NTF-02 FR-9 / AC-7 — the row is written (the attempt is evidence), nothing is sent."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    party = PartyFactory(tenant=tenant, sms_opt_in=False)
    outcome = deliver_sms(
        tenant=tenant, party=party, template_code="LEDGER_ENTRY_GAVE", params=PARAMS
    )
    assert (outcome.log.status, outcome.log.error) == ("skipped", "party_opted_out")
    assert FakeSmsBackend.sent == []


def test_a_landline_fails_with_a_reason_rather_than_being_guessed(
    tenant: Any, settings: Any
) -> None:
    """LED-08 EC-2 — `invalid_number`, a fix the merchant can make."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    party = PartyFactory(tenant=tenant, mobile="+912212345678")
    outcome = deliver_sms(
        tenant=tenant, party=party, template_code="LEDGER_ENTRY_GAVE", params=PARAMS
    )
    assert (outcome.log.status, outcome.log.error) == ("failed", "invalid_number")
    assert FakeSmsBackend.sent == []


def test_a_configured_provider_sends_and_records_one_row(tenant: Any, settings: Any) -> None:
    settings.UB_SMS_BACKEND = FAKE_PATH
    party = PartyFactory(tenant=tenant, mobile="+919812345678")
    outcome = deliver_sms(
        tenant=tenant, party=party, template_code="LEDGER_ENTRY_GAVE", params=PARAMS
    )
    assert outcome.log.status == "sent" and outcome.log.sent_at is not None
    assert FakeSmsBackend.sent[0]["to"] == "+919812345678"
    assert MessageLog.objects.filter(party=party).count() == 1


def test_a_provider_exception_is_a_failed_row_marked_retryable(tenant: Any, settings: Any) -> None:
    """NTF-02 FR-10 — a timeout never escapes into the caller; the job retries it."""
    settings.UB_SMS_BACKEND = FAKE_PATH
    FakeSmsBackend.fail_with = TimeoutError("provider down")
    party = PartyFactory(tenant=tenant, mobile="+919812345678")
    outcome = deliver_sms(
        tenant=tenant, party=party, template_code="LEDGER_ENTRY_GAVE", params=PARAMS
    )
    assert (outcome.log.status, outcome.retryable) == ("failed", True)


# ── NTF-03: the deep link ───────────────────────────────────────────────────


def test_wa_url_percent_encodes_hindi_emoji_and_the_ampersand() -> None:
    """T-LED-06-1 — `&` and `#` in a note cannot end the `text` parameter."""
    text = "नमस्ते Ramesh & Sons #1 🙏\nRs 2,800"
    url = wa_url("919812345678", text)
    parsed = urlparse(url)
    assert parsed.netloc == "wa.me" and parsed.path == "/919812345678"
    assert parse_qs(parsed.query)["text"] == [text]
    assert "&" not in parsed.query.split("text=", 1)[1]


@pytest.mark.parametrize(
    ("raw", "digits"),
    [("+919812345678", "919812345678"), ("9812345678", "919812345678"), ("12", None), (None, None)],
)
def test_whatsapp_digits_strip_the_plus_and_refuse_a_guess(raw: Any, digits: Any) -> None:
    assert whatsapp_digits(raw) == digits


def test_the_reminder_carries_a_upi_link_only_when_the_shop_has_a_vpa(tenant: Any) -> None:
    """NTF-03 / LED-06 AC-1, EC-7 — `upi://pay?pa=…&am=2800.00`, or no line at all."""
    party = PartyFactory(tenant=tenant, name="Ramesh Traders", mobile="+919812345678")
    without = compose_reminder(tenant=tenant, party=party, balance=Decimal("2800.00"))
    assert "upi://" not in without.text and "Pay via UPI" not in without.text

    tenant.upi_vpa = "sharma@okaxis"
    tenant.save(update_fields=["upi_vpa"])
    with_vpa = compose_reminder(
        tenant=tenant, party=party, balance=Decimal("2800.00"), reference="RM-1"
    )
    decoded = unquote(with_vpa.wa_url)
    assert "Rs 2,800" in decoded and tenant.name in decoded
    assert "upi://pay?pa=sharma%40okaxis" in with_vpa.text and "am=2800.00" in with_vpa.text


def test_optional_lines_collapse_instead_of_leaving_blanks(tenant: Any) -> None:
    """LED-06 BR-3 — no collection date, no note, no VPA → three lines vanish."""
    party = PartyFactory(tenant=tenant, name="Ramesh")
    text = compose_reminder(tenant=tenant, party=party, balance=Decimal("10")).text
    assert "\n\n" not in text and "collection date" not in text
    assert text.endswith(f"— {tenant.name}")
