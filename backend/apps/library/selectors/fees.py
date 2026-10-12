"""The Fees board (approved designs, 12 Oct 2026): who has not paid, then who paid.

A reading room's Fees screen used to be three "See students" shortcuts and the
plan list. The approved design is the list the person at the desk works from:
two figures (what is left to collect, what came in this month), then "Not
paid" — each student with what they owe and Take fee on the row — then "Paid
this month", each payment with its date and mode.

Figures come from the same rows the rest of the library reads: open charges
(`amount_due`, reversals excluded) and recorded payments allocated to library
charges, so this board, the home and a student's own page cannot disagree.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import connection

#: How many rows each half shows. A desk with more works from the Students list.
SHOWN = 100

_PAID = """
SELECT p.id, p.payment_date, p.primary_mode, sum(a.amount) AS amount,
       pa.name, m.id AS membership_id
  FROM payments_allocation a
  JOIN payments_payment p ON p.id = a.payment_id
  JOIN library_charge c ON c.id = a.document_id
  JOIN library_membership m ON m.id = c.membership_id
  JOIN parties_party pa ON pa.id = m.party_id
 WHERE a.tenant_id = %(t)s AND a.document_type = 'library_charge'
   AND p.status = 'recorded' AND p.payment_date >= %(month)s AND p.payment_date <= %(today)s
 GROUP BY p.id, p.payment_date, p.primary_mode, pa.name, m.id
 ORDER BY p.payment_date DESC, p.created_at DESC
 LIMIT %(limit)s
"""

_COLLECTED = """
SELECT coalesce(sum(a.amount), 0) FROM payments_allocation a
  JOIN payments_payment p ON p.id = a.payment_id
 WHERE a.tenant_id = %(t)s AND a.document_type = 'library_charge'
   AND p.status = 'recorded' AND p.payment_date >= %(month)s AND p.payment_date <= %(today)s
"""


def fees_board(tenant: Any, today: dt.date) -> dict:
    from apps.library.models import LibraryCharge, LibraryMembership

    month = today.replace(day=1)
    open_charges = (
        LibraryCharge.objects.filter(tenant=tenant, reversed_at__isnull=True)
        .open()
        .select_related("membership__party", "membership__membership_type")
        .order_by("charge_date", "number", "id")
    )
    by_member: dict[Any, dict] = {}
    for charge in open_charges:
        member = charge.membership
        row = by_member.get(member.id)
        if row is None:
            row = by_member[member.id] = {
                "membership_id": str(member.id),
                "party_id": str(member.party_id),
                "name": member.party.name,
                "plan": member.membership_type.name if member.membership_type_id else "",
                "since": charge.charge_date.isoformat(),
                "owes": Decimal("0"),
                # Take fee settles the oldest open charge first, as a person
                # paying at the desk would expect.
                "charge": {
                    "id": str(charge.id),
                    "number": charge.number,
                    "amount_due": f"{Decimal(charge.amount_due):.2f}",
                },
            }
        row["owes"] += Decimal(charge.amount_due)
    not_paid = sorted(by_member.values(), key=lambda r: (r["since"], r["name"]))[:SHOWN]
    to_collect = sum((r["owes"] for r in by_member.values()), Decimal("0"))

    params = {"t": tenant.pk, "month": month, "today": today, "limit": SHOWN}
    with connection.cursor() as cursor:
        cursor.execute(_COLLECTED, params)
        (collected,) = cursor.fetchone()
        cursor.execute(_PAID, params)
        paid_rows = cursor.fetchall()

    return {
        "students": LibraryMembership.objects.filter(tenant=tenant)
        .exclude(status="closed")
        .count(),
        "to_collect": f"{to_collect:.2f}",
        "collected_this_month": f"{Decimal(collected):.2f}",
        "not_paid": [{**r, "owes": f"{r['owes']:.2f}"} for r in not_paid],
        "paid": [
            {
                "payment_id": str(pid),
                "on": on.isoformat(),
                "mode": mode,
                "amount": f"{Decimal(amount):.2f}",
                "name": name,
                "membership_id": str(mid),
            }
            for pid, on, mode, amount, name, mid in paid_rows
        ],
    }
