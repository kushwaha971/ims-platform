"""A4a / PLT-X03 — target protocol v2, one bucket per payment, global auto FIFO, earmarks.

Contracts §1.4 (R5, R6, R7, R30, R61). Every test names the defect it prevents. The existing
payments, sales and purchases suites are the proof that a shop's payments behave exactly as they
did; these pin the new rules.
"""

from __future__ import annotations

import ast
import datetime as dt
import pathlib
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured

from apps.ledger.constants import SourceType
from apps.ledger.models import LedgerEntry
from apps.payments.models import Payment
from apps.payments.services import targets
from apps.payments.services.targets import register_target, target_for, targets_for_direction
from apps.payments.tests.conftest import cash_lines, pay
from apps.sales.services.payment_target import SalesInvoiceTarget

pytestmark = pytest.mark.django_db

PAYMENTS_ROOT = pathlib.Path(__file__).resolve().parents[1]


@pytest.fixture
def clean_targets() -> Any:
    """Restore the start-up registrations around a test that registers a fake target."""
    targets._reset_for_tests()
    yield
    targets._reset_for_tests()


class LoanOverInvoices(SalesInvoiceTarget):
    """A test-only `loan`-bucket target, explicit only, over real invoices so it can be locked."""

    document_type = "test_loan_invoice"
    bucket = "loan"
    auto = False


class NeverAutoTarget:
    """An `auto=False` target that fails the test if FIFO so much as asks for its documents."""

    document_type = "test_never_auto"
    direction = "in"
    bucket = "main"
    auto = False

    def lock_open_for_party(self, **_: Any) -> list:
        raise AssertionError("auto allocation reached an auto=False target")

    open_documents = lock_open_for_party


# ── The protocol and the registry ────────────────────────────────────────────


def test_the_two_shop_targets_declare_the_main_bucket_and_auto() -> None:
    """R5/R6 — the shop's invoice and bill are `main` and FIFO may choose them, as it always has."""
    for document_type in ("sales_document", "purchase_document"):
        target = target_for(document_type)
        assert (target.bucket, target.auto) == ("main", True)


@pytest.mark.parametrize(
    "attrs",
    [
        {"document_type": "x" * 33},
        {"bucket": "rent"},
        {"direction": "sideways"},
    ],
    ids=["too-long", "bad-bucket", "bad-direction"],
)
def test_register_target_refuses_a_malformed_target(attrs: dict, clean_targets: Any) -> None:
    """R7 — `payments_allocation.document_type` is `varchar(32)`: a longer name would register and
    then fail at the first allocation insert. A bucket or direction outside the vocabulary is a
    typo that would otherwise send money to the wrong balance."""
    fake = SimpleNamespace(document_type="test_ok", direction="in", bucket="main", auto=True)
    for key, value in attrs.items():
        setattr(fake, key, value)
    with pytest.raises(ImproperlyConfigured):
        register_target(fake)


def test_register_target_is_idempotent_and_refuses_a_different_shape(clean_targets: Any) -> None:
    """ADR-042 — a second `ready()` is harmless; a second owner disagreeing about a document type's
    direction, bucket or `auto` is a start-up error, not whichever imported last."""
    register_target(SalesInvoiceTarget())
    assert target_for("sales_document").auto is True
    changed = SalesInvoiceTarget()
    changed.auto = False
    with pytest.raises(ImproperlyConfigured):
        register_target(changed)


def test_targets_for_direction_can_ask_for_auto_targets_only(clean_targets: Any) -> None:
    """R6 — `"auto"` walks only `auto=True` targets, in registration order."""
    register_target(NeverAutoTarget())
    every = [t.document_type for t in targets_for_direction("in")]
    auto = [t.document_type for t in targets_for_direction("in", auto_only=True)]
    assert every == ["sales_document", "test_never_auto"]
    assert auto == ["sales_document"]


def test_every_caller_hands_the_target_its_ctx_and_payment() -> None:
    """R1 — `apply`/`unapply` take the caller's `ctx` (None is for job handlers only, and payments
    has none) and the `payment_id`. A caller that drops them leaves a document listener with an
    unattributed audit row and no way to know which payment moved it."""
    missing: list[str] = []
    for path in (PAYMENTS_ROOT / "services").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in ("apply", "unapply")
            ):
                keywords = {kw.arg for kw in node.keywords}
                if not {"ctx", "payment_id"} <= keywords:
                    missing.append(f"{path.name}:{node.lineno}")
    assert missing == []


# ── One bucket per payment (R5) ──────────────────────────────────────────────


def test_a_shop_payment_is_main_and_its_ledger_line_agrees(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """R5 reconciliation — `payments_payment.bucket` is written once and equals the bucket of the
    payment's own khata line; a shop payment, allocated or not, is `main`."""
    party = make_party(name="Main Traders")
    invoice_for(party, "500.00")
    allocated = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("300.00"))
    advance = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("900.00"))
    assert allocated.status_code == advance.status_code == 201
    for payment in Payment.objects.filter(party=party):
        line = LedgerEntry.objects.get(source_type=SourceType.PAYMENT, source_id=payment.id)
        assert payment.bucket == line.bucket == "main"


def test_a_payment_settling_a_loan_target_posts_in_the_loan_bucket(
    owner: Any, make_party: Any, invoice_for: Any, clean_targets: Any
) -> None:
    """ADR-043 — the payment's one line lands in the bucket of what it settles, so the loan cache
    moves with it (and the column says so)."""
    register_target(LoanOverInvoices())
    party = make_party(name="Loan Traders")
    doc = invoice_for(party, "800.00")
    response = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("800.00"),
        allocations=[
            {"document_type": "test_loan_invoice", "document_id": doc["id"], "amount": "800.00"}
        ],
    )
    assert response.status_code == 201, response.json()
    payment = Payment.objects.get(pk=response.json()["data"]["id"])
    line = LedgerEntry.objects.get(source_type=SourceType.PAYMENT, source_id=payment.id)
    assert payment.bucket == line.bucket == "loan"
    party.refresh_from_db()
    assert party.loan_balance == Decimal("-800.00")


def test_a_payment_naming_two_buckets_is_refused_and_writes_nothing(
    owner: Any, make_party: Any, invoice_for: Any, clean_targets: Any
) -> None:
    """T-PLT-X03-2 — "One payment settles one kind of balance": refused before a payment row, a
    ledger line or a receipt number exists (the RCT series never gaps)."""
    from apps.platform_app.models import DocumentSequence

    register_target(LoanOverInvoices())
    party = make_party(name="Mixed Traders")
    shop_bill = invoice_for(party, "500.00")
    loan_bill = invoice_for(party, "400.00")
    before = list(DocumentSequence.objects.filter(tenant=party.tenant).values_list("next_number"))
    response = pay(
        owner,
        party_id=str(party.id),
        mode_breakup=cash_lines("900.00"),
        allocations=[
            {"document_type": "sales_document", "document_id": shop_bill["id"], "amount": "500.00"},
            {
                "document_type": "test_loan_invoice",
                "document_id": loan_bill["id"],
                "amount": "400.00",
            },
        ],
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["allocations"] == [
        "One payment settles one kind of balance."
    ]
    assert Payment.objects.filter(party=party).count() == 0
    after = list(DocumentSequence.objects.filter(tenant=party.tenant).values_list("next_number"))
    assert after == before


def test_auto_never_asks_an_explicit_only_target(
    owner: Any, make_party: Any, invoice_for: Any, clean_targets: Any
) -> None:
    """T-PLT-X03-4 — `lending_loan`, `dues_instalment` and the deposit targets are `auto=False`:
    a customer's ordinary payment must never be applied to a loan disbursal or a deposit by FIFO
    (the `test_supplier_fifo_never_touches_*` pattern)."""
    register_target(NeverAutoTarget())
    party = make_party(name="Fifo Traders")
    invoice_for(party, "500.00")
    response = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00"))
    assert response.status_code == 201, response.json()


# ── Global oldest-first (R6) ─────────────────────────────────────────────────


def _doc(day: int, number: str, pk: str) -> Any:
    return SimpleNamespace(document_date=dt.date(2026, 4, day), number=number, id=pk)


def test_auto_merges_every_target_oldest_first_and_keeps_each_targets_own_order() -> None:
    """R6 — with several auto targets, the older document is settled first whichever target it
    belongs to (registration order used to decide: a later invoice paid before an older fee).
    Within one target its own FIFO stands, so PUR-02's due-date order for a supplier's bills is
    exactly what it was."""
    from apps.payments.services.record import merge_oldest_first

    invoices = SimpleNamespace(document_type="sales_document")
    fees = SimpleNamespace(document_type="library_charge")
    a = [(invoices, _doc(10, "INV/2", "b")), (invoices, _doc(20, "INV/3", "c"))]
    b = [(fees, _doc(5, "FIN/1", "a")), (fees, _doc(15, "FIN/2", "d"))]
    merged = merge_oldest_first([a, b])
    assert [doc.number for _t, doc in merged] == ["FIN/1", "INV/2", "FIN/2", "INV/3"]

    # One target: its order is returned untouched, even when it is not by document date.
    by_due = [(invoices, _doc(20, "BILL/9", "x")), (invoices, _doc(1, "BILL/1", "y"))]
    assert [doc.number for _t, doc in merge_oldest_first([by_due])] == ["BILL/9", "BILL/1"]


# ── Earmarks (R61) ───────────────────────────────────────────────────────────


def test_an_earmarked_payment_is_not_applied_by_auto(
    shop: Any, make_party: Any, invoice_for: Any
) -> None:
    """R61 — a hotel's booking advance is earmarked for that stay. Recorded with `"auto"` it must
    stay unallocated, or the next counter invoice would silently eat the guest's advance."""
    from apps.common.context import Ctx
    from apps.payments.services.record import record_payment

    party = make_party(name="Earmark Traders")
    invoice_for(party, "500.00")
    result = record_payment(
        ctx=Ctx.system(shop),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": cash_lines("500.00"),
            "allocations": "auto",
            "meta": {
                "earmark": {
                    "module": "hospitality",
                    "subject_type": "hospitality_stay",
                    "subject_id": "01920000-0000-7000-8000-000000000001",
                }
            },
        },
    )
    payment = result["payment"]
    assert payment.allocations.count() == 0
    assert payment.unallocated_amount == Decimal("500.00")


def test_a_malformed_earmark_is_refused(shop: Any, make_party: Any) -> None:
    """An earmark is `{module, subject_type, subject_id}`; half of one would hide a payment from
    every automatic use while naming nothing it is reserved for."""
    from apps.common.context import Ctx
    from apps.common.exceptions import ValidationFailed
    from apps.payments.services.record import record_payment

    party = make_party(name="Bad Earmark")
    with pytest.raises(ValidationFailed):
        record_payment(
            ctx=Ctx.system(shop),
            payload={
                "direction": "in",
                "party_id": str(party.id),
                "mode_breakup": cash_lines("100.00"),
                "allocations": "none",
                "meta": {"earmark": {"module": "hospitality"}},
            },
        )


def test_open_advances_lists_only_free_main_money_oldest_first(
    shop: Any, owner: Any, make_party: Any
) -> None:
    """The advances the document port and the dues run may apply on their own: recorded, money
    left, `main`, not earmarked, not a credit note's refund voucher — oldest payment first."""
    from apps.common.context import Ctx
    from apps.payments.selectors.payments import open_advances
    from apps.payments.services.record import record_payment
    from apps.payments.tests.conftest import void

    party = make_party(name="Advance Traders")
    first = pay(
        owner, party_id=str(party.id), mode_breakup=cash_lines("100.00"), payment_date="2026-04-01"
    )
    second = pay(
        owner, party_id=str(party.id), mode_breakup=cash_lines("200.00"), payment_date="2026-04-05"
    )
    voided = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("300.00"))
    void(owner, voided.json()["data"]["id"])
    record_payment(
        ctx=Ctx.system(shop),
        payload={
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": cash_lines("400.00"),
            "allocations": "none",
            "meta": {
                "earmark": {
                    "module": "hospitality",
                    "subject_type": "hospitality_stay",
                    "subject_id": "01920000-0000-7000-8000-000000000002",
                }
            },
        },
    )
    rows = list(open_advances(tenant=shop, party_id=party.id))
    assert [str(p.id) for p in rows] == [first.json()["data"]["id"], second.json()["data"]["id"]]


def test_the_payment_list_filters_the_open_advances_by_bucket(
    owner: Any, make_party: Any, invoice_for: Any
) -> None:
    """PLT-X03 §11 — "Advances" is a filter on the existing list: `?unallocated=true&bucket=main`
    returns the recorded payments with money not yet applied, and nothing fully applied or void."""
    from django.urls import reverse

    party = make_party(name="Filter Traders")
    invoice_for(party, "500.00")
    applied = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("500.00"))
    advance = pay(owner, party_id=str(party.id), mode_breakup=cash_lines("700.00"))
    url = reverse("v1:payment-list")
    rows = owner.get(f"{url}?unallocated=true&bucket=main").json()["data"]
    ids = {row["id"] for row in rows}
    assert advance.json()["data"]["id"] in ids
    assert applied.json()["data"]["id"] not in ids
    assert owner.get(f"{url}?bucket=loan").json()["data"] == []
