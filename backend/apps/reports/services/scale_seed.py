"""A merchant book at launch scale, written fast and still true (H3 item 3, Part 12 §12.8).

`manage.py seed_scale` calls `seed_scale()`. It exists to make the performance
budgets of Part 12 §12.5 measurable (`manage.py scale_probe`) and the launch
gate "balance-drift and stock-drift jobs clean on the seeded 100,000-row
dataset" executable — so the book it writes must pass `check_invariants`, not
merely look big.

Why bulk inserts and not the services. Posting 100,000 entries through
`post_source_entry` and 40,000 movements through `post_movements`, each in its
own transaction with its locks and audit rows, is hours on the 2-CPU box. The
services' own suites prove the services; this module writes exactly the columns
they leave behind, and derives every cache the same way the product does:

- one simulated day at a time, in date order, so each item's movement
  `sequence_no` is also its date order and each movement's running pair
  (`on_hand_after`, `avg_cost_after`, `value_after`) comes from folding
  `inventory.services.costing.apply_weighted_average` — the product's own step;
- `ItemStock` is the last row's pair; `Party.balance` and its receivable /
  payable split are `Σ debit − Σ credit` of the rows written, applied by SQL at
  the end with `ledger.selectors.entry.SIGNED_AMOUNT`'s rule;
- invoices and bills carry `amount_paid` / `amount_due` / status from the
  allocations actually written (oldest first, PAY-01's auto rule), and each
  document kind's `platform_document_sequence` is advanced past the numbers used,
  so the next real invoice does not collide;
- sales never take an item below zero (the default negative-stock policy).

The ledger lines are split: invoices, bills, payments and expenses post their
own lines, and manual "You gave / You got" lines make up the remainder of
`entries`. Shape: ~10 % suppliers, 1 bill per 8 invoices, 1 receipt per
3 invoices, 1 supplier payment per 3 bills, 1 expense per 20 invoices.
"""

from __future__ import annotations

import datetime as dt
import random
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Callable

from django.db import connection, transaction
from django.utils import timezone

TWO = Decimal("0.01")
#: Slabs in force since 22 Sep 2025 (GST12 was folded into 5 and 18), so a real
#: invoice issued after seeding validates against the same codes.
GST_CODES = (("GST5", Decimal("5")), ("GST18", Decimal("18")))
SURNAMES = ("Sharma", "Verma", "Gupta", "Iyer", "Khan", "Patel", "Reddy", "Bose", "Jain", "Das")
SUFFIXES = ("Traders", "Stores", "Agency", "Mart", "& Sons", "Kirana", "Enterprises")
GOODS = ("Rice", "Atta", "Sugar", "Oil", "Dal", "Tea", "Soap", "Ghee", "Salt", "Biscuit")


def q2(value: Decimal) -> Decimal:
    from apps.common.money import q2 as _q2

    return _q2(value)


@dataclass
class _Stock:
    on_hand: Decimal = Decimal("0.000")
    avg: Decimal = Decimal("0.0000")
    value: Decimal = Decimal("0.0000000")
    seq: int = 0
    last_date: dt.date | None = None


@dataclass
class _Book:
    """Everything written, held until the batch flush."""

    entries: list = field(default_factory=list)
    movements: list = field(default_factory=list)
    sales: list = field(default_factory=list)
    sale_lines: list = field(default_factory=list)
    bills: list = field(default_factory=list)
    bill_lines: list = field(default_factory=list)
    payments: list = field(default_factory=list)
    allocations: list = field(default_factory=list)
    expenses: list = field(default_factory=list)


def _fill(row: Any, **values: Any) -> None:
    """Set a built row's columns once its id has been used by its children."""
    for name, value in values.items():
        setattr(row, name, value)


def _fresh_gstin(tenant: Any) -> str:
    """A checksum-valid Maharashtra GSTIN no other tenant of the partner holds
    (`uq_tenant_partner_gstin`), so the command can be run more than once."""
    from apps.platform_app.models import Tenant
    from apps.tax.validators import gstin_checksum

    for n in range(Tenant.objects.count(), Tenant.objects.count() + 10_000):
        body = f"27AAPFU{n % 10_000:04d}F1Z"
        gstin = body + gstin_checksum(body)
        if not Tenant.objects.filter(partner_id=tenant.partner_id, gstin=gstin).exists():
            return gstin
    raise RuntimeError("no free GSTIN")


def _owner_and_tenant(email: str, password: str, name: str) -> tuple[Any, Any]:
    from apps.inventory.services.stock import default_location
    from apps.platform_app.models import Membership, User
    from apps.platform_app.services.auth import register
    from apps.platform_app.services.onboarding import WIZARD_LAST_STEP, create_tenant

    user = User.objects.filter(email=email).first() or register(
        email=email, password=password, full_name="Scale Owner"
    )
    membership = create_tenant(user=user, name=name, business_type="retail", state_code="27")
    tenant = membership.tenant
    tenant.gst_type = "regular"
    tenant.gstin = _fresh_gstin(tenant)
    tenant.onboarding_step = WIZARD_LAST_STEP
    tenant.address = {"line1": "1 Scale Road", "city": "Pune"}
    tenant.save()
    Membership.objects.filter(user=user).exclude(pk=membership.pk).update(is_default=False)
    Membership.objects.filter(pk=membership.pk).update(is_default=True)
    default_location(tenant)
    return user, tenant


def seed_scale(
    *,
    entries: int,
    parties: int,
    items: int,
    invoices: int,
    days: int = 365,
    seed: int = 20260928,
    email: str = "scale@digikhaato.test",
    password: str = "Scale-Run-2026!",
    name: str | None = None,
    log: Callable[[str], None] = print,
) -> dict:
    """Write the book. Returns `{tenant_id, email, password, counts, seconds}`."""
    from apps.common.dates import fy_label_for
    from apps.expenses.constants import (
        EXPENSE_NUMBER_PADDING,
        EXPENSE_NUMBER_PREFIX,
        EXPENSE_SEQUENCE_KIND,
    )
    from apps.expenses.models import Expense, ExpenseCategory
    from apps.inventory.models import Category, Item, ItemStock, Location, StockMovement, Unit
    from apps.inventory.services.costing import apply_weighted_average
    from apps.ledger.models import LedgerEntry
    from apps.parties.models import Party
    from apps.payments.models import Allocation, Payment
    from apps.platform_app.models import DocumentSequence
    from apps.platform_app.services.presets import NUMBER_PADDING, NUMBERING_PREFIXES
    from apps.platform_app.services.sequences import format_number
    from apps.purchases.models import PurchaseDocument, PurchaseDocumentLine
    from apps.sales.models import SalesDocument, SalesDocumentLine

    started = time.monotonic()
    rng = random.Random(seed)
    user, tenant = _owner_and_tenant(email, password, name or f"Scale Traders {seed}")
    location = Location.objects.get(tenant=tenant, is_default=True)
    nos = Unit.objects.get(tenant__isnull=True, code="NOS")
    today = timezone.localdate()
    first_day = today - dt.timedelta(days=days - 1)
    now = timezone.now()
    log(f"tenant {tenant.id} ({email})")

    # ── parties ─────────────────────────────────────────────────────────────
    party_rows = []
    for n in range(parties):
        supplier = n % 10 == 0
        party_rows.append(
            Party(
                tenant=tenant,
                name=f"{rng.choice(SURNAMES)} {rng.choice(SUFFIXES)} {n}",
                display_code=f"{'S' if supplier else 'C'}-{n:06d}",
                mobile=f"9{n:09d}",
                is_customer=not supplier,
                is_supplier=supplier,
                state_code="27",
                credit_days=rng.choice((None, 7, 15, 30)),
                collection_date=(
                    today + dt.timedelta(days=rng.randint(-20, 20)) if n % 3 == 0 else None
                ),
                status="archived" if n % 50 == 49 else "active",
            )
        )
    Party.objects.bulk_create(party_rows, batch_size=5_000)
    active = [p for p in party_rows if p.status == "active"]
    customers = [p for p in active if p.is_customer]
    suppliers = [p for p in active if p.is_supplier] or active[:1]
    log(f"parties {len(party_rows)}")

    # ── items, with an opening movement each ────────────────────────────────
    categories = [
        Category(tenant=tenant, name=f"{g} & co", sort_order=i) for i, g in enumerate(GOODS)
    ]
    Category.objects.bulk_create(categories)
    item_rows: list = []
    stock: dict[Any, _Stock] = {}
    for n in range(items):
        code, _rate = GST_CODES[n % len(GST_CODES)]
        price = Decimal(rng.randint(1_000, 99_900)) / 100
        item_rows.append(
            Item(
                tenant=tenant,
                name=f"{rng.choice(GOODS)} {n} {rng.choice(('1kg', '5kg', 'pack', 'box'))}",
                item_type="goods",
                sku=f"SKU-{n:06d}",
                barcode=f"89{n:011d}" if n % 2 == 0 else None,
                unit=nos,
                category=categories[n % len(categories)],
                hsn_sac="1006",
                tax_code=code,
                purchase_price=q2(price * Decimal("0.8")),
                selling_price=price,
                track_stock=True,
                reorder_point=Decimal(rng.choice((5, 10, 20))),
            )
        )
    Item.objects.bulk_create(item_rows, batch_size=5_000)
    book = _Book()

    def move(item: Any, qty: Decimal, kind: str, on: dt.date, src: str, sid: Any, cost=None):
        s = stock.setdefault(item.id, _Stock())
        step = apply_weighted_average(
            on_hand=s.on_hand, avg_cost=s.avg, qty=qty, unit_cost=cost, value=s.value
        )
        s.seq += 1
        s.on_hand, s.avg, s.value, s.last_date = (
            step.on_hand_after,
            step.avg_after,
            step.value_after,
            on,
        )
        book.movements.append(
            StockMovement(
                tenant=tenant,
                item=item,
                location=location,
                sequence_no=s.seq,
                movement_type=kind,
                qty=qty,
                unit_cost=step.unit_cost,
                avg_cost_after=step.avg_after,
                on_hand_after=step.on_hand_after,
                value_after=step.value_after,
                source_type=src,
                source_id=sid,
                movement_date=on,
            )
        )
        return step

    for item in item_rows:
        move(
            item,
            Decimal(rng.randint(40, 400)),
            "opening",
            first_day,
            "item",
            None,
            item.purchase_price,
        )

    # ── documents, one day at a time ────────────────────────────────────────
    counters: dict[tuple[str, str], int] = defaultdict(int)
    prefixes = {**dict(NUMBERING_PREFIXES), EXPENSE_SEQUENCE_KIND: EXPENSE_NUMBER_PREFIX}
    paddings = {EXPENSE_SEQUENCE_KIND: EXPENSE_NUMBER_PADDING}

    def number(kind: str, on: dt.date) -> tuple[str, str]:
        fy = fy_label_for(tenant, on)
        counters[(kind, fy)] += 1
        padding = paddings.get(kind, NUMBER_PADDING)
        formatted = format_number(
            prefix=prefixes[kind], fy_label=fy, number=counters[(kind, fy)], padding=padding
        )
        return formatted, fy

    def post(party: Any, direction: str, amount: Decimal, on: dt.date, etype: str, **kw: Any):
        book.entries.append(
            LedgerEntry(
                tenant=tenant,
                party=party,
                direction=direction,
                amount=amount,
                entry_date=on,
                entry_type=etype,
                status="posted",
                **kw,
            )
        )

    party_by_id = {p.id: p for p in party_rows}
    open_invoices: dict[Any, deque] = defaultdict(deque)
    open_bills: dict[Any, deque] = defaultdict(deque)
    n_bills, n_receipts, n_payouts, n_expenses = (
        invoices // 8,
        invoices // 3,
        invoices // 24,
        invoices // 20,
    )
    doc_entries = invoices + n_bills + n_receipts + n_payouts
    manual = max(0, entries - doc_entries)
    expense_categories = [
        ExpenseCategory.objects.get_or_create(tenant=tenant, name=n)[0]
        for n in ("Rent", "Electricity", "Wages", "Transport")
    ]

    def share(total: int, day: int) -> int:
        """How many of `total` fall on day `day` — an even spread with a remainder."""
        return total * (day + 1) // days - total * day // days

    def lines_for(doc_id: Any, chosen: list[tuple[Any, Decimal, Decimal]], model: Any, sale: bool):
        subtotal = tax = Decimal("0.00")
        rows = []
        for no, (item, qty, price) in enumerate(chosen, start=1):
            rate = dict(GST_CODES)[item.tax_code]
            taxable = q2(qty * price)
            half = q2(taxable * rate / 200)
            subtotal += taxable
            tax += half * 2
            common = dict(
                document_id=doc_id,
                line_no=no,
                item=item,
                description=item.name,
                hsn_sac=item.hsn_sac,
                qty=qty,
                unit_code="NOS",
                discount_amount=Decimal("0.00"),
                taxable_value=taxable,
                tax_code=item.tax_code,
                tax_rate=rate,
                cgst=half,
                sgst=half,
                line_total=taxable + half * 2,
            )
            if sale:
                rows.append(model(unit_price=price, **common))
            else:
                rows.append(model(unit_cost=price, inbound_unit_cost=price, **common))
        total = subtotal + tax
        grand = total.quantize(Decimal("1"))
        return rows, subtotal, tax, grand, grand - total

    for day in range(days):
        on = first_day + dt.timedelta(days=day)
        stamp = timezone.make_aware(dt.datetime.combine(on, dt.time(10, 0)))

        for _ in range(share(n_bills, day)):
            party = rng.choice(suppliers)
            chosen = [
                (
                    item,
                    Decimal(rng.randint(5, 40)),
                    q2(item.purchase_price * Decimal(rng.choice(("0.95", "1", "1.05")))),
                )
                for item in rng.sample(item_rows, rng.randint(1, 3))
            ]
            doc = PurchaseDocument(tenant=tenant, kind="purchase_bill", party=party)
            rows, sub, tax, grand, round_off = lines_for(
                doc.id, chosen, PurchaseDocumentLine, False
            )
            doc.number, doc.fy_label = number("purchase_bill", on)
            doc.supplier_invoice_number = f"SUP-{doc.number}"
            _fill(
                doc,
                status="recorded",
                document_date=on,
                due_on=on + dt.timedelta(days=party.credit_days or 0),
                place_of_supply_state="27",
                subtotal=sub,
                taxable_total=sub,
                cgst_total=tax / 2,
                sgst_total=tax / 2,
                round_off=round_off,
                grand_total=grand,
                amount_due=grand,
                recorded_at=stamp,
            )
            book.bills.append(doc)
            book.bill_lines.extend(rows)
            for item, qty, cost in chosen:
                move(item, qty, "purchase_in", on, "purchase_document", doc.id, cost)
            post(
                party,
                "credit",
                grand,
                on,
                "purchase_bill",
                source_type="purchase_document",
                source_id=doc.id,
                note=doc.number,
            )
            open_bills[party.id].append(doc)

        for _ in range(share(invoices, day)):
            party = rng.choice(customers)
            chosen = []
            for item in rng.sample(item_rows, rng.randint(1, 3)):
                qty = Decimal(rng.randint(1, 4))
                if stock[item.id].on_hand >= qty:
                    chosen.append((item, qty, item.selling_price))
            if not chosen:
                continue
            doc = SalesDocument(tenant=tenant, kind="invoice", party=party)
            rows, sub, tax, grand, round_off = lines_for(doc.id, chosen, SalesDocumentLine, True)
            doc.number, doc.fy_label = number("invoice", on)
            _fill(
                doc,
                status="issued",
                document_date=on,
                due_on=on + dt.timedelta(days=party.credit_days or 0),
                place_of_supply_state="27",
                supplier_gstin_snapshot=tenant.gstin,
                party_snapshot={"name": party.name, "mobile": party.mobile},
                subtotal=sub,
                taxable_total=sub,
                cgst_total=tax / 2,
                sgst_total=tax / 2,
                round_off=round_off,
                grand_total=grand,
                amount_due=grand,
                issued_at=stamp,
            )
            for row, (item, qty, _price) in zip(rows, chosen):
                row.unit_cost_snapshot = move(
                    item, -qty, "sale_out", on, "sales_document", doc.id
                ).unit_cost
            book.sales.append(doc)
            book.sale_lines.extend(rows)
            post(
                party,
                "debit",
                grand,
                on,
                "invoice",
                source_type="sales_document",
                source_id=doc.id,
                note=doc.number,
            )
            open_invoices[party.id].append(doc)

        def settle(direction: str, count: int, opened: dict, targets: str, etype: str) -> None:
            for _ in range(count):
                owing = [pid for pid, docs in opened.items() if docs]
                if not owing:
                    return
                pid = rng.choice(owing)
                docs = opened[pid]
                due = sum((d.amount_due for d in docs), Decimal("0.00"))
                amount = min(due, q2(due * Decimal(rng.choice(("0.3", "0.5", "1")))))
                if amount <= 0:
                    continue
                mode = rng.choice(("cash", "upi", "bank"))
                pay = Payment(tenant=tenant, direction=direction, party_id=pid)
                pay.number, _fy = number("payment_in" if direction == "in" else "payment_out", on)
                _fill(
                    pay,
                    payment_date=on,
                    amount=amount,
                    mode_breakup=[{"mode": mode, "amount": str(amount)}],
                    primary_mode=mode,
                    status="recorded",
                    unallocated_amount=Decimal("0.00"),
                )
                book.payments.append(pay)
                left = amount
                while left > 0 and docs:
                    doc = docs[0]
                    take = min(left, doc.amount_due)
                    book.allocations.append(
                        Allocation(
                            tenant=tenant,
                            payment=pay,
                            document_type=targets,
                            document_id=doc.id,
                            amount=take,
                        )
                    )
                    doc.amount_paid += take
                    doc.amount_due -= take
                    doc.status = "paid" if doc.amount_due == 0 else "partially_paid"
                    left -= take
                    if doc.amount_due == 0:
                        docs.popleft()
                post(
                    party_by_id[pid],
                    "credit" if direction == "in" else "debit",
                    amount,
                    on,
                    etype,
                    source_type="payment",
                    source_id=pay.id,
                    payment_mode=mode if direction == "in" else None,
                    note=pay.number,
                )

        settle("in", share(n_receipts, day), open_invoices, "sales_document", "payment_in")
        settle("out", share(n_payouts, day), open_bills, "purchase_document", "payment_out")

        for _ in range(share(n_expenses, day)):
            exp = Expense(tenant=tenant, category=rng.choice(expense_categories))
            exp.number, _fy = number(EXPENSE_SEQUENCE_KIND, on)
            _fill(
                exp,
                expense_date=on,
                amount=Decimal(rng.randint(100, 5_000)),
                mode=rng.choice(("cash", "upi")),
                paid=True,
                status="recorded",
            )
            book.expenses.append(exp)

        for _ in range(share(manual, day)):
            party = rng.choice(active)
            got = rng.random() < 0.45
            post(
                party,
                "credit" if got else "debit",
                Decimal(rng.randint(100, 500_000)) / 100,
                on,
                "manual_got" if got else "manual_gave",
                source_type="manual",
                payment_mode="cash" if got else None,
            )

    # ── flush ───────────────────────────────────────────────────────────────
    with transaction.atomic():
        for model, rows in (
            (PurchaseDocument, book.bills),
            (PurchaseDocumentLine, book.bill_lines),
            (SalesDocument, book.sales),
            (SalesDocumentLine, book.sale_lines),
            (Payment, book.payments),
            (Allocation, book.allocations),
            (Expense, book.expenses),
            (StockMovement, book.movements),
            (LedgerEntry, book.entries),
        ):
            model.objects.bulk_create(rows, batch_size=5_000)
            log(f"{model._meta.db_table} {len(rows)}")
        ItemStock.objects.bulk_create(
            [
                ItemStock(
                    tenant=tenant,
                    item_id=item_id,
                    location=location,
                    on_hand=s.on_hand,
                    avg_cost=s.avg,
                    stock_value=s.value,
                    last_sequence_no=s.seq,
                    max_movement_date=s.last_date,
                    last_movement_at=now,
                )
                for item_id, s in stock.items()
            ],
            batch_size=5_000,
        )
        for (kind, fy), used in counters.items():
            DocumentSequence.objects.update_or_create(
                tenant=tenant,
                kind=kind,
                fy_label=fy,
                defaults={
                    "prefix": prefixes[kind],
                    "next_number": used + 1,
                    "padding": paddings.get(kind, NUMBER_PADDING),
                },
            )
        with connection.cursor() as cursor:
            # The balance cache, by the ledger's own rule (LIVE_ENTRIES: every row
            # here is posted and unreversed), and the activity stamp the list sorts by.
            cursor.execute(
                """
                UPDATE parties_party p
                   SET balance = s.bal,
                       receivable_total = GREATEST(s.bal, 0),
                       payable_total = GREATEST(-s.bal, 0),
                       last_activity_at = s.last_at
                  FROM (SELECT party_id,
                               SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) AS bal,
                               (MAX(entry_date)::timestamp + interval '10 hours') AT TIME ZONE 'Asia/Kolkata' AS last_at
                          FROM ledger_entry WHERE tenant_id = %s GROUP BY party_id) s
                 WHERE p.id = s.party_id
                """,
                [str(tenant.id)],
            )
    with connection.cursor() as cursor:
        for table in (
            "parties_party",
            "ledger_entry",
            "inventory_item",
            "inventory_item_stock",
            "inventory_stock_movement",
            "sales_document",
            "sales_document_line",
            "purchases_document",
            "purchases_document_line",
            "payments_payment",
            "payments_allocation",
            "expenses_expense",
        ):
            cursor.execute(f"ANALYZE {table}")  # noqa: S608 — fixed identifiers
    counts = {
        "parties": len(party_rows),
        "items": len(item_rows),
        "ledger_entries": len(book.entries),
        "stock_movements": len(book.movements),
        "invoices": len(book.sales),
        "bills": len(book.bills),
        "payments": len(book.payments),
        "expenses": len(book.expenses),
    }
    return {
        "tenant_id": str(tenant.id),
        "email": email,
        "password": password,
        "counts": counts,
        "seconds": round(time.monotonic() - started, 1),
    }
