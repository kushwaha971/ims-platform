"""Row builders for the reports suites.

The reports READ six apps' tables, so these write rows straight through the
ORM — a sale, a payment, a khata line — with exactly the columns the posting
services would leave behind, and nothing the reports do not read. That is
deliberate: a reconciliation test must be free to build a book the posting
services could produce in any order (backdated, voided, split across modes),
and going through six services per row would make a fifty-row fuzzed book a
minute-long test. The services' own suites prove the services.

`credit_note(...)` writes `kind='credit_note'`, which SAL-04 adds to the enum
on another branch; the column is a plain varchar, so the reports can be proved
against the FRD's shape before the feature lands (Part 17 SAL-04 FR-1).
"""

from __future__ import annotations

import datetime as dt
import itertools
from decimal import Decimal
from typing import Any

from apps.common.dates import fy_label_for

_seq = itertools.count(1)


def _n(prefix: str) -> str:
    return f"{prefix}/{next(_seq):05d}"


def D(value: Any) -> Decimal:  # noqa: N802
    return Decimal(str(value)).quantize(Decimal("0.01"))


def party(tenant: Any, name: str = "Ramesh", **extra: Any) -> Any:
    from tests.factories.parties import PartyFactory

    return PartyFactory(tenant=tenant, name=name, **extra)


def sale(
    tenant: Any,
    on: dt.date,
    total: Any,
    *,
    party: Any = None,
    kind: str = "invoice",
    status: str = "issued",
    due: Any = None,
    walk_in_name: str | None = None,
    **extra: Any,
) -> Any:
    from django.utils import timezone

    from apps.sales.models import SalesDocument

    amount = D(total)
    number = None if status == "draft" else _n("INV" if kind != "credit_note" else "CN")
    if party is None and kind != "credit_note" and status != "draft":
        due = 0
    return SalesDocument.objects.create(
        tenant=tenant,
        kind=kind,
        number=number,
        fy_label=fy_label_for(tenant, on),
        status=status,
        party=party,
        walk_in_name=walk_in_name,
        document_date=on,
        place_of_supply_state="27",
        grand_total=amount,
        taxable_total=amount,
        amount_due=D(amount if due is None else due),
        issued_at=None if status == "draft" else timezone.now(),
        voided_at=timezone.now() if status == "void" else None,
        void_reason="Duplicate" if status == "void" else None,
        **extra,
    )


def credit_note(tenant: Any, on: dt.date, total: Any, *, party: Any, status: str = "issued") -> Any:
    return sale(tenant, on, total, party=party, kind="credit_note", status=status, due=0)


def purchase(tenant: Any, on: dt.date, total: Any, *, party: Any, status: str = "recorded") -> Any:
    from django.utils import timezone

    from apps.purchases.models import PurchaseDocument

    return PurchaseDocument.objects.create(
        tenant=tenant,
        kind="purchase_bill",
        number=None if status == "draft" else _n("PUR"),
        fy_label=fy_label_for(tenant, on),
        status=status,
        party=party,
        document_date=on,
        place_of_supply_state="27",
        grand_total=D(total),
        taxable_total=D(total),
        amount_due=D(total),
        recorded_at=None if status == "draft" else timezone.now(),
    )


def payment(
    tenant: Any,
    on: dt.date,
    modes: dict[str, Any],
    *,
    direction: str = "in",
    party: Any = None,
    status: str = "recorded",
) -> Any:
    """`modes={"cash": 1000, "upi": 772}` — one row, split across modes (EC-1)."""
    from django.utils import timezone

    from apps.payments.models import Payment

    breakup = [{"mode": mode, "amount": str(D(amount))} for mode, amount in modes.items()]
    total = sum((D(amount) for amount in modes.values()), Decimal("0.00"))
    return Payment.objects.create(
        tenant=tenant,
        number=_n("RCT" if direction == "in" else "PAYOUT"),
        direction=direction,
        party=party,
        payment_date=on,
        amount=total,
        mode_breakup=breakup,
        primary_mode=max(modes, key=lambda mode: D(modes[mode])),
        status=status,
        voided_at=timezone.now() if status == "void" else None,
        void_reason="Wrong party" if status == "void" else None,
        unallocated_amount=0 if status == "void" else total,
    )


def category(tenant: Any, name: str = "Rent") -> Any:
    from apps.expenses.models import ExpenseCategory

    found = ExpenseCategory.objects.filter(tenant=tenant, name=name).first()
    return found or ExpenseCategory.objects.create(tenant=tenant, name=name)


def expense(
    tenant: Any,
    on: dt.date,
    amount: Any,
    *,
    mode: str | None = "cash",
    paid: bool = True,
    party: Any = None,
    status: str = "recorded",
    note: str = "",
) -> Any:
    from django.utils import timezone

    from apps.expenses.models import Expense

    return Expense.objects.create(
        tenant=tenant,
        number=_n("EXP"),
        category=category(tenant),
        party=party,
        expense_date=on,
        amount=D(amount),
        mode=mode if paid else None,
        paid=paid,
        status=status,
        note=note,
        voided_at=timezone.now() if status == "void" else None,
        void_reason="Typo" if status == "void" else None,
    )


def khata(
    tenant: Any,
    on: dt.date,
    amount: Any,
    *,
    party: Any,
    got: bool = True,
    mode: str | None = None,
    entry_type: str | None = None,
    source_type: str = "manual",
    note: str = "",
) -> Any:
    """A khata line: "You got ₹500, cash" by default."""
    from apps.ledger.models import LedgerEntry

    return LedgerEntry.objects.create(
        tenant=tenant,
        party=party,
        direction="credit" if got else "debit",
        amount=D(amount),
        entry_date=on,
        entry_type=entry_type or ("manual_got" if got else "manual_gave"),
        source_type=source_type,
        payment_mode=mode if got else None,
        note=note,
    )


def reverse(entry: Any, reason: str = "Typed twice") -> Any:
    """LED-03's reversal: an opposite row dated like the original, the original marked."""
    from apps.ledger.models import LedgerEntry

    reversal = LedgerEntry.objects.create(
        tenant=entry.tenant,
        party=entry.party,
        direction="debit" if entry.direction == "credit" else "credit",
        amount=entry.amount,
        entry_date=entry.entry_date,
        entry_type="reversal",
        source_type="ledger_entry",
        source_id=entry.id,
        reverses=entry,
        reason=reason,
    )
    entry.status = "reversed"
    entry.reversed_by = reversal
    entry.save(update_fields=["status", "reversed_by"])
    return reversal


def stocked_item(
    tenant: Any, name: str, *, on_hand: Any, reorder_point: Any = None, unit_code: str = "NOS"
) -> Any:
    from apps.inventory.models import Item, ItemStock, Location, Unit

    unit = Unit.all_objects.filter(code=unit_code, tenant__isnull=True).first() or (
        Unit.objects.create(code=unit_code, name=unit_code, is_system=True)
    )
    location = Location.objects.filter(tenant=tenant, is_default=True).first() or (
        Location.objects.create(tenant=tenant, code="MAIN", name="Main", is_default=True)
    )
    item = Item.objects.create(
        tenant=tenant,
        name=name,
        sku=_n("SKU").replace("/", "-"),
        unit=unit,
        reorder_point=None if reorder_point is None else Decimal(str(reorder_point)),
    )
    ItemStock.objects.create(
        tenant=tenant, item=item, location=location, on_hand=Decimal(str(on_hand))
    )
    return item


def adjustment(tenant: Any, on: dt.date, *, reason: str = "damage") -> Any:
    from apps.inventory.models import Location, StockAdjustment

    location = Location.objects.filter(tenant=tenant, is_default=True).first() or (
        Location.objects.create(tenant=tenant, code="MAIN", name="Main", is_default=True)
    )
    return StockAdjustment.objects.create(
        tenant=tenant, number=_n("ADJ"), adjustment_date=on, location=location, reason=reason
    )
