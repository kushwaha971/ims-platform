"""A5 — the document port through the sales issuer (FRD 00 PLT-X05 §12, contracts §1.5).

A module (gym, hospitality, the dues engine) gets a real tax invoice by calling
`apps.common.seams.documents.issue_document`; sales issues it through its own pipeline —
numbering, Rule 46, the tax engine, the ledger debit — and stamps the origin on it. These tests
drive the port with a fake origin (`conftest.FakeOrigin`), exactly as a module would.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

import pytest

from apps.common.seams import documents as port
from apps.sales.tests.conftest import (
    PORT_ORIGIN,
    cash,
    issued_invoice,
    line,
    membership_line,
    money,
    port_request,
)

pytestmark = pytest.mark.django_db


def _document(result: dict) -> Any:
    from apps.sales.models import SalesDocument

    return SalesDocument.objects.get(pk=result["document_id"])


def _advance(owner: Any, party: Any, amount: str) -> Any:
    from apps.payments.models import Payment
    from apps.payments.tests.conftest import cash_lines, pay

    response = pay(owner, party_id=str(party.id), mode_breakup=cash_lines(amount))
    assert response.status_code == 201, response.json()
    return Payment.objects.get(pk=response.json()["data"]["id"])


# ── T-PLT-X05-1 / -2: one issued document, the tenant's kind ─────────────────


def test_issue_through_the_port_is_one_issued_invoice_with_its_origin(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """T-PLT-X05-1 and the gym worked example: ₹2,500 at 18% intra-state is CGST ₹225 + SGST
    ₹225 = ₹2,950.00, one draft → issued document numbered from the sales series, the origin
    stamped, the khata debited. A module never sees a draft: the port creates and issues in one
    call."""
    from apps.ledger.models import LedgerEntry
    from apps.sales.models import SalesDocument

    party = make_party(name="Asha Gym Member")
    origin_id = uuid.uuid4()
    result = port.issue_document(ctx=port_ctx, request=port_request(party, origin_id=origin_id))

    assert SalesDocument.objects.filter(tenant=port_ctx.tenant).count() == 1
    document = _document(result)
    assert document.status == "issued"
    assert document.kind == result["kind"] == "invoice"
    assert (document.origin_module, document.origin_type, document.origin_id) == (
        "gym",
        PORT_ORIGIN,
        origin_id,
    )
    assert document.cgst_total == document.sgst_total == money("225.00")
    assert document.grand_total == result["grand_total"] == money("2950.00")
    assert result["amount_due"] == money("2950.00")
    assert result["number"] == document.number and document.number.startswith("INV")
    entry = LedgerEntry.objects.get(source_type="sales_document", source_id=document.id)
    assert str(entry.id) == str(result["ledger_entry_id"])
    assert entry.amount == money("2950.00")
    assert result["refund_payment"] is None
    lines = list(document.lines.all())
    assert [(ln.description, ln.hsn_sac, ln.tax_code, ln.unit_code) for ln in lines] == [
        ("Quarterly membership, 1 Oct – 31 Dec 2026", "999723", "GST18", "NOS")
    ]


@pytest.mark.parametrize(
    ("gst_type", "kind"), [("composition", "bill_of_supply"), ("unregistered", "invoice")]
)
def test_the_kind_is_the_tenants_and_never_an_estimate(
    port_ctx: Any, fake_origin: Any, make_party: Any, gst_type: str, kind: str
) -> None:
    """T-PLT-X05-2, BR-1 — the port never requests a kind: `kind_for(tenant, None)` decides, and
    a composition tenant's module fee is a bill of supply, tax-free."""
    tenant = port_ctx.tenant
    tenant.gst_type = gst_type
    if gst_type == "unregistered":
        tenant.gstin = None
    tenant.save()
    result = port.issue_document(ctx=port_ctx, request=port_request(make_party()))
    document = _document(result)
    assert document.kind == result["kind"] == kind
    assert document.grand_total == money("2500.00")  # tax-free (BR-12)


# ── T-PLT-X05-3: the credit check ────────────────────────────────────────────


def _over_limit_party(make_party: Any) -> Any:
    return make_party(name="Limit ₹2,000", credit_limit=Decimal("2000.00"))


@pytest.fixture
def blocking_limits(shop: Any) -> None:
    from apps.platform_app.models import TenantSetting

    TenantSetting.objects.update_or_create(
        tenant=shop, key="ledger.credit_limit_mode", defaults={"value": {"mode": "block"}}
    )


def test_skip_issues_over_the_limit_and_says_so(
    port_ctx: Any, fake_origin: Any, make_party: Any, blocking_limits: None
) -> None:
    """T-PLT-X05-3, BR-3, ADR-048 — an engine charge is owed whether or not the party is over
    their shop limit, so `credit_check="skip"` issues and returns the crossed limit as a warning
    (`{limit, balance_after, over_by}` of the worked example), never a 409."""
    party = _over_limit_party(make_party)
    result = port.issue_document(ctx=port_ctx, request=port_request(party))
    assert _document(result).status == "issued"
    [warning] = [w for w in result["warnings"] if w["code"] == "credit_limit_exceeded"]
    assert warning["details"] == {
        "limit": "2000.00",
        "balance_after": "2950.00",
        "over_by": "950.00",
    }


def test_enforce_refuses_over_the_limit_like_a_counter_sale(
    port_ctx: Any, fake_origin: Any, make_party: Any, blocking_limits: None
) -> None:
    """T-PLT-X05-3 — `"enforce"` is the counter's rule: 409, nothing written, no number used."""
    from apps.common.exceptions import BusinessRuleViolation
    from apps.sales.models import SalesDocument

    party = _over_limit_party(make_party)
    with pytest.raises(BusinessRuleViolation) as caught:
        port.issue_document(ctx=port_ctx, request=port_request(party, credit_check="enforce"))
    assert caught.value.code == "credit_limit_exceeded"
    assert not SalesDocument.objects.filter(tenant=port_ctx.tenant).exists()


def test_override_is_honoured_for_an_owner_and_refused_for_staff(
    port_ctx: Any, fake_origin: Any, make_party: Any, blocking_limits: None, api_as: Any
) -> None:
    """R62 — `override=True` with `"enforce"` is sales' own `may_override`: an owner goes past
    the limit, a staff member is told only an owner or admin can."""
    from apps.common.context import Ctx
    from apps.common.exceptions import BusinessRuleViolation

    party = _over_limit_party(make_party)
    done = port.issue_document(
        ctx=port_ctx, request=port_request(party, credit_check="enforce", override=True)
    )
    assert _document(done).status == "issued"

    _client, staff = api_as(port_ctx.tenant, role="staff")
    staff_ctx = Ctx(tenant=port_ctx.tenant, actor=staff.user, actor_type="user")
    with pytest.raises(BusinessRuleViolation) as caught:
        port.issue_document(
            ctx=staff_ctx,
            request=port_request(
                make_party(name="Other", credit_limit=Decimal("10.00")),
                credit_check="enforce",
                override=True,
            ),
        )
    assert caught.value.code == "override_not_allowed"


# ── BR-2, BR-6, BR-7, EC-5: the request's shape ──────────────────────────────


def test_a_second_issue_for_the_same_origin_returns_the_standing_document(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """T-PLT-X05-6, BR-6 — a retried "Start membership" must not bill the member twice: the
    port is idempotent by `(origin_type, origin_id)` for a document that is not void."""
    from apps.sales.models import SalesDocument

    party = make_party()
    request = port_request(party)
    first = port.issue_document(ctx=port_ctx, request=request)
    again = port.issue_document(ctx=port_ctx, request=dict(request))
    assert again["document_id"] == first["document_id"]
    assert again["existing"] is True
    assert SalesDocument.objects.filter(tenant=port_ctx.tenant).count() == 1


def test_after_a_void_the_same_origin_can_be_issued_again(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """BR-6 is about a document that stands: a voided one no longer answers for its origin."""
    party = make_party()
    request = port_request(party)
    first = port.issue_document(ctx=port_ctx, request=request)
    port.void_document(ctx=port_ctx, document_id=first["document_id"], reason="Billed wrong plan")
    second = port.issue_document(ctx=port_ctx, request=dict(request))
    assert second["document_id"] != first["document_id"]
    assert not second.get("existing")


def test_a_module_document_is_never_walk_in(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """BR-2 — a module's customer has a khata; `party_id` is required."""
    from apps.common.exceptions import ValidationFailed

    request = port_request(make_party())
    request.pop("party_id")
    with pytest.raises(ValidationFailed) as caught:
        port.issue_document(ctx=port_ctx, request=request)
    assert "party_id" in caught.value.details


def test_an_unregistered_origin_type_is_a_programming_error(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """The origin's module fills `origin_module`: a type nobody registered cannot be stamped,
    and a document nobody listens for could be voided without its module ever hearing."""
    with pytest.raises(ValueError, match="not a registered origin"):
        port.issue_document(
            ctx=port_ctx, request=port_request(make_party(), origin_type="nobody_home")
        )


def test_a_gst_rate_is_mapped_to_its_one_code(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """R2 — `gst_rate` is a convenience: 5% on the document date is GST5 (the hotel example's
    per-line rates), and the stored line carries the CODE."""
    lines = [
        membership_line(
            tax_code=None,
            gst_rate=Decimal("5"),
            unit_price=Decimal("3000.00"),
            qty=Decimal("2"),
            description="2 nights, Deluxe",
        ),
        membership_line(
            tax_code=None,
            gst_rate=Decimal("18"),
            unit_price=Decimal("8000.00"),
            description="1 night, Suite",
        ),
    ]
    result = port.issue_document(ctx=port_ctx, request=port_request(make_party(), lines=lines))
    document = _document(result)
    assert [ln.tax_code for ln in document.lines.order_by("line_no")] == ["GST5", "GST18"]
    assert document.grand_total == money("15740.00")


@pytest.mark.parametrize(
    ("rate", "message"),
    [
        ("0", "Several tax codes are 0%; send tax_code."),
        ("12", "No tax code for 12% on {date}."),
    ],
)
def test_a_rate_that_does_not_resolve_to_one_code_is_refused(
    port_ctx: Any, fake_origin: Any, make_party: Any, rate: str, message: str
) -> None:
    """T-PLT-X05-6, BR-7 — 0% is four codes and 12% ended in 2025: 400 on `lines.N.gst_rate`,
    and nothing is written."""
    from apps.common.exceptions import ValidationFailed
    from apps.sales.models import SalesDocument

    request = port_request(
        make_party(),
        lines=[membership_line(), membership_line(tax_code=None, gst_rate=Decimal(rate))],
    )
    with pytest.raises(ValidationFailed) as caught:
        port.issue_document(ctx=port_ctx, request=request)
    expected = message.format(date=request["document_date"].strftime("%d/%m/%Y"))
    assert caught.value.details == {"lines.1.gst_rate": [expected]}
    assert not SalesDocument.objects.filter(tenant=port_ctx.tenant).exists()


def test_an_item_with_inventory_off_is_refused(
    port_ctx: Any, fake_origin: Any, make_party: Any, make_item: Any
) -> None:
    """EC-5 — a gym without inventory describes its lines; an item id would name a row the
    tenant cannot see or stock it cannot move."""
    from apps.common.exceptions import ValidationFailed

    item = make_item()
    tenant = port_ctx.tenant
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "inventory"]
    tenant.save()
    request = port_request(make_party(), lines=[membership_line(item_id=item.id)])
    with pytest.raises(ValidationFailed) as caught:
        port.issue_document(ctx=port_ctx, request=request)
    assert caught.value.details == {
        "lines.0.item_id": ["Items are off; describe the line instead."]
    }


def test_place_of_supply_overrides_the_default(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """R60 — a hotel's supply is where the hotel is, whatever the guest's state: the port's
    `place_of_supply_state` wins over `default_pos`, and an out-of-state place is IGST."""
    party = make_party(state_code="27")
    result = port.issue_document(
        ctx=port_ctx, request=port_request(party, place_of_supply_state="29")
    )
    document = _document(result)
    assert document.place_of_supply_state == "29"
    assert document.is_inter_state is True
    assert document.igst_total == money("450.00")


def test_the_line_discount_and_notes_reach_the_document(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """`discount_amount` is the line's amount discount; `notes` and `meta_block` ride along."""
    request = port_request(
        make_party(),
        lines=[membership_line(discount_amount=Decimal("500.00"))],
        notes="Welcome to the gym",
        meta_block={"membership": {"plan": "Quarterly"}},
        due_on=dt.date(2026, 12, 31),
    )
    document = _document(port.issue_document(ctx=port_ctx, request=request))
    assert document.taxable_total == money("2000.00")
    assert document.notes == "Welcome to the gym"
    assert document.meta["origin_block"] == {"membership": {"plan": "Quarterly"}}
    assert document.due_on == dt.date(2026, 12, 31)


# ── T-PLT-X05-9: sales off ───────────────────────────────────────────────────


def test_sales_off_is_module_disabled_naming_sales(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """T-PLT-X05-9 — a module whose tenant switched sales off gets 403 `module_disabled` with
    `details.module = "sales"`, the code its own endpoint passes straight through."""
    from apps.common.exceptions import ModuleDisabled

    tenant = port_ctx.tenant
    tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "sales"]
    tenant.save()
    assert port.issuer_available(tenant) is False
    with pytest.raises(ModuleDisabled) as caught:
        port.issue_document(ctx=port_ctx, request=port_request(make_party()))
    assert caught.value.details == {"module": "sales"}


# ── Money already held: payment at issue, credit notes, advances ─────────────


def test_a_payment_taken_at_issue_settles_the_document(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """`payment` is sales' issue payment: the front desk takes the fee as the membership starts."""
    result = port.issue_document(
        ctx=port_ctx, request=port_request(make_party(), payment=cash("2950.00"))
    )
    assert result["status"] == "paid"
    assert result["amount_due"] == money("0.00")


def test_open_advances_are_applied_oldest_first_up_to_the_due(
    port_ctx: Any, fake_origin: Any, make_party: Any, owner: Any
) -> None:
    """T-PLT-X05-7 and the worked example: a ₹1,000 advance and `apply_open_advances` leave
    ₹1,950 due. Two advances are used oldest first, and only as far as the bill needs."""
    from apps.payments.models import Payment

    party = make_party()
    older = _advance(owner, party, "1000.00")
    newer = _advance(owner, party, "5000.00")
    Payment.objects.filter(pk=older.pk).update(payment_date=older.payment_date - dt.timedelta(1))
    result = port.issue_document(
        ctx=port_ctx, request=port_request(party, apply_open_advances=True)
    )
    older.refresh_from_db()
    newer.refresh_from_db()
    assert older.unallocated_amount == money("0.00")
    assert newer.unallocated_amount == money("3050.00")
    assert result["amount_due"] == money("0.00") and result["status"] == "paid"


def test_open_advances_never_take_a_loan_deposit_or_earmarked_payment(
    port_ctx: Any, fake_origin: Any, make_party: Any, owner: Any
) -> None:
    """T-PLT-X05-7, R61 — a loan repayment or a held deposit is not an advance for the shop, and
    a booking's earmarked advance waits for the stay it was paid for."""
    from apps.payments.models import Payment

    party = make_party()
    loan = _advance(owner, party, "700.00")
    deposit = _advance(owner, party, "800.00")
    earmarked = _advance(owner, party, "900.00")
    Payment.objects.filter(pk=loan.pk).update(bucket="loan")
    Payment.objects.filter(pk=deposit.pk).update(bucket="deposit")
    Payment.objects.filter(pk=earmarked.pk).update(
        meta={"earmark": {"module": "hospitality", "subject_type": "booking", "subject_id": "b1"}}
    )
    result = port.issue_document(
        ctx=port_ctx, request=port_request(party, apply_open_advances=True)
    )
    assert result["amount_due"] == money("2950.00")
    for payment in (loan, deposit, earmarked):
        payment.refresh_from_db()
        assert payment.unallocated_amount == payment.amount


def test_named_payments_are_applied_in_the_order_given_even_when_earmarked(
    port_ctx: Any, fake_origin: Any, make_party: Any, owner: Any
) -> None:
    """R61 — hospitality sends its booking's earmarked advances by id: those, in that order,
    and exactly as far as the folio needs."""
    from apps.payments.models import Payment

    party = make_party()
    first = _advance(owner, party, "2000.00")
    second = _advance(owner, party, "2000.00")
    Payment.objects.filter(pk=second.pk).update(
        meta={"earmark": {"module": "hospitality", "subject_type": "booking", "subject_id": "b1"}}
    )
    result = port.issue_document(
        ctx=port_ctx,
        request=port_request(party, apply_payment_ids=[second.id, first.id]),
    )
    first.refresh_from_db()
    second.refresh_from_db()
    assert second.unallocated_amount == money("0.00")
    assert first.unallocated_amount == money("1050.00")
    assert result["amount_due"] == money("0.00")


def test_a_named_payment_of_another_party_is_refused_before_anything_is_written(
    port_ctx: Any, fake_origin: Any, make_party: Any, owner: Any
) -> None:
    from apps.common.exceptions import ValidationFailed
    from apps.sales.models import SalesDocument

    stranger = _advance(owner, make_party(name="Someone Else"), "500.00")
    with pytest.raises(ValidationFailed) as caught:
        port.issue_document(
            ctx=port_ctx, request=port_request(make_party(), apply_payment_ids=[stranger.id])
        )
    assert "apply_payment_ids.0" in caught.value.details
    assert not SalesDocument.objects.filter(tenant=port_ctx.tenant, kind="invoice").exists()


def test_named_credit_notes_are_applied_first(
    port_ctx: Any, fake_origin: Any, make_party: Any, owner: Any, make_item: Any
) -> None:
    """R50 — an open credit note (a pro-rata credit from the old membership) is applied before
    any payment; explicit only, never automatic."""
    from django.urls import reverse

    from apps.sales.models import SalesCreditApplication, SalesDocument

    party = make_party()
    item = make_item(price="500.00", tax_code="GST0")
    old = issued_invoice(owner, party, [line(item)])
    owner.post(
        reverse("v1:payment-list"),
        {
            "direction": "in",
            "party_id": str(party.id),
            "mode_breakup": [{"mode": "cash", "amount": "500.00"}],
        },
        format="json",
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    from apps.sales.services.credit_note_issue import issue_credit_note
    from apps.sales.services.credit_notes import create_credit_note

    note_draft = create_credit_note(
        ctx=port_ctx,
        payload={
            "against_id": old["id"],
            "reason": "post_sale_discount",
            "lines": [{"against_line_id": old["lines"][0]["id"], "taxable_value": "300.00"}],
        },
    )["document"]
    issue_credit_note(ctx=port_ctx, document_id=note_draft.id)
    note = SalesDocument.objects.get(pk=note_draft.id)
    assert note.amount_due == money("300.00")  # the old bill was paid: all of it is open

    result = port.issue_document(
        ctx=port_ctx, request=port_request(party, apply_credit_note_ids=[note.id])
    )
    note.refresh_from_db()
    assert note.amount_due == money("0.00") and note.status == "applied"
    assert SalesCreditApplication.objects.get(credit_note=note).amount == money("300.00")
    assert result["amount_due"] == money("2650.00")


# ── The credit note and the void through the port ────────────────────────────


def test_a_module_credit_note_credits_by_value_and_names_its_refund(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """R51, R52 — a pro-rata refund on leaving: a VALUE credit of the membership line, tax
    copied, refunded in cash, and the refund voucher named in the result."""
    party = make_party()
    issued = port.issue_document(ctx=port_ctx, request=port_request(party, payment=cash("2950.00")))
    invoice = _document(issued)
    [invoice_line] = list(invoice.lines.all())
    note = port.issue_credit_note(
        ctx=port_ctx,
        against_id=invoice.id,
        origin_type=PORT_ORIGIN,
        origin_id=invoice.origin_id,
        lines=[{"against_line_id": invoice_line.id, "taxable_value": Decimal("1000.00")}],
        settlement="refund",
        reason="Left after one month",
    )
    document = _document(note)
    assert document.kind == "credit_note"
    assert document.grand_total == money("1180.00")
    assert (document.origin_type, document.origin_id) == (PORT_ORIGIN, invoice.origin_id)
    assert document.meta["reason"] == {"code": "other", "note": "Left after one month"}
    assert note["refund_payment"]["amount"] == money("1180.00")
    assert note["refund_payment"]["number"]
    invoice_line.refresh_from_db()
    assert invoice_line.returned_qty == 0  # a value credit returns nothing


def test_a_void_through_the_port_does_not_call_the_module_back(
    port_ctx: Any, fake_origin: Any, make_party: Any
) -> None:
    """The module asked for the void (a reversed dues adjustment, R45): its own `check_void`
    could only refuse itself, and an `on_void` would tell it what it already knows."""
    fake_origin.block = "End the membership first"
    result = port.issue_document(ctx=port_ctx, request=port_request(make_party()))
    voided = port.void_document(
        ctx=port_ctx, document_id=result["document_id"], reason="Plan reversed"
    )
    assert voided["document"]["status"] == "void"
    assert fake_origin.of("void") == []


def test_summaries_are_one_read_for_many_documents(
    port_ctx: Any, fake_origin: Any, make_party: Any, django_assert_max_num_queries: Any
) -> None:
    """`document_summaries(tenant, ids)` → `{id: IssuedDocument}` — the dues run reads a
    page of documents in one go, not one query per due."""
    party = make_party()
    ids = {
        port.issue_document(ctx=port_ctx, request=port_request(party))["document_id"]
        for _ in range(3)
    }
    with django_assert_max_num_queries(2):
        summaries = port.document_summaries(tenant=port_ctx.tenant, ids=ids)
    assert set(summaries) == ids
    assert {s["grand_total"] for s in summaries.values()} == {money("2950.00")}
    assert all(s["ledger_entry_id"] for s in summaries.values())
