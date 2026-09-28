"""Input coercion for estimates, credit notes and voids (SAL-01, SAL-04, SAL-05).

As in `document.py`, these only COERCE (a date is a date, an amount a
Decimal); every business rule — the cap, the reason list, the settlement —
lives in the services, so a draft's relaxed save and an issue's strict one are
one code path.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.sales.constants import LINES_MAX, REASON_NOTE_MAX, VOID_REASON_MAX
from apps.sales.serializers.document import (
    InvoiceWriteSerializer,
    LineInputSerializer,
    PaymentInputSerializer,
)


class VoidSerializer(serializers.Serializer):
    # Length is the service's rule (3–160 after trimming); this only bounds the input.
    reason = serializers.CharField(required=False, allow_blank=True, max_length=VOID_REASON_MAX * 2)


class EstimateWriteSerializer(InvoiceWriteSerializer):
    valid_until = serializers.DateField(required=False, allow_null=True)


class RejectSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)


class VersionSerializer(serializers.Serializer):
    version = serializers.IntegerField(required=False)


class CreditNoteLineSerializer(LineInputSerializer):
    against_line_id = serializers.UUIDField(required=False, allow_null=True)


class CreditNoteWriteSerializer(serializers.Serializer):
    against_id = serializers.UUIDField(required=False, allow_null=True)
    party_id = serializers.UUIDField(required=False, allow_null=True)
    document_date = serializers.DateField(required=False, allow_null=True)
    place_of_supply_state = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=2
    )
    reason = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=32)
    reason_note = serializers.CharField(
        required=False, allow_blank=True, max_length=REASON_NOTE_MAX * 2
    )
    restock = serializers.BooleanField(required=False)
    settlement = serializers.CharField(required=False, max_length=16)
    refund = PaymentInputSerializer(required=False, allow_null=True)
    round_off_enabled = serializers.BooleanField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = CreditNoteLineSerializer(many=True, required=False)
    version = serializers.IntegerField(required=False)

    def validate_lines(self, value: list) -> list:
        if len(value) > LINES_MAX:
            raise serializers.ValidationError(f"At most {LINES_MAX} lines.")
        return value


class CreditNoteIssueSerializer(serializers.Serializer):
    refund = PaymentInputSerializer(required=False, allow_null=True)
    version = serializers.IntegerField(required=False)


class ApplyCreditSerializer(serializers.Serializer):
    invoice_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
