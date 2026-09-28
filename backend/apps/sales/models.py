"""Sales documents and their lines (Part 21 §21.3.7, SAL-02).

One table for every sales document kind: `invoice` and `bill_of_supply`
(SAL-02), `estimate` (SAL-01) and `credit_note` (SAL-04). Every money column is exactly what `compute_document_totals`
produced — the server never stores a client figure (FR-3, canon §0.11-3).

── Columns beyond §21.3.7, and why ──────────────────────────────────────────
`round_off_enabled` persists the editor's toggle, which BR-8 reads and the
column list omits (CR in docs/CR-LOG.md). `version` IS in §21.3.7.
The immediate payment of a walk-in sale lives in `meta.payment` until PAY-01
brings `payments_payment` (see services/payment_seam.py).
"""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import MoneyField, QuantityField, RateField, UnitCostField, uuid7_pk
from apps.common.models import TenantModel
from apps.sales.constants import DiscountType, DocumentKind, DocumentStatus


class SalesDocument(TenantModel):
    kind = models.CharField(max_length=16, choices=DocumentKind.choices)
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
        related_name="sales_documents",
    )
    walk_in_name = models.CharField(max_length=120, null=True, blank=True)
    walk_in_mobile = models.CharField(max_length=15, null=True, blank=True)
    document_date = models.DateField()
    due_on = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)
    # Credit note → the invoice it credits (SAL-04). RESTRICT: an invoice with
    # a credit note is never deleted (only drafts are, and drafts have none).
    against = models.ForeignKey(
        "self",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="credit_notes",
    )
    # Estimate ↔ invoice (SAL-01 FR-6). SET_NULL: discarding the converted
    # DRAFT invoice frees the estimate to be converted again (SAL-05 EC-9).
    converted_to = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    converted_from = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    place_of_supply_state = models.CharField(max_length=2)
    is_inter_state = models.BooleanField(default=False)
    reverse_charge = models.BooleanField(default=False)
    supplier_gstin_snapshot = models.CharField(max_length=15, null=True, blank=True)
    party_gstin_snapshot = models.CharField(max_length=15, null=True, blank=True)
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
    terms = models.TextField(blank=True, default="")
    issued_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=160, null=True, blank=True)
    public_token_hash = models.CharField(max_length=64, null=True, blank=True, unique=True)
    version = models.IntegerField(default=1)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "sales_document"
        verbose_name = "sales document"
        verbose_name_plural = "sales documents"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "kind", "fy_label", "number"],
                condition=models.Q(number__isnull=False),
                name="uq_sales_document_number",
            ),
            # An issued document always has its number; a draft never has one.
            models.CheckConstraint(
                condition=models.Q(status=DocumentStatus.DRAFT, number__isnull=True)
                | (~models.Q(status=DocumentStatus.DRAFT) & models.Q(number__isnull=False)),
                name="ck_sales_document_number_iff_issued",
            ),
            # SAL-07 BR-1 — a walk-in is never a receivable.
            models.CheckConstraint(
                condition=models.Q(status=DocumentStatus.DRAFT)
                | models.Q(party__isnull=False)
                | models.Q(amount_due=0),
                name="ck_sales_document_walk_in_paid",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_paid__gte=0) & models.Q(amount_due__gte=0),
                name="ck_sales_document_amounts_non_negative",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "kind", "status", "-document_date"],
                name="ix_sales_doc_kind_status",
            ),
            models.Index(fields=["tenant", "party", "-document_date"], name="ix_sales_doc_party"),
            models.Index(
                fields=["tenant", "due_on"],
                condition=models.Q(status__in=["issued", "partially_paid"]),
                name="ix_sales_doc_open_due",
            ),
            models.Index(fields=["tenant", "number"], name="ix_sales_doc_number"),
            # SAL-04 §15 / CR-SAL-3 — "credit notes of this invoice".
            models.Index(
                fields=["tenant", "against"],
                condition=models.Q(against__isnull=False),
                name="ix_sales_doc_against",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return self.number or f"draft {self.id}"


class SalesDocumentLine(models.Model):
    """A line; `taxable_value` is post-both-discounts (BR-5, the Rule 46 figure)."""

    id = uuid7_pk()
    document = models.ForeignKey(SalesDocument, on_delete=models.CASCADE, related_name="lines")
    line_no = models.SmallIntegerField()
    item = models.ForeignKey(
        "inventory.Item",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="sales_lines",
    )
    description = models.CharField(max_length=255)
    hsn_sac = models.CharField(max_length=8, null=True, blank=True)
    qty = QuantityField()
    unit_code = models.CharField(max_length=8)
    unit_price = UnitCostField(default=0)
    tax_inclusive = models.BooleanField(default=False)
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
    unit_cost_snapshot = UnitCostField(null=True, blank=True)
    returned_qty = QuantityField(default=0)
    # A credit-note line → the invoice line it returns (SAL-04 FR-2), so the
    # cap and the `returned_qty` cache are per line, not per item.
    against_line = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="return_lines"
    )

    class Meta:
        db_table = "sales_document_line"
        verbose_name = "sales document line"
        verbose_name_plural = "sales document lines"
        ordering = ["line_no"]
        constraints = [
            models.UniqueConstraint(fields=["document", "line_no"], name="uq_sales_line_no"),
            models.CheckConstraint(
                condition=models.Q(qty__gt=0), name="ck_sales_line_qty_positive"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.line_no}: {self.description}"


class SalesCreditApplication(TenantModel):
    """Open credit from a credit note, used against an invoice (Part 21 §21.3.9 decision).

    Its own table rather than a `payments_allocation` row with a NULL payment,
    so a credit is never mistaken for money received. One row per pair; a
    second application of the same note to the same invoice adds to `amount`.
    A void deletes the row (SAL-04 FR-10, SAL-05 FR-2) and the audit log keeps
    what it was.
    """

    credit_note = models.ForeignKey(
        SalesDocument, on_delete=models.RESTRICT, related_name="applications"
    )
    invoice = models.ForeignKey(
        SalesDocument, on_delete=models.RESTRICT, related_name="credit_applications"
    )
    amount = MoneyField()

    class Meta:
        db_table = "sales_credit_application"
        verbose_name = "credit application"
        verbose_name_plural = "credit applications"
        constraints = [
            models.UniqueConstraint(
                fields=["credit_note", "invoice"], name="uq_sales_credit_application_pair"
            ),
            models.CheckConstraint(
                condition=models.Q(amount__gt=0), name="ck_sales_credit_application_positive"
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "invoice"], name="ix_sales_credit_app_invoice"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.credit_note_id} → {self.invoice_id}: {self.amount}"
