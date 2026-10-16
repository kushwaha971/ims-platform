"""RPT-01 — the dashboard's figures: the owner's five daily questions on one screen.

"What do I have to collect, what do I owe, who is due today, what did I sell
today, what am I running out of" (§1). Every figure here is ALREADY a figure
somewhere else in the product, and the rule this module keeps is that it is
computed by the SAME code as that somewhere else:

* To collect / To pay are `ledger_summary()` — the figures above the party
  list and on `/ledger/aging`'s tabs.
* (DEC-019) To collect / To pay read `shop_balance`: this is the Shop's home.
  Due today and Upcoming were the Udhaar book's promise dates and are that
  app's Reminders now; Overdue is the Shop's overdue bills.
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
import logging
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Count, DecimalField, Min, Q, Sum
from django.db.models.functions import Coalesce

from apps.common.constants import LedgerBucket
from apps.common.money import ZERO
from apps.common.overdue import overdue_q
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

logger = logging.getLogger("ub.reports")


def _money(value: Decimal | None) -> str:
    return str((value or ZERO).quantize(Decimal("0.01")))


def _sum(field: str, predicate: Q) -> Any:
    return Coalesce(Sum(field, filter=predicate), Decimal("0.00"), output_field=_MONEY)


# ── Tiles ────────────────────────────────────────────────────────────────────


def party_tiles(*, tenant: Any, today: dt.date) -> dict[str, dict[str, Any]]:
    """To collect and To pay on the Shop's bills (FR-2, DEC-019, WP-06 DASH-02).

    The dashboard is the SHOP's home, and DEC-019 (owner, 12 Oct 2026) keeps each
    app's money to itself: these are `shop_balance`, what is due on bills, never
    the Udhaar book's figure. Due today, Upcoming and the party half of Overdue
    were the udhaar book's promise dates (`collection_buckets`) and went with it
    to that app's Reminders; the Shop's overdue is its overdue BILLS.

    Each tile is the total of the list it opens, by that list's own query
    (`party_totals` over the customers, or the suppliers). Summing every party
    whatever its role made "To pay, to all your suppliers" a customer's advance
    over an empty supplier list. The money held the other way round (a
    customer's advance, a supplier paid ahead) rides beside each tile as
    `advances`, named, rather than vanishing or being folded in. A party who is
    both is in both lists, as the lists already show them; their net position
    is decision D-03's and nothing here invents one.
    """
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party
    from apps.parties.selectors.party import party_totals

    active = Party.objects.for_tenant(tenant).filter(status=PartyStatus.ACTIVE)
    customers = party_totals(active.filter(is_customer=True), field="shop_balance")
    suppliers = party_totals(active.filter(is_supplier=True), field="shop_balance")
    return {
        "to_collect": {
            "amount": _money(customers["receivable"]),
            "advances": _money(customers["payable"]),
        },
        "to_pay": {
            "amount": _money(suppliers["payable"]),
            "advances": _money(suppliers["receivable"]),
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
    from apps.sales.constants import OPEN_STATUSES as SALE_OPEN

    # WP-06 Finding 2 — decided on the day, as the list it opens decides it.
    overdue = Q(kind__in=SALE_KINDS) & overdue_q(today=today, open_statuses=SALE_OPEN)
    row = SalesDocument.objects.filter(tenant=tenant).aggregate(
        sales_today=_sum("grand_total", sale & Q(document_date=today)),
        bills_today=Count("id", filter=sale & Q(document_date=today)),
        credit_today=_sum("grand_total", credit & Q(document_date=today)),
        sales_yesterday=_sum("grand_total", sale & Q(document_date=yesterday)),
        credit_yesterday=_sum("grand_total", credit & Q(document_date=yesterday)),
        overdue_count=Count("id", filter=overdue),
        overdue_due=_sum("amount_due", overdue),
        overdue_since=Min("due_on", filter=overdue),
        overdue_first=Min("document_date", filter=overdue),
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
            # WP-06 — Needs attention says how old: the oldest bill's days past due.
            **_age(row["overdue_since"], today, row["overdue_first"]),
        },
    }


def _age(since: dt.date | None, today: dt.date, first: dt.date | None = None) -> dict[str, Any]:
    """`oldest_days_late` for the oldest due date, and `oldest_bill_date`, the
    earliest bill date among them, so the link can open the list over a range
    that holds every one: the list defaults to this financial year, and an
    overdue bill from last year is exactly the one that must not drop out."""
    return {
        **({"oldest_days_late": (today - since).days} if since else {}),
        **({"oldest_bill_date": first.isoformat()} if first else {}),
    }


def money_received_today(*, tenant: Any, today: dt.date) -> dict[str, Any]:
    """WP-06 layout A — the Today row's "Money received": the Shop's receipts dated
    today. Not sales (a bill issued and not paid is no money), not a void receipt,
    and not another app's money (`bucket`, DEC-019)."""
    from apps.payments.models import Payment

    row = (
        Payment.objects.filter(
            tenant=tenant,
            bucket=LedgerBucket.SHOP,
            direction="in",
            payment_date=today,
        )
        .exclude(status=VOID)
        .aggregate(amount=_sum("amount", Q()), count=Count("id"))
    )
    return {"amount": _money(row["amount"]), "count": row["count"]}


def supplier_bills(*, tenant: Any, today: dt.date) -> dict[str, Any]:
    """WP-06 spec order 3 — the Suppliers panel's bills: overdue (the purchase
    list's own `overdue` tab, with the oldest's age) and those falling due in the
    next seven days that are still open (the `unpaid` tab, by due date)."""
    from apps.purchases.constants import OPEN_STATUSES
    from apps.purchases.models import PurchaseDocument

    overdue = overdue_q(today=today, open_statuses=OPEN_STATUSES)
    week = Q(status__in=OPEN_STATUSES, due_on__gte=today, due_on__lte=today + dt.timedelta(days=7))
    row = PurchaseDocument.objects.filter(tenant=tenant, kind="purchase_bill").aggregate(
        overdue_count=Count("id", filter=overdue),
        overdue_due=_sum("amount_due", overdue),
        overdue_since=Min("due_on", filter=overdue),
        overdue_first=Min("document_date", filter=overdue),
        week_count=Count("id", filter=week),
        week_due=_sum("amount_due", week),
    )
    return {
        "overdue": {
            "count": row["overdue_count"],
            "amount": _money(row["overdue_due"]),
            **_age(row["overdue_since"], today, row["overdue_first"]),
        },
        "due_week": {"count": row["week_count"], "amount": _money(row["week_due"])},
    }


def cash_in_hand(*, tenant: Any, today: dt.date, bucket: str | None = LedgerBucket.SHOP) -> Decimal:
    """BR-3 — the drawer since the book began: the day book's closing cash for today.

    Payments in minus out by their cash shares, minus paid cash expenses, plus
    manual khata lines recorded as cash (EXP-03's rule). Opening cash is not
    modelled at MVP, which the tile's hint says in words.

    The Shop's drawer by default (DEC-019, WP-06 Finding 4): the Udhaar book's
    "You got ₹300, cash" and a lending collection are other apps' money.
    `bucket=None` is every book, which is what the `cash_in_hand` key has
    always sent and still sends (see `build_dashboard`).
    """
    return money_position(
        tenant=tenant,
        before=today + dt.timedelta(days=1),
        sources=frozenset({"payments", "expenses", "ledger"}),
        bucket=bucket,
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
    """FR-4 — the five customers who owe the Shop most, largest first.

    WP-06 — the top of the list its "View all" opens (`/customers?balance=owes_me`),
    so a supplier paid ahead is the To pay tile's `advances`, not a debtor here.
    """
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    rows = (
        Party.objects.for_tenant(tenant)
        # DEC-019 — who owes the SHOP most, on bills.
        .filter(status=PartyStatus.ACTIVE, is_customer=True, shop_balance__gt=ZERO)
        .order_by("-shop_balance", "name", "id")
        .only("id", "name", "shop_balance", "collection_date", "mobile")[:TOP_DEBTORS_LIMIT]
    )
    return [
        {
            "id": str(party.id),
            "name": party.name,
            "balance": _money(party.shop_balance),
            "collection_date": (
                party.collection_date.isoformat() if party.collection_date else None
            ),
            "mobile": party.mobile or None,
        }
        for party in rows
    ]


def top_creditors(*, tenant: Any) -> list[dict[str, Any]]:
    """WP-06 — the five suppliers the Shop owes most: the top of `/suppliers?balance=i_owe`."""
    from apps.parties.constants import PartyStatus
    from apps.parties.models import Party

    rows = (
        Party.objects.for_tenant(tenant)
        .filter(status=PartyStatus.ACTIVE, is_supplier=True, shop_balance__lt=ZERO)
        .order_by("shop_balance", "name", "id")
        .only("id", "name", "shop_balance")[:TOP_DEBTORS_LIMIT]
    )
    return [
        {"id": str(party.id), "name": party.name, "balance": _money(-party.shop_balance)}
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
    on: dt.date | None = None,
) -> dict[str, Any]:
    """`at` is when it was entered; `on` the day it belongs to (WP-06 Finding 5),
    absent for a void, which is an act of its own moment."""
    return {
        "id": f"{type_}:{source_id}",
        "type": type_,
        "at": at.isoformat(),
        **({"business_date": on.isoformat()} if on else {}),
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

    DEC-019 — this is the Shop's home, so only the Shop's money is in it: a
    ledger line or a payment in another app's bucket (an udhaar "You gave", a
    library fee, a loan collection) is that app's event, never the Shop's.
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
        LedgerEntry.objects.filter(
            tenant=tenant, source_type__in=("manual", "ledger_entry"), bucket=LedgerBucket.SHOP
        )
        .select_related("party")
        .order_by("-created_at", "-id")[:limit]
    ):
        events.append(
            _event(
                type_=entry.entry_type,
                at=entry.created_at,
                on=entry.entry_date,
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
                on=doc.document_date,
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

    payments = Payment.objects.filter(tenant=tenant, bucket=LedgerBucket.SHOP).select_related(
        "party"
    )
    for payment in payments.order_by("-created_at", "-id")[:limit]:
        events.append(
            _event(
                type_=f"payment_{payment.direction}",
                at=payment.created_at,
                on=payment.payment_date,
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

    expenses = Expense.objects.filter(tenant=tenant, app="shop").select_related("party", "category")
    for expense in expenses.order_by("-created_at", "-id")[:limit]:
        events.append(
            _event(
                type_="expense",
                at=expense.created_at,
                on=expense.expense_date,
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

    bills = PurchaseDocument.objects.filter(tenant=tenant, kind="purchase_bill").select_related(
        "party"
    )
    for bill in bills.exclude(status=DRAFT).order_by(_newest("recorded_at"), "-id")[:limit]:
        events.append(
            _event(
                type_="purchase",
                at=bill.recorded_at or bill.created_at,
                on=bill.document_date,
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
                on=adjustment.adjustment_date,
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


def _part(name: str, failed: list[str], compute: Any, default: Any = None) -> Any:
    """One part of the dashboard, computed alone (WP-06 Finding 7, DASH-04).

    Inside a savepoint, so a failed query does not poison the transaction the
    other parts read in; logged, and named in `failed`, so the reader is told
    which panel could not load instead of being shown a false zero."""
    try:
        with transaction.atomic():
            return compute()
    except Exception:
        logger.exception("dashboard.part_failed", extra={"part": name})
        failed.append(name)
        return default


def build_dashboard(*, tenant: Any, today: dt.date) -> dict[str, Any]:
    """Every figure for the business, unfiltered and JSON-safe — what is cached.

    Each part fails alone: a part that raised is left out (a tile) or empty (a
    list) and named in `unavailable`, which is absent when nothing failed. The
    view does not cache a payload that names one."""
    failed: list[str] = []
    documents = _part("documents", failed, lambda: document_tiles(tenant=tenant, today=today))
    stock = _part("low_stock", failed, lambda: low_stock(tenant=tenant))
    parties = _part("party_tiles", failed, lambda: party_tiles(tenant=tenant, today=today), {})
    tiles: dict[str, Any] = {**parties}
    if documents is not None:
        tiles["today_sales"] = documents["today_sales"]
        tiles["overdue_invoices"] = documents["overdue_invoices"]
    # The figure this key has always sent, every book's cash, kept as it was:
    # `main_bucket_reads.json` pins it for an Udhaar-only business, and that
    # file is never regenerated. The Shop's home reads `shop_cash_in_hand`.
    every_book = _part(
        "cash_in_hand", failed, lambda: cash_in_hand(tenant=tenant, today=today, bucket=None)
    )
    if every_book is not None:
        tiles["cash_in_hand"] = {"amount": _money(every_book)}
    # WP-06 Finding 4 / DEC-019 — the Shop's own drawer: what the day book and
    # the cashbook close on, and what the Shop's Today row shows.
    shop_cash = _part("shop_cash_in_hand", failed, lambda: cash_in_hand(tenant=tenant, today=today))
    if shop_cash is not None:
        tiles["shop_cash_in_hand"] = {"amount": _money(shop_cash)}
    for key, compute in (
        ("today_received", lambda: money_received_today(tenant=tenant, today=today)),
        ("supplier_bills", lambda: supplier_bills(tenant=tenant, today=today)),
    ):
        value = _part(key, failed, compute)
        if value is not None:
            tiles[key] = value
    if stock is not None:
        tiles["low_stock"] = stock["tile"]
    payload: dict[str, Any] = {
        "as_of": today.isoformat(),
        "tiles": tiles,
        "recent_activity": _part(
            "recent_activity", failed, lambda: recent_activity(tenant=tenant), []
        ),
        "top_debtors": _part("top_debtors", failed, lambda: top_debtors(tenant=tenant), []),
        "top_creditors": _part("top_creditors", failed, lambda: top_creditors(tenant=tenant), []),
        "low_stock_items": stock["items"] if stock is not None else [],
        # A failure here must not greet an established shop as on its first day.
        "first_use": _part(
            "first_use",
            failed,
            lambda: first_use(tenant=tenant),
            {"has_party": True, "has_item": True, "has_document": True, "has_upi": True},
        ),
    }
    if failed:
        payload["unavailable"] = sorted(failed)
    return payload


#: The tiles a reader sees, and what each needs (§12). Party tiles need only
#: `parties.party.read` beside the report permission — EC-5: a billing-only
#: tenant with the ledger module off still has balances, through documents.
_PARTY_TILES = ("to_collect", "to_pay")


def _project_tiles(
    source: dict[str, Any], *, granted: frozenset[str], modules: frozenset[str]
) -> dict[str, Any]:
    """The tiles this reader may see. A tile missing from `source` (its part
    failed, DASH-04) is missing here too, never a zero."""
    tiles: dict[str, Any] = {}
    sales = "sales.invoice.read" in granted
    if "parties.party.read" in granted:
        tiles.update({key: dict(source[key]) for key in _PARTY_TILES if key in source})
        if sales and "overdue_invoices" in source:
            # BR-6 — the Shop's overdue is its overdue bills (DEC-019: the party
            # promise dates are the Udhaar book's), so the tile is the bills alone.
            bills = dict(source["overdue_invoices"])
            tiles["overdue"] = {"count": 0, "amount": bills["amount"], "invoices": bills}
    cash = "reports.financial.read" in granted and {"payments", "expenses"} <= modules
    allowed = {
        "today_sales": sales,
        "today_received": "payments.payment.read" in granted,
        "cash_in_hand": cash,
        "shop_cash_in_hand": cash,
        "low_stock": "inventory.stock.read" in granted,
    }
    tiles.update({key: dict(source[key]) for key, ok in allowed.items() if ok and key in source})
    if "purchases.bill.read" in granted and "supplier_bills" in source:
        tiles["supplier_bills"] = {
            key: dict(value) for key, value in source["supplier_bills"].items()
        }
    return tiles


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
            "top_creditors": [],
            "low_stock_items": [],
            "first_use": payload["first_use"],
        }
    tiles = _project_tiles(payload["tiles"], granted=granted, modules=modules)
    parties = "parties.party.read" in granted
    stock = "inventory.stock.read" in granted

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

    cut: dict[str, Any] = {
        "as_of": payload["as_of"],
        "tiles": tiles,
        "recent_activity": activity,
        "top_debtors": debtors,
        "top_creditors": list(payload.get("top_creditors", [])) if parties else [],
        "low_stock_items": list(payload["low_stock_items"]) if stock else [],
        "first_use": payload["first_use"],
    }
    # DASH-04 — which parts could not be computed, so each panel says so itself.
    if payload.get("unavailable"):
        cut["unavailable"] = list(payload["unavailable"])
    return cut


def mask_mobile(mobile: str | None) -> str | None:
    """`+91 98••• ••210` — SAL-02 §19's list mask, from the sales serializer."""
    from apps.sales.serializers.document import mask_mobile as sales_mask

    return sales_mask(mobile)
