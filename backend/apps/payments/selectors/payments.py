"""Payment reads (Part 26 §26.7 — selectors never write)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import (
    Case,
    Count,
    DecimalField,
    F,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce

from apps.common.constants import Direction
from apps.common.money import ZERO
from apps.ledger.constants import EntryType, SourceType
from apps.ledger.models import LedgerEntry
from apps.ledger.selectors.entry import BALANCE_BUCKETS
from apps.payments.constants import PaymentDirection, PaymentStatus
from apps.payments.models import Allocation, Payment
from apps.payments.services.targets import target_for, targets_for_direction

LIST_ORDERING = ("-payment_date", "-created_at", "-id")


def list_payments(*, tenant: Any) -> QuerySet:
    """Every payment, newest first, with the two joins every row renders.

    `allocated` is a correlated subquery, not `Sum("allocations__amount")`: the
    join-and-GROUP-BY form aggregated EVERY payment of the tenant before the sort
    and the LIMIT (H3 scale run: 7,499 payments × 19,112 allocations, 115 ms for a
    page of 25), where the subquery runs for the rows on the page only and the
    page itself walks `ix_payment_tenant_date`.
    """
    per_payment = (
        Allocation.objects.filter(payment=OuterRef("pk"))
        .order_by()
        .values("payment")
        .annotate(total=Sum("amount"))
        .values("total")[:1]
    )
    money = DecimalField(max_digits=14, decimal_places=2)
    return (
        Payment.objects.for_tenant(tenant)
        .select_related("party", "created_by")
        .annotate(allocated=Coalesce(Subquery(per_payment, output_field=money), Value(ZERO)))
        .order_by(*LIST_ORDERING)
    )


def detail_queryset(*, tenant: Any) -> QuerySet:
    return (
        Payment.objects.for_tenant(tenant)
        .select_related("party", "created_by", "voided_by", "tenant")
        .prefetch_related("allocations")
    )


def payment_totals(queryset: QuerySet) -> dict:
    """`meta.totals` over the FILTERED set; a void never counts as money that moved."""
    money = DecimalField(max_digits=14, decimal_places=2)
    recorded = Q(status=PaymentStatus.RECORDED)
    row = queryset.order_by().aggregate(
        count=Count("id", distinct=True),
        # QA P-D6 — each money card counts its own payments: recorded, one direction.
        count_in=Count("id", filter=recorded & Q(direction=PaymentDirection.IN), distinct=True),
        count_out=Count("id", filter=recorded & Q(direction=PaymentDirection.OUT), distinct=True),
        amount_in=Coalesce(
            Sum(
                Case(
                    When(recorded & Q(direction=PaymentDirection.IN), then="amount"),
                    output_field=money,
                )
            ),
            Value(ZERO),
        ),
        amount_out=Coalesce(
            Sum(
                Case(
                    When(recorded & Q(direction=PaymentDirection.OUT), then="amount"),
                    output_field=money,
                )
            ),
            Value(ZERO),
        ),
    )
    return {
        "count": row["count"],
        "count_in": row["count_in"],
        "count_out": row["count_out"],
        "amount_in": str(row["amount_in"]),
        "amount_out": str(row["amount_out"]),
    }


def allocation_details(payment: Payment) -> list[dict]:
    """Each allocation with its document's number and CURRENT status/due (PAY-04 BR-1)."""
    rows = list(payment.allocations.all())
    by_type: dict[str, list[Any]] = {}
    for row in rows:
        by_type.setdefault(row.document_type, []).append(row.document_id)
    documents: dict[str, dict] = {}
    for document_type, ids in by_type.items():
        target = target_for(document_type)
        if target is None:
            continue
        for document in target.find(tenant=payment.tenant_id, ids=ids):
            documents[str(document.id)] = target.summary(document)
    out = []
    for row in rows:
        summary = documents.get(str(row.document_id), {})
        out.append(
            {
                "document_type": row.document_type,
                "document_id": str(row.document_id),
                "number": summary.get("number"),
                "kind": summary.get("kind"),
                "document_date": summary.get("document_date"),
                "status": summary.get("status"),
                "amount_due": summary.get("amount_due"),
                "amount": str(row.amount),
            }
        )
    return out


def open_documents(*, tenant: Any, party_id: Any, direction: str) -> list[dict]:
    """PAY-01 FR-2 — the allocation panel's rows, oldest first (FIFO order)."""
    rows: list[dict] = []
    for target in targets_for_direction(direction):
        rows.extend(
            target.summary(document)
            for document in target.open_documents(tenant=tenant, party_id=party_id)
            if target.outstanding(document) > ZERO
        )
    return rows


def payments_for_document(*, tenant: Any, document_type: str, document_id: Any) -> list[dict]:
    """The receipts that settled one document — the invoice page's "Payments" list."""
    rows = (
        Allocation.objects.filter(
            tenant=tenant, document_type=document_type, document_id=document_id
        )
        .select_related("payment")
        .order_by("payment__payment_date", "payment__created_at")
    )
    return [
        {
            "id": str(row.payment_id),
            "number": row.payment.number,
            "payment_date": row.payment.payment_date.isoformat(),
            "primary_mode": row.payment.primary_mode,
            "amount": str(row.amount),
            "status": row.payment.status,
        }
        for row in rows
    ]


def resolve_payments(ids: set[str]) -> dict[str, dict]:
    """LED-10 FR-5 — registered with the ledger in `PaymentsConfig.ready()`."""
    rows = Payment.objects.filter(pk__in=ids).values_list("id", "number", "status", "direction")
    return {
        str(pk): {
            "number": number,
            "status": status,
            "kind": "payment_in" if direction == PaymentDirection.IN else "payment_out",
        }
        for pk, number, status, direction in rows
    }


def party_balance_after(payment: Payment) -> Decimal | None:
    """PAY-04 FR-1 — the party's balance immediately after this payment's khata line.

    Every row up to and including the payment's own entry in the statement's
    order `(entry_date, created_at, id)`, reversed rows included — so a void
    posted LATER does not rewrite what the balance was at the time, and a
    correction posted earlier nets to zero as it did then. `None` for a
    walk-in payment, which has no khata.
    """
    if payment.party_id is None:
        return None
    entry = (
        LedgerEntry.objects.filter(
            tenant_id=payment.tenant_id,
            source_type=SourceType.PAYMENT,
            source_id=payment.id,
            entry_type__in=(EntryType.PAYMENT_IN, EntryType.PAYMENT_OUT),
        )
        .order_by("created_at")
        .first()
    )
    if entry is None:
        return None
    upto = Q(entry_date__lt=entry.entry_date) | Q(
        entry_date=entry.entry_date, created_at__lt=entry.created_at
    )
    upto |= Q(pk=entry.pk)
    signed = Case(
        When(direction=Direction.DEBIT, then=F("amount")),
        default=-F("amount"),
        output_field=DecimalField(max_digits=16, decimal_places=2),
    )
    total = (
        LedgerEntry.objects.filter(tenant_id=payment.tenant_id, party_id=payment.party_id)
        .filter(upto)
        # A2 — the balance is Σ main + Σ loan; a deposit line was never in it (ADR-043).
        .filter(BALANCE_BUCKETS)
        .aggregate(total=Coalesce(Sum(signed), Value(ZERO)))["total"]
    )
    return total
