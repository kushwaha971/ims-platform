"""Permission maps for the expenses app (canon §0.9, Part 20 §20.5.5).

`HasPermission` is fail-closed: an action missing from a map is denied.

EXP-01 §12: the accountant reads and never writes; staff record (the registry
grants them `expenses.expense.write` by default — the FRD's "off by default"
is a registry decision this app does not override) and never void; void is
`expenses.expense.void`, which only the owner and admin hold.
"""

from __future__ import annotations

from apps.common.permissions import HasPermission

ExpensePermissions = HasPermission(
    {
        "list": "expenses.expense.read",
        "retrieve": "expenses.expense.read",
        "create": "expenses.expense.write",
        "void": "expenses.expense.void",
    }
)

# EXP-02 §12 — viewing is `read` (the picker), creating inline is `write`.
ExpenseCategoryPermissions = HasPermission(
    {
        "list": "expenses.expense.read",
        "create": "expenses.expense.write",
    }
)

# EXP-03 §12 — the baseline is `expenses.expense.read` (today, cash only);
# the wider view is a second codename the view checks for itself, because it
# depends on the query rather than on the route.
CashbookPermissions = HasPermission("expenses.expense.read")

#: The codename that widens the cashbook beyond today's till (FR-13, BR-12).
FINANCIAL_READ = "reports.financial.read"
