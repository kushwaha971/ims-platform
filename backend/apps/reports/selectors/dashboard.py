"""RPT-01 — the dashboard's figures: the owner's five daily questions on one screen.

"What do I have to collect, what do I owe, who is due today, what did I sell
today, what am I running out of" (§1). Every figure here is ALREADY a figure
somewhere else in the product, and the rule this module keeps is that it is
computed by the SAME code as that somewhere else:

* To collect / To pay are `ledger_summary()` — the figures above the party
  list and on `/ledger/aging`'s tabs.
* Due today / Overdue / Upcoming are `collection_buckets()` — the reminders
  screen's tabs, so tapping a tile lists exactly the parties it counted.
* Cash in hand is the day book's `money_position()` up to today — the day
  book's closing cash, so the tile and the report can never disagree.
* Low stock is `low_stock_queryset()` — the `/stock/low` list and the Items
  badge.

What is NEW here is only Today's sales (one aggregate, credit notes netted),
the recent activity feed, top debtors and the first-use flags.

── One payload per tenant, trimmed per reader ───────────────────────────────
`build_dashboard` computes everything for the business, whoever asked, and
the view caches that (CR-106, ≤ 60 s). `project` then removes what THIS reader
may not see (§12) — tiles are omitted, never zeroed (FR-6, §10), and activity
rows carry the codename that reads them. Computing per reader instead would
cache four copies of the same arithmetic and make "tiles omitted per
permission" a property of a cache key rather than of the code.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce

from apps.common.money import ZERO
from apps.reports.constants import (
    CREDIT_NOTE_KIND,
    CREDIT_NOTE_LIVE_STATUSES,
    DRAFT,
    LOW_STOCK_ITEMS_LIMIT,
    RECENT_ACTIVITY_LIMIT,
    SALE_KINDS,
    TOP_DEBTORS_LIMIT,
    VOID,
)
from apps.reports.selectors.day_book import money_position

_MONEY = DecimalField(max_digits=14, decimal_places=2)


def _money(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.01")))


def _sum(field: str, predicate: Q) -> Any:
    return Coalesce(Sum(field, filter=predicate), Decimal("0.00"), output_field=_MONEY)


# ── Tiles ────────────────────────────────────────────────────────────────────


def party_tiles(*, tenant: Any, today: dt.date) -> dict[str, dict[str, Any]]:
    """To collect, To pay, Due today, Overdue (party side) and Upcoming (FR-2)."""
    from apps.ledger.selectors.aging import ledger_summary
    from apps.ledger.selectors.collection import collection_buckets

    summary = ledger_summary(tenant=tenant)
    buckets = collection_buckets(tenant=tenant, today=today)
    return {
        "to_collect": {"amount": _money(summary["receivable"])},
        "to_pay": {"amount": _money(summary["payable"])},
        **{
            key: {"count": buckets[key]["count"], "amount": _money(buckets[key]["amount"])}
            for key in ("due_today", "overdue", "upcoming_7d")
        },
    }


def document_tiles(*, tenant: Any, today: dt.date) -> dict[str, Any]:
    """Today's sales (credit notes netted, BR-2) and overdue bills (BR-6), in one aggregate.

    A sale is an `invoice` or `bill_of_supply` that is neither a draft nor void;
    a credit note counts when `issued` or `applied`, on the date it was ISSUED
    (its `document_date`), not the date it was applied — BR-2. The result can be
    negative on a returns day (EC-3), and is reported as such.
    """
    from apps.sales.models import SalesDocument

    yesterday = today - dt.timedelta(days=1)
    sale = Q(kind__in=SALE_KINDS) & ~Q(status__in=(DRAFT, VOID))
    credit = Q(kind=CREDIT_NOTE_KIND, status__in=CREDIT_NOTE_LIVE_STATUSES)
    overdue = Q(kind__in=SALE_KINDS, status="overdue")
    row = SalesDocument.objects.filter(tenant=tenant).aggregate(
        sales_today=_sum("grand_total", sale & Q(document_date=today)),
        bills_today=Count("id", filter=sale & Q(document_date=today)),
        credit_today=_sum("grand_total", credit & Q(document_date=today)),
        sales_yesterday=_sum("grand_total", sale & Q(document_date=yesterday)),
        credit_yesterday=_sum("grand_total", credit & Q(document_date=yesterday)),
        overdue_count=Count("id", filter=overdue),
        overdue_due=_sum("amount_due", overdue),
    )
    return {
        "today_sales": {
            "amount": _money(row["sales_today"] - row["credit_today"]),
            "count": row["bills_today"],
            "yesterday_amount": _money(row["sales_yesterday"] - row["credit_yesterday"]),
        },
        "overdue_invoices": {
            "count": row["overdue_count"],
            "amount": _money(row["overdue_due"]),
        },
    }


def cash_in_hand(*, tenant: Any, today: dt.date) -> Decimal:
    """BR-3 — the drawer since the book began: the day book's closing cash for today.

    Payments in minus out by their cash shares, minus paid cash expenses, plus
    manual khata lines recorded as cash (EXP-03's rule). Opening cash is not
    modelled at MVP, which the tile's hint says in words.
    """
    return money_position(
        tenant=tenant,
        before=today + dt.timedelta(days=1),
        sources=frozenset({"payments", "expenses", "ledger"}),
    )["cash"]


def _default_location_id(tenant: Any) -> Any:
    """`MAIN` — read, never created: this is a selector (the service creates it)."""
    from apps.inventory.models import Location

    return (
        Location.objects.filter(tenant=tenant, is_default=True)
        .order_by("created_at")
        .values_list("id", flat=True)
        .first()
    )


def low_stock(*, tenant: Any) -> dict[str, Any]:
    """The Low stock tile and its five rows — the `/stock/low` list's own query."""
    from apps.inventory.constants import StockStatus
    from apps.inventory.selectors.stock import low_stock_queryset

    location_id = _default_location_id(tenant)
    if location_id is None:
        return {"tile": {"count": 0, "out_count": 0}, "items": []}
    qs = low_stock_queryset(tenant=tenant, location_id=location_id)
    counts = qs.aggregate(
        low=Count("id", filter=Q(stock_status=StockStatus.LOW)),
        out=Count("id", filter=Q(stock_status=StockStatus.OUT)),
    )
    items = [
        {
            "id": str(item.id),
            "name": item.name,
            "on_hand": str(item.on_hand),
            "reorder_point": str(item.reorder_point) if item.reorder_point is not None else None,
            "unit": item.unit.code,
            "stock_status": item.stock_status,
        }
        for item in qs[:LOW_STOCK_ITEMS_LIMIT]
    ]
    return {
        "tile": {"count": counts["low"] + counts["out"], "out_count": counts["out"]},
        "items": items,
    }


# ── Lists ────────────────────────────────────────────────────────────────────


def top_debtors(*, tenant: Any) -> list[dict[str, Any]]:
    """FR-4 — the five biggest positive balances, largest first."""
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    rows = (
        Party.objects.for_tenant(tenant)
        .filter(status=PartyStatus.ACTIVE, balance__gt=ZERO)
        .order_by("-balance", "name", "id")
        .only("id", "name", "balance", "collection_date", "mobile")[:TOP_DEBTORS_LIMIT]
    )
    return [
        {
            "id": str(party.id),
            "name": party.name,
            "balance": _money(party.balance),
            "collection_date": (
                party.collection_date.isoformat() if party.collection_date else None
            ),
            "mobile": party.mobile or None,
        }
        for party in rows
    ]


def _newest(field: str) -> Any:
    """`-field` with NULLs last — Postgres puts them FIRST on a descending sort,
    and a row with no timestamp is never the newest event."""
    from django.db.models import F

    return F(field).desc(nulls_last=True)


def _party(party_id: Any, name: str | None) -> dict | None:
    return {"id": str(party_id), "name": name or ""} if party_id else None


def _event(
    *,
    type_: str,
    at: dt.datetime,
    kind: str,
    source_id: Any,
    permission: str,
    number: str | None = None,
    amount: Decimal | None = None,
    direction: str | None = None,
    party: dict | None = None,
    party_id: Any = None,
) -> dict[str, Any]:
    return {
        "id": f"{type_}:{source_id}",
        "type": type_,
        "at": at.isoformat(),
        "number": number,
        "amount": _money(amount) if amount is not None else None,
        "direction": direction,
        "party": party,
        "source": {
            "kind": kind,
            "id": str(source_id),
            "party_id": str(party_id) if party_id else None,
        },
        "permission": permission,
    }


def recent_activity(*, tenant: Any) -> list[dict[str, Any]]:
    """FR-3 — the latest events across the modules, ten from each, newest first.

    Ten from each source and not ten overall, because `project` drops the rows
    a reader may not see AFTER the cache: a staff member who cannot read
    purchases must still get ten rows when the ten newest events were bills.

    Khata lines are the ledger's OWN lines (manual entries, openings,
    write-offs and LED-03's reversals). A document's ledger line is the
    document's own event here, exactly as in the day book, so issuing an
    invoice is one row and not two.
    """
    from apps.expenses.models import Expense
    from apps.inventory.models import StockAdjustment
    from apps.ledger.models import LedgerEntry
    from apps.payments.models import Payment
    from apps.purchases.models import PurchaseDocument
    from apps.sales.models import SalesDocument

    limit = RECENT_ACTIVITY_LIMIT
    events: list[dict[str, Any]] = []

    for entry in (
        LedgerEntry.objects.filter(tenant=tenant, source_type__in=("manual", "ledger_entry"))
        .select_related("party")
        .order_by("-created_at", "-id")[:limit]
    ):
        events.append(
            _event(
                type_=entry.entry_type,
                at=entry.created_at,
                kind="ledger_entry",
                source_id=entry.id,
                permission="ledger.entry.read",
                amount=entry.amount,
                direction=entry.direction,
                party=_party(entry.party_id, entry.party.name),
                party_id=entry.party_id,
            )
        )

    sales = SalesDocument.objects.filter(
        tenant=tenant, kind__in=(*SALE_KINDS, CREDIT_NOTE_KIND)
    ).select_related("party")
    for doc in sales.exclude(status=DRAFT).order_by(_newest("issued_at"), "-id")[:limit]:
        events.append(
            _event(
                type_="credit_note" if doc.kind == CREDIT_NOTE_KIND else "sale",
                at=doc.issued_at or doc.created_at,
                kind="sales_document",
                source_id=doc.id,
                permission="sales.invoice.read",
                number=doc.number,
                amount=doc.grand_total,
                party=_party(doc.party_id, doc.party.name if doc.party_id else doc.walk_in_name),
                party_id=doc.party_id,
            )
        )
    for doc in sales.filter(status=VOID, voided_at__isnull=False).order_by("-voided_at")[:limit]:
        events.append(
            _event(
                type_=("credit_note" if doc.kind == CREDIT_NOTE_KIND else "sale") + "_void",
                at=doc.voided_at,
                kind="sales_document",
                source_id=doc.id,
                permission="sales.invoice.read",
                number=doc.number,
                amount=doc.grand_total,
                party=_party(doc.party_id, doc.party.name if doc.party_id else doc.walk_in_name),
                party_id=doc.party_id,
            )
        )

    payments = Payment.objects.filter(tenant=tenant).select_related("party")
    for payment in payments.order_by("-created_at", "-id")[:limit]:
        events.append(
            _event(
                type_=f"payment_{payment.direction}",
                at=payment.created_at,
                kind="payment",
                source_id=payment.id,
                permission="payments.payment.read",
                number=payment.number,
                amount=payment.amount,
                party=_party(payment.party_id, payment.party.name if payment.party_id else None),
                party_id=payment.party_id,
            )
        )
    for payment in payments.filter(status=VOID, voided_at__isnull=False).order_by("-voided_at")[
        :limit
    ]:
        events.append(
            _event(
                type_=f"payment_{payment.direction}_void",
                at=payment.voided_at,
                kind="payment",
                source_id=payment.id,
                permission="payments.payment.read",
                number=payment.number,
                amount=payment.amount,
                party=_party(payment.party_id, payment.party.name if payment.party_id else None),
                party_id=payment.party_id,
            )
        )

    expenses = Expense.objects.filter(tenant=tenant).select_related("party", "category")
    for expense in expenses.order_by("-created_at", "-id")[:limit]:
        events.append(
            _event(
                type_="expense",
                at=expense.created_at,
                kind="expense",
                source_id=expense.id,
                permission="expenses.expense.read",
                number=expense.number,
                amount=expense.amount,
                party=_party(expense.party_id, expense.party.name if expense.party_id else None),
                party_id=expense.party_id,
            )
        )
    for expense in expenses.filter(status=VOID, voided_at__isnull=False).order_by("-voided_at")[
        :limit
    ]:
        events.append(
            _event(
                type_="expense_void",
                at=expense.voided_at,
                kind="expense",
                source_id=expense.id,
                permission="expenses.expense.read",
                number=expense.number,
                amount=expense.amount,
            )
        )

    bills = PurchaseDocument.objects.filter(tenant=tenant).select_related("party")
    for bill in bills.exclude(status=DRAFT).order_by(_newest("recorded_at"), "-id")[:limit]:
        events.append(
            _event(
                type_="purchase",
                at=bill.recorded_at or bill.created_at,
                kind="purchase_document",
                source_id=bill.id,
                permission="purchases.bill.read",
                number=bill.number,
                amount=bill.grand_total,
                party=_party(bill.party_id, bill.party.name if bill.party_id else None),
                party_id=bill.party_id,
            )
        )

    for adjustment in StockAdjustment.objects.filter(tenant=tenant).order_by("-created_at", "-id")[
        :limit
    ]:
        events.append(
            _event(
                type_="stock_adjustment",
                at=adjustment.created_at,
                kind="stock_adjustment",
                source_id=adjustment.id,
                permission="inventory.stock.read",
                number=adjustment.number,
            )
        )

    events.sort(key=lambda event: (event["at"], event["id"]), reverse=True)
    return events


def first_use(*, tenant: Any) -> dict[str, bool]:
    """FR-9 — what the onboarding checklist still has to ask for."""
    from apps.inventory.models import Item
    from apps.parties.models import Party
    from apps.sales.models import SalesDocument

    return {
        "has_party": Party.objects.for_tenant(tenant).exists(),
        "has_item": Item.objects.filter(tenant=tenant).exists(),
        "has_document": SalesDocument.objects.filter(tenant=tenant).exclude(status=DRAFT).exists(),
        "has_upi": bool(getattr(tenant, "upi_vpa", None)),
    }


# ── The whole payload, and the reader's cut of it ──────────────────────────


def build_dashboard(*, tenant: Any, today: dt.date) -> dict[str, Any]:
    """Every figure for the business, unfiltered and JSON-safe — what is cached."""
    documents = document_tiles(tenant=tenant, today=today)
    stock = low_stock(tenant=tenant)
    tiles = {
        **party_tiles(tenant=tenant, today=today),
        "today_sales": documents["today_sales"],
        "overdue_invoices": documents["overdue_invoices"],
        "cash_in_hand": {"amount": _money(cash_in_hand(tenant=tenant, today=today))},
        "low_stock": stock["tile"],
    }
    return {
        "as_of": today.isoformat(),
        "tiles": tiles,
        "recent_activity": recent_activity(tenant=tenant),
        "top_debtors": top_debtors(tenant=tenant),
        "low_stock_items": stock["items"],
        "first_use": first_use(tenant=tenant),
    }


#: The tiles a reader sees, and what each needs (§12). Party tiles need only
#: `parties.party.read` beside the report permission — EC-5: a billing-only
#: tenant with the ledger module off still has balances, through documents.
_PARTY_TILES = ("to_collect", "to_pay", "due_today", "overdue", "upcoming_7d")


def project(
    payload: dict[str, Any], *, granted: frozenset[str], modules: frozenset[str]
) -> dict[str, Any]:
    """The reader's dashboard: omit what they may not see, mask what they need not.

    `granted` is `permissions_for(membership)`, which has already removed every
    codename of a disabled module — so "inventory off → no Low stock" (FR-6)
    falls out of `inventory.stock.read` being absent. Cash in hand is the one
    tile gated on modules directly: it is a sum over payments AND expenses, and
    with either switched off it would be a figure missing half its terms.
    """
    if "reports.basic.read" not in granted:
        return {
            "as_of": payload["as_of"],
            "tiles": {},
            "recent_activity": [],
            "top_debtors": [],
            "low_stock_items": [],
            "first_use": payload["first_use"],
        }
    source = payload["tiles"]
    tiles: dict[str, Any] = {}
    parties = "parties.party.read" in granted
    sales = "sales.invoice.read" in granted
    if parties:
        for key in _PARTY_TILES:
            tiles[key] = dict(source[key])
        if sales:
            # BR-6's secondary line — "₹x in 4 bills" — is about bills.
            tiles["overdue"]["invoices"] = dict(source["overdue_invoices"])
    if sales:
        tiles["today_sales"] = dict(source["today_sales"])
    if "reports.financial.read" in granted and {"payments", "expenses"} <= modules:
        tiles["cash_in_hand"] = dict(source["cash_in_hand"])
    stock = "inventory.stock.read" in granted
    if stock:
        tiles["low_stock"] = dict(source["low_stock"])

    activity = [
        {key: value for key, value in event.items() if key != "permission"}
        for event in payload["recent_activity"]
        if event["permission"] in granted
    ][:RECENT_ACTIVITY_LIMIT]

    can_remind = "ledger.reminder.write" in granted
    debtors = []
    if parties:
        for row in payload["top_debtors"]:
            debtor = {key: value for key, value in row.items() if key != "mobile"}
            debtor["mobile_masked"] = mask_mobile(row["mobile"])
            # §19 masks the number in the list. The unmasked one travels only
            # with the Remind action it exists for, to a reader who may send it.
            debtor["mobile"] = row["mobile"] if can_remind else None
            debtors.append(debtor)

    return {
        "as_of": payload["as_of"],
        "tiles": tiles,
        "recent_activity": activity,
        "top_debtors": debtors,
        "low_stock_items": list(payload["low_stock_items"]) if stock else [],
        "first_use": payload["first_use"],
    }


def mask_mobile(mobile: str | None) -> str | None:
    """`+91 98••• ••210` — SAL-02 §19's list mask, from the sales serializer."""
    from apps.sales.serializers.document import mask_mobile as sales_mask

    return sales_mask(mobile)
