"""EXP-01 FR-8 — `record_expense()`, the one write this module is built around.

Fat service (Part 26 §26.7 R7.1): every rule is here, the viewset only
authenticates, authorises and delegates.

── The order of operations is the safety argument ───────────────────────────
1. Validate everything that needs no row, and raise it all at once — a
   merchant who typed two things wrong is told both.
2. Resolve the category (tenant-scoped; another tenant's id is NOT FOUND).
3. For an unpaid expense, LOCK the party. Its balance moves below, and it
   moves correctly only if nobody else can move it until this commits.
4. Allocate the number — the sequence row is the hottest lock and is taken
   LAST (Part 20 §20.11.2 L4; see `numbering.py`).
5. Insert the expense, post the ledger credit when unpaid, audit. One atom:
   an expense without its ledger line is a debt the khata does not show, and a
   ledger line without its expense is a credit nobody can explain or void.

── Shared rules, not copies ─────────────────────────────────────────────────
The amount and the date go through the ledger's own parsers. An unpaid
expense's amount and date BECOME a ledger row, and LED-02 has already paid for
the lesson of two validators disagreeing (an opening once accepted a date in
the year 202600 while an ordinary entry refused it).

── Seams, named rather than stubbed ─────────────────────────────────────────
* **Receipt photo (FR-7).** `receipt_attachment_id` needs `files_attachment`,
  which is not on this branch. When `POST /attachments` exists, this function
  takes `receipt_attachment_id`, checks it belongs to the tenant and is a
  `kind='receipt'` upload, and links it; the drawer grows its tile at the same
  time. Until then the field is not accepted, rather than accepted and dropped.
* **GST (FR-5), the staff limit (BR-9) and the staff notification (§17)** are
  not in this wave; each needs a setting or a table that does not exist.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.constants import MONEY_PAYMENT_MODES, PaymentMode, UpiApp
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, NotFound, ValidationFailed
from apps.expenses.constants import NOTE_MAX_LENGTH, REFERENCE_MAX_LENGTH, ExpenseStatus
from apps.expenses.models import Expense, ExpenseCategory
from apps.expenses.services.ledger_link import post_expense_payable
from apps.expenses.services.numbering import allocate_expense_number
from apps.ledger.services.entries import _clean_text, _parse_amount, _parse_date
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.services.balance import lock_party


def _flag(raw: Any, *, default: bool) -> bool:
    """A JSON boolean, or the strings a form post sends. Anything else: the default."""
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str) and raw.lower() in ("true", "false"):
        return raw.lower() == "true"
    return default


def _parse_optional_date(raw: Any) -> dt.date | None | str:
    """`None` when absent, a date when valid, or the string "invalid"."""
    if raw in (None, ""):
        return None
    if isinstance(raw, dt.date):
        return raw
    try:
        return dt.date.fromisoformat(str(raw))
    except ValueError:
        return "invalid"


def validate_expense_payload(payload: dict, *, tenant: Any) -> dict:
    """Every field rule that needs no row. Raises one `ValidationFailed` with all of them."""
    details: dict[str, list[str]] = {}

    amount = _parse_amount(payload.get("amount"), details)

    # The ledger's date rule, keyed under this form's field name.
    date_errors: dict[str, list[str]] = {}
    expense_date = _parse_date(payload.get("expense_date"), tenant=tenant, details=date_errors)
    if date_errors:
        details["expense_date"] = date_errors["entry_date"]

    if not payload.get("category_id"):
        details["category_id"] = ["Choose a category."]

    paid = _flag(payload.get("paid"), default=True)

    mode = payload.get("mode") or None
    upi_app = payload.get("upi_app") or None
    reference = _clean_text(payload.get("reference") or "")
    if paid:
        if mode not in MONEY_PAYMENT_MODES:  # A4b / R24: never `adjustment`
            details["mode"] = ["Choose how you paid."]
        # Optional even for UPI ("UPI, not sure which" is true), and dropped
        # silently for every other mode: the client keeps the pick in form
        # state when the merchant switches from PhonePe to Cash, and refusing
        # a field that is no longer on screen is a form that cannot say why.
        if mode != PaymentMode.UPI:
            upi_app = None
        elif upi_app is not None and upi_app not in UpiApp.values:
            details["upi_app"] = ["Choose a UPI app from the list."]
        if len(reference) > REFERENCE_MAX_LENGTH:
            details["reference"] = [f"Keep the reference under {REFERENCE_MAX_LENGTH} characters."]
        if mode == PaymentMode.CASH:
            # A UTR or a cheque number on a cash payment is a leftover from a
            # mode the merchant switched away from, not a fact about the cash.
            reference = ""
    else:
        # Not paid yet, so there is no "how" — see the model's docstring.
        mode, upi_app, reference = None, None, ""

    due_on = _parse_optional_date(payload.get("due_on"))
    if paid:
        due_on = None
    elif due_on == "invalid":
        details["due_on"] = ["Enter a valid date."]
    elif due_on is None:
        details["due_on"] = ["Choose when this is due."]
    elif (
        isinstance(expense_date, dt.date) and isinstance(due_on, dt.date) and due_on < expense_date
    ):
        details["due_on"] = ["The due date cannot be before the expense date."]

    party_id = payload.get("party_id") or None
    if not paid and not party_id:
        details["party_id"] = ["Choose who you owe this to."]

    note = _clean_text(payload.get("note") or "")
    if len(note) > NOTE_MAX_LENGTH:
        details["note"] = [f"Keep the note under {NOTE_MAX_LENGTH} characters."]

    if details:
        raise ValidationFailed(details)

    return {
        "amount": amount,
        "expense_date": expense_date,
        "category_id": payload.get("category_id"),
        "paid": paid,
        "mode": mode,
        "upi_app": upi_app,
        "reference": reference,
        "due_on": due_on,
        "party_id": party_id,
        "note": note,
    }


def expense_snapshot(expense: Expense) -> dict:
    """§16 — the full row, money as strings (the audit log is JSON)."""
    return {
        "id": str(expense.id),
        "number": expense.number,
        "category_id": str(expense.category_id),
        "party_id": str(expense.party_id) if expense.party_id else None,
        "expense_date": expense.expense_date.isoformat(),
        "amount": str(expense.amount),
        "mode": expense.mode,
        "upi_app": expense.upi_app,
        "reference": expense.reference,
        "note": expense.note,
        "paid": expense.paid,
        "due_on": expense.due_on.isoformat() if expense.due_on else None,
        "status": expense.status,
    }


def _resolve_category(*, tenant: Any, category_id: Any) -> ExpenseCategory:
    """Any live category of this tenant — archived included (EXP-02 EC-7).

    The picker never offers an archived category, but one archived while the
    drawer was open is still a valid FK, and refusing the save would lose an
    expense the merchant has finished typing.
    """
    try:
        category = (
            ExpenseCategory.objects.for_tenant(tenant)
            .filter(deleted_at__isnull=True, pk=category_id)
            .first()
        )
    except (ValueError, TypeError):  # a malformed uuid
        category = None
    if category is None:
        raise ValidationFailed({"category_id": ["Choose a category from the list."]})
    return category


def _lock_open_party(*, tenant: Any, party_id: Any) -> Any:
    try:
        party = lock_party(tenant=tenant, party_id=party_id)
    except (ValueError, TypeError):
        party = None
    if party is None:
        # Canon §0.11 rule 2 — another tenant's party is NOT FOUND, never
        # forbidden; a 403 would confirm the row exists.
        raise NotFound("No such party.")
    if party.status == PartyStatus.ARCHIVED:
        raise BusinessRuleViolation(
            "party_archived",
            "This party is archived. Restore them to record an expense against them.",
            details={"party_id": str(party.id), "name": party.name},
        )
    return party


@transaction.atomic
def record_expense(*, ctx: Ctx, payload: dict) -> dict:
    """Write one expense. Returns `{expense, party_balance, ledger_entry_id}`.

    `party_balance` is the balance the ledger post left, or `None` for a paid
    expense (which moves no balance — BR-2). It travels in the result for the
    reason `post_entry` gives: the figure the merchant is shown must be the
    one this transaction produced.
    """
    cleaned = validate_expense_payload(payload, tenant=ctx.tenant)
    category = _resolve_category(tenant=ctx.tenant, category_id=cleaned["category_id"])

    party = None
    if cleaned["party_id"]:
        if cleaned["paid"]:
            # FR-6: a paid expense may NAME a party ("Paid to") without posting
            # anything to their khata. Read, not locked — no balance moves.
            try:
                party = Party.objects.for_tenant(ctx.tenant).filter(pk=cleaned["party_id"]).first()
            except (ValueError, TypeError):
                party = None
            if party is None:
                raise NotFound("No such party.")
        else:
            party = _lock_open_party(tenant=ctx.tenant, party_id=cleaned["party_id"])

    number = allocate_expense_number(tenant=ctx.tenant, expense_date=cleaned["expense_date"])

    expense = Expense.objects.create(
        tenant=ctx.tenant,
        created_by=ctx.actor if ctx.actor_type == "user" else None,
        number=number,
        category=category,
        party=party,
        expense_date=cleaned["expense_date"],
        amount=cleaned["amount"],
        mode=cleaned["mode"],
        upi_app=cleaned["upi_app"],
        reference=cleaned["reference"],
        note=cleaned["note"],
        paid=cleaned["paid"],
        due_on=cleaned["due_on"],
        status=ExpenseStatus.RECORDED,
    )

    balance: Decimal | None = None
    entry_id: str | None = None
    if not expense.paid:
        entry, balance = post_expense_payable(ctx=ctx, expense=expense, party=party)
        entry_id = str(entry.id)

    write_audit(
        ctx=ctx,
        action=AuditAction.EXPENSE_RECORDED,
        entity_type="expenses_expense",
        entity_id=expense.id,
        after=expense_snapshot(expense),
        metadata={
            "idempotency_key": ctx.idempotency_key,
            **({"ledger_entry_id": entry_id} if entry_id else {}),
        },
    )
    return {"expense": expense, "party_balance": balance, "ledger_entry_id": entry_id}
