"""Borrowers and loans: preview, create with disbursal, figures (FRD lending LEN-02 … LEN-05).

── What a save writes, in order, in one transaction (LEN-04) ─────────────────
1. The borrower (an existing one, or a new party and its borrower row).
2. The loan row with the terms as agreed and the calculator's derived figures.
3. Each deduction: a row, and a `charge` ledger line in the `loan` bucket.
4. The disbursal: a payment OUT of the cash handed over, allocated to this
   loan (the `lending_loan` target), which posts the `payment_out` line.
5. A per-loan dues plan (expectation mode, supplied instalments with their
   principal and interest) and its schedule. The engine posts each
   instalment's interest on its date; the principal is already owed from 3 + 4.

So from the day of the loan the borrower's loan balance is principal (cash +
deductions), and grows by each instalment's interest as it falls due — FRD
§0.3's money model, with every line owned by the app that owns its rule.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Max, Q

from apps.common.audit import write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.common.money import ZERO, q2
from apps.lending.constants import (
    LABEL_MAX,
    MODULE,
    NAME_MAX,
    NUMBER_BORROWER,
    NUMBER_LOAN,
    SOURCE_DEDUCTION,
    SUBJECT_LOAN,
    TARGET_LOAN,
    BorrowerStatus,
    DeductionKind,
    LoanStatus,
)
from apps.lending.models import (
    LendingBorrower,
    LendingLoan,
    LendingLoanDeduction,
    LendingRoute,
)
from apps.lending.services.calculator import (
    MON_TO_SAT,
    Deduction,
    LoanTerms,
    Schedule,
    TermsError,
    compute,
    schedule_json,
)

PAYMENT_MODES = ("cash", "upi", "bank", "cheque")


# ── parsing ─────────────────────────────────────────────────────────────────


def _money(errors: dict, data: dict, key: str, *, required: bool = True) -> Decimal | None:
    raw = data.get(key)
    if raw in (None, ""):
        if required:
            errors.setdefault(key, []).append("Enter an amount.")
        return None
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        errors.setdefault(key, []).append("Enter an amount.")
        return None
    if value != q2(value):
        errors.setdefault(key, []).append("To the paisa.")
    return value


def _day(errors: dict, data: dict, key: str) -> dt.date | None:
    raw = data.get(key)
    try:
        return dt.date.fromisoformat(str(raw)) if raw else None
    except ValueError:
        errors.setdefault(key, []).append("Enter a date like 2026-10-05.")
        return None


def parse_terms(data: Any, today: dt.date) -> LoanTerms:
    """The request's terms as `LoanTerms`, or a 400 with field errors."""
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors: dict[str, list[str]] = {}
    principal = _money(errors, data, "principal")
    rate = Decimal("0")
    if data.get("rate") not in (None, ""):
        try:
            rate = Decimal(str(data["rate"]))
        except (InvalidOperation, ValueError):
            errors.setdefault("rate", []).append("Enter a rate.")
    deductions: list[Deduction] = []
    for i, row in enumerate(data.get("deductions") or []):
        row = row if isinstance(row, dict) else {}
        kind = row.get("kind") or DeductionKind.PROCESSING_FEE
        if kind not in DeductionKind.values:
            errors.setdefault(f"deductions.{i}.kind", []).append("Choose a kind.")
        amount = _money(errors, row, "amount") or ZERO
        label = str(row.get("label") or "").strip()[:LABEL_MAX]
        deductions.append(Deduction(kind, label, amount))
    try:
        count = int(data.get("instalment_count") or 1)
    except (TypeError, ValueError):
        errors.setdefault("instalment_count", []).append("Enter a whole number.")
        count = 1
    disbursed = _day(errors, data, "disbursed_on") or today
    first_due = _day(errors, data, "first_due_on")
    if first_due is None:
        errors.setdefault("first_due_on", []).append("Enter the first due date.")
    weekdays = MON_TO_SAT
    raw_weekdays = data.get("collection_weekdays")
    if raw_weekdays not in (None, ""):
        # A bitmask Monday=1 … Sunday=64. A list, a word or a bool is a field
        # error, never `int(list)` and a 500 (L02 QA).
        if isinstance(raw_weekdays, bool) or not isinstance(raw_weekdays, (int, str)):
            errors.setdefault("collection_weekdays", []).append("Choose the collection days.")
        else:
            try:
                weekdays = int(raw_weekdays)
            except ValueError:
                errors.setdefault("collection_weekdays", []).append("Choose the collection days.")
            else:
                if not 1 <= weekdays <= 127:
                    errors.setdefault("collection_weekdays", []).append(
                        "Choose the collection days."
                    )
    # Parsed BEFORE the errors are raised, so its own error is not dropped.
    per_instalment = _money(errors, data, "per_instalment_amount", required=False)
    if errors:
        raise ValidationFailed(errors)
    assert principal is not None and first_due is not None
    terms = LoanTerms(
        plan_type=str(data.get("plan_type") or ""),
        principal=principal,
        disbursed_on=disbursed,
        first_due_on=first_due,
        frequency=str(data.get("frequency") or ""),
        instalment_count=count,
        rate=rate,
        rate_unit=str(data.get("rate_unit") or "per_month"),
        per_instalment_amount=per_instalment,
        collection_weekdays=weekdays,
        rounding_rule=str(data.get("rounding_rule") or "paise"),
        deductions=tuple(deductions),
    )
    return terms


LATE_FEE_KINDS = ("none", "flat_once", "per_day", "simple_interest")


def parse_late_fee(data: dict) -> dict:
    """LEN-09 FR-2 — the late-fee rule as columns, or a 400. Absent is `none`."""
    kind = str(data.get("late_fee_kind") or "none")
    errors: dict[str, list[str]] = {}
    if kind not in LATE_FEE_KINDS:
        errors["late_fee_kind"] = ["Choose a late-fee rule."]
    if kind in ("none",) or errors:
        if errors:
            raise ValidationFailed(errors)
        return {
            "late_fee_kind": "none",
            "late_fee_value": None,
            "late_fee_cap": None,
            "late_fee_grace_days": 0,
        }
    value = _money(errors, data, "late_fee_value")
    if value is not None and value <= 0:
        errors.setdefault("late_fee_value", []).append("Enter an amount.")
    cap = _money(errors, data, "late_fee_cap", required=kind != "flat_once")
    try:
        grace = int(data.get("late_fee_grace_days") or 0)
    except (TypeError, ValueError):
        grace = -1
    if not 0 <= grace <= 90:
        errors["late_fee_grace_days"] = ["Between 0 and 90 days."]
    if errors:
        raise ValidationFailed(errors)
    return {
        "late_fee_kind": kind,
        "late_fee_value": value,
        "late_fee_cap": cap if kind != "flat_once" else None,
        "late_fee_grace_days": grace,
    }


#: Calendar days one instalment spans, for how far ahead to read closed days.
SPAN_DAYS = {"daily": 2, "weekly": 7, "fortnightly": 14, "monthly": 31}


def _closed(tenant: Any, terms: LoanTerms) -> set[dt.date]:
    """The closed days a new loan's dates step around — every frequency (QA F8)."""
    from apps.platform_app.services.calendar import closed_days_between

    span = SPAN_DAYS.get(terms.frequency, 2)
    end = terms.first_due_on + dt.timedelta(days=terms.instalment_count * span + 60)
    return closed_days_between(tenant, terms.first_due_on, end, module=MODULE)


def _schedule(tenant: Any, terms: LoanTerms, today: dt.date) -> Schedule:
    try:
        return compute(terms, today=today, closed=_closed(tenant, terms))
    except TermsError as refused:
        raise ValidationFailed(refused.errors) from None


def preview(*, tenant: Any, data: Any) -> dict:
    """`POST /lending/loans/preview` — the schedule and the figures; writes nothing."""
    today = tenant_today(tenant)
    schedule = _schedule(tenant, parse_terms(data, today), today)
    return {"data": schedule_json(schedule), "warnings": schedule.warnings}


# ── borrowers ───────────────────────────────────────────────────────────────


def borrower_party_ids(tenant: Any) -> Any:
    return LendingBorrower.objects.filter(tenant=tenant).values("party_id")


def _borrower(ctx: Any, data: dict) -> LendingBorrower:
    """An existing borrower by id, or one made for a party (existing or new)."""
    from apps.parties.models import Party
    from apps.parties.services.crud import create_party
    from apps.platform_app.services.sequences import allocate_counter

    raw = data.get("borrower_id")
    if raw:
        found = LendingBorrower.objects.filter(tenant=ctx.tenant, pk=raw).first()
        if found is None:
            raise ValidationFailed({"borrower_id": ["Choose a borrower."]})
        return found
    party = None
    if data.get("party_id"):
        party = Party.objects.for_tenant(ctx.tenant).filter(pk=data["party_id"]).first()
        if party is None:
            raise ValidationFailed({"party_id": ["Choose a person."]})
    else:
        new = data.get("party") if isinstance(data.get("party"), dict) else None
        if not new or not str(new.get("name") or "").strip():
            raise ValidationFailed({"party.name": ["Enter the borrower's name."]})
        party, _warnings = create_party(
            ctx=ctx,
            payload={
                "name": str(new["name"]).strip(),
                "mobile": str(new.get("mobile") or "").strip() or None,
            },
        )
    existing = LendingBorrower.objects.filter(tenant=ctx.tenant, party=party).first()
    if existing is not None:
        return existing
    route = None
    if data.get("route_id"):
        route = LendingRoute.objects.filter(tenant=ctx.tenant, pk=data["route_id"]).first()
    return LendingBorrower.objects.create(
        tenant=ctx.tenant,
        created_by=getattr(ctx, "actor", None),
        party=party,
        borrower_number=allocate_counter(tenant=ctx.tenant, kind=NUMBER_BORROWER),
        route=route,
        area=str(data.get("area") or "").strip()[:NAME_MAX],
    )


# ── the disbursal target (protocol v2: out, loan bucket, explicit only) ─────


class LendingLoanTarget:
    """A payment OUT handing the loan's cash to the borrower (FRD §0.3)."""

    document_type = TARGET_LOAN
    direction = "out"
    bucket = "loan"
    auto = False
    _ORDER = ("disbursed_on", "number", "id")

    def _rows(self, tenant: Any) -> Any:
        return LendingLoan.objects.filter(tenant=tenant)

    def open_documents(self, *, tenant: Any, party_id: Any) -> list[Any]:
        return [
            loan
            for loan in self._rows(tenant).filter(party_id=party_id).order_by(*self._ORDER)
            if self.is_open(loan)
        ]

    def find(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return list(self._rows(tenant).filter(pk__in=ids).order_by(*self._ORDER))

    def lock(self, *, tenant: Any, ids: list[Any]) -> list[Any]:
        return list(
            self._rows(tenant).select_for_update().filter(pk__in=ids).order_by(*self._ORDER)
        )

    def lock_open_for_party(self, *, tenant: Any, party_id: Any) -> list[Any]:
        return [
            loan
            for loan in self._rows(tenant)
            .select_for_update()
            .filter(party_id=party_id)
            .order_by(*self._ORDER)
            if self.is_open(loan)
        ]

    def is_open(self, document: Any) -> bool:
        return document.status == LoanStatus.ACTIVE and self.outstanding(document) > ZERO

    def outstanding(self, document: Any) -> Decimal:
        return max(
            q2(Decimal(document.cash_handed_over) - Decimal(document.disbursed_amount)), ZERO
        )

    def party_id(self, document: Any) -> Any:
        return document.party_id

    def apply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        if amount > self.outstanding(document):
            raise BusinessRuleViolation(
                "over_allocated",
                "This is more than the cash this loan hands over.",
                details={"outstanding": str(self.outstanding(document))},
            )
        document.disbursed_amount = q2(Decimal(document.disbursed_amount) + amount)
        document.save(update_fields=["disbursed_amount", "updated_at"])
        return document.status, document.status

    def unapply(
        self,
        *,
        document: Any,
        amount: Decimal,
        today: dt.date,
        payment_id: Any = None,
        ctx: Any = None,
    ) -> tuple[str, str]:
        if (
            payment_id is not None
            and payment_id == document.disbursal_payment_id
            and document.status == LoanStatus.ACTIVE
        ):
            raise BusinessRuleViolation(
                "loan_disbursal_locked",
                "The money given cannot be voided while the loan runs. Cancel the loan instead.",
                details={"loan_id": str(document.id)},
            )
        document.disbursed_amount = q2(Decimal(document.disbursed_amount) - amount)
        document.save(update_fields=["disbursed_amount", "updated_at"])
        return document.status, document.status

    def summary(self, document: Any) -> dict:
        return {
            "document_type": TARGET_LOAN,
            "document_id": str(document.id),
            "kind": "lending_loan",
            "number": document.number,
            "label": f"Loan {document.number}",
            "document_date": document.disbursed_on.isoformat(),
            "due_on": None,
            "grand_total": f"{Decimal(document.cash_handed_over):.2f}",
            "amount_due": f"{self.outstanding(document):.2f}",
            "status": document.status,
        }

    def audit_action(self) -> str:
        return "lending.loan.updated"


def resolve_deductions(ids: set[str]) -> dict[str, dict]:
    rows = LendingLoanDeduction.objects.filter(pk__in=ids).select_related("loan")
    return {
        str(row.id): {"number": row.loan.number, "status": row.loan.status, "kind": "lending_loan"}
        for row in rows
    }


def loan_labels(ids: set[Any]) -> dict[Any, str]:
    return {
        pk: f"Loan {number}"
        for pk, number in LendingLoan.objects.filter(pk__in=ids).values_list("id", "number")
    }


def on_due_changed(ctx: Any, due: Any, before: str, after: str) -> None:
    """The engine's hook: a loan whose every instalment is settled closes itself;
    a void that reopens one reopens it (FRD §0.6)."""
    from apps.dues.models import DuesDue

    loan = LendingLoan.objects.select_for_update().filter(pk=due.schedule.subject_id).first()
    if loan is None:
        return
    open_left = (
        DuesDue.objects.filter(schedule_id=due.schedule_id)
        .exclude(status__in=["paid", "cancelled", "skipped"])
        .exists()
    )
    today = tenant_today(loan.tenant)
    if loan.status == LoanStatus.ACTIVE and not open_left:
        loan.status, loan.close_reason, loan.closed_on = LoanStatus.CLOSED, "completed", today
        loan.save(update_fields=["status", "close_reason", "closed_on", "updated_at"])
        _audit(ctx, "lending.loan.closed", loan)
    elif (
        loan.status == LoanStatus.CLOSED
        and open_left
        and loan.close_reason in ("completed", "early")
        and _owes(loan)
    ):
        loan.status, loan.close_reason, loan.closed_on = LoanStatus.ACTIVE, "", None
        loan.save(update_fields=["status", "close_reason", "closed_on", "updated_at"])
        _audit(ctx, "lending.loan.reopened", loan)


def _owes(loan: LendingLoan) -> bool:
    """Something is still owed (a prepaid instalment waiting for its date is not)."""
    from apps.lending.services.collections import remaining

    return remaining(loan) > ZERO


def _audit(ctx: Any, action: str, loan: LendingLoan, **after: Any) -> None:
    write_audit(
        ctx=ctx,
        action=action,
        entity_type="lending_loan",
        entity_id=loan.id,
        after={"number": loan.number, "status": loan.status, **after},
    )


# ── create (LEN-04) ─────────────────────────────────────────────────────────


def parse_existing(data: dict, schedule: Schedule) -> Decimal | None:
    """QA F8 — `existing: {instalments_collected | collected_amount}` for a loan brought in
    from paper, or None for a new loan. N instalments are the first N on the schedule
    (what a paper register counts); an amount may be any figure. Either way it must
    leave something owed: a loan paid in full has nothing to bring in. An amount of 0
    is a loan from the old book whose first collection has not come yet (QA F10's
    loan import: given last week, nothing paid) — still not today's cash."""
    raw = data.get("existing")
    if raw in (None, False, ""):
        return None
    if not isinstance(raw, dict):
        raise ValidationFailed({"existing": ["Say what was already collected."]})
    total = schedule.total_payable
    count = raw.get("instalments_collected")
    if count not in (None, ""):
        try:
            n = int(count)
        except (TypeError, ValueError):
            n = -1
        if not 0 < n < len(schedule.rows):
            raise ValidationFailed(
                {"existing": [f"Enter how many of the {len(schedule.rows)} instalments were paid."]}
            )
        amount = q2(sum((r.amount for r in schedule.rows[:n]), ZERO))
    else:
        try:
            amount = q2(Decimal(str(raw.get("collected_amount") or "")))
        except (ArithmeticError, ValueError):
            raise ValidationFailed({"existing": ["Enter the amount already collected."]}) from None
    if amount < ZERO or (amount == ZERO and count not in (None, "")):
        raise ValidationFailed({"existing": ["Enter the amount already collected."]})
    if amount >= total:
        raise ValidationFailed(
            {"existing": [f"Already collected must be less than the whole loan (Rs {total:,.2f})."]}
        )
    return amount


@transaction.atomic
def create_loan(*, ctx: Any, data: Any) -> LendingLoan:
    from apps.dues.services.plans import create_plan
    from apps.dues.services.schedules import create_schedule
    from apps.ledger.constants import EntryType
    from apps.ledger.services.postings import post_source_entry
    from apps.parties.services.balance import lock_party
    from apps.payments.services.record import record_adjustment, record_payment
    from apps.platform_app.services.sequences import allocate_counter

    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    today = tenant_today(ctx.tenant)
    terms = parse_terms(data, today)
    schedule = _schedule(ctx.tenant, terms, today)
    already = parse_existing(data, schedule)
    mode = data.get("payment_mode") or "cash"
    if mode not in PAYMENT_MODES:
        raise ValidationFailed({"payment_mode": ["Choose cash, UPI, bank or cheque."]})
    note = str(data.get("notes") or "").strip()[:500]
    borrower = _borrower(ctx, data)
    # Re-read under a row lock: `block_borrower` locks the same row, so a block
    # that commits while this loan is being written cannot be read past.
    borrower = LendingBorrower.objects.select_for_update().get(pk=borrower.pk)
    if borrower.status == BorrowerStatus.BLOCKED:
        # Only a NEW loan is refused. Collections on the loans they hold go on
        # (`services.borrowers`): blocking somebody never stops money coming back.
        raise BusinessRuleViolation(
            "borrower_blocked",
            "This borrower is blocked. Unblock them to give a new loan.",
            details={"borrower_id": str(borrower.id)},
        )
    party = lock_party(tenant=ctx.tenant, party_id=borrower.party_id)
    if party.status == "archived":
        raise BusinessRuleViolation(
            "party_archived",
            "This person is archived. Restore them or choose another.",
            details={"party_id": str(party.id)},
        )
    route = borrower.route
    if data.get("route_id"):
        route = LendingRoute.objects.filter(tenant=ctx.tenant, pk=data["route_id"]).first()
    seq = 0
    if route is not None:
        top = LendingLoan.objects.filter(tenant=ctx.tenant, route=route).aggregate(
            m=Max("route_seq")
        )
        seq = (top["m"] or 0) + 1
    late_fee = parse_late_fee(data)
    number = allocate_counter(tenant=ctx.tenant, kind=NUMBER_LOAN)
    try:
        with transaction.atomic():
            loan = LendingLoan.objects.create(
                tenant=ctx.tenant,
                created_by=getattr(ctx, "actor", None),
                number=number,
                borrower=borrower,
                party=party,
                route=route,
                route_seq=seq,
                plan_type=terms.plan_type,
                principal=terms.principal,
                rate=terms.rate if terms.plan_type != "fixed_daily" else 0,
                rate_unit=terms.rate_unit,
                frequency=terms.frequency,
                instalment_count=len(schedule.rows),
                per_instalment_amount=terms.per_instalment_amount,
                collection_weekdays=terms.collection_weekdays,
                rounding_rule=terms.rounding_rule,
                disbursed_on=terms.disbursed_on,
                first_due_on=terms.first_due_on,
                maturity_on=schedule.maturity_on,
                instalment_amount=schedule.instalment_amount,
                total_interest=schedule.total_interest,
                total_payable=schedule.total_payable,
                deductions_total=schedule.deductions_total,
                **late_fee,
                cash_handed_over=schedule.cash_handed_over,
                effective_annual_rate=schedule.effective_annual_rate,
                notes=note,
            )
    except IntegrityError:  # pragma: no cover - the number is allocated under a lock
        raise ValidationFailed({"number": ["Try again."]}) from None

    for d in terms.deductions:
        row = LendingLoanDeduction.objects.create(
            tenant=ctx.tenant, loan=loan, kind=d.kind, label=d.label or d.kind, amount=d.amount
        )
        post_source_entry(
            ctx=ctx,
            party=party,
            amount=d.amount,
            entry_date=terms.disbursed_on,
            entry_type=EntryType.CHARGE,
            source_type=SOURCE_DEDUCTION,
            source_id=row.id,
            note=f"{row.label} — deducted at disbursal ({loan.number})",
            source_number=loan.number,
            bucket="loan",
        )

    # QA F8 — a loan brought in from paper: the money left the drawer long before
    # this book, so its disbursal is an `adjustment` (R24/R37) no cash report counts.
    give = record_adjustment if already is not None else record_payment
    disbursal = give(
        ctx=ctx,
        payload={
            "direction": "out",
            "party_id": str(party.id),
            "payment_date": terms.disbursed_on.isoformat(),
            "mode_breakup": [
                {
                    "mode": "adjustment" if already is not None else mode,
                    "amount": f"{schedule.cash_handed_over:.2f}",
                    **(
                        {"reference": str(data.get("reference"))}
                        if data.get("reference") and already is None
                        else {}
                    ),
                }
            ],
            "allocations": [
                {
                    "document_type": TARGET_LOAN,
                    "document_id": str(loan.id),
                    "amount": f"{schedule.cash_handed_over:.2f}",
                }
            ],
            "note": f"Loan {loan.number} given"
            + (" (brought forward)" if already is not None else "")
            + (f" — {note}" if note else ""),
        },
    )

    plan = create_plan(
        ctx=ctx,
        module=MODULE,
        data={
            "name": f"Loan {loan.number}",
            "mode": "expectation",
            "posting": "none",
            "amount_rule": "supplied",
            "recurrence": {
                "freq": "once",
                "explicit_dates": [r.due_on.isoformat() for r in schedule.rows],
            },
            "rounding_rule": "paise",
            "allocation_order": "oldest_first",
            "grace_days": 0,
        },
    )
    result = create_schedule(
        ctx=ctx,
        module=MODULE,
        plan_id=plan.id,
        party_id=party.id,
        subject_type=SUBJECT_LOAN,
        subject_id=loan.id,
        start_on=schedule.rows[0].due_on,
        end_on=schedule.maturity_on,
        supplied=[
            {
                "due_on": r.due_on,
                "amount": r.amount,
                "components": [
                    c
                    for c in (
                        {"component": "principal", "amount": r.principal},
                        {"component": "interest", "amount": r.interest},
                    )
                    if c["amount"] > ZERO
                ]
                or [{"component": "principal", "amount": r.amount}],
            }
            for r in schedule.rows
        ],
        confirm_backdated=True,
    )
    loan.schedule_id = result.schedule.id
    loan.disbursal_payment_id = disbursal["payment"].id
    loan.save(update_fields=["schedule_id", "disbursal_payment_id", "updated_at"])
    if already:
        from apps.lending.services.collections import record_opening

        record_opening(ctx=ctx, loan=loan, amount=already, on=today)
    _audit(
        ctx,
        "lending.loan.created",
        loan,
        principal=f"{loan.principal:.2f}",
        cash_handed_over=f"{loan.cash_handed_over:.2f}",
        total_payable=f"{loan.total_payable:.2f}",
        effective_annual_rate=f"{loan.effective_annual_rate:.2f}",
    )
    return loan


# ── reading ─────────────────────────────────────────────────────────────────


def figures(loan: LendingLoan, today: dt.date) -> dict:
    """FRD §0.4's figures, from the dues (one query)."""
    from apps.dues.models import DuesDue
    from apps.dues.services.settlement import outstanding

    dues = list(
        DuesDue.objects.filter(schedule_id=loan.schedule_id)
        .exclude(status__in=["cancelled", "skipped"])
        .order_by("due_on", "seq")
    )
    due_today = arrears = remaining = paid = ZERO
    oldest_late: dt.date | None = None
    next_due: Any = None
    for due in dues:
        left = outstanding(due)
        remaining += left
        paid += Decimal(due.settled_amount)
        if left <= ZERO:
            continue
        if due.due_on == today:
            due_today += left
        elif due.due_on < today:
            arrears += left
            oldest_late = oldest_late or due.due_on
        elif next_due is None:
            next_due = due
    return {
        "due_today": f"{q2(due_today):.2f}",
        "arrears": f"{q2(arrears):.2f}",
        "remaining": f"{q2(remaining):.2f}",
        "collected": f"{q2(paid):.2f}",
        "days_past_due": (today - oldest_late).days if oldest_late else 0,
        "next_due_on": next_due.due_on.isoformat() if next_due else None,
        "next_due_amount": f"{outstanding(next_due):.2f}" if next_due else None,
    }


def borrower_summaries(tenant: Any, borrower_ids: Any, today: dt.date) -> dict[Any, dict]:
    """Each borrower's loans, added up — in three queries however many borrowers.

    A borrower and a loan are different things (owner, 12 Oct 2026): one person
    may hold several loans, each with its own terms, schedule and status, and
    every money path in this module is per LOAN. What was missing was the
    person: nothing said "Ramesh has three loans, ₹35,000 given, ₹9,000 back,
    ₹29,500 left" — the Borrowers list showed a name and a phone number, and a
    tap opened the shop's khata page, which knows nothing of loans.

    The figures are sums of the same per-loan figures `figures()` returns, read
    from the dues in bulk, so a borrower's total can never disagree with their
    loans added up by hand. `left` and `late` count RUNNING loans only: a loan
    that was written off or cancelled is not money anybody is waiting for.
    """
    from apps.dues.models import DuesDue

    ids = list(borrower_ids)
    out: dict[Any, dict] = {
        bid: {
            "loans": 0,
            "running": 0,
            "given": ZERO,
            "collected": ZERO,
            "left": ZERO,
            "late": ZERO,
        }
        for bid in ids
    }
    if not ids:
        return {}
    loans_of = list(
        LendingLoan.objects.filter(tenant=tenant, borrower_id__in=ids)
        .exclude(status=LoanStatus.CANCELLED)
        .values("id", "borrower_id", "schedule_id", "status", "principal")
    )
    by_schedule = {row["schedule_id"]: row for row in loans_of if row["schedule_id"]}
    for row in loans_of:
        mine = out[row["borrower_id"]]
        mine["loans"] += 1
        mine["given"] += Decimal(row["principal"])
        if row["status"] == LoanStatus.ACTIVE:
            mine["running"] += 1
    dues = DuesDue.objects.filter(schedule_id__in=list(by_schedule)).exclude(
        status__in=["cancelled", "skipped"]
    )
    for due in dues:
        loan = by_schedule[due.schedule_id]
        mine = out[loan["borrower_id"]]
        mine["collected"] += Decimal(due.settled_amount)
        if loan["status"] != LoanStatus.ACTIVE:
            continue
        owed = Decimal(due.amount) + Decimal(due.penalty_amount) - Decimal(due.waived_amount)
        left = max(q2(owed - Decimal(due.settled_amount)), ZERO)
        mine["left"] += left
        if due.due_on < today:
            mine["late"] += left
    return {
        bid: {
            "loans": v["loans"],
            "running": v["running"],
            "given": f"{q2(v['given']):.2f}",
            "collected": f"{q2(v['collected']):.2f}",
            "left": f"{q2(v['left']):.2f}",
            "late": f"{q2(v['late']):.2f}",
        }
        for bid, v in out.items()
    }


def book_totals(tenant: Any, today: dt.date) -> dict:
    """What is left and what is late on every running loan, in ONE query.

    The same arithmetic as `borrower_summaries` (an instalment's amount plus
    late fees, less waivers and what was paid, never below zero), summed by the
    database, so the line above the Borrowers table agrees with its rows added
    up and does not read every instalment of the book into Python to say so.
    """
    from django.db.models import DecimalField, F, Sum, Value
    from django.db.models.functions import Greatest

    from apps.dues.models import DuesDue

    left = Greatest(
        F("amount") + F("penalty_amount") - F("waived_amount") - F("settled_amount"),
        Value(ZERO),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
    got = (
        DuesDue.objects.filter(
            schedule_id__in=LendingLoan.objects.filter(
                tenant=tenant, status=LoanStatus.ACTIVE
            ).values("schedule_id")
        )
        .exclude(status__in=["cancelled", "skipped"])
        .aggregate(left=Sum(left), late=Sum(left, filter=Q(due_on__lt=today)))
    )
    return {
        "left": f"{q2(got['left'] or ZERO):.2f}",
        "late": f"{q2(got['late'] or ZERO):.2f}",
    }


def loan_json(loan: LendingLoan, today: dt.date, *, with_schedule: bool = False) -> dict:
    out = {
        "id": str(loan.id),
        "number": loan.number,
        "status": loan.status,
        "close_reason": loan.close_reason,
        "closed_on": loan.closed_on.isoformat() if loan.closed_on else None,
        "borrower": {
            "id": str(loan.borrower_id),
            "number": loan.borrower.borrower_number,
            "party_id": str(loan.party_id),
            "name": loan.party.name,
            "mobile": loan.party.mobile,
            "area": loan.borrower.area,
            "status": loan.borrower.status,
        },
        "route": {"id": str(loan.route_id), "name": loan.route.name} if loan.route_id else None,
        "route_seq": loan.route_seq,
        "plan_type": loan.plan_type,
        "frequency": loan.frequency,
        "principal": f"{loan.principal:.2f}",
        "rate": f"{loan.rate:.4f}",
        "rate_unit": loan.rate_unit,
        "instalment_count": loan.instalment_count,
        "instalment_amount": f"{loan.instalment_amount:.2f}",
        "total_interest": f"{loan.total_interest:.2f}",
        "total_payable": f"{loan.total_payable:.2f}",
        "deductions_total": f"{loan.deductions_total:.2f}",
        "cash_handed_over": f"{loan.cash_handed_over:.2f}",
        "effective_annual_rate": f"{loan.effective_annual_rate:.2f}",
        "disbursed_on": loan.disbursed_on.isoformat(),
        "first_due_on": loan.first_due_on.isoformat(),
        "maturity_on": loan.maturity_on.isoformat(),
        "notes": loan.notes,
        "status_reason": loan.status_reason,
        "late_fee": {
            "kind": loan.late_fee_kind,
            "value": f"{loan.late_fee_value:.2f}" if loan.late_fee_value is not None else None,
            "cap": f"{loan.late_fee_cap:.2f}" if loan.late_fee_cap is not None else None,
            "grace_days": loan.late_fee_grace_days,
        },
        "version": loan.version,
        **figures(loan, today),
    }
    if with_schedule:
        from apps.dues.models import DuesDue

        out["lender"] = lender_json(loan.tenant)
        from apps.lending.models import LendingCollection
        from apps.lending.services.closing import write_off_amount

        # LEN-10 — what the write-off dialog pins, and whether Cancel is still possible.
        active = loan.status == LoanStatus.ACTIVE
        out["write_off_amount"] = f"{write_off_amount(loan):.2f}" if active else None
        out["has_collections"] = LendingCollection.objects.filter(
            loan=loan, voided_at__isnull=True
        ).exists()
        from apps.dues.services.settlement import outstanding

        out["deductions"] = [
            {"kind": d.kind, "label": d.label, "amount": f"{d.amount:.2f}"}
            for d in loan.deductions.order_by("created_at")
        ]
        out["schedule"] = [
            {
                "id": str(due.id),
                "seq": due.seq,
                "due_on": due.due_on.isoformat(),
                "amount": f"{Decimal(due.amount):.2f}",
                "settled": f"{Decimal(due.settled_amount):.2f}",
                "outstanding": f"{outstanding(due):.2f}",
                "late_fee": f"{Decimal(due.penalty_amount):.2f}",
                "waived": f"{Decimal(due.waived_amount):.2f}",
                "status": due.status,
            }
            for due in DuesDue.objects.filter(schedule_id=loan.schedule_id).order_by(
                "due_on", "seq"
            )
        ]
    return out


def lender_json(tenant: Any) -> dict:
    """The letterhead the loan's papers carry — receipt, statement, closure letter: the
    lender's own name, address and phone, never the product's (BRAND-A)."""
    address = dict(tenant.address or {})
    lines = [address.get(k, "") for k in ("line1", "line2")]
    place = ", ".join(x for x in (address.get("city", ""), address.get("pincode", "")) if x)
    return {
        "name": tenant.name,
        "legal_name": tenant.legal_name or "",
        "address": [x for x in (*lines, place) if x],
        "phone": tenant.phone or "",
        "gstin": tenant.gstin or "",
    }


def get_loan(tenant: Any, loan_id: Any) -> LendingLoan:
    loan = (
        LendingLoan.objects.filter(tenant=tenant, pk=loan_id)
        .select_related("party", "borrower", "route")
        .first()
    )
    if loan is None:
        raise NotFound()
    return loan


def list_loans(tenant: Any, params: Any) -> Any:
    qs = LendingLoan.objects.filter(tenant=tenant).select_related("party", "borrower", "route")
    status = params.get("status") or "active"
    if status != "all":
        qs = qs.filter(status=status)
    if params.get("route"):
        qs = qs.filter(route_id=params["route"])
    if params.get("borrower"):
        qs = qs.filter(borrower_id=params["borrower"])
    term = (params.get("q") or "").strip()
    if term:
        qs = qs.filter(
            Q(party__name__icontains=term)
            | Q(party__mobile__contains=term)
            | Q(number__iexact=term)
        )
    return qs.order_by("route__sort_order", "route_seq", "number")
