"""Purchase bills and their lines (Part 21 §21.3.8, PUR-01).

`purchases_document` mirrors `sales_document` — the same money columns, the
same `version` semantics (§21.3.8 says the two tables must not diverge on
concurrency), the same "a number iff not a draft" CHECK — plus the supplier's
own invoice number and date and `itc_eligible`. Every money column is what
`apps.tax.services.tax_engine.compute_document_totals` produced; the server
never stores a client figure (canon §0.11-3).

── The duplicate-bill index, and the one way it differs from §21.3.8 ────────
`uq_purchases_supplier_invoice` is unique on `(tenant, party,
UPPER(supplier_invoice_number))` for bills that are neither `void` nor
`draft`. §21.3.8 excludes only `void`. Drafts are excluded as well because a
draft autosaves (FR-8): with drafts in the index, a clerk who types a number
that is already on a bill could not save the lines they were typing at all —
the draft itself would 409. The duplicate is refused at RECORD instead, which
is the moment the bill starts moving stock and money, and the index still
makes it impossible for two recorded bills to share a number under any
interleaving (CR-2026-09-25-PUR-A). `UPPER` because the number is typed by
hand from paper: "at/778" and "AT/778" are one bill.

── Columns beyond §21.3.8 ──────────────────────────────────────────────────
`round_off_enabled` (as sales, CR-SAL-A); `recorded_at` is sales' `issued_at`
under the bill's own verb; `voided_by` so a voided bill can say WHO without a
trip through the audit log (PUR-04 FR-5, AC-3); `inbound_unit_cost` on the
line is the §17.7.0 valuation cost the `purchase_in` movement carried.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models.functions import Upper

from apps.common.db.fields import MoneyField, QuantityField, RateField, UnitCostField, uuid7_pk
from apps.common.models import TenantModel
from apps.purchases.constants import DiscountType, DocumentKind, DocumentStatus


class PurchaseDocument(TenantModel):
    kind = models.CharField(
        max_length=16, choices=DocumentKind.choices, default=DocumentKind.PURCHASE_BILL
    )
    number = models.CharField(max_length=32, null=True, blank=True)
    fy_label = models.CharField(max_length=9)
    status = models.CharField(
        max_length=16, choices=DocumentStatus.choices, default=DocumentStatus.DRAFT
    )
    party = models.ForeignKey(
        "parties.Party",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="purchase_documents",
    )
    supplier_invoice_number = models.CharField(max_length=48, null=True, blank=True)
    supplier_invoice_date = models.DateField(null=True, blank=True)
    document_date = models.DateField()
    due_on = models.DateField(null=True, blank=True)
    place_of_supply_state = models.CharField(max_length=2)
    is_inter_state = models.BooleanField(default=False)
    reverse_charge = models.BooleanField(default=False)
    itc_eligible = models.BooleanField(default=True)
    supplier_gstin_snapshot = models.CharField(max_length=15, null=True, blank=True)
    party_snapshot = models.JSONField(default=dict, blank=True)
    subtotal = MoneyField(default=0)
    discount_type = models.CharField(
        max_length=8, choices=DiscountType.choices, null=True, blank=True
    )
    discount_value = MoneyField(null=True, blank=True)
    discount_amount = MoneyField(default=0)
    taxable_total = MoneyField(default=0)
    cgst_total = MoneyField(default=0)
    sgst_total = MoneyField(default=0)
    igst_total = MoneyField(default=0)
    cess_total = MoneyField(default=0)
    round_off_enabled = models.BooleanField(default=True)
    round_off = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    grand_total = MoneyField(default=0)
    amount_paid = MoneyField(default=0)
    amount_due = MoneyField(default=0)
    notes = models.TextField(blank=True, default="")
    recorded_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    void_reason = models.CharField(max_length=160, null=True, blank=True)
    version = models.IntegerField(default=1)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "purchases_document"
        verbose_name = "purchase document"
        verbose_name_plural = "purchase documents"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "kind", "fy_label", "number"],
                condition=models.Q(number__isnull=False),
                name="uq_purchases_document_number",
            ),
            models.UniqueConstraint(
                "tenant",
                "party",
                Upper("supplier_invoice_number"),
                condition=models.Q(supplier_invoice_number__isnull=False)
                & ~models.Q(status__in=["void", "draft"]),
                name="uq_purchases_supplier_invoice",
            ),
            models.CheckConstraint(
                condition=models.Q(status="draft", number__isnull=True)
                | (~models.Q(status="draft") & models.Q(number__isnull=False)),
                name="ck_purchases_document_number_iff_recorded",
            ),
            # A recorded bill always names its supplier (there is no walk-in purchase).
            models.CheckConstraint(
                condition=models.Q(status="draft") | models.Q(party__isnull=False),
                name="ck_purchases_document_party_when_recorded",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paid__gte=0) & models.Q(amount_due__gte=0),
                name="ck_purchases_document_amounts_non_negative",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "kind", "status", "-document_date"],
                name="ix_purch_doc_kind_status",
            ),
            models.Index(fields=["tenant", "party", "-document_date"], name="ix_purch_doc_party"),
            models.Index(
                fields=["tenant", "due_on"],
                condition=models.Q(status__in=["recorded", "partially_paid"]),
                name="ix_purch_doc_open_due",
            ),
            models.Index(fields=["tenant", "number"], name="ix_purch_doc_number"),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return self.number or f"draft {self.id}"


class PurchaseDocumentLine(models.Model):
    """A line; `taxable_value` is post-both-discounts, `inbound_unit_cost` the valuation cost."""

    id = uuid7_pk()
    document = models.ForeignKey(PurchaseDocument, on_delete=models.CASCADE, related_name="lines")
    line_no = models.SmallIntegerField()
    item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="purchase_lines",
    )
    description = models.CharField(max_length=255)
    hsn_sac = models.CharField(max_length=8, null=True, blank=True)
    qty = QuantityField()
    unit_code = models.CharField(max_length=8)
    unit_cost = UnitCostField(default=0)
    discount_type = models.CharField(
        max_length=8, choices=DiscountType.choices, null=True, blank=True
    )
    discount_value = MoneyField(null=True, blank=True)
    discount_amount = MoneyField(default=0)
    taxable_value = MoneyField(default=0)
    tax_code = models.CharField(max_length=16)
    tax_rate = RateField(default=0)
    cess_rate = RateField(default=0)
    cgst = MoneyField(default=0)
    sgst = MoneyField(default=0)
    igst = MoneyField(default=0)
    cess = MoneyField(default=0)
    line_total = MoneyField(default=0)
    inbound_unit_cost = UnitCostField(null=True, blank=True)

    class Meta:
        db_table = "purchases_document_line"
        verbose_name = "purchase document line"
        verbose_name_plural = "purchase document lines"
        ordering = ["line_no"]
        constraints = [
            models.UniqueConstraint(fields=["document", "line_no"], name="uq_purchases_line_no"),
            models.CheckConstraint(
                condition=models.Q(qty__gt=0), name="ck_purchases_line_qty_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=0), name="ck_purchases_line_cost_non_negative"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.line_no}: {self.description}"
