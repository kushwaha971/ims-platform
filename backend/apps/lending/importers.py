"""QA F10 — running loans, brought in from the lender's old register.

Every row is a loan ALREADY RUNNING (QA F8): given on a day in the past, with
something — possibly nothing yet — collected since. The commit calls
`loans.create_loan(existing={"collected_amount": …})` per row, the call the new-
loan form's "Loan already running" switch makes: the disbursal is an adjustment
no cash report counts, what was collected comes in as history oldest instalment
first, and the late days run from the first instalment really unpaid.

The columns are the ones a lender's register has, not the calculator's: how much,
when, how often, how many times, and either the amount collected each time
(a daily or weekly "fixed" loan) or the interest per month (weekly or monthly).
Validation runs the calculator itself, without the closed days — they move dates,
never whether a loan is valid — so no row costs a query.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from apps.imports.registry import (
    CoerceError,
    ColumnSpec,
    ImporterSpec,
    RowResult,
    coerce,
)
from apps.imports.registry import register as register_importer

NAME_MIN = 2
NAME_MAX = 160
COLLECT_CHOICES = ("daily", "weekly", "monthly")
ZERO = Decimal("0.00")

COLUMNS = (
    ColumnSpec(
        "name",
        required=True,
        help="required; the borrower's name",
        aliases=("borrower", "borrower_name", "customer", "नाम"),
    ),
    ColumnSpec(
        "mobile",
        help="10-digit mobile; +91 is optional",
        aliases=("phone", "mobile_no", "mobile_number", "contact", "फ़ोन"),
    ),
    ColumnSpec(
        "amount",
        required=True,
        help="money lent, e.g. 10000",
        aliases=("loan_amount", "principal", "lent", "given"),
        kind="money",
    ),
    ColumnSpec(
        "given_on",
        required=True,
        help="dd/mm/yyyy; the day the money was given",
        aliases=("given_date", "loan_date", "date", "disbursed_on"),
        kind="date",
    ),
    ColumnSpec(
        "collect",
        help="daily, weekly or monthly (default daily)",
        aliases=("frequency", "collection", "every"),
    ),
    ColumnSpec(
        "instalments",
        required=True,
        help="how many times you collect in all, e.g. 100",
        aliases=("instalment_count", "installments", "kist", "किस्त"),
    ),
    ColumnSpec(
        "each_instalment",
        help="amount collected each time, e.g. 120 (daily and weekly loans)",
        aliases=("per_instalment", "instalment_amount", "installment", "kist_amount"),
        kind="money",
    ),
    ColumnSpec(
        "interest",
        help="% a month, e.g. 3 (weekly and monthly loans without each_instalment)",
        aliases=("rate", "interest_rate", "byaj", "ब्याज"),
    ),
    ColumnSpec(
        "collected",
        help="money already collected on this loan, e.g. 6000 (blank means nothing yet)",
        aliases=("collected_so_far", "paid", "received", "jama"),
        kind="money",
    ),
    ColumnSpec("notes", help="up to 500 characters", aliases=("note", "remarks")),
)

TEMPLATE_ROWS = (
    {
        "name": "Geeta Devi",
        "mobile": "9820011223",
        "amount": "10000",
        "given_on": "01/08/2026",
        "collect": "daily",
        "instalments": "100",
        "each_instalment": "120",
        "collected": "6000",
    },
    {
        "name": "Mohan Lal",
        "mobile": "9830022334",
        "amount": "20000",
        "given_on": "15/06/2026",
        "collect": "monthly",
        "instalments": "12",
        "interest": "2",
        "collected": "3600",
    },
)


def _key(value: str) -> str:
    return " ".join(value.lower().split())


def _mobile_key(stored: str) -> str:
    try:
        return coerce.mobile(stored) or stored
    except CoerceError:
        return stored


def preflight(tenant: Any) -> dict:
    from apps.common.dates import tenant_today
    from apps.lending.constants import BorrowerStatus
    from apps.lending.models import LendingBorrower
    from apps.parties.models import Party

    blocked = {
        str(pid)
        for pid in LendingBorrower.objects.filter(
            tenant=tenant, status=BorrowerStatus.BLOCKED
        ).values_list("party_id", flat=True)
    }
    return {
        "tenant": tenant,
        "today": tenant_today(tenant),
        "parties": {
            _mobile_key(mobile): (str(pk), name, status)
            for pk, mobile, name, status in Party.objects.filter(
                tenant=tenant, mobile__isnull=False
            )
            .values_list("id", "mobile", "name", "status")
            .iterator(chunk_size=2000)
        },
        "borrower_names": {
            _key(name): name
            for name in LendingBorrower.objects.filter(tenant=tenant)
            .values_list("party__name", flat=True)
            .iterator(chunk_size=2000)
            if name
        },
        "blocked": blocked,
    }


def first_due(given: dt.date, collect: str) -> dt.date:
    """The register's habit: the first collection one period after the money went."""
    if collect == "monthly":
        from apps.dues.services.preview import add_months

        return add_months(given, 1)
    return given + dt.timedelta(days=7 if collect == "weekly" else 1)


def _terms(row_terms: dict, result: RowResult, today: dt.date) -> Any:
    """The calculator's own verdict, its field errors put on the sheet's columns."""
    from apps.common.exceptions import ValidationFailed
    from apps.lending.services.calculator import TermsError, compute
    from apps.lending.services.loans import parse_terms

    columns = {
        "principal": "amount",
        "disbursed_on": "given_on",
        "first_due_on": "given_on",
        "instalment_count": "instalments",
        "per_instalment_amount": "each_instalment",
        "rate": "interest",
        "frequency": "collect",
    }
    try:
        return compute(parse_terms(row_terms, today), today=today)
    except (TermsError, ValidationFailed) as refused:
        errors = getattr(refused, "errors", None) or getattr(refused, "details", {}) or {}
        for field, messages in errors.items():
            message = messages[0] if isinstance(messages, list) and messages else str(messages)
            result.error(columns.get(field, "amount"), "invalid_terms", str(message))
        return None


def validate_row(ctx: dict, row: dict[str, str], number: int) -> RowResult:
    from apps.lending.services.calculator import PRINCIPAL_MAX
    from apps.lending.services.loans import parse_existing

    result = RowResult()

    def attempt(column: str, fn: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(row.get(column, ""), *args, **kwargs)
        except CoerceError as exc:
            result.error(column, exc.code, exc.message)
            return None

    name = " ".join(coerce.text(row.get("name")).split())
    if not NAME_MIN <= len(name) <= NAME_MAX:
        result.error("name", "invalid_name", "Enter a name (2–160 characters).")
    mobile = attempt("mobile", coerce.mobile)
    party_id = None
    if mobile and mobile in ctx["parties"]:
        party_id, held_name, status = ctx["parties"][mobile]
        if status == "archived":
            result.error("mobile", "archived", f"{held_name} is archived. Restore them first.")
        elif party_id in ctx["blocked"]:
            result.error("mobile", "blocked", f"{held_name} is blocked from new loans.")
    elif not mobile and name and _key(name) in ctx["borrower_names"]:
        result.duplicate = ctx["borrower_names"][_key(name)]

    amount = attempt("amount", coerce.money, maximum=PRINCIPAL_MAX)
    if amount is None and "amount" not in {e[0] for e in result.errors}:
        result.error("amount", "required", "Enter the money lent.")
    given = attempt("given_on", coerce.date_value, today=ctx["today"])
    if given is None and "given_on" not in {e[0] for e in result.errors}:
        result.error("given_on", "required", "Enter the day the money was given.")
    collect = (
        attempt("collect", coerce.choice, COLLECT_CHOICES, message="Use daily, weekly or monthly.")
        or "daily"
    )
    raw_count = coerce.text(row.get("instalments"))
    count = int(raw_count) if raw_count.isdigit() and int(raw_count) > 0 else None
    if count is None:
        result.error("instalments", "required", "Enter how many times you collect, e.g. 100.")
    each = attempt("each_instalment", coerce.money)
    rate = attempt(
        "interest",
        coerce.decimal_value,
        places=4,
        code="invalid_rate",
        message="Enter the interest % a month, e.g. 3.",
    )
    collected = attempt("collected", coerce.money) or ZERO
    notes = attempt("notes", coerce.optional_text, max_length=500)

    if each:
        if collect == "monthly":
            result.error(
                "each_instalment",
                "monthly_fixed",
                "For a monthly loan write the interest % instead of each instalment.",
            )
        plan_type = "fixed_daily"
    else:
        if collect == "daily":
            result.error("each_instalment", "required", "Write the amount collected each day.")
        plan_type = "flat"

    data: dict[str, Any] = {}
    if not result.errors and amount and given and count:
        data = {
            "plan_type": plan_type,
            "principal": str(amount),
            "disbursed_on": given.isoformat(),
            "first_due_on": first_due(given, collect).isoformat(),
            "frequency": collect,
            "instalment_count": count,
            **({"per_instalment_amount": str(each)} if each else {}),
            **({"rate": str(rate or 0), "rate_unit": "per_month"} if plan_type == "flat" else {}),
            **({"party_id": party_id} if party_id else {"party": {"name": name, "mobile": mobile}}),
            "existing": {"collected_amount": str(collected)},
            **({"notes": notes} if notes else {}),
        }
        schedule = _terms(data, result, ctx["today"])
        if schedule is not None:
            from apps.common.exceptions import ValidationFailed

            try:
                parse_existing(data, schedule)
            except ValidationFailed as exc:
                result.error("collected", "invalid_collected", str(exc.details["existing"][0]))
            else:
                result.tally = {
                    "lent": amount,
                    "collected": collected,
                    "remaining": schedule.total_payable - collected,
                }
    result.clean = data
    result.preview = {
        "name": name,
        "mobile": mobile,
        "amount": str(amount) if amount is not None else None,
        "given_on": given.isoformat() if given else None,
        "collect": collect,
        "instalments": str(count) if count else None,
        "each_instalment": str(each) if each else None,
        "collected": str(collected) if collected else None,
    }
    return result


def commit_rows(ctx: dict, service_ctx: Any, rows: list[tuple[int, dict]], progress: Any) -> dict:
    """`create_loan(existing=…)` per row, in file order."""
    from apps.lending.services.loans import create_loan

    created = 0
    lent = ZERO
    collected = ZERO
    for index, (_number, clean) in enumerate(rows, start=1):
        create_loan(ctx=service_ctx, data=dict(clean))
        created += 1
        lent += Decimal(clean["principal"])
        collected += Decimal(clean["existing"]["collected_amount"])
        progress(index)
    return {"created_loans": created, "lent": f"{lent:.2f}", "collected": f"{collected:.2f}"}


def preview_totals(ctx: dict) -> dict:
    tally = ctx.get("tally") or {}
    return {
        key: f"{Decimal(tally.get(key) or 0):.2f}" for key in ("lent", "collected", "remaining")
    }


def register() -> ImporterSpec:
    """Called from the app's `ready()` (R27)."""
    return register_importer(
        ImporterSpec(
            kind="loans",
            label="imports.kind.loans",
            columns=COLUMNS,
            template_rows=TEMPLATE_ROWS,
            required_permissions=("lending.loan.create",),
            read_permission="lending.loan.read",
            preflight=preflight,
            validate_row=validate_row,
            commit_rows=commit_rows,
            unique_columns=(),
            max_rows=5_000,
            modules=("lending",),
            summary_fields=("created_loans", "lent", "collected"),
            records_route="/lending/loans",
            totals=preview_totals,
        )
    )
