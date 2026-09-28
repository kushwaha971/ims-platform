"""Enumerations owned by the reports app (Part 26 §26.16 R16.1).

── Document vocabularies spelled as strings, deliberately ─────────────────
`sales.constants.DocumentKind` on this branch knows `invoice` and
`bill_of_supply`; SAL-01/04 add `estimate` and `credit_note` (Part 21 §21.3.7,
SAL-04 FR-1) on a branch that merges beside this one. The reports read the
column, not the enum, so the names below are the canonical STRINGS of §21.3.7 —
a credit note issued the day SAL-04 lands is netted out of today's sales and
listed in the day book without a change here, and an estimate is never read at
all because no set below names it.
"""

from __future__ import annotations

#: Tax documents that count as a SALE (RPT-01 FR-2, RPT-02 FR-2 `sale`).
SALE_KINDS: tuple[str, ...] = ("invoice", "bill_of_supply")
#: SAL-04 FR-1 — a credit note is a `sales_document` of this kind.
CREDIT_NOTE_KIND = "credit_note"
#: Statuses a sale is live in (canon §0.7): not a draft, not void.
SALE_LIVE_STATUSES: tuple[str, ...] = ("issued", "partially_paid", "paid", "overdue")
#: SAL-04 FR-1/FR-8 — `issued` is open credit, `applied` is fully used; both count.
CREDIT_NOTE_LIVE_STATUSES: tuple[str, ...] = ("issued", "applied")
VOID = "void"
DRAFT = "draft"

#: RPT-02 BR-1 — which payment modes are "bank". `cash` is cash; `other` is
#: neither (shown in In/Out, never in a balance).
CASH_MODE = "cash"
BANK_MODES: tuple[str, ...] = ("upi", "bank", "card", "cheque")

# ── RPT-01 — the dashboard ──────────────────────────────────────────────────
DASHBOARD = "dashboard"
#: FR-1 — "cached ≤ 60 s per tenant".
DASHBOARD_MAX_AGE_SECONDS = 60
#: The payload's SHAPE version, used as `params_hash`. Bump it when the stored
#: payload changes shape, so a row written by the previous release is a miss
#: rather than a KeyError.
DASHBOARD_PAYLOAD_VERSION = "dashboard-v1"
#: FR-3 / FR-4 / FR-5 — how many of each list.
RECENT_ACTIVITY_LIMIT = 10
TOP_DEBTORS_LIMIT = 5
LOW_STOCK_ITEMS_LIMIT = 5

# ── RPT-02 — the day book ───────────────────────────────────────────────────
DAY_BOOK = "day-book"
#: §10 — "Choose a range up to one year".
DAY_BOOK_MAX_DAYS = 366
DAY_BOOK_PAGE_SIZE = 100
DAY_BOOK_MAX_PAGE_SIZE = 200

#: FR-2's type codes, in the order the day book breaks a tie within one moment.
DAY_BOOK_TYPES: tuple[str, ...] = (
    "sale",
    "credit_note",
    "purchase",
    "payment_in",
    "payment_out",
    "expense",
    "manual_gave",
    "manual_got",
    "opening",
    "write_off",
    "reversal",
    "correction",
    "stock_adjustment",
)
