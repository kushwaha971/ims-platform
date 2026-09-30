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

from apps.common.constants import Direction, PaymentMode
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
    """`meta.totals` over the FILTERED set; a void never counts as money that moved.

    Nor does an adjustment (A4b, FRD 00 PLT-X02 §11): the two halves of applying
    a held deposit, and an opening deposit, are listed with their mode but moved
    no money, so they are in no money card."""
    money = DecimalField(max_digits=14, decimal_places=2)
    recorded = Q(status=PaymentStatus.RECORDED) & ~Q(primary_mode=PaymentMode.ADJUSTMENT)
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
    later = {
        (entry.get("document_type"), entry.get("document_id")): entry.get("on")
        for entry in (payment.meta or {}).get("applied_later") or []
        if isinstance(entry, dict)
    }
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
                # A4a (PLT-X03 §8) — the date `allocate_existing` applied this, when it was
                # applied after the payment was recorded; `null` for an allocation made at
                # record time. The receipt prints "Applied later: INV/… on …".
                "applied_later_on": later.get((row.document_type, str(row.document_id))),
                # R30 — a target's own line under the number (a module's charge), if any.
                **({"label": summary["label"]} if summary.get("label") else {}),
            }
        )
    return out


def open_documents(
    *, tenant: Any, party_id: Any, direction: str, bucket: str | None = None
) -> list[dict]:
    """PAY-01 FR-2 — the allocation panel's rows, oldest first (FIFO order).

    Without `bucket` (the record-payment panel): the `auto` targets of the `main` bucket, which is
    what a new payment may settle by default and what the panel always listed. With `bucket`
    (A4a, Apply to bills): every target of that bucket, explicit-only ones included — a loan
    advance is applied to instalments, which FIFO never chooses (PLT-X03 EC-3).
    """
    if bucket is None:
        chosen = targets_for_direction(direction, auto_only=True, bucket="main")
    else:
        chosen = targets_for_direction(direction, bucket=bucket)
    rows: list[dict] = []
    for target in chosen:
        rows.extend(
            target.summary(document)
            for document in target.open_documents(tenant=tenant, party_id=party_id)
            if target.outstanding(document) > ZERO
        )
    return rows


def open_advances(
    *, tenant: Any, party_id: Any, direction: str = "in", bucket: str = "main"
) -> QuerySet:
    """The advances an AUTOMATIC use may apply (R61): the document port's `apply_open_advances`
    and the dues run. Oldest payment first.

    Recorded, money left, the given bucket and direction, and none of: an earmark (money
    reserved for one subject, applied only by an explicit allocation), a credit note's refund
    voucher (its money went back to the customer), a module refund (`meta.context`
    `<module>_refund`, R36).
    """
    return (
        Payment.objects.filter(
            tenant=tenant,
            party_id=party_id,
            direction=direction,
            bucket=bucket,
            status=PaymentStatus.RECORDED,
            unallocated_amount__gt=ZERO,
        )
        .exclude(meta__has_key="earmark")
        .exclude(meta__has_key="credit_note_id")
        # `has_key` first: a missing key is NULL in SQL, and `NOT (NULL LIKE …)` would drop
        # every payment that has no `context` at all.
        .exclude(Q(meta__has_key="context") & Q(meta__context__endswith="_refund"))
        .order_by("payment_date", "created_at", "id")
    )


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
