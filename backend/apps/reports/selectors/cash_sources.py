"""EXP-03's third cashbook source: payments, one row per `mode_breakup` share (BR-3).

The cashbook lives in `expenses`, which may not import `payments` (Part 20
§20.1.4), and its own docstring always said the composition would move here
when payments existed. Rather than move the whole screen, the source moves:
this object is registered with `expenses.selectors.cashbook` from
`ReportsConfig.ready()`, and the cashbook walks it beside its own two.

A split payment (₹700 UPI + ₹300 cash, EC-1 of RPT-02) is TWO cashbook rows —
the cashbook is a book of buckets, and each share lands in its own — while the
day book shows it as one row with both effects. The drawer's figure is the
same either way, which the reconciliation suite asserts.

── A4b / R4: an adjustment is not cash ───────────────────────────────────────
A share in mode `adjustment` moved no money — the two halves of applying a held
deposit to a charge, or an opening deposit from the paper era (R37) — so it is
never a cashbook row and never part of the opening brought forward. The rest of
the payment's shares are counted as always. (`bucket_of`, the cashbook's own
cash/bank split, is untouched; it is the cashbook's `cash_bucket` and never the
ledger's `bucket`.)
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from django.db import connection

from apps.common.constants import PaymentMode
from apps.common.money import ZERO
from apps.expenses.selectors.cashbook import IN, OUT, CashRow, bucket_of

_NET_SQL = """
SELECT m ->> 'mode' AS mode, p.direction, SUM((m ->> 'amount')::numeric)
  FROM payments_payment p
  CROSS JOIN LATERAL jsonb_array_elements(p.mode_breakup) AS m
 WHERE p.tenant_id = %(tenant)s AND p.status = 'recorded' AND p.payment_date < %(before)s
   AND m ->> 'mode' <> %(adjustment)s
 GROUP BY 1, 2
"""


class PaymentCashSource:
    """Recorded payments in and out, by each mode's share."""

    name = "payment"

    def rows(self, *, tenant: Any, date_from: dt.date, date_to: dt.date) -> Iterable[CashRow]:
        from apps.payments.models import Payment

        queryset = Payment.objects.filter(
            tenant=tenant,
            status="recorded",
            payment_date__gte=date_from,
            payment_date__lte=date_to,
        ).select_related("party")
        for payment in queryset:
            parts = payment.mode_breakup or []
            for index, part in enumerate(parts):
                if part.get("mode") == PaymentMode.ADJUSTMENT:
                    continue  # R4 — no money moved
                yield CashRow(
                    source_type="payment",
                    # One id per share, so a split payment's two rows are two
                    # rows to the client's keyed list, not one drawn twice.
                    source_id=f"{payment.id}:{index}",
                    date=payment.payment_date,
                    at=payment.created_at,
                    direction=IN if payment.direction == "in" else OUT,
                    mode=part.get("mode") or PaymentMode.OTHER,
                    upi_app=part.get("upi_app"),
                    amount=Decimal(str(part.get("amount") or "0")),
                    party=(
                        {"id": str(payment.party_id), "name": payment.party.name}
                        if payment.party_id
                        else None
                    ),
                    category=None,
                    number=payment.number,
                    # UAT D6 — each share shows ITS OWN reference: the payment-level
                    # one (the UPI part's UTR on a split) only stands in for a
                    # single-mode payment, never for the cash half of a split.
                    reference=(
                        part.get("reference")
                        or (payment.reference if len(parts) == 1 else "")
                        or ""
                    ),
                    note=payment.note,
                )

    def net_before(self, *, tenant: Any, before: dt.date) -> dict[str, Decimal]:
        net: dict[str, Decimal] = defaultdict(lambda: ZERO)
        with connection.cursor() as cursor:
            cursor.execute(
                _NET_SQL,
                {
                    "tenant": str(getattr(tenant, "id", tenant)),
                    "before": before,
                    "adjustment": PaymentMode.ADJUSTMENT.value,
                },
            )
            for mode, direction, total in cursor.fetchall():
                signed = (total or ZERO) if direction == "in" else -(total or ZERO)
                net[bucket_of(mode)] += signed
        return net
