"""A15 — value credit lines (R51, ADR-057; contracts §1.5).

A credit-note line may credit an exact TAXABLE VALUE of an invoice line instead
of a quantity of it: tax copied from the invoice line, the credited value capped
so Σ credits (value lines, plus quantity lines at their value) never exceed the
line's taxable value, and neither `returned_qty` nor stock moving.

The defects this prevents, each of which quantity pricing cannot avoid:

* gym.md's upgrade credits 77/92 of a ₹4,000.00 membership. By quantity that is
  0.837 of a unit and ₹3,515.40 on the customer's credit note; the exact credit
  is ₹3,515.22 (taxable ₹3,347.83, CGST ₹83.70, SGST ₹83.69). A customer checks
  the paise.
* a service credit "returns" nothing, yet a quantity return moves `returned_qty`
  (so the line looks half-returned) and may restock goods that never came back.
* two credits against one line, one by value and one by quantity, together
  credit more than was ever invoiced — unless the cap counts both in one unit.

These are service-level tests: the value mode is the document port's
(`issue_credit_note`, A5), and the counter's HTTP credit note stays
quantity-only, which the last test holds.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest
from django.urls import reverse

from apps.common.context import Ctx
from apps.common.exceptions import ValidationFailed
from apps.inventory.models import ItemStock, StockMovement
from apps.reports.selectors import gst as gst_selectors
from apps.sales.constants import CreditMode
from apps.sales.models import SalesDocument, SalesDocumentLine
from apps.sales.services.credit_note_apply import void_credit_note
from apps.sales.services.credit_note_issue import issue_credit_note
from apps.sales.services.credit_notes import create_credit_note, update_credit_note
from apps.sales.tests.conftest import CREDIT_NOTES, issued_invoice, line

pytestmark = pytest.mark.django_db


@pytest.fixture
def membership(make_item: Any) -> Any:
    """gym.md's Quarterly plan: ₹4,200.00 including 5% GST = taxable ₹4,000.00."""
    return make_item(
        "Quarterly membership",
        "4200.00",
        "GST5",
        stock=None,
        inclusive=True,
        hsn_sac="999723",
        item_type="service",
        track_stock=False,
    )


@pytest.fixture
def ctx(shop: Any) -> Ctx:
    return Ctx.system(shop)


def _value_note(ctx: Ctx, invoice: dict, value: str, index: int = 0, **extra: Any) -> SalesDocument:
    payload = {
        "against_id": invoice["id"],
        "reason": "other",
        "lines": [{"against_line_id": invoice["lines"][index]["id"], "taxable_value": value}],
        **extra,
    }
    return create_credit_note(ctx=ctx, payload=payload)["document"]


def _issue(ctx: Ctx, note: SalesDocument) -> dict:
    return issue_credit_note(ctx=ctx, document_id=note.id)


# ── The worked example, to the paisa ─────────────────────────────────────────


def test_the_gym_upgrade_credit_is_exact_to_the_paisa(
    ctx: Ctx, owner: Any, membership: Any, make_party: Any
) -> None:
    """gym.md GYM-11 worked example: 4,000.00 × 77 ÷ 92 = 3,347.83 taxable;
    GST 5% = 167.39, CGST 83.70 + SGST 83.69 (the engine's split); 3,515.22
    before round-off, 3,515.00 with the invoice's round-off (BR-10)."""
    invoice = issued_invoice(owner, make_party(), [line(membership, "1")])
    assert invoice["taxable_total"] == "4000.00"
    credit = (Decimal("4000.00") * 77 / 92).quantize(Decimal("0.01"))
    assert credit == Decimal("3347.83")

    note = _value_note(ctx, invoice, str(credit))
    _issue(ctx, note)
    note.refresh_from_db()
    row = note.lines.get()
    assert row.credit_mode == CreditMode.VALUE
    assert row.taxable_value == Decimal("3347.83")
    assert (row.cgst, row.sgst, row.igst) == (Decimal("83.70"), Decimal("83.69"), Decimal("0.00"))
    assert row.line_total == Decimal("3515.22")
    assert row.tax_code == "GST5" and row.tax_rate == Decimal("5.000")
    assert row.hsn_sac == "999723" and row.against_line_id is not None
    assert note.round_off_enabled is True
    assert note.grand_total == Decimal("3515.00")
    assert note.round_off == Decimal("-0.22")


def test_a_value_credit_moves_neither_returned_qty_nor_stock(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    """R51: a price correction on goods is not a return. Restock left at its
    default (on) must still move nothing, and the line must not look returned."""
    rice = make_item("Rice", "500.00", "GST5", stock="10")
    invoice = issued_invoice(owner, make_party(), [line(rice, "4")])
    on_hand = ItemStock.objects.get(item=rice).on_hand
    movements = StockMovement.objects.count()
    note = _value_note(ctx, invoice, "150.00")
    _issue(ctx, note)
    invoice_line = SalesDocumentLine.objects.get(pk=invoice["lines"][0]["id"])
    assert invoice_line.returned_qty == 0
    assert ItemStock.objects.get(item=rice).on_hand == on_hand
    assert StockMovement.objects.count() == movements


def test_tax_is_copied_from_the_invoice_line_including_the_place_of_supply(
    ctx: Ctx, owner: Any, membership: Any, make_party: Any
) -> None:
    """An inter-state invoice's credit is IGST, at the invoice line's snapshotted
    rate — not today's rate for the code, and not intra-state because the
    shop is in Maharashtra."""
    invoice = issued_invoice(owner, make_party(state_code="29"), [line(membership, "1")])
    note = _value_note(ctx, invoice, "1000.00")
    _issue(ctx, note)
    row = note.lines.get()
    assert (row.cgst, row.sgst, row.igst) == (Decimal("0.00"), Decimal("0.00"), Decimal("50.00"))


# ── The cap ───────────────────────────────────────────────────────────────────


def test_a_value_above_the_lines_taxable_value_is_refused(
    ctx: Ctx, owner: Any, membership: Any, make_party: Any
) -> None:
    invoice = issued_invoice(owner, make_party(), [line(membership, "1")])
    with pytest.raises(ValidationFailed) as refused:
        _value_note(ctx, invoice, "4000.01")
    assert refused.value.details == {
        "lines.0.taxable_value": ["At most ₹4,000.00 can be credited on this line"]
    }


def test_two_value_credits_are_capped_together_on_the_locked_line(
    ctx: Ctx, owner: Any, membership: Any, make_party: Any
) -> None:
    """Two drafts that each fit, but not together: the first issues, the second
    is refused at issue on the LOCKED invoice line (the EC-9 pattern), and a
    third draft is refused at once against what is now left."""
    invoice = issued_invoice(owner, make_party(), [line(membership, "1")])
    first = _value_note(ctx, invoice, "3000.00")
    second = _value_note(ctx, invoice, "1500.00")
    _issue(ctx, first)
    with pytest.raises(ValidationFailed) as refused:
        _issue(ctx, second)
    assert refused.value.details == {
        "lines.0.taxable_value": ["At most ₹1,000.00 can be credited on this line"]
    }
    with pytest.raises(ValidationFailed):
        _value_note(ctx, invoice, "1000.01")
    _value_note(ctx, invoice, "1000.00")  # exactly what is left is allowed


def test_a_quantity_return_after_a_value_credit_is_capped_by_value(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    """Contracts §1.5: Σ credited value counts quantity lines AT THEIR VALUE.
    Two units of ₹500 with ₹600 already credited by value leave ₹400: a
    one-unit return (₹500) would credit ₹1,100 of a ₹1,000 line."""
    rice = make_item("Rice", "500.00", "GST0", stock="10")
    invoice = issued_invoice(owner, make_party(), [line(rice, "2")])
    _issue(ctx, _value_note(ctx, invoice, "600.00"))
    response = owner.post(
        reverse(CREDIT_NOTES),
        {
            "against_id": invoice["id"],
            "reason": "sales_return",
            "lines": [{"against_line_id": invoice["lines"][0]["id"], "qty": "1"}],
        },
        format="json",
    )
    assert response.status_code == 400, response.json()
    assert response.json()["error"]["details"] == {
        "lines.0.qty": ["At most ₹400.00 can be credited on this line"]
    }


def test_a_value_credit_after_a_quantity_return_is_capped_by_what_is_left(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    rice = make_item("Rice", "500.00", "GST0", stock="10")
    invoice = issued_invoice(owner, make_party(), [line(rice, "2")])
    returned = create_credit_note(
        ctx=ctx,
        payload={
            "against_id": invoice["id"],
            "reason": "sales_return",
            "lines": [{"against_line_id": invoice["lines"][0]["id"], "qty": "1"}],
        },
    )["document"]
    _issue(ctx, returned)
    with pytest.raises(ValidationFailed) as refused:
        _value_note(ctx, invoice, "500.01")
    assert refused.value.details == {
        "lines.0.taxable_value": ["At most ₹500.00 can be credited on this line"]
    }


def test_voiding_a_value_credit_frees_its_value_and_leaves_returned_qty_alone(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    """The void path gives back QUANTITIES; a value line has none to give back
    (its stored qty of 1 is not a returned unit). Its value leaves the cap
    because a void note no longer counts."""
    rice = make_item("Rice", "500.00", "GST0", stock="10")
    invoice = issued_invoice(owner, make_party(), [line(rice, "2")])
    returned = create_credit_note(
        ctx=ctx,
        payload={
            "against_id": invoice["id"],
            "reason": "sales_return",
            "lines": [{"against_line_id": invoice["lines"][0]["id"], "qty": "1"}],
        },
    )["document"]
    _issue(ctx, returned)
    value = _value_note(ctx, invoice, "500.00")
    _issue(ctx, value)
    void_credit_note(ctx=ctx, document_id=value.id, reason="Entered twice")
    invoice_line = SalesDocumentLine.objects.get(pk=invoice["lines"][0]["id"])
    assert invoice_line.returned_qty == 1
    _value_note(ctx, invoice, "500.00")  # the voided credit's value is available again


# ── The request ───────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("raw", "field", "message"),
    [
        (
            {"taxable_value": "0"},
            "taxable_value",
            "Enter an amount above zero, in rupees and paise.",
        ),
        (
            {"taxable_value": "-5.00"},
            "taxable_value",
            "Enter an amount above zero, in rupees and paise.",
        ),
        (
            {"taxable_value": "10.005"},
            "taxable_value",
            "Enter an amount above zero, in rupees and paise.",
        ),
        (
            {"taxable_value": "ten"},
            "taxable_value",
            "Enter an amount above zero, in rupees and paise.",
        ),
        ({"taxable_value": "10.00", "qty": "1"}, "qty", "Credit a quantity or a value, not both."),
    ],
)
def test_a_value_line_is_validated(
    ctx: Ctx, owner: Any, membership: Any, make_party: Any, raw: dict, field: str, message: str
) -> None:
    invoice = issued_invoice(owner, make_party(), [line(membership, "1")])
    payload = {
        "against_id": invoice["id"],
        "reason": "other",
        "lines": [{"against_line_id": invoice["lines"][0]["id"], **raw}],
    }
    with pytest.raises(ValidationFailed) as refused:
        create_credit_note(ctx=ctx, payload=payload)
    assert refused.value.details == {f"lines.0.{field}": [message]}


def test_one_note_credits_by_quantity_or_by_value_never_both(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    """A quantity return carries a share of the invoice's document discount,
    which the engine spreads over every line of the note by taxable value; in
    a mixed note it would shave the value line's exact paise. So a note is one
    mode."""
    rice = make_item("Rice", "500.00", "GST0", stock="10")
    dal = make_item("Dal", "500.00", "GST0", stock="10")
    invoice = issued_invoice(
        owner,
        make_party(),
        [line(rice, "1"), line(dal, "1")],
        discount_type="amount",
        discount_value="100.00",
    )
    payload = {
        "against_id": invoice["id"],
        "reason": "other",
        "lines": [
            {"against_line_id": invoice["lines"][0]["id"], "qty": "1"},
            {"against_line_id": invoice["lines"][1]["id"], "taxable_value": "100.00"},
        ],
    }
    with pytest.raises(ValidationFailed) as refused:
        create_credit_note(ctx=ctx, payload=payload)
    assert refused.value.details == {
        "lines": ["A credit note returns quantities or credits values, not both."]
    }


def test_a_value_note_carries_no_document_discount_even_on_a_discounted_invoice(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    """The invoice line's taxable value is already after its discount share;
    the credit is that value's currency, so nothing more comes off it."""
    rice = make_item("Rice", "500.00", "GST0", stock="10")
    invoice = issued_invoice(
        owner, make_party(), [line(rice, "2")], discount_type="amount", discount_value="100.00"
    )
    assert invoice["lines"][0]["taxable_value"] == "900.00"
    note = _value_note(ctx, invoice, "900.00")
    assert note.discount_amount == Decimal("0.00")
    assert note.lines.get().taxable_value == Decimal("900.00")


def test_a_header_only_update_keeps_the_value_lines(
    ctx: Ctx, owner: Any, membership: Any, make_party: Any
) -> None:
    """A draft PATCH without `lines` rebuilds from what is stored, as a
    quantity note's does; a value line must come back a value line."""
    invoice = issued_invoice(owner, make_party(), [line(membership, "1")])
    note = _value_note(ctx, invoice, "3347.83")
    update_credit_note(
        ctx=ctx, document_id=note.id, payload={"notes": "Upgrade", "version": note.version}
    )
    row = SalesDocument.objects.get(pk=note.id).lines.get()
    assert (row.credit_mode, row.taxable_value) == (CreditMode.VALUE, Decimal("3347.83"))


def test_the_counter_api_stays_quantity_only(owner: Any, membership: Any, make_party: Any) -> None:
    """R51 changes the port, not the counter: `taxable_value` over HTTP is not
    a field of the counter's credit note, so a line without `qty` is refused
    as it always was, and no value line is created."""
    invoice = issued_invoice(owner, make_party(), [line(membership, "1")])
    response = owner.post(
        reverse(CREDIT_NOTES),
        {
            "against_id": invoice["id"],
            "reason": "other",
            "lines": [{"against_line_id": invoice["lines"][0]["id"], "taxable_value": "100.00"}],
        },
        format="json",
    )
    assert response.status_code == 400
    assert not SalesDocumentLine.objects.filter(credit_mode=CreditMode.VALUE).exists()


# ── Reconciliation: the GST summary and the register ─────────────────────────


def test_a_value_credit_reconciles_in_the_gst_summary_and_the_sales_register(
    ctx: Ctx, owner: Any, membership: Any, make_item: Any, make_party: Any, shop: Any
) -> None:
    """RPT-07's rule, with a value credit in the month: Σ rate-wise taxable =
    Σ HSN taxable = the register's line total, each NET of the credit; the
    tax heads are net of the copied tax; and the credit adds NO quantity to
    table 12 or to the register (it changed value, not what was supplied)."""
    rice = make_item("Rice", "500.00", "GST5", stock="10")
    customer = make_party(gstin="27AAPFU0939F1ZV", gst_registration="regular")
    invoice = issued_invoice(owner, customer, [line(membership, "1"), line(rice, "2")])
    note = _value_note(ctx, invoice, "3347.83")
    _issue(ctx, note)
    today = SalesDocument.objects.get(pk=invoice["id"]).document_date

    lines = gst_selectors.outward_lines(tenant=shop, date_from=today, date_to=today)
    by_rate = gst_selectors.outward_by_rate(lines)
    hsn = gst_selectors.hsn_summary(lines)
    rate_taxable = sum((Decimal(r["taxable_value"]) for r in by_rate["rows"]), Decimal("0"))
    hsn_taxable = sum((Decimal(r["taxable_value"]) for r in hsn["rows"]), Decimal("0"))
    expected_taxable = Decimal("4000.00") + Decimal("1000.00") - Decimal("3347.83")
    assert rate_taxable == hsn_taxable == expected_taxable

    service_row = next(r for r in hsn["rows"] if r["hsn_sac"] == "999723")
    assert Decimal(service_row["taxable_value"]) == Decimal("652.17")
    assert Decimal(service_row["total_qty"]) == Decimal("1.000")  # the invoice's 1, the credit's 0
    assert Decimal(service_row["cgst"]) == Decimal("100.00") - Decimal("83.70")
    assert Decimal(service_row["sgst"]) == Decimal("100.00") - Decimal("83.69")

    period = today.strftime("%Y-%m")
    register = owner.get(
        reverse("v1:report-sales-register") + f"?level=line&period={period}&page_size=100"
    ).json()
    credit_row = next(r for r in register["data"] if r["kind"] == "credit_note")
    assert (credit_row["qty"], credit_row["taxable_value"]) == ("0.000", "-3347.83")
    assert (credit_row["cgst"], credit_row["sgst"], credit_row["line_total"]) == (
        "-83.70",
        "-83.69",
        "-3515.22",
    )
    totals = register["meta"]["totals"]
    assert Decimal(totals["taxable_total"]) == expected_taxable

    summary = owner.get(reverse("v1:report-gst-summary") + f"?period={period}").json()["data"]
    outward_total = summary["outward"]["by_rate"]["total"]
    assert Decimal(outward_total["taxable_value"]) == expected_taxable
    assert Decimal(summary["hsn"]["total"]["taxable_value"]) == expected_taxable
    assert Decimal(summary["gstr3b"]["3.1(a)"]["taxable"]) == expected_taxable
    assert outward_total["cgst"] == totals["cgst"] and outward_total["sgst"] == totals["sgst"]
    cdnr = next(r for r in summary["outward"]["by_nature"]["rows"] if r["nature"] == "cdnr")
    assert (cdnr["document_count"], cdnr["taxable_value"], cdnr["cgst"], cdnr["sgst"]) == (
        1,
        "3347.83",
        "83.70",
        "83.69",
    )
    assert cdnr["invoice_value"] == "3515.00"  # the note's grand total, after its round-off


# ── Adversarial pass (A15): value credits against the tax engine, fuzzed ──────


def test_a_value_line_is_exact_through_the_tax_engine_fuzzed() -> None:
    """The whole design rests on one property of the engine: a single
    exclusive unit priced at a 2-dp value, with no discount, comes back with
    that taxable value UNCHANGED, and its tax is the engine's formula on it —
    CGST = q2(t×r/200), SGST = q2(t×r/100) − CGST intra-state; IGST =
    q2(t×r/100) inter-state; cess = q2(t×c/100). 5,000 random values, every
    GST rate, with and without cess, both supply types."""
    import random

    from apps.common.money import q2
    from apps.tax.services.tax_engine import EngineDocument, EngineLine, compute_document_totals

    rng = random.Random(51)
    for _ in range(5_000):
        value = Decimal(rng.randrange(1, 99_999_999)) / 100
        rate = Decimal(rng.choice(("0", "0.25", "3", "5", "12", "18", "28")))
        cess = Decimal(rng.choice(("0", "0", "1", "12", "22")))
        inter = rng.random() < 0.5
        result = compute_document_totals(
            EngineDocument(
                lines=[
                    EngineLine(
                        qty=Decimal("1"),
                        unit_price=value,
                        tax_inclusive=False,
                        discount_type=None,
                        discount_value=None,
                        rate=rate,
                        cess_rate=cess,
                    )
                ],
                tenant_state="27",
                place_of_supply="29" if inter else "27",
                round_off_enabled=False,
            )
        )
        row = result.lines[0]
        assert row.taxable_value == value
        tax = q2(value * rate / 100)
        if inter:
            assert (row.igst, row.cgst, row.sgst) == (tax, Decimal("0.00"), Decimal("0.00"))
        else:
            assert row.cgst == q2(value * rate / 200)
            assert row.cgst + row.sgst == tax and row.igst == Decimal("0.00")
        assert row.cess == q2(value * cess / 100)
        assert row.line_total == value + tax + row.cess


def test_unit_by_unit_returns_still_pass_where_their_paise_overshoot(
    ctx: Ctx, owner: Any, make_item: Any, make_party: Any
) -> None:
    """Adversarial pass (A15), the reason the value cap binds a quantity return
    only on a line a VALUE credit touched: two ₹15.00 inclusive units at 5%
    are ₹28.57 taxable on the invoice, but each one-unit return is ₹14.29, so
    returning them one at a time credits ₹28.58. SAL-04 EC-3 accepts that
    paisa; applying the value cap to every quantity return would have refused
    the second unit at the counter, which is behaviour A15 must not change."""
    towel = make_item("Hand towel", "15.00", "GST5", stock="10", inclusive=True)
    invoice = issued_invoice(owner, make_party(), [line(towel, "2")])
    assert invoice["lines"][0]["taxable_value"] == "28.57"
    for _ in range(2):
        note = create_credit_note(
            ctx=ctx,
            payload={
                "against_id": invoice["id"],
                "reason": "sales_return",
                "lines": [{"against_line_id": invoice["lines"][0]["id"], "qty": "1"}],
            },
        )["document"]
        _issue(ctx, note)
        assert note.lines.get().taxable_value == Decimal("14.29")
    assert SalesDocumentLine.objects.get(pk=invoice["lines"][0]["id"]).returned_qty == 2
