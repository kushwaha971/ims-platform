"""Expenses and their categories (Part 21 §21.3.10, EXP-01 / EXP-02).

`expenses_category` is from Sprint 0 because `seed_reference_data` seeds it
(Part 32 §32.3.4 S0-39). `expenses_expense` arrives with EXP-01.

── What is deliberately NOT a column here ───────────────────────────────────
`receipt_attachment_id` (EXP-01 FR-7). The `files` app has no
`files_attachment` table on this branch, so the column could only ever be null
and the drawer would offer a photo it cannot store. The seam is named in
`services/record.py`; the column arrives in the migration that adds the FK,
with the upload beside it.

`tax_code` / `tax_amount` / `supplier_gstin` / `itc_eligible` (FR-5). The GST
section is not part of this wave; four columns nobody writes would be four
claims about GST that no code has ever checked.
"""

from __future__ import annotations

from django.db import models

from apps.common.constants import MONEY_PAYMENT_MODE_CHOICES, PaymentMode, UpiApp
from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.models import SoftDeleteModel, TenantModel
from apps.expenses.constants import (
    CATEGORY_COLORS,
    NOTE_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    SEEDED_COLOR_BY_CODE,
    CategoryStatus,
    ExpenseStatus,
)


class ExpenseCategory(TenantModel, SoftDeleteModel):
    """Seeded: Rent, Salaries, Electricity, Transport, Purchases-misc, Food,
    Marketing, Fees, Other (Part 21 §21.3.10).

    A category is REFERENCED by an expense, not snapshotted (EXP-02 BR-1):
    renaming "Food" to "Chai-pani" relabels every past expense, which is the
    owner correcting a label rather than rewriting history.
    """

    id = uuid7_pk()
    name = models.CharField(max_length=80)
    system_code = models.CharField(max_length=32, null=True, blank=True)
    is_system = models.BooleanField(default=False)
    sort_order = models.SmallIntegerField(default=0)
    #: A palette TOKEN (`viz-1`…`viz-8`), never hex — see `CATEGORY_COLORS`.
    color = models.CharField(max_length=16, blank=True, default="")
    status = models.CharField(
        max_length=16, choices=CategoryStatus.choices, default=CategoryStatus.ACTIVE
    )

    class Meta:
        db_table = "expenses_category"
        verbose_name = "expense category"
        verbose_name_plural = "expense categories"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_expense_category_name",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args: object, **kwargs: object) -> None:
        """Give a category a colour the first time it is saved without one.

        Here rather than in one seeder, because three writers create rows —
        `seed_reference_data`, onboarding's business-type extras and the inline
        create in the expense drawer — and a colour rule in one of them is a
        grey chip from the other two. A seeded code gets its fixed token;
        anything else takes the next token round the palette, counted from the
        tenant's existing rows, so consecutive new categories do not all land on
        the same colour.
        """
        if not self.color:
            code = self.system_code or ""
            if code in SEEDED_COLOR_BY_CODE:
                self.color = SEEDED_COLOR_BY_CODE[code]
            else:
                existing = type(self).all_objects.filter(tenant_id=self.tenant_id).count()
                self.color = CATEGORY_COLORS[existing % len(CATEGORY_COLORS)]
        super().save(*args, **kwargs)  # type: ignore[arg-type]


class Expense(TenantModel):
    """EXP-01 — money that left the business and was not a supplier bill.

    ── Two kinds of expense, one table ─────────────────────────────────────
    `paid=true` is money that already left: it appears in the cashbook under
    its mode and posts NOTHING to the ledger (BR-2). `paid=false` is money
    still owed to a party: it posts exactly one ledger `credit`
    (`entry_type='expense'`, `source_type='expense'`, `source_id=<this id>`)
    and never touches the cashbook until a payment settles it (BR-5).

    ── Why an unpaid expense has no mode ───────────────────────────────────
    FR-2 lists "Paid by" as required. For an expense that has not been paid it
    is not a fact yet — and a mode stored on it would put a Cash row in the
    cashbook the moment somebody forgot the `paid` filter. The service drops it
    silently, as the ledger drops a mode on a debit, and
    `ck_expense_mode_iff_paid` makes that silence safe for every writer.

    ── Void, never delete, never edit the money ────────────────────────────
    BR-8: void keeps the row and its number; the ledger credit, if any, is
    reversed by a new ledger row dated the void date (LED-10 BR-6).
    """

    id = uuid7_pk()
    #: FR-3 — `EXP/26-27/0031`, from `platform_document_sequence`. Never reused;
    #: a voided expense keeps its number.
    number = models.CharField(max_length=32)
    category = models.ForeignKey(
        ExpenseCategory, on_delete=models.RESTRICT, related_name="expenses"
    )
    party = models.ForeignKey(
        "parties.Party",
        # A party with an expense against it is archived, never deleted
        # (Part 21 §21.5); RESTRICT is the database refusing the cascade.
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="expenses",
    )
    #: The BUSINESS date — what the merchant says happened. The cashbook
    #: buckets by this, never by `created_at` (EXP-03 BR-10).
    expense_date = models.DateField()
    amount = MoneyField()
    # A4b / R24: never `adjustment` — an expense is money that left.
    mode = models.CharField(
        max_length=16, choices=MONEY_PAYMENT_MODE_CHOICES, null=True, blank=True
    )
    #: "PhonePe kiya" — the same flattened choice the ledger's "You got"
    #: offers, stored the same way: only ever with `mode='upi'`.
    upi_app = models.CharField(max_length=16, choices=UpiApp.choices, null=True, blank=True)
    reference = models.CharField(max_length=REFERENCE_MAX_LENGTH, blank=True, default="")
    note = models.CharField(max_length=NOTE_MAX_LENGTH, blank=True, default="")
    paid = models.BooleanField(default=True)
    due_on = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=10, choices=ExpenseStatus.choices, default=ExpenseStatus.RECORDED
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    void_reason = models.CharField(max_length=160, null=True, blank=True)

    class Meta:
        db_table = "expenses_expense"
        verbose_name = "expense"
        verbose_name_plural = "expenses"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "number"], name="uq_expense_number"),
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_expense_amount_positive"
            ),
            # FR-6 — "Choose who you owe this to". An unpaid expense with nobody
            # to owe it to is a debt with no creditor and no khata to post to.
            models.CheckConstraint(
                condition=models.Q(paid=True) | models.Q(party__isnull=False),
                name="ck_expense_unpaid_has_party",
            ),
            # A paid expense says how it was paid; an unpaid one cannot yet.
            models.CheckConstraint(
                condition=(
                    models.Q(paid=True, mode__isnull=False)
                    | models.Q(paid=False, mode__isnull=True)
                ),
                name="ck_expense_mode_iff_paid",
            ),
            models.CheckConstraint(
                condition=models.Q(upi_app__isnull=True) | models.Q(mode=PaymentMode.UPI),
                name="ck_expense_upi_app_needs_upi",
            ),
            # BR-8 — a void carries its reason, always.
            models.CheckConstraint(
                condition=(
                    models.Q(status=ExpenseStatus.RECORDED)
                    | models.Q(status=ExpenseStatus.VOID, void_reason__isnull=False)
                ),
                name="ck_expense_void_has_reason",
            ),
        ]
        indexes = [
            # The list's default ordering and the cashbook's range scan.
            models.Index(
                fields=["tenant", "-expense_date", "-created_at"], name="ix_expense_tenant_date"
            ),
            # FR-9's tabs — All / Unpaid / Void — within a date range.
            models.Index(
                fields=["tenant", "status", "-expense_date"], name="ix_expense_tenant_status"
            ),
            models.Index(fields=["tenant", "category"], name="ix_expense_tenant_category"),
            models.Index(
                fields=["tenant", "party", "-expense_date"],
                condition=models.Q(party__isnull=False),
                name="ix_expense_tenant_party",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.number} {self.amount}"
