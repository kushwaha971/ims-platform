"""A4a / PLT-X03 — `allocate_existing`: apply money already received to later documents.

Hospitality found it (§6.7): `record_payment` takes allocations once, so an advance received on
3 Sep could never settle the invoice raised at check-out on 12 Oct. ADR-047 adds the service and
`POST /payments/{id}/allocations`. Every test names the defect it prevents; T-PLT-X03-n numbers are
FRD 00's.
"""

from __future__ import annotations

import threading
import time
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.db import connection
from django.urls import reverse

from apps.common.context import Ctx
from apps.ledger.models import LedgerEntry
from apps.payments.models import Allocation, Payment
from apps.payments.tests.conftest import cash_lines, pay, payment_url, void
from apps.sales.models import SalesDocument

pytestmark = pytest.mark.django_db

D = Decimal


def allocate(client: Any, payment_id: Any, body: dict, key: str | None = None) -> Any:
    return client.post(
        payment_url(payment_id, "allocations"),
        body,
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


def rows(document: dict, amount: str) -> dict:
    return {
        "allocations": [
            {"document_type": "sales_document", "document_id": document["id"], "amount": amount}
        ],
        "reason": "Advance applied",
    }


@pytest.fixture
def advance(owner: Any, make_party: Any) -> Any:
    """The worked example's party: ₹3,000 received on account, nothing to settle yet."""
    party = make_party(name="Advance Stay")
    response = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("3000.00"))
    assert response.status_code == 201, response.json()
    return {"party": party, "payment_id": response.json()["data"]["id"]}


def test_the_worked_example_applies_part_of_an_advance(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """T-PLT-X03-3 — ₹3,000 advance, a ₹1,770 invoice: the invoice is paid, ₹1,230 stays as
    advance, and the khata does NOT move (BR-3) — the money was on it already. Moving it again
    would count the advance twice."""
    party = advance["party"]
    party.refresh_from_db()
    assert party.balance == D("-3000.00")
    invoice = invoice_for(party, "1770.00")
    lines_before = LedgerEntry.objects.filter(party=party).count()

    response = allocate(owner, advance["payment_id"], rows(invoice, "1770.00"))

    assert response.status_code == 200, response.json()
    body = response.json()
    assert body["data"]["payment"]["unallocated_amount"] == "1230.00"
    assert body["data"]["allocations"] == [
        {
            "document_type": "sales_document",
            "document_id": invoice["id"],
            "number": invoice["number"],
            "amount": "1770.00",
        }
    ]
    assert body["meta"]["party_balance"] == "-1230.00"
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "paid"
    assert LedgerEntry.objects.filter(party=party).count() == lines_before
    party.refresh_from_db()
    assert party.balance == D("-1230.00")


def test_more_than_is_unallocated_is_refused_with_what_is_left(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """BR-2 — a second application beyond the ₹1,230 left answers 409 `over_allocated` with the
    figure the dialog must show, and changes nothing."""
    party = advance["party"]
    first = invoice_for(party, "1770.00")
    allocate(owner, advance["payment_id"], rows(first, "1770.00"))
    second = invoice_for(party, "1500.00")

    response = allocate(owner, advance["payment_id"], rows(second, "1300.00"))

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "over_allocated"
    assert error["details"]["unallocated_amount"] == "1230.00"
    assert SalesDocument.objects.get(pk=second["id"]).status == "issued"


def test_a_row_above_the_documents_due_is_refused(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """BR-2 — each row ≤ what the document can still take, with the current figure."""
    invoice = invoice_for(advance["party"], "500.00")
    response = allocate(owner, advance["payment_id"], rows(invoice, "600.00"))
    assert response.status_code == 400
    assert response.json()["error"]["details"]["allocations.0.amount"] == ["Max ₹500.00"]


def test_applying_again_to_the_same_invoice_increases_the_row(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """T-PLT-X03-7, BR-6 — `uq_allocation_target` forbids a second row for one payment and one
    document, so a second application grows the first instead of failing on the constraint."""
    invoice = invoice_for(advance["party"], "1000.00")
    assert allocate(owner, advance["payment_id"], rows(invoice, "400.00")).status_code == 200
    assert allocate(owner, advance["payment_id"], rows(invoice, "600.00")).status_code == 200
    allocation = Allocation.objects.get(payment_id=advance["payment_id"])
    assert allocation.amount == D("1000.00")
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "paid"


def test_auto_applies_oldest_first_up_to_what_is_left(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """`allocations: "auto"` — oldest invoice first across the payment's bucket's auto targets."""
    party = advance["party"]
    older = invoice_for(party, "2000.00", days_ago=10)
    newer = invoice_for(party, "2000.00", days_ago=1)
    response = allocate(owner, advance["payment_id"], {"allocations": "auto", "reason": ""})
    assert response.status_code == 200, response.json()
    assert SalesDocument.objects.get(pk=older["id"]).status == "paid"
    assert SalesDocument.objects.get(pk=newer["id"]).status == "partially_paid"
    assert Payment.objects.get(pk=advance["payment_id"]).unallocated_amount == D("0.00")


def test_a_void_later_releases_an_applied_later_allocation_like_any_other(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """BR-4 — the rows `allocate_existing` writes are ordinary allocations: voiding the payment
    reopens the invoice it was applied to."""
    invoice = invoice_for(advance["party"], "1770.00")
    allocate(owner, advance["payment_id"], rows(invoice, "1770.00"))
    assert void(owner, advance["payment_id"]).status_code == 200
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "issued"


def test_the_receipt_remembers_what_was_applied_later(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """PLT-X03 §8 — the receipt prints what the payment settled at print time, with "Applied
    later: INV/… on …" for an allocation made after it was recorded."""
    invoice = invoice_for(advance["party"], "1770.00")
    allocate(owner, advance["payment_id"], rows(invoice, "1770.00"))
    detail = owner.get(payment_url(advance["payment_id"])).json()["data"]
    [row] = detail["allocations"]
    assert row["number"] == invoice["number"]
    assert row["applied_later_on"] is not None


# ── Refusals ────────────────────────────────────────────────────────────────


def test_a_voided_payment_cannot_be_applied(owner: Any, advance: dict, invoice_for: Any) -> None:
    invoice = invoice_for(advance["party"], "100.00")
    void(owner, advance["payment_id"])
    response = allocate(owner, advance["payment_id"], rows(invoice, "100.00"))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "payment_already_void"


def test_another_partys_invoice_is_not_found(
    owner: Any, advance: dict, invoice_for: Any, make_party: Any
) -> None:
    """T-PLT-X03-8 — never forbidden, never "wrong party": not found (canon §0.11 rule 2)."""
    stranger = invoice_for(make_party(name="Stranger"), "100.00")
    response = allocate(owner, advance["payment_id"], rows(stranger, "100.00"))
    assert response.status_code == 404


def test_another_tenants_payment_is_not_found(
    advance: dict, api_as: Any, partner: Any, plan: Any
) -> None:
    """T-PLT-X03-8 — a cross-tenant id is 404 (ADR-032)."""
    from tests.factories.platform import TenantFactory

    other, _member = api_as(TenantFactory(partner=partner, plan=plan))
    response = allocate(other, advance["payment_id"], {"allocations": "auto"})
    assert response.status_code == 404


def test_a_bill_cannot_take_a_receipt(owner: Any, advance: dict) -> None:
    """The target's direction must be the payment's: money received never settles a purchase
    bill (CR-2026-09-28-INT-A's rule, from the other side)."""
    response = allocate(
        owner,
        advance["payment_id"],
        {
            "allocations": [
                {
                    "document_type": "purchase_document",
                    "document_id": str(uuid.uuid4()),
                    "amount": "10.00",
                }
            ]
        },
    )
    assert response.status_code == 400


def test_an_empty_list_and_a_duplicate_are_refused(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    invoice = invoice_for(advance["party"], "100.00")
    assert allocate(owner, advance["payment_id"], {"allocations": []}).status_code == 400
    twice = rows(invoice, "10.00")
    twice["allocations"].append(dict(twice["allocations"][0]))
    assert allocate(owner, advance["payment_id"], twice).status_code == 400


def test_a_walk_in_receipt_cannot_be_applied_later(shop: Any, owner: Any, make_item: Any) -> None:
    """EC-1 — a walk-in receipt has no khata, so there is nothing it could be an advance on."""
    from apps.sales.tests.conftest import draft, issue, line

    item = make_item(price="50.00", tax_code="GST0")
    doc = draft(owner, lines=[line(item)]).json()["data"]
    issued = issue(owner, doc["id"], payment={"mode_breakup": cash_lines("50.00")})
    assert issued.status_code == 200, issued.json()
    walk_in = Payment.objects.get(party__isnull=True, tenant=shop)
    response = allocate(owner, walk_in.id, {"allocations": "auto"})
    assert response.status_code == 400
    assert "walk-in" in str(response.json()["error"]["details"]).lower()


def test_a_credit_notes_refund_voucher_cannot_be_applied(
    shop: Any, owner: Any, make_party: Any
) -> None:
    """EC-5 — the money of a refund voucher went back to the customer; it is spoken for."""
    from apps.payments.services.record import record_payment

    party = make_party(name="Refund Traders")
    voucher = record_payment(
        ctx=Ctx.system(shop),
        payload={
            "direction": "out",
            "party_id": str(party.id),
            "mode_breakup": cash_lines("100.00"),
            "allocations": "none",
            "meta": {"credit_note_id": str(uuid.uuid4())},
        },
    )["payment"]
    response = allocate(owner, voucher.id, {"allocations": "auto"})
    assert response.status_code == 400


def test_the_accountant_may_not_apply_an_advance(
    shop: Any, api_as: Any, advance: dict, invoice_for: Any
) -> None:
    """PLT-X03 §10 — `payments.payment.write`: owner, admin and staff, not the accountant."""
    accountant, _member = api_as(shop, role="accountant")
    invoice = invoice_for(advance["party"], "100.00")
    assert allocate(accountant, advance["payment_id"], rows(invoice, "100.00")).status_code == 403


def test_the_endpoint_replays_an_idempotent_retry(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """T-PLT-X03-8 — the same key and body replay the first answer; nothing is applied twice."""
    invoice = invoice_for(advance["party"], "1000.00")
    key = str(uuid.uuid4())
    first = allocate(owner, advance["payment_id"], rows(invoice, "400.00"), key=key)
    again = allocate(owner, advance["payment_id"], rows(invoice, "400.00"), key=key)
    assert first.status_code == again.status_code == 200
    assert again.headers.get("Idempotent-Replayed") == "true"
    assert Allocation.objects.get(payment_id=advance["payment_id"]).amount == D("400.00")


def test_the_route_is_the_contracts() -> None:
    """`POST /api/v1/payments/{id}/allocations` (contracts §1.4)."""
    path = reverse("v1:payment-allocations", args=[uuid.uuid4()])
    assert path.startswith("/api/v1/payments/") and path.endswith("/allocations")


# ── Concurrency ─────────────────────────────────────────────────────────────


def _run_together(*calls: Any) -> list[str]:
    barrier = threading.Barrier(len(calls))
    outcomes: list[str] = [""] * len(calls)

    def run(index: int, fn: Any) -> None:
        try:
            barrier.wait()
            if index:
                time.sleep(0.05)
            fn()
            outcomes[index] = "ok"
        except Exception as exc:  # noqa: BLE001 — the outcome IS the assertion
            outcomes[index] = type(exc).__name__ + ":" + getattr(exc, "code", "")
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(calls)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert not any(thread.is_alive() for thread in threads), "a call hung"
    return outcomes


@pytest.mark.concurrency
@pytest.mark.django_db(transaction=True)
def test_two_applications_racing_for_one_advance_cannot_both_win(
    shop: Any, owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PLT-X03-5 — ₹1,230 left and two ₹800 applications at once: one succeeds, the other is
    `over_allocated`. Both take the party lock first, so the second reads the first's result."""
    from apps.payments.services.allocate import allocate_existing

    party = make_party(name="Race Advance")
    payment_id = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("1230.00")).json()[
        "data"
    ]["id"]
    one, two = invoice_for(party, "800.00"), invoice_for(party, "800.00")

    def apply_to(doc: dict) -> Any:
        return lambda: allocate_existing(
            ctx=Ctx.system(shop),
            payment_id=payment_id,
            allocations=[
                {"document_type": "sales_document", "document_id": doc["id"], "amount": "800.00"}
            ],
        )

    outcomes = _run_together(apply_to(one), apply_to(two))
    assert sorted(outcomes) == ["BusinessRuleViolation:over_allocated", "ok"]
    assert Payment.objects.get(pk=payment_id).unallocated_amount == D("430.00")


@pytest.mark.concurrency
@pytest.mark.django_db(transaction=True)
def test_an_application_racing_a_void_neither_deadlocks_nor_corrupts(
    shop: Any, owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """T-PLT-X03-6 — both paths take the party first, so they serialise: either the void wins and
    the application is `payment_already_void`, or the application lands and the void releases it."""
    from apps.payments.services.allocate import allocate_existing
    from apps.payments.services.void import void_payment

    party = make_party(name="Race Void")
    payment_id = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00")).json()[
        "data"
    ]["id"]
    doc = invoice_for(party, "500.00")
    outcomes = _run_together(
        lambda: allocate_existing(
            ctx=Ctx.system(shop),
            payment_id=payment_id,
            allocations=[
                {"document_type": "sales_document", "document_id": doc["id"], "amount": "500.00"}
            ],
        ),
        lambda: void_payment(ctx=Ctx.system(shop), payment_id=payment_id, reason="Wrong receipt"),
    )
    assert outcomes[1] == "ok"
    assert outcomes[0] in ("ok", "BusinessRuleViolation:payment_already_void")
    assert SalesDocument.objects.get(pk=doc["id"]).status == "issued"
    assert not Allocation.objects.filter(payment_id=payment_id).exists()


def test_an_archived_partys_advance_can_still_be_applied(
    owner: Any, advance: dict, invoice_for: Any
) -> None:
    """EC-4 — moving money already received harms no one, as a void of it does not (PAY-05 EC-5):
    an archived party's advance may still settle a bill raised before the archive."""
    from apps.parties.models import Party

    invoice = invoice_for(advance["party"], "500.00")
    Party.all_objects.filter(pk=advance["party"].pk).update(status="archived")
    response = allocate(owner, advance["payment_id"], rows(invoice, "500.00"))
    assert response.status_code == 200, response.json()


def test_an_earmarked_advance_is_applied_by_an_explicit_request(
    shop: Any, owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """R61 — an earmark keeps a payment away from every AUTOMATIC use; an explicit allocation is
    exactly what it waits for (hospitality check-out applies the booking's advance)."""
    from apps.payments.services.record import record_payment

    party = make_party(name="Earmarked Stay")
    payment = record_payment(
        ctx=Ctx.system(shop),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": cash_lines("1000.00"),
            "allocations": "auto",
            "meta": {
                "earmark": {
                    "module": "hospitality",
                    "subject_type": "hospitality_stay",
                    "subject_id": str(uuid.uuid4()),
                }
            },
        },
    )["payment"]
    invoice = invoice_for(party, "1000.00")
    response = allocate(owner, payment.id, rows(invoice, "1000.00"))
    assert response.status_code == 200, response.json()
    assert SalesDocument.objects.get(pk=invoice["id"]).status == "paid"
