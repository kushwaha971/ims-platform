"""Is this member clear? — LIB-13 BR-4, read by the no-dues report (B15) and certificate (B16).

Clear means: no loan open; no lost loan whose `lost_book` charge still has money due; and no
open library charge for the membership. A held deposit does not block clearance — it is returned
when the membership closes — but the certificate mentions it.

Evaluated on the records as they are now (EC-3: a member closed years ago is evaluated today).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Count, Q, Sum

from apps.common.money import ZERO
from apps.library.constants import ChargeKind, LoanStatus
from apps.library.models import LibraryCharge, LibraryLoan

OPEN_CHARGE = Q(amount_due__gt=0, reversed_at__isnull=True)


def evaluate_many(tenant: Any, members: list) -> list[dict]:
    """Three grouped queries for any number of members, in the order given."""
    ids = [m.id for m in members]
    out = dict(
        LibraryLoan.objects.filter(tenant=tenant, membership_id__in=ids, status=LoanStatus.OPEN)
        .values("membership_id")
        .annotate(n=Count("id"))
        .values_list("membership_id", "n")
    )
    lost = dict(
        LibraryLoan.objects.filter(tenant=tenant, membership_id__in=ids, status=LoanStatus.LOST)
        .filter(
            pk__in=LibraryCharge.objects.filter(OPEN_CHARGE, kind=ChargeKind.LOST_BOOK).values(
                "loan_id"
            )
        )
        .values("membership_id")
        .annotate(n=Count("id"))
        .values_list("membership_id", "n")
    )
    dues = dict(
        LibraryCharge.objects.filter(OPEN_CHARGE, tenant=tenant, membership_id__in=ids)
        .values("membership_id")
        .annotate(total=Sum("amount_due"))
        .values_list("membership_id", "total")
    )
    results = []
    for m in members:
        books, unpaid, owed = out.get(m.id, 0), lost.get(m.id, 0), dues.get(m.id) or ZERO
        results.append(
            {
                "clear": books == 0 and unpaid == 0 and owed == 0,
                "books_out": books,
                "lost_unpaid": unpaid,
                "dues": Decimal(owed),
            }
        )
    return results


def evaluate(member: Any) -> dict:
    """One member, with the items a not-clear page names (LIB-13 FR-3)."""
    result = evaluate_many(member.tenant, [member])[0]
    reasons: list[dict] = []
    if result["books_out"]:
        loans = LibraryLoan.objects.filter(membership=member, status=LoanStatus.OPEN)
        reasons.append(
            {
                "code": "books_out",
                "count": result["books_out"],
                "items": [
                    {
                        "loan_id": str(loan.id),
                        "title": loan.copy.title.title,
                        "accession_number": loan.copy.accession_number,
                        "due_on": loan.due_on.isoformat(),
                    }
                    for loan in loans.select_related("copy", "copy__title").order_by("due_on")
                ],
            }
        )
    if result["lost_unpaid"]:
        reasons.append({"code": "lost_unpaid", "count": result["lost_unpaid"]})
    if result["dues"]:
        reasons.append({"code": "dues", "amount": f"{result['dues']:.2f}"})
    return {**result, "reasons": reasons}
