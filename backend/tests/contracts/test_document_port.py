"""T-PLT-X05-4, -5, -10 — the contract every origin listener is held to (contracts §1.5, R55).

Sales calls an origin's listener from inside its own transactions: `check_void` before a void of
a document with an origin, `on_void` last inside it, and `on_settlement_changed` whenever the
document's `amount_due` or `status` moves. These clauses are run against the fake origin in
`apps/sales/tests/conftest.py`; a module that registers a real origin type must add a factory
below (`test_every_registered_origin_is_under_contract`) so its listener is held to the same
clauses rather than to whatever its own tests remembered.
"""

from __future__ import annotations

import threading
import uuid
from decimal import Decimal
from typing import Any

import pytest
from django.db import close_old_connections, connection
from django.urls import reverse

from apps.common.seams import documents as port
from apps.sales.tests.conftest import PORT_ORIGIN, credit_note_url, invoice_url, port_request

pytestmark = pytest.mark.django_db

#: origin type → the module test that proves its listener keeps these clauses. Empty until a
#: module (dues, gym, hospitality) registers a real origin; the fake below stands in.
FACTORIES: dict[str, str] = {}


def test_every_registered_origin_is_under_contract() -> None:
    """A real origin registered at start-up without a line in FACTORIES fails here, so a new
    listener cannot land without the contract noticing it."""
    missing = sorted(set(port.registered_origins()) - set(FACTORIES))
    assert missing == [], f"origin types with no contract factory: {missing}"


def _issue(ctx: Any, party: Any, **extra: Any) -> Any:
    from apps.sales.models import SalesDocument

    result = port.issue_document(ctx=ctx, request=port_request(party, **extra))
    return SalesDocument.objects.get(pk=result["document_id"])


def _void(client: Any, document: Any, **body: Any) -> Any:
    body.setdefault("reason", "Billed the wrong member")
    return client.post(invoice_url(document.id, "void"), body, format="json")


def _pay(client: Any, party: Any, document: Any, amount: str) -> Any:
    return client.post(
        reverse("v1:payment-list"),
        {
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": amount}],
            "allocations": [
                {
                    "document_type": "sales_document",
                    "document_id": str(document.id),
                    "amount": amount,
                }
            ],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )


# ── T-PLT-X05-4: the void ────────────────────────────────────────────────────


def test_on_void_is_called_once_inside_the_transaction(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """The module hears of the void in the same transaction (BR-5), once, with the document's
    summary and the merchant's reason."""
    document = _issue(port_ctx, make_party())
    response = _void(owner, document)
    assert response.status_code == 200, response.json()
    [call] = fake_origin.of("void")
    _kind, origin_id, summary, reason, in_atomic = call
    assert origin_id == str(document.origin_id)
    assert summary["document_id"] == document.id and summary["status"] == "void"
    assert reason == "Billed the wrong member"
    assert in_atomic is True


def test_a_raising_listener_rolls_the_void_back(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """A listener that raises must leave the invoice issued and the khata untouched: a void that
    committed while the membership stayed active would bill and un-bill the member at once."""
    from apps.ledger.models import LedgerEntry

    party = make_party()
    document = _issue(port_ctx, party)
    entries = LedgerEntry.objects.filter(tenant=port_ctx.tenant).count()
    fake_origin.raise_on_void = True
    assert _void(owner, document).status_code == 500
    document.refresh_from_db()
    party.refresh_from_db()
    assert document.status == "issued"
    assert LedgerEntry.objects.filter(tenant=port_ctx.tenant).count() == entries
    assert party.balance == Decimal("2950.00")


def test_a_block_refuses_the_void_with_the_modules_reason(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """R55 — `check_void` → `block`: 409 `document_origin_locked {origin_type, reason}`, and the
    reason is the module's own words, which the void dialog shows in place."""
    document = _issue(port_ctx, make_party())
    fake_origin.block = "End the membership first"
    response = _void(owner, document)
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "document_origin_locked"
    assert error["details"] == {"origin_type": PORT_ORIGIN, "reason": "End the membership first"}
    document.refresh_from_db()
    assert document.status == "issued"
    assert fake_origin.of("void") == []


def test_a_confirm_asks_first_and_voids_once_confirmed(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """R55 — `check_void` → `confirm`: 409 `document_origin_confirm {origin_type, message}`
    until the request carries `confirm_origin: true`; then the void goes through and cascades."""
    document = _issue(port_ctx, make_party())
    fake_origin.confirm = "This also ends membership M-0042. Continue?"
    asked = _void(owner, document)
    assert asked.status_code == 409
    assert asked.json()["error"]["code"] == "document_origin_confirm"
    assert asked.json()["error"]["details"] == {
        "origin_type": PORT_ORIGIN,
        "message": "This also ends membership M-0042. Continue?",
    }
    done = _void(owner, document, confirm_origin=True)
    assert done.status_code == 200, done.json()
    assert len(fake_origin.of("void")) == 1


def test_a_block_wins_over_confirm_origin(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """`confirm_origin` answers a question; it does not lift a refusal."""
    document = _issue(port_ctx, make_party())
    fake_origin.block = "End the membership first"
    fake_origin.confirm = "Sure?"
    response = _void(owner, document, confirm_origin=True)
    assert response.json()["error"]["code"] == "document_origin_locked"


def test_an_unregistered_origin_lets_the_void_proceed_and_says_so(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any, caplog: Any
) -> None:
    """EC-4 — a module removed in code leaves documents nobody listens for: the merchant can
    still void them (a warning is logged), and nothing is called."""
    from apps.sales.models import SalesDocument

    document = _issue(port_ctx, make_party())
    SalesDocument.objects.filter(pk=document.pk).update(origin_type="removed_module_thing")
    with caplog.at_level("WARNING"):
        response = _void(owner, document)
    assert response.status_code == 200, response.json()
    assert "document_origin_unregistered" in caplog.text
    assert fake_origin.calls == []


def test_a_module_credit_note_asks_its_origin_before_its_void(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """R58 — `void_credit_note` calls the listener exactly as `void_invoice` does: the
    pro-rata credit of a membership cannot be undone behind the membership's back."""
    invoice = _issue(port_ctx, make_party())
    [invoice_line] = list(invoice.lines.all())
    note = port.issue_credit_note(
        ctx=port_ctx,
        against_id=invoice.id,
        origin_type=PORT_ORIGIN,
        origin_id=invoice.origin_id,
        lines=[{"against_line_id": invoice_line.id, "taxable_value": Decimal("500.00")}],
        settlement="hold_advance",
        reason="Pro-rata credit",
    )
    url = credit_note_url(note["document_id"], "void")
    fake_origin.block = "Re-open the membership first"
    blocked = owner.post(url, {"reason": "Wrong credit"}, format="json")
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "document_origin_locked"

    fake_origin.block = None
    fake_origin.calls.clear()
    done = owner.post(url, {"reason": "Wrong credit"}, format="json")
    assert done.status_code == 200, done.json()
    voids = fake_origin.of("void")
    assert [str(call[2]["document_id"]) for call in voids] == [str(note["document_id"])]
    # The note's credit came off the invoice: the invoice's origin hears its due grow back.
    [settled] = fake_origin.of("settlement")
    assert settled[2]["amount_due"] == Decimal("2950.00")


# ── T-PLT-X05-5: the settlement ──────────────────────────────────────────────


def test_on_settlement_changed_follows_every_move_of_the_due(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """After a payment, the payment's void, an advance applied later (`allocate_existing`) and
    a credit application, the origin is told the new `amount_due` and status each time — the
    gym's due becomes `paid` when the invoice does."""
    from apps.payments.services.allocate import allocate_existing
    from apps.payments.tests.conftest import cash_lines, pay

    party = make_party()
    document = _issue(port_ctx, party)
    fake_origin.calls.clear()

    paid = _pay(owner, party, document, "950.00")
    assert paid.status_code == 201, paid.json()
    assert [c[2]["amount_due"] for c in fake_origin.of("settlement")] == [Decimal("2000.00")]

    voided = owner.post(
        reverse("v1:payment-detail", args=[paid.json()["data"]["id"]]) + "/void",
        {"reason": "Bounced"},
        format="json",
    )
    assert voided.status_code == 200, voided.json()
    assert fake_origin.of("settlement")[-1][2]["amount_due"] == Decimal("2950.00")

    advance = pay(
        owner, party_id=str(party.id), mode_breakup=cash_lines("2950.00"), allocations="none"
    )
    assert advance.status_code == 201, advance.json()
    allocate_existing(
        ctx=port_ctx,
        payment_id=advance.json()["data"]["id"],
        allocations=[
            {
                "document_type": "sales_document",
                "document_id": str(document.id),
                "amount": "2950.00",
            }
        ],
    )
    last = fake_origin.of("settlement")[-1][2]
    assert (last["amount_due"], last["status"]) == (Decimal("0.00"), "paid")
    assert all(call[3] for call in fake_origin.of("settlement"))  # inside the transaction


def test_a_credit_application_is_a_settlement_change(
    owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """EC-1 — a module invoice credit-noted in part: the origin hears the smaller due."""
    invoice = _issue(port_ctx, make_party())
    [invoice_line] = list(invoice.lines.all())
    fake_origin.calls.clear()
    port.issue_credit_note(
        ctx=port_ctx,
        against_id=invoice.id,
        origin_type=PORT_ORIGIN,
        origin_id=invoice.origin_id,
        lines=[{"against_line_id": invoice_line.id, "taxable_value": Decimal("500.00")}],
        settlement="hold_advance",
        reason="Pro-rata credit",
    )
    [call] = fake_origin.of("settlement")
    assert call[1] == str(invoice.origin_id)
    assert call[2]["amount_due"] == Decimal("2360.00")


def test_no_call_when_neither_the_due_nor_the_status_moved(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """A refresh that changes nothing tells nobody: a module that re-derives its own state on
    each call should not be woken by a no-op."""
    from apps.sales.services.amounts import refresh_invoice_amounts

    document = _issue(port_ctx, make_party())
    fake_origin.calls.clear()
    refresh_invoice_amounts(document, ctx=port_ctx)
    assert fake_origin.of("settlement") == []


def test_a_document_with_an_origin_and_no_ctx_refuses_to_refresh(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """Every writer must hand its `ctx` on (R1): a refresh without one would move the invoice
    and leave the module's due wrong, silently. It fails loudly instead."""
    from apps.sales.services.amounts import refresh_invoice_amounts

    document = _issue(port_ctx, make_party())
    document.amount_paid = Decimal("100.00")
    with pytest.raises(RuntimeError, match="needs the caller's ctx"):
        refresh_invoice_amounts(document)


# ── T-PLT-X05-10: a void racing a payment ────────────────────────────────────


@pytest.mark.django_db(transaction=True)
def test_a_void_racing_a_payment_serialises_on_the_party(
    shop: Any, owner: Any, port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """Void takes party → invoice; a payment takes party → invoices. Both start at the party, so
    one waits for the other: no deadlock, and the listener sees one of the two orders whole —
    either the payment settled and was then released by the void, or the void won and the
    payment was refused because the invoice was no longer open."""
    party = make_party()
    document = _issue(port_ctx, party)
    fake_origin.calls.clear()
    barrier = threading.Barrier(2)
    results: dict[str, Any] = {}

    def run(name: str, call: Any) -> None:
        try:
            barrier.wait(timeout=10)
            results[name] = call()
        except Exception as exc:  # pragma: no cover - reported below
            results[name] = exc
        finally:
            close_old_connections()
            connection.close()

    from apps.payments.services.record import record_payment
    from apps.sales.services.void import void_invoice

    def void_it() -> str:
        void_invoice(ctx=port_ctx, document_id=document.id, reason="Billed the wrong member")
        return "ok"

    def pay_it() -> str:
        record_payment(
            ctx=port_ctx,
            payload={
                "direction": "in",
                "party_id": str(party.id),
                "mode_breakup": [{"mode": "cash", "amount": "500.00"}],
                "allocations": [
                    {
                        "document_type": "sales_document",
                        "document_id": str(document.id),
                        "amount": "500.00",
                    }
                ],
            },
        )
        return "ok"

    threads = [
        threading.Thread(target=run, args=("void", void_it)),
        threading.Thread(target=run, args=("pay", pay_it)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)
    assert results["void"] == "ok", results["void"]
    kinds = [call[0] for call in fake_origin.calls]
    if results["pay"] == "ok":
        assert kinds == ["settlement", "void"]
    else:
        assert getattr(results["pay"], "code", None) == "document_not_open", results["pay"]
        assert kinds == ["void"]
