"""The shared GST fixture, run against the backend engine (T-SAL02-1…6, BR-1…BR-12).

`taxEngine.cases.json` lives beside the frontend mirror and is read from there
on purpose: ONE file, two engines. If this test cannot find it the build fails
rather than skips — a skipped agreement test is how the two engines drift.
Also here: the BR-9 invariants over random documents (T-SAL02-23), which is the
property the fixture cannot enumerate.
"""

from __future__ import annotations

import datetime as dt
import json
import random
from decimal import Decimal
from pathlib import Path

import pytest

from apps.tax.services.tax_engine import (
    EngineDocument,
    EngineLine,
    RateNotApplicable,
    assert_invariants,
    compute_document_totals,
    resolve_rate,
)

FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "frontend/src/modules/DigiKhaato/features/sales/view-model/taxEngine.cases.json"
)
DOC_FIELDS = (
    "subtotal",
    "discount_amount",
    "taxable_total",
    "cgst_total",
    "sgst_total",
    "igst_total",
    "cess_total",
    "grand_raw",
    "round_off",
    "grand_total",
)
LINE_FIELDS = (
    "gross",
    "discount_amount",
    "taxable_line",
    "doc_discount_share",
    "taxable_value",
    "tax_rate",
    "cgst",
    "sgst",
    "igst",
    "cess",
    "line_total",
)


def _load() -> dict:
    assert FIXTURE.exists(), f"shared tax fixture missing at {FIXTURE}"
    return json.loads(FIXTURE.read_text())


FIXTURE_DATA = _load()


def _dec(value: object) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def build(case_input: dict, rates: list[dict]) -> EngineDocument:
    """Resolve each line's rate by (code, date) exactly as the service will."""
    on = dt.date.fromisoformat(case_input["document_date"])
    lines = []
    for index, raw in enumerate(case_input["lines"]):
        row = resolve_rate(rates, raw["tax_code"], on)
        if row is None:
            raise RateNotApplicable(line_index=index, tax_code=raw["tax_code"])
        lines.append(
            EngineLine(
                qty=Decimal(raw["qty"]),
                unit_price=Decimal(raw["unit_price"]),
                tax_inclusive=raw["tax_inclusive"],
                discount_type=raw["discount_type"],
                discount_value=_dec(raw["discount_value"]),
                rate=Decimal(row["rate"]),
                cess_rate=Decimal(row["cess_rate"]),
            )
        )
    return EngineDocument(
        lines=lines,
        gst_type=case_input["gst_type"],
        tenant_state=case_input["tenant_state"],
        place_of_supply=case_input["place_of_supply"],
        round_off_enabled=case_input["round_off_enabled"],
        discount_type=case_input["discount_type"],
        discount_value=_dec(case_input["discount_value"]),
    )


@pytest.mark.parametrize("case", FIXTURE_DATA["cases"], ids=lambda c: c["id"])
def test_backend_engine_matches_the_shared_fixture(case: dict) -> None:
    """Protects: the stored figures equal the hand-computed FRD figures, to the paisa,
    for every slab, both state splits, composition, unregistered, cess, discounts,
    round-off, reverse charge and documents dated before 2025-09-21."""
    rates = FIXTURE_DATA["rates"]
    if "expected_error" in case:
        with pytest.raises(RateNotApplicable) as caught:
            compute_document_totals(build(case["input"], rates))
        assert caught.value.line_index == case["expected_error"]["line_index"]
        assert caught.value.tax_code == case["expected_error"]["tax_code"]
        return

    result = compute_document_totals(build(case["input"], rates))
    expected = case["expected"]
    assert result.is_inter_state is expected["document"]["is_inter_state"]
    for name in DOC_FIELDS:
        assert str(getattr(result, name)) == expected["document"][name], name
    assert len(result.lines) == len(expected["lines"])
    for index, (line, want) in enumerate(zip(result.lines, expected["lines"])):
        for name in LINE_FIELDS:
            assert str(getattr(line, name)) == want[name], f"line {index + 1} {name}"


def test_fixture_contains_a_document_dated_before_the_slab_boundary() -> None:
    """Protects: Part 32 §32.10.4's exit criterion — the suite must keep a pre-2025-09-21 case."""
    boundary = dt.date(2025, 9, 21)
    dated = [
        dt.date.fromisoformat(c["input"]["document_date"])
        for c in FIXTURE_DATA["cases"]
        if "expected" in c
    ]
    assert any(d < boundary for d in dated)


def test_doc_discount_allocation_is_keyed_by_line_number() -> None:
    """Protects: BR-5's `meta.doc_discount_allocation` shape for print and audit."""
    case = next(c for c in FIXTURE_DATA["cases"] if c["id"] == "br10-intra")
    result = compute_document_totals(build(case["input"], FIXTURE_DATA["rates"]))
    assert result.doc_discount_allocation == {"1": "25.26", "2": "13.51", "3": "11.23"}


@pytest.mark.parametrize("seed", range(40))
def test_random_documents_keep_the_br9_invariants(seed: int) -> None:
    """Protects: T-SAL02-23 — Σ line_total = grand_raw, taxable_total + discount =
    subtotal, grand = raw + round_off, and round-off within half a rupee, for any
    mix of up to 20 lines, both discounts and both state splits."""
    rng = random.Random(seed)
    lines = [
        EngineLine(
            qty=Decimal(rng.randint(1, 5000)) / 1000,
            unit_price=Decimal(rng.randint(0, 999999)) / 100,
            tax_inclusive=rng.random() < 0.4,
            discount_type=rng.choice([None, "percent", "amount"]),
            discount_value=Decimal(rng.randint(0, 100)),
            rate=Decimal(rng.choice(["0", "5", "12", "18", "28", "40"])),
            cess_rate=Decimal(rng.choice(["0", "0", "12"])),
        )
        for _ in range(rng.randint(0, 20))
    ]
    doc = EngineDocument(
        lines=lines,
        gst_type=rng.choice(["regular", "regular", "composition", "unregistered"]),
        tenant_state="27",
        place_of_supply=rng.choice(["27", "24"]),
        round_off_enabled=rng.random() < 0.7,
        discount_type=rng.choice([None, "percent", "amount"]),
        discount_value=Decimal(rng.randint(0, 100)),
    )
    result = compute_document_totals(doc)
    assert_invariants(result)
    assert sum((line.line_total for line in result.lines), Decimal("0")) == result.grand_raw
    assert Decimal("-0.49") <= result.round_off <= Decimal("0.50")
    assert sum((line.doc_discount_share for line in result.lines), Decimal("0")) == (
        result.discount_amount if result.lines else Decimal("0")
    )
    assert all(line.taxable_value >= 0 for line in result.lines)
