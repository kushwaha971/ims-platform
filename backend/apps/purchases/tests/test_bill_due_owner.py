"""WP-03 REUSE-02 — a purchase bill's due is written by ONE formula.

`amount_due = grand_total − amount_paid − debit notes applied` (PUR-02 §1,
PUR-07). Paying a bill and returning goods against it are the two writers that
move it, and each used to spell the formula out itself: the payment path in
`payment_seam.apply_payment`, the debit-note path in `debit_notes._move_bill_due`.
They agreed only because both remembered the debit-note term — the defect the
debit-note suite names ("a payment arithmetic that forgets the note") is exactly
what a third copy would reintroduce. `payment_seam.outstanding` owns it now.
"""

from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

from apps.purchases.services.payment_seam import outstanding

PURCHASES = Path(__file__).resolve().parents[1]
OWNER = PURCHASES / "services" / "payment_seam.py"
SPELLED_OUT = re.compile(r"grand_total\s*-\s*[\w.]*(amount_paid|paid)\b")


def test_only_the_owner_spells_out_the_bill_due_formula() -> None:
    offenders = [
        str(path.relative_to(PURCHASES))
        for path in PURCHASES.rglob("*.py")
        if "tests" not in path.parts
        and "migrations" not in path.parts
        and path != OWNER
        and SPELLED_OUT.search(path.read_text())
    ]
    assert offenders == []


def test_outstanding_takes_payments_and_debit_notes_off_the_total() -> None:
    bill = SimpleNamespace(
        grand_total=Decimal("1000.00"),
        amount_paid=Decimal("300.00"),
        meta={"debit_applied": "250.00"},
    )
    assert outstanding(bill) == Decimal("450.00")
    # A payment being tried (or undone) is passed in rather than written first.
    assert outstanding(bill, amount_paid=Decimal("800.00")) == Decimal("-50.00")
    assert outstanding(SimpleNamespace(grand_total=Decimal("10.00"), amount_paid=0, meta=None)) == (
        Decimal("10.00")
    )
