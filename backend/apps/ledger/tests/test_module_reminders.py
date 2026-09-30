"""PLT-X06 through the HTTP API (A7, FRD 00 §2, §6, §9, §13).

The module's candidates with `allowed`, a send about one record (the server
derives the party, the recipient and the amount), the worked example's cap, the
closed record (EC-1), bulk skips, the window settings, the trade figure for
party reminders (BR-7), and the reminder shape.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.ledger.constants import ReminderKind, ReminderStatus
from apps.ledger.models import Reminder
from apps.ledger.tests.module_reminder_fixtures import (  # noqa: F401  (fixtures)
    CANDIDATES,
    MODULE,
    SOURCE,
    at_ist,
    candidate,
    clock,
    module_on,
    test_module,
)
from apps.parties.models import Party
from tests.factories.parties import PartyFactory

pytestmark = pytest.mark.django_db

DAY = dt.date(2026, 10, 12)
DUE = "v1:reminder-due"
PREVIEW = "v1:reminder-preview"
LIST = "v1:reminder-list"
BULK = "v1:reminder-bulk"
SETTINGS = "v1:reminder-settings"


def _send(client: Any, reminder_id: Any) -> Any:
    return client.post(reverse("v1:reminder-send", args=[reminder_id]), {}, format="json")


def _create(client: Any, cand: dict, channel: str = "whatsapp_manual") -> Any:
    return client.post(
        reverse(LIST),
        {"source_type": SOURCE, "source_id": str(cand["source_id"]), "channel": channel},
        format="json",
    )


@pytest.fixture
def world(tenant: Any, api_as: Any, test_module: Any, clock: Any) -> dict:
    module_on(tenant)
    clock(at_ist(DAY, 18, 10))
    rahul = PartyFactory(tenant=tenant, name="Rahul", mobile="9876543210")
    mohan = PartyFactory(tenant=tenant, name="Mohan", mobile="9812345678")
    client, _ = api_as(tenant, role="staff")
    return {"tenant": tenant, "client": client, "rahul": rahul, "mohan": mohan}


def test_the_module_list_buckets_candidates_and_says_when_each_may_go(
    world: dict, clock: Any
) -> None:
    """§6 — `{party, recipient, source_type, source_id, subject_label, due_on,
    amount, bucket, allowed, next_allowed_at}`; a notice has no amount."""
    tenant, rahul, mohan = world["tenant"], world["rahul"], world["mohan"]
    due = candidate(rahul, recipient=mohan)
    notice = candidate(rahul, amount=None, label="Wings of Fire is ready to collect")
    CANDIDATES[tenant.pk] = [due, notice]

    body = world["client"].get(reverse(DUE), {"module": MODULE}).json()

    rows = {row["source_id"]: row for row in body["data"]}
    assert rows[str(due["source_id"])] == {
        "party": {"id": str(rahul.id), "name": "Rahul"},
        "recipient": {"id": str(mohan.id), "name": "Mohan"},
        "source_type": SOURCE,
        "source_id": str(due["source_id"]),
        "subject_label": "Instalment 4 of LN-0042",
        "due_on": "2026-10-12",
        "amount": "5625.00",
        "bucket": "due_today",
        "allowed": True,
        "next_allowed_at": None,
    }
    assert rows[str(notice["source_id"])]["bucket"] == "notice"
    assert rows[str(notice["source_id"])]["amount"] is None

    clock(at_ist(DAY, 19, 30))
    late = world["client"].get(reverse(DUE), {"module": MODULE}).json()["data"][0]
    assert late["allowed"] is False
    assert late["next_allowed_at"] == "2026-10-13T08:00:00+05:30"


def test_a_module_that_is_off_or_unknown_is_a_400(world: dict) -> None:
    """EC-4 — its tab and candidates disappear; the history stays."""
    tenant = world["tenant"]
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != MODULE]
    tenant.save(update_fields=["enabled_modules"])
    for module in (MODULE, "nonsense"):
        response = world["client"].get(reverse(DUE), {"module": module})
        assert response.status_code == 400
        assert "module" in response.json()["error"]["details"]


def test_a_send_about_one_record_is_addressed_to_the_recipient(world: dict) -> None:
    """BR-6, BR-8 — the preview and the send use the SOURCE's amount and the
    guardian's number; the row names the record, the module and the recipient."""
    tenant, rahul, mohan = world["tenant"], world["rahul"], world["mohan"]
    cand = candidate(rahul, recipient=mohan)
    CANDIDATES[tenant.pk] = [cand]
    client = world["client"]

    preview = client.post(
        reverse(PREVIEW),
        {"source_type": SOURCE, "source_id": str(cand["source_id"])},
        format="json",
    ).json()["data"]
    assert preview["text"].startswith("Namaste Mohan, Instalment 4 of LN-0042 for Rahul")
    assert "5,625" in preview["text"]
    assert preview["recipient"] == {"id": str(mohan.id), "name": "Mohan"}
    assert preview["fixed_text"] is True
    assert preview["allowed"] is True
    assert "919812345678" in preview["wa_url"]

    created = _create(client, cand)
    assert created.status_code == 201, created.content
    sent = _send(client, created.json()["data"]["id"])
    assert sent.status_code == 200, sent.content

    row = Reminder.objects.get(pk=created.json()["data"]["id"])
    assert row.status == ReminderStatus.SENT
    assert row.kind == ReminderKind.MANUAL  # a merchant's own send stays manual (R9)
    assert row.module == MODULE and row.source_type == SOURCE
    assert row.source_id == cand["source_id"]
    assert row.recipient_party_id == mohan.pk
    assert row.snapshot_balance == Decimal("5625.00")

    listed = client.get(reverse(LIST), {"module": MODULE}).json()["data"][0]
    assert listed["subject_label"] == "Instalment 4 of LN-0042"
    assert listed["recipient"] == {"id": str(mohan.id), "name": "Mohan"}
    assert listed["module"] == MODULE


def test_the_worked_example_one_per_loan_per_day(world: dict) -> None:
    """§9 worked example: 18:10 send recorded; a second at 18:40 → 409
    `reminder_cap_reached {cap: 1, next_allowed_at: 13 Oct 08:00}`, and NOTHING is
    recorded; a second loan due the same day is allowed."""
    tenant, rahul = world["tenant"], world["rahul"]
    loan, other = candidate(rahul), candidate(rahul, label="Instalment 2 of LN-0051")
    CANDIDATES[tenant.pk] = [loan, other]
    client = world["client"]
    assert _send(client, _create(client, loan).json()["data"]["id"]).status_code == 200

    count = Reminder.objects.count()
    refused = _create(client, loan)
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "reminder_cap_reached"
    assert refused.json()["error"]["details"] == {
        "cap": 1,
        "next_allowed_at": "2026-10-13T08:00:00+05:30",
    }
    assert Reminder.objects.count() == count

    assert _send(client, _create(client, other).json()["data"]["id"]).status_code == 200


def test_outside_the_window_nothing_is_created_or_sent(world: dict, clock: Any) -> None:
    """BR-1/BR-2 — refused at create; and a row created in the window is refused at
    SEND when the hour passes, and stays unsent."""
    tenant, rahul = world["tenant"], world["rahul"]
    cand = candidate(rahul)
    CANDIDATES[tenant.pk] = [cand]
    client = world["client"]
    created = _create(client, cand).json()["data"]

    clock(at_ist(DAY, 19, 0))
    refused = _send(client, created["id"])
    assert refused.status_code == 409
    assert refused.json()["error"]["code"] == "reminder_outside_window"
    assert refused.json()["error"]["details"]["window_end"] == "19:00"
    assert Reminder.objects.get(pk=created["id"]).status == ReminderStatus.SCHEDULED
    assert _create(client, candidate(rahul)).status_code in (409, 404)


def test_a_record_that_is_no_longer_due_is_409_due_not_open(world: dict) -> None:
    """EC-1 — paid between the list load and the tap: nothing is recorded."""
    tenant, rahul = world["tenant"], world["rahul"]
    cand = candidate(rahul)
    CANDIDATES[tenant.pk] = [cand]
    client = world["client"]
    created = _create(client, cand).json()["data"]
    CANDIDATES[tenant.pk] = []

    response = _send(client, created["id"])
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "due_not_open"
    assert Reminder.objects.get(pk=created["id"]).status == ReminderStatus.SCHEDULED


def test_fixed_templates_refuse_a_note(world: dict) -> None:
    """§8 — lending's text is fixed; free text is refused, not ignored."""
    tenant, rahul = world["tenant"], world["rahul"]
    cand = candidate(rahul)
    CANDIDATES[tenant.pk] = [cand]
    response = world["client"].post(
        reverse(LIST),
        {
            "source_type": SOURCE,
            "source_id": str(cand["source_id"]),
            "channel": "whatsapp_manual",
            "note": "Pay now or else",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "note" in response.json()["error"]["details"]


def test_an_archived_guardian_is_not_messaged(world: dict) -> None:
    """EC-3 — the party is the recipient again."""
    tenant, rahul, mohan = world["tenant"], world["rahul"], world["mohan"]
    Party.objects.filter(pk=mohan.pk).update(status="archived")
    cand = candidate(rahul, recipient=mohan)
    CANDIDATES[tenant.pk] = [cand]
    preview = (
        world["client"]
        .post(
            reverse(PREVIEW),
            {"source_type": SOURCE, "source_id": str(cand["source_id"])},
            format="json",
        )
        .json()["data"]
    )
    assert preview["recipient"] is None
    assert preview["text"].startswith("Namaste Rahul")


def test_bulk_records_the_allowed_and_skips_the_rest_with_the_next_time(world: dict) -> None:
    """§2 flow 3 / §6 — `skipped: [{source_id, code, next_allowed_at}]`."""
    tenant, rahul = world["tenant"], world["rahul"]
    ok, capped = candidate(rahul), candidate(rahul, label="Instalment 5")
    CANDIDATES[tenant.pk] = [ok, capped]
    client = world["client"]
    _send(client, _create(client, capped).json()["data"]["id"])

    body = client.post(
        reverse(BULK),
        {
            "channel": "whatsapp_manual",
            "sources": [
                {"source_type": SOURCE, "source_id": str(ok["source_id"])},
                {"source_type": SOURCE, "source_id": str(capped["source_id"])},
                {"source_type": SOURCE, "source_id": str(uuid.uuid4())},
            ],
        },
        format="json",
    ).json()["data"]

    assert [item["source_id"] for item in body["items"]] == [str(ok["source_id"])]
    skipped = {row["source_id"]: row for row in body["skipped"]}
    assert skipped[str(capped["source_id"])]["code"] == "reminder_cap_reached"
    assert skipped[str(capped["source_id"])]["next_allowed_at"] == "2026-10-13T08:00:00+05:30"
    assert len(skipped) == 2  # the unknown one is `due_not_open`


# ── Window settings (T-PLT-X06-7, §10) ───────────────────────────────────────


def test_the_owner_narrows_the_window_and_nobody_widens_it(world: dict, api_as: Any) -> None:
    tenant = world["tenant"]
    owner, _ = api_as(tenant, role="owner")
    got = owner.get(reverse(SETTINGS)).json()["data"]
    assert got["windows"] == {
        MODULE: {"start": "08:00", "end": "19:00", "policy_start": "08:00", "policy_end": "19:00"}
    }

    saved = owner.patch(reverse(SETTINGS), {"windows": {MODULE: ["09:00", "18:00"]}}, format="json")
    assert saved.status_code == 200, saved.content
    assert saved.json()["data"]["windows"][MODULE]["start"] == "09:00"

    wider = owner.patch(reverse(SETTINGS), {"windows": {MODULE: ["07:00", "18:00"]}}, format="json")
    assert wider.status_code == 400
    assert wider.json()["error"]["details"] == {
        "reminders.test.window": ["Can only be narrower than 08:00–19:00."]
    }
    short = owner.patch(reverse(SETTINGS), {"windows": {MODULE: ["10:00", "10:30"]}}, format="json")
    assert short.status_code == 400

    admin, _ = api_as(tenant, role="admin")
    refused = admin.patch(reverse(SETTINGS), {"windows": {MODULE: None}}, format="json")
    assert refused.status_code == 403

    cleared = owner.patch(reverse(SETTINGS), {"windows": {MODULE: None}}, format="json")
    assert cleared.json()["data"]["windows"][MODULE]["start"] == "08:00"


def test_a_shop_without_a_policy_window_sees_no_window_settings(tenant: Any, api_as: Any) -> None:
    """Owner Q5's default — no window outside lending: the key is absent."""
    owner, _ = api_as(tenant, role="owner")
    assert "windows" not in owner.get(reverse(SETTINGS)).json()["data"]


# ── BR-7: party reminders quote the trade figure ─────────────────────────────


def test_a_party_reminder_quotes_the_shop_figure_never_the_loan(tenant: Any, api_as: Any) -> None:
    """Worked example: balance ₹48,925, loan ₹46,625 → the shop reminder quotes
    ₹2,300 in the text and the snapshot; a borrower with only a loan is not in the
    shop's due list and cannot be reminded from it."""
    client, _ = api_as(tenant, role="staff")
    today = dt.date.today()
    borrower = PartyFactory(tenant=tenant, mobile="9876543210", collection_date=today)
    Party.objects.filter(pk=borrower.pk).update(
        balance=Decimal("48925.00"), loan_balance=Decimal("46625.00")
    )
    only_loan = PartyFactory(tenant=tenant, mobile="9811111111", collection_date=today)
    Party.objects.filter(pk=only_loan.pk).update(
        balance=Decimal("1000.00"), loan_balance=Decimal("1000.00")
    )

    preview = client.post(reverse(PREVIEW), {"party_id": str(borrower.id)}, format="json").json()
    assert preview["data"]["balance"] == "2300.00"
    assert "2,300" in preview["data"]["text"] and "48,925" not in preview["data"]["text"]

    created = client.post(
        reverse(LIST), {"party_id": str(borrower.id), "channel": "whatsapp_manual"}, format="json"
    ).json()["data"]
    _send(client, created["id"])
    assert Reminder.objects.get(pk=created["id"]).snapshot_balance == Decimal("2300.00")

    due_ids = [row["id"] for row in client.get(reverse(DUE), {"bucket": "today"}).json()["data"]]
    assert str(borrower.id) in due_ids and str(only_loan.id) not in due_ids
    refused = client.post(reverse(PREVIEW), {"party_id": str(only_loan.id)}, format="json")
    assert refused.json()["error"]["code"] == "nothing_due"
