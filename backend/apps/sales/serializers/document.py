"""Sales document serializers — input coercion and the §22.7 common shape.

Input serializers only COERCE types (a date is a date, a price a Decimal);
the business rules live in `services/`, so the draft's relaxed validation and
the issue's strict one are one code path with one switch.
"""

from __future__ import annotations


from rest_framework import serializers

from apps.sales.models import SalesDocument, SalesDocumentLine
from apps.sales.serializers.common import mask_mobile, person
from apps.sales.serializers.links import document_links

__all__ = ["DocumentReadSerializer", "mask_mobile"]


class LineInputSerializer(serializers.Serializer):
    item_id = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=255
    )
    hsn_sac = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=8)
    qty = serializers.DecimalField(max_digits=14, decimal_places=3, required=False, allow_null=True)
    unit_code = serializers.CharField(required=False, allow_null=True, max_length=8)
    unit_price = serializers.DecimalField(
        max_digits=14, decimal_places=4, required=False, allow_null=True
    )
    tax_inclusive = serializers.BooleanField(required=False, allow_null=True, default=None)
    discount_type = serializers.ChoiceField(
        choices=("percent", "amount"), required=False, allow_null=True, allow_blank=True
    )
    discount_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    tax_code = serializers.CharField(required=False, allow_null=True, max_length=16)


class PaymentRowSerializer(serializers.Serializer):
    mode = serializers.CharField(max_length=12)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=64, default="")


class PaymentInputSerializer(serializers.Serializer):
    payment_date = serializers.DateField(required=False, allow_null=True)
    mode_breakup = PaymentRowSerializer(many=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")


class InvoiceWriteSerializer(serializers.Serializer):
    kind = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    party_id = serializers.UUIDField(required=False, allow_null=True)
    walk_in_name = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=120
    )
    walk_in_mobile = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=15
    )
    document_date = serializers.DateField(required=False, allow_null=True)
    due_on = serializers.DateField(required=False, allow_null=True)
    place_of_supply_state = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=2
    )
    reverse_charge = serializers.BooleanField(required=False)
    round_off_enabled = serializers.BooleanField(required=False)
    discount_type = serializers.ChoiceField(
        choices=("percent", "amount"), required=False, allow_null=True, allow_blank=True
    )
    discount_value = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    terms = serializers.CharField(required=False, allow_blank=True)
    lines = LineInputSerializer(many=True, required=False)
    payment = PaymentInputSerializer(required=False, allow_null=True)
    override = serializers.BooleanField(required=False, default=False)
    version = serializers.IntegerField(required=False)

    def validate_lines(self, value: list) -> list:
        from apps.sales.constants import LINES_MAX

        if len(value) > LINES_MAX:
            raise serializers.ValidationError(f"At most {LINES_MAX} lines.")
        return value


class IssueSerializer(serializers.Serializer):
    payment = PaymentInputSerializer(required=False, allow_null=True)
    override = serializers.BooleanField(required=False, default=False)
    version = serializers.IntegerField(required=False)


class ShareLinkSerializer(serializers.Serializer):
    expires_in_days = serializers.IntegerField(required=False, allow_null=True)
    channel = serializers.ChoiceField(choices=("link", "whatsapp"), required=False, default="link")


class LineReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesDocumentLine
        fields = (
            "id",
            "line_no",
            "item_id",
            "description",
            "hsn_sac",
            "qty",
            "unit_code",
            "unit_price",
            "tax_inclusive",
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
            "returned_qty",
            "against_line_id",
        )


def supplier_block(document: SalesDocument) -> dict:
    tenant = document.tenant
    return {
        "name": tenant.name,
        "legal_name": tenant.legal_name,
        "gstin": document.supplier_gstin_snapshot or tenant.gstin,
        "gst_type": tenant.gst_type,
        "state_code": tenant.state_code,
        "phone": tenant.phone,
        "email": tenant.email,
        "address": dict(tenant.address or {}),
        "upi_vpa": tenant.upi_vpa,
        "bank_details": dict(tenant.bank_details or {}),
    }


class DocumentReadSerializer(serializers.ModelSerializer):
    party = serializers.SerializerMethodField()
    party_snapshot = serializers.SerializerMethodField()
    supplier = serializers.SerializerMethodField()
    payment = serializers.SerializerMethodField()
    lines = LineReadSerializer(many=True, read_only=True)
    doc_discount_allocation = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    links = serializers.SerializerMethodField()

    class Meta:
        model = SalesDocument
        fields = (
            "id",
            "kind",
            "number",
            "fy_label",
            "status",
            "version",
            "party",
            "party_snapshot",
            "walk_in_name",
            "walk_in_mobile",
            "supplier",
            "document_date",
            "due_on",
            "valid_until",
            "place_of_supply_state",
            "is_inter_state",
            "reverse_charge",
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
            "payment",
            "lines",
            "notes",
            "terms",
            "doc_discount_allocation",
            "created_by",
            "issued_at",
            "voided_at",
            "void_reason",
            "links",
            "created_at",
            "updated_at",
        )

    def get_party(self, obj: SalesDocument) -> dict | None:
        party = obj.party
        if party is None:
            return None
        return {
            "id": str(party.id),
            "name": party.name,
            "gstin": party.gstin,
            "mobile": party.mobile,
            "state_code": party.state_code,
        }

    def get_party_snapshot(self, obj: SalesDocument) -> dict | None:
        if obj.party_snapshot:
            return obj.party_snapshot
        from apps.sales.services.issue_parts import party_snapshot

        return party_snapshot(obj.party, obj)

    def get_supplier(self, obj: SalesDocument) -> dict:
        return supplier_block(obj)

    def get_payment(self, obj: SalesDocument) -> dict | None:
        return (obj.meta or {}).get("payment")

    def get_doc_discount_allocation(self, obj: SalesDocument) -> dict:
        return (obj.meta or {}).get("doc_discount_allocation") or {}

    def get_created_by(self, obj: SalesDocument) -> dict | None:
        return person(obj.created_by)

    def get_links(self, obj: SalesDocument) -> dict:
        """SAL-01/04/05 — the documents this one is tied to, and a note's settlement."""
        return document_links(obj)
