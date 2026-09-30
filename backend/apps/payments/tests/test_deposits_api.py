"""A4b — `/deposits` over HTTP (FRD 00 PLT-X02 §6, §10).

What the endpoints add on top of the services: who may read and who may move
money (the accountant reads and never writes), the list's filters and its held
total over the FILTERED set, the detail's evidence (receipts, applications,
returns), idempotent replays of money writes, the stale-version refusal, 404
for another business's deposit, and a client that tries to send `adjustment`.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx
from apps.payments.models import Payment
from apps.payments.services import deposits
from apps.payments.tests.conftest import cash_lines, upi

pytestmark = pytest.mark.django_db

LIST = "v1:deposit-list"


def _url(deposit_id: Any, suffix: str = "") -> str:
    base = reverse("v1:deposit-detail", args=[deposit_id])
    return f"{base}/{suffix}" if suffix else base


def _post(client: Any, deposit_id: Any, suffix: str, body: dict, key: str | None = None) -> Any:
    return client.post(
        _url(deposit_id, suffix),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


@pytest.fixture
def deposit(shop: Any, make_party: Any) -> Any:
    return deposits.open_deposit(
        ctx=Ctx.system(shop),
        party_id=make_party(name="Asha Rao").id,
        module="library",
        subject_type="library_membership",
        subject_id=uuid.uuid4(),
        purpose="Library deposit",
        expected_amount="500.00",
    )


def test_receive_apply_and_return_over_http(owner: Any, deposit: Any, invoice_for: Any) -> None:
    """The three money acts, each 201 with the deposit's new figures and the
    payment(s) it wrote; the detail then lists the evidence of each."""
    received = _post(
        owner, deposit.id, "receive", {"amount": "500.00", "mode_breakup": cash_lines("500.00")}
    )
    assert received.status_code == 201, received.json()
    body = received.json()["data"]
    assert body["deposit"]["held_amount"] == "500.00" and body["deposit"]["status"] == "held"
    assert body["payment"]["number"].startswith("RCT/")

    fine = invoice_for(deposit.party, "120.00")
    applied = _post(
        owner,
        deposit.id,
        "apply",
        {
            "allocations": [
                {"document_type": "sales_document", "document_id": fine["id"], "amount": "120.00"}
            ],
            "reason": "Late return fine",
        },
    )
    assert applied.status_code == 201, applied.json()
    data = applied.json()["data"]
    assert data["deposit"]["held_amount"] == "380.00"
    assert data["refund_payment"]["primary_mode"] == "adjustment"
    assert data["settle_payment"]["primary_mode"] == "adjustment"
    assert data["documents"][0]["status"] == "paid"

    returned = _post(
        owner,
        deposit.id,
        "refund",
        {"amount": "380.00", "mode_breakup": upi("380.00"), "reason": "Closed"},
    )
    assert returned.status_code == 201, returned.json()
    assert returned.json()["data"]["deposit"]["status"] == "released"

    detail = owner.get(_url(deposit.id)).json()["data"]
    assert [r["amount"] for r in detail["receipts"]] == ["500.00"]
    assert [a["amount"] for a in detail["applications"]] == ["120.00"]
    assert detail["applications"][0]["voided_at"] is None
    assert [r["amount"] for r in detail["refunds"]] == ["380.00"]
    assert "subject_label" not in detail  # never sent empty (see the serializer)


def test_the_list_filters_and_totals_what_is_held(
    shop: Any, owner: Any, deposit: Any, make_party: Any
) -> None:
    other = deposits.open_deposit(
        ctx=Ctx.system(shop),
        party_id=make_party(name="Ravi").id,
        module="gym",
        subject_type="gym_membership",
        subject_id=uuid.uuid4(),
        purpose="Locker deposit",
        expected_amount="200.00",
    )
    for row, amount in ((deposit, "500.00"), (other, "200.00")):
        _post(owner, row.id, "receive", {"amount": amount, "mode_breakup": cash_lines(amount)})
    everything = owner.get(reverse(LIST)).json()
    assert everything["meta"]["totals"]["held"] == "700.00"
    library = owner.get(reverse(LIST), {"module": "library"}).json()
    assert [r["id"] for r in library["data"]] == [str(deposit.id)]
    assert library["meta"]["totals"]["held"] == "500.00"
    mine = owner.get(reverse(LIST), {"party_id": str(deposit.party_id), "status": "held"}).json()
    assert [r["id"] for r in mine["data"]] == [str(deposit.id)]
    assert owner.get(reverse(LIST), {"status": "open"}).status_code == 400
    assert owner.get(reverse(LIST), {"party_id": "not-a-uuid"}).status_code == 400


def test_the_accountant_reads_deposits_and_moves_no_money(
    shop: Any, api_as: Any, deposit: Any
) -> None:
    """PLT-X02 §10: read `payments.payment.read`; receive/apply/refund
    `payments.payment.write`, which the accountant does not hold (staff do)."""
    accountant, _ = api_as(shop, role="accountant")
    staff, _ = api_as(shop, role="staff")
    assert accountant.get(reverse(LIST)).status_code == 200
    assert accountant.get(_url(deposit.id)).status_code == 200
    body = {"amount": "100.00", "mode_breakup": cash_lines("100.00")}
    assert _post(accountant, deposit.id, "receive", body).status_code == 403
    assert _post(staff, deposit.id, "receive", body).status_code == 201


def test_a_money_write_replays_on_the_same_key(owner: Any, deposit: Any) -> None:
    """A counter that retries on a flaky network must not take the deposit twice."""
    body = {"amount": "500.00", "mode_breakup": cash_lines("500.00")}
    key = str(uuid.uuid4())
    first = _post(owner, deposit.id, "receive", body, key=key)
    second = _post(owner, deposit.id, "receive", body, key=key)
    assert first.status_code == second.status_code == 201
    assert second["Idempotent-Replayed"] == "true"
    assert Payment.objects.filter(meta__deposit_id=str(deposit.id)).count() == 1


def test_a_stale_version_is_refused(owner: Any, deposit: Any) -> None:
    _post(owner, deposit.id, "receive", {"amount": "100.00", "mode_breakup": cash_lines("100.00")})
    stale = _post(
        owner,
        deposit.id,
        "receive",
        {"amount": "100.00", "mode_breakup": cash_lines("100.00"), "version": 1},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_version"


def test_a_client_cannot_send_an_adjustment(owner: Any, deposit: Any) -> None:
    """R24 through the deposit endpoint: only an opening taken by a vertical's
    own flow is an adjustment; the counter's "Take deposit" is real money."""
    response = _post(
        owner,
        deposit.id,
        "receive",
        {"amount": "500.00", "mode_breakup": [{"mode": "adjustment", "amount": "500.00"}]},
    )
    assert response.status_code == 400
    assert "mode_breakup.0.mode" in response.json()["error"]["details"]


def test_another_businesss_deposit_is_not_found(
    deposit: Any, other_tenant: Any, api_as: Any
) -> None:
    stranger, _ = api_as(other_tenant)
    assert stranger.get(_url(deposit.id)).status_code == 404
    response = _post(
        stranger, deposit.id, "receive", {"amount": "1.00", "mode_breakup": cash_lines("1.00")}
    )
    assert response.status_code == 404


def test_refusals_carry_their_codes(owner: Any, deposit: Any) -> None:
    over = _post(
        owner, deposit.id, "receive", {"amount": "600.00", "mode_breakup": cash_lines("600.00")}
    )
    assert over.status_code == 409 and over.json()["error"]["code"] == "over_allocated"
    _post(owner, deposit.id, "receive", {"amount": "500.00", "mode_breakup": cash_lines("500.00")})
    too_much = _post(
        owner,
        deposit.id,
        "refund",
        {"amount": "501.00", "mode_breakup": cash_lines("501.00"), "reason": "x"},
    )
    assert too_much.status_code == 409
    assert too_much.json()["error"]["code"] == "deposit_insufficient"
    assert too_much.json()["error"]["details"]["held_amount"] == "500.00"
    no_reason = _post(
        owner,
        deposit.id,
        "refund",
        {"amount": "1.00", "mode_breakup": cash_lines("1.00"), "reason": ""},
    )
    assert no_reason.status_code == 400


def test_the_deposits_held_report_is_listed_and_exports(
    shop: Any, owner: Any, api_as: Any, deposit: Any
) -> None:
    """FRD 00 PLT-X02 §11, through A10's registry: listed for a reader with
    `reports.financial.read` (staff lack it), JSON and CSV agree."""
    _post(owner, deposit.id, "receive", {"amount": "500.00", "mode_breakup": cash_lines("500.00")})
    listed = owner.get(reverse("v1:report-list")).json()["data"]
    assert {r["key"] for r in listed} >= {"payments.deposits_held"}
    staff, _ = api_as(shop, role="staff")
    assert "payments.deposits_held" not in {
        r["key"] for r in staff.get(reverse("v1:report-list")).json()["data"]
    }
    url = reverse("v1:report-module", kwargs={"key": "payments.deposits_held"})
    report = owner.get(url).json()["data"]
    assert [(r["purpose"], r["held"]) for r in report["rows"]] == [("Library deposit", "500.00")]
    assert report["totals"]["held"] == "500.00"
    csv = b"".join(owner.get(url, {"format": "csv"}).streaming_content).decode("utf-8")
    lines = csv.lstrip("﻿").strip().split("\r\n")
    assert lines[0].split(",")[-1] == "held" and lines[1].endswith(",500.00")


def test_a_payment_that_is_half_of_an_application_names_its_partner(
    owner: Any, deposit: Any, invoice_for: Any
) -> None:
    """The void dialog says what else a void reverses (FRD 00 PLT-X02 §7)."""
    _post(owner, deposit.id, "receive", {"amount": "500.00", "mode_breakup": cash_lines("500.00")})
    fine = invoice_for(deposit.party, "120.00")
    data = _post(
        owner,
        deposit.id,
        "apply",
        {
            "allocations": [
                {"document_type": "sales_document", "document_id": fine["id"], "amount": "120.00"}
            ],
            "reason": "Fine",
        },
    ).json()["data"]
    out, settle = data["refund_payment"], data["settle_payment"]
    assert out["context"] == settle["context"] == "deposit_adjustment"
    assert out["deposit_pair"]["partner"]["number"] == settle["number"]
    assert settle["deposit_pair"]["partner"]["number"] == out["number"]
    assert settle["deposit_pair"]["amount"] == "120.00"
    receipt = owner.get(reverse("v1:payment-list")).json()["data"]
    cash = next(r for r in receipt if r["primary_mode"] == "cash")
    detail = owner.get(reverse("v1:payment-detail", args=[cash["id"]])).json()["data"]
    assert detail["deposit_pair"] is None and detail["context"] == "deposit_receipt"


def test_a_party_whose_deposit_holds_money_is_not_archived(owner: Any, deposit: Any) -> None:
    """PLT-X04 BR-5 / PLT-X02 EC-7 through A6's archive guards. The khata's main
    balance is zero the whole time — a deposit sits in its own bucket — so
    without the guard the archive would go through and ₹500 of the member's
    money would vanish from every working screen. An EXPECTED deposit holds
    nothing and does not block; a returned one no longer does."""
    archive = reverse("v1:party-archive", args=[deposit.party_id])
    _post(owner, deposit.id, "receive", {"amount": "500.00", "mode_breakup": cash_lines("500.00")})
    refused = owner.post(archive, {}, format="json")
    assert refused.status_code == 409, refused.json()
    error = refused.json()["error"]
    assert error["code"] == "party_has_open_records"
    assert error["details"]["module"] == "payments"
    assert error["details"]["count"] == 1
    assert error["details"]["label_id"] == "payments.deposit.archiveBlock"
    _post(
        owner,
        deposit.id,
        "refund",
        {"amount": "500.00", "mode_breakup": upi("500.00"), "reason": "Closed"},
    )
    assert owner.post(archive, {}, format="json").status_code == 200
