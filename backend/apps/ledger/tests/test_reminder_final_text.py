"""WP-04 MSG-10 / MSG-07 — the reminder log keeps the words the merchant SENT.

Since the share composer, the sheet lets the merchant change the reminder's
words before WhatsApp or the SMS app opens. The log was still written from the
server's own template at `/send`, so the record said one thing and the
customer received another. `/send` now takes the final `text`: it is what the
log stores and what the returned link carries. Without it the server's words
are used, as before.

The same field is what makes "Remind all" editable: each bulk row carries the
party's number, the dialog builds its link from the edited words, and the tap
sends those words to `/send`.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from urllib.parse import unquote

import pytest
from django.urls import reverse

from apps.ledger.models import Reminder
from apps.notifications.models import MessageLog
from apps.notifications.services.whatsapp_text import MAX_SHARE_TEXT
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

EDITED = "Ramesh ji, Rs 2,800 baaki hai. Kal dukaan aa jaana. - Sharma Store"


@pytest.fixture
def owes(tenant: Any) -> Any:
    return PartyFactory(
        tenant=tenant, name="Ramesh Traders", mobile="+919812345678", balance=Decimal("2800.00")
    )


def _scheduled(client: Any, party: Any, channel: str = "whatsapp_manual") -> str:
    created = client.post(
        reverse("v1:reminder-list"),
        {"party_id": str(party.id), "channel": channel},
        format="json",
    )
    assert created.status_code == 201, created.content
    return created.json()["data"]["id"]


def _send(client: Any, reminder_id: str, **body: Any) -> Any:
    return client.post(reverse("v1:reminder-send", args=[reminder_id]), body, format="json")


def _logged_body(reminder_id: str) -> str:
    reminder = Reminder.objects.get(pk=reminder_id)
    return MessageLog.objects.get(pk=reminder.message_log_id).payload["body"]


def test_whatsapp_logs_and_links_the_words_the_merchant_sent(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    """The log said the template's words while the customer got the edit."""
    client, _ = api_as(tenant)
    rid = _scheduled(client, owes)

    response = _send(client, rid, text=f"  {EDITED}\n")

    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["text"] == EDITED
    assert unquote(data["wa_url"]).endswith(EDITED)
    assert data["wa_url"].startswith("https://wa.me/919812345678?text=")
    assert _logged_body(rid) == EDITED


def test_the_sms_app_logs_the_edited_words_too(tenant: Any, api_as: Any, owes: Any) -> None:
    client, _ = api_as(tenant)
    rid = _scheduled(client, owes, channel="sms_manual")

    data = _send(client, rid, text=EDITED).json()["data"]

    assert unquote(data["sms_url"]).endswith(EDITED)
    assert _logged_body(rid) == EDITED


def test_without_text_the_servers_words_are_logged(tenant: Any, api_as: Any, owes: Any) -> None:
    """An older client (or a merchant who changed nothing) keeps today's record."""
    client, _ = api_as(tenant)
    rid = _scheduled(client, owes)

    data = _send(client, rid).json()["data"]

    assert "Rs 2,800" in data["text"]
    assert _logged_body(rid) == data["text"]


@pytest.mark.parametrize("text", ["", "   \n ", 12, "x" * (MAX_SHARE_TEXT + 1), "a\x00b"])
def test_unusable_words_are_refused_and_nothing_is_marked_sent(
    tenant: Any, api_as: Any, owes: Any, text: Any
) -> None:
    """A blank message, a number, an over-long one or a NUL byte is a field
    error on `text`, and the row stays scheduled so the merchant can try again."""
    client, _ = api_as(tenant)
    rid = _scheduled(client, owes)

    response = _send(client, rid, text=text)

    assert response.status_code == 400, response.content
    assert "text" in response.json()["error"]["details"]
    assert Reminder.objects.get(pk=rid).status == "scheduled"
    assert MessageLog.objects.count() == 0


def test_a_call_ignores_text_because_there_is_no_message(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    client, _ = api_as(tenant)
    rid = _scheduled(client, owes, channel="call")

    response = _send(client, rid, text=EDITED)

    assert response.status_code == 200
    assert MessageLog.objects.count() == 0


def test_a_provider_sms_cannot_carry_edited_words(
    tenant: Any, api_as: Any, owes: Any, settings: Any
) -> None:
    """A provider SMS goes out in its registered wording; accepting `text` here
    would record words that were never sent."""
    settings.DEBUG = True
    client, _ = api_as(tenant)
    rid = _scheduled(client, owes, channel="sms")

    response = _send(client, rid, text=EDITED)

    assert response.status_code == 400
    assert "text" in response.json()["error"]["details"]
    assert Reminder.objects.get(pk=rid).status == "scheduled"


def test_each_bulk_row_carries_the_number_its_link_is_built_from(
    tenant: Any, api_as: Any, owes: Any
) -> None:
    """MSG-07 — the dialog rebuilds a row's link from the edited words, so it
    needs the party's number, not only a finished `wa.me` URL."""
    client, _ = api_as(tenant)
    data = client.post(
        reverse("v1:reminder-bulk"),
        {"party_ids": [str(owes.id)], "channel": "whatsapp_manual"},
        format="json",
    ).json()["data"]

    item = data["items"][0]
    assert item["mobile"] == owes.mobile

    sent = _send(client, item["reminder_id"], text=EDITED)
    assert sent.status_code == 200
    assert _logged_body(item["reminder_id"]) == EDITED
