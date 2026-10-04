"""The library's day — dashboard section and library home (LIB-11; task B14).

One statement of scalar subqueries rather than a query per figure, so the
section stays inside the core's section budget (`SECTION_QUERY_BUDGET`, three)
as well as LIB-11 BR-4's six. Every subquery is tenant-scoped and served by an
index the earlier tasks created: `ix_library_loan_issued`, `ix_library_loan_returned`,
`ix_library_loan_overdue`, `ix_library_hold_expiry`, `ix_library_membership_status`,
`ix_library_charge_fifo`.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import connection

#: FR-4 — the money figures need this codename as well as `library.loan.read`.
MONEY_PERMISSION = "library.member.read"
GROUPS_SHOWN = 12

_FIGURES = """
SELECT
  (SELECT count(*) FROM library_loan
     WHERE tenant_id = %(t)s AND issued_on = %(today)s AND status <> 'cancelled'),
  (SELECT count(*) FROM library_loan
     WHERE tenant_id = %(t)s AND status = 'returned' AND returned_on = %(today)s),
  (SELECT count(*) FROM library_loan_event
     WHERE tenant_id = %(t)s AND kind = 'renewed' AND on_date = %(today)s),
  (SELECT count(*) FROM library_loan WHERE tenant_id = %(t)s AND status = 'open'),
  (SELECT count(*) FROM library_loan
     WHERE tenant_id = %(t)s AND status = 'open' AND due_on < %(today)s),
  (SELECT count(DISTINCT membership_id) FROM library_loan
     WHERE tenant_id = %(t)s AND status = 'open' AND due_on < %(today)s),
  (SELECT count(*) FROM library_hold WHERE tenant_id = %(t)s AND status = 'ready'),
  (SELECT count(*) FROM library_hold
     WHERE tenant_id = %(t)s AND status = 'ready' AND collect_by = %(today)s),
  (SELECT count(*) FROM library_membership
     WHERE tenant_id = %(t)s AND status = 'active'
       AND valid_until >= %(today)s AND valid_until <= %(week)s),
  (SELECT count(*) FROM library_membership m
     WHERE m.tenant_id = %(t)s AND m.status <> 'closed' AND m.valid_until < %(today)s
       AND EXISTS (SELECT 1 FROM library_loan l
                   WHERE l.membership_id = m.id AND l.status = 'open')),
  (SELECT coalesce(sum(amount_due), 0) FROM library_charge
     WHERE tenant_id = %(t)s AND amount_due > 0 AND reversed_at IS NULL),
  (SELECT coalesce(sum(held_amount), 0) FROM payments_held_deposit
     WHERE tenant_id = %(t)s AND module = 'library' AND status = 'held')
"""


def library_dashboard(tenant: Any, today: dt.date) -> dict:
    """`LibraryDashboard` (LIB-11 §6), money included; `redact` removes it per reader."""
    with connection.cursor() as cursor:
        cursor.execute(
            _FIGURES, {"t": tenant.pk, "today": today, "week": today + dt.timedelta(days=7)}
        )
        row = cursor.fetchone()
    (issued, returned, renewed, out_now, overdue, members, ready, expiring) = row[:8]
    expiring_7d, expired_holding, open_charges, deposits = row[8:]
    return {
        "as_of": today.isoformat(),
        "today": {"issued": issued, "returned": returned, "renewed": renewed},
        "out_now": out_now,
        "overdue": {"loans": overdue, "members": members},
        "holds": {"ready": ready, "expiring_today": expiring},
        "memberships": {"expiring_7d": expiring_7d, "expired_holding": expired_holding},
        "money": {
            "open_charges": f"{Decimal(open_charges):.2f}",
            "deposits_held": f"{Decimal(deposits):.2f}",
        },
    }


def redact(data: dict, granted: frozenset) -> dict:
    """FR-4 — without `library.member.read` the `money` key is absent, not zeroed."""
    if MONEY_PERMISSION in granted:
        return data
    return {key: value for key, value in data.items() if key != "money"}


def overdue_by_group(tenant: Any, today: dt.date) -> list[dict]:
    """FR-3 — the school view, "9-B · 6 overdue": top twelve groups by overdue loans."""
    from django.db.models import Count

    from apps.library.models import LibraryLoan

    rows = (
        LibraryLoan.objects.filter(tenant=tenant, status="open", due_on__lt=today)
        .exclude(membership__group_label="")
        .values("membership__group_label")
        .annotate(loans=Count("id"), members=Count("membership", distinct=True))
        .order_by("-loans", "membership__group_label")[:GROUPS_SHOWN]
    )
    return [
        {"group_label": r["membership__group_label"], "loans": r["loans"], "members": r["members"]}
        for r in rows
    ]


#: FR-3 — the home's large buttons, each behind the codename its screen needs.
QUICK_ACTIONS = (
    ("counter", "/library/counter", "library.loan.write"),
    ("add_book", "/library/catalogue?add=1", "library.catalogue.write"),
    ("add_member", "/library/members?add=1", "library.member.write"),
    ("stock_check", "/library/verification", "library.verification.run"),
)


def library_home(tenant: Any, today: dt.date, granted: frozenset) -> dict:
    return {
        **redact(library_dashboard(tenant, today), granted),
        "overdue_by_group": overdue_by_group(tenant, today),
        "quick_actions": [
            {"key": key, "href": href}
            for key, href, codename in QUICK_ACTIONS
            if codename in granted
        ],
    }
