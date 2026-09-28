"""Purchase bill serializers — input coercion and the §22.7 common document shape.

Input serializers only COERCE types (a date is a date, a cost a Decimal);
the rules live in `services/`, so the draft's relaxed validation and record's
strict one are one code path with one switch. Amounts are parsed from strings
by `DecimalField`, which is what refuses a float (§19).
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.purchases.constants import LINES_MAX
from apps.purchases.models import PurchaseDocument, PurchaseDocumentLine


class BillLineInputSerializer(serializers.Serializer):
    item_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=255
    )
    hsn_sac = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=8)
    qty = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, allow_null=True)
    unit_code = serializers.CharField(required=False, allow_null=True, max_length=8)
    unit_cost = serializers.DecimalField(
        max_digits=14, decimal_places=4, required=False, allow_null=True
    )
    discount_type = serializers.ChoiceField(
        choices=("percent", "amount"), required=False, allow_null=True, allow_blank=True
    )
    discount_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    tax_code = serializers.CharField(required=False, allow_null=True, max_length=16)


class PaymentRowSerializer(serializers.Serializer):
    """One `mode_breakup` line of "Paid now"; PAY-02's rules run in the service."""

    mode = serializers.CharField(max_length=12)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")
    upi_app = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=16
    )


class PaymentInputSerializer(serializers.Serializer):
    """PUR-01 FR-6h — money handed to the supplier as the bill is recorded (PUR-02)."""

    payment_date = serializers.DateField(required=False, allow_null=True)
    mode_breakup = PaymentRowSerializer(many=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")


class BillWriteSerializer(serializers.Serializer):
    party_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_invoice_number = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=48
    )
    supplier_invoice_date = serializers.DateField(required=False, allow_null=True)
    document_date = serializers.DateField(required=False, allow_null=True)
    due_on = serializers.DateField(required=False, allow_null=True)
    reverse_charge = serializers.BooleanField(required=False)
    itc_eligible = serializers.BooleanField(required=False)
    round_off_enabled = serializers.BooleanField(required=False)
    discount_type = serializers.ChoiceField(
        choices=("percent", "amount"), required=False, allow_null=True, allow_blank=True
    )
    discount_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = BillLineInputSerializer(many=True, required=False)
    version = serializers.IntegerField(required=False)
    # Read only by `?record=true` (create-and-record); a draft stores no payment.
    payment = PaymentInputSerializer(required=False, allow_null=True)

    def validate_lines(self, value: list) -> list:
        if len(value) > LINES_MAX:
            raise serializers.ValidationError(f"At most {LINES_MAX} lines.")
        return value


class RecordSerializer(serializers.Serializer):
    version = serializers.IntegerField(required=False)
    payment = PaymentInputSerializer(required=False, allow_null=True)


class VoidSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=400)


def _person(user: Any) -> dict | None:
    if user is None:
        return None
    return {
        "id": str(user.id),
        "name": getattr(user, "full_name", "") or getattr(user, "email", ""),
    }


class BillLineReadSerializer(serializers.ModelSerializer):
    track_stock = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseDocumentLine
        fields = (
            "id",
            "line_no",
            "item_id",
            "description",
            "hsn_sac",
            "qty",
            "unit_code",
            "unit_cost",
            "discount_type",
            "discount_value",
            "discount_amount",
            "taxable_value",
            "tax_code",
            "tax_rate",
            "cess_rate",
            "cgst",
            "sgst",
            "igst",
            "cess",
            "line_total",
            "inbound_unit_cost",
            "track_stock",
        )

    def get_track_stock(self, obj: PurchaseDocumentLine) -> bool:
        """Whether this line moves stock (BR-9) — the void dialog lists only these (FR-3)."""
        item = obj.item
        return bool(item is not None and item.item_type == "goods" and item.track_stock)


class BillReadSerializer(serializers.ModelSerializer):
    party = serializers.SerializerMethodField()
    party_snapshot = serializers.SerializerMethodField()
    lines = BillLineReadSerializer(many=True, read_only=True)
    doc_discount_allocation = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    voided_by = serializers.SerializerMethodField()
    ledger_entry = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseDocument
        fields = (
            "id",
            "kind",
            "number",
            "fy_label",
            "status",
            "version",
            "party",
            "party_snapshot",
            "supplier_invoice_number",
            "supplier_invoice_date",
            "document_date",
            "due_on",
            "place_of_supply_state",
            "is_inter_state",
            "reverse_charge",
            "itc_eligible",
            "discount_type",
            "discount_value",
            "round_off_enabled",
            "subtotal",
            "discount_amount",
            "taxable_total",
            "cgst_total",
            "sgst_total",
            "igst_total",
            "cess_total",
            "round_off",
            "grand_total",
            "amount_paid",
            "amount_due",
            "lines",
            "notes",
            "doc_discount_allocation",
            "ledger_entry",
            "payments",
            "created_by",
            "recorded_at",
            "voided_at",
            "voided_by",
            "void_reason",
            "created_at",
            "updated_at",
        )

    def get_party(self, obj: PurchaseDocument) -> dict | None:
        party = obj.party
        if party is None:
            return None
        return {
            "id": str(party.id),
            "name": party.name,
            "gstin": party.gstin,
            "mobile": party.mobile,
            "state_code": party.state_code,
            "credit_days": party.credit_days,
        }

    def get_party_snapshot(self, obj: PurchaseDocument) -> dict | None:
        """Frozen at record (PUR-03 EC-1); a draft shows the supplier as they are now."""
        if obj.party_snapshot:
            return obj.party_snapshot
        if obj.party is None:
            return None
        from apps.purchases.services.record import party_snapshot

        return party_snapshot(obj.party)

    def get_doc_discount_allocation(self, obj: PurchaseDocument) -> dict:
        return (obj.meta or {}).get("doc_discount_allocation") or {}

    def get_created_by(self, obj: PurchaseDocument) -> dict | None:
        return _person(obj.created_by)

    def get_voided_by(self, obj: PurchaseDocument) -> dict | None:
        return _person(obj.voided_by)

    def get_ledger_entry(self, obj: PurchaseDocument) -> dict | None:
        """FR-9 — `{id}` of the supplier-khata credit; null for a draft or a ₹0 bill."""
        if obj.status == "draft":
            return None
        from apps.purchases.selectors.bills import ledger_entry_id_for

        entry_id = ledger_entry_id_for(tenant=obj.tenant, document_id=obj.id)
        return {"id": entry_id} if entry_id else None

    def get_payments(self, obj: PurchaseDocument) -> list[dict]:
        """PUR-02 FR-6 — the supplier payments allocated to this bill, oldest first.

        A deferred import (Part 20 §20.1.4 rule D5: purchases never imports
        payments at module level). Empty for a draft, and for a void bill,
        whose allocations the void released (BR-4).
        """
        if obj.status in ("draft", "void"):
            return []
        from apps.payments.selectors.payments import payments_for_document

        return payments_for_document(
            tenant=obj.tenant_id, document_type="purchase_document", document_id=obj.id
        )


class BillListSerializer(serializers.ModelSerializer):
    party = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseDocument
        fields = (
            "id",
            "kind",
            "number",
            "status",
            "party",
            "supplier_invoice_number",
            "document_date",
            "due_on",
            "grand_total",
            "amount_paid",
            "amount_due",
            "is_overdue",
        )

    def get_party(self, obj: PurchaseDocument) -> dict | None:
        """PUR-03 EC-1 — the frozen name for a recorded bill, the current one for a draft."""
        if obj.party_id is None:
            return None
        name = (obj.party_snapshot or {}).get("name") or (obj.party.name if obj.party else "")
        return {"id": str(obj.party_id), "name": name}

    def get_is_overdue(self, obj: PurchaseDocument) -> bool:
        """BR-2 — same-day accuracy for the row; the TAB uses the stored status."""
        today = self.context.get("today")
        if obj.status == "overdue":
            return True
        return bool(
            today
            and obj.due_on
            and obj.due_on < today
            and obj.status in ("recorded", "partially_paid")
        )
