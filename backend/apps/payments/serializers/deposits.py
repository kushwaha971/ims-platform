"""`/deposits` (A4b, FRD 00 PLT-X02 §6) — the shapes in and out.

Money is a 2-dp string on the wire; the service parses and checks it. The
`Deposit` shape is FRD §6's, less `subject_label`: a deposit's subject is named
by the vertical that opened it, and until a vertical registers how to name its
subjects the key would always be empty — a key this code cannot fill is left
out rather than sent as a blank (the PTY-03 rule).
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.payments.constants import HELD_DEPOSIT, HELD_DEPOSIT_REFUND
from apps.payments.models import Allocation, DepositApplication, HeldDeposit


class DepositSerializer(serializers.ModelSerializer):
    party = serializers.SerializerMethodField()

    class Meta:
        model = HeldDeposit
        fields = (
            "id",
            "party",
            "module",
            "subject_type",
            "subject_id",
            "purpose",
            "expected_amount",
            "received_amount",
            "applied_amount",
            "refunded_amount",
            "held_amount",
            "status",
            "note",
            "version",
            "created_at",
        )
        read_only_fields = fields

    def get_party(self, deposit: HeldDeposit) -> dict:
        return {"id": str(deposit.party_id), "name": deposit.party.name}


def _payment_row(payment: Any, amount: Any) -> dict:
    return {
        "id": str(payment.id),
        "number": payment.number,
        "payment_date": payment.payment_date.isoformat(),
        "amount": str(amount),
        "primary_mode": payment.primary_mode,
        "status": payment.status,
        "opening": (payment.meta or {}).get("context") == "deposit_opening",
    }


class DepositDetailSerializer(DepositSerializer):
    """With the evidence: its receipts, its applications and its returns."""

    receipts = serializers.SerializerMethodField()
    applications = serializers.SerializerMethodField()
    refunds = serializers.SerializerMethodField()

    class Meta(DepositSerializer.Meta):
        fields = (*DepositSerializer.Meta.fields, "receipts", "applications", "refunds")
        read_only_fields = fields

    def _allocations(self, deposit: HeldDeposit, document_type: str) -> list[Allocation]:
        # A void payment's allocations are deleted (PAY-05 BR-2); the audit row
        # keeps them. What is listed here is what still counts.
        return list(
            Allocation.objects.filter(
                tenant_id=deposit.tenant_id, document_type=document_type, document_id=deposit.id
            )
            .select_related("payment")
            .order_by("payment__payment_date", "payment__created_at")
        )

    def get_receipts(self, deposit: HeldDeposit) -> list[dict]:
        return [_payment_row(a.payment, a.amount) for a in self._allocations(deposit, HELD_DEPOSIT)]

    def get_refunds(self, deposit: HeldDeposit) -> list[dict]:
        return [
            _payment_row(a.payment, a.amount)
            for a in self._allocations(deposit, HELD_DEPOSIT_REFUND)
            if (a.payment.meta or {}).get("context") != "deposit_adjustment"
        ]

    def get_applications(self, deposit: HeldDeposit) -> list[dict]:
        rows = (
            DepositApplication.objects.filter(deposit=deposit)
            .select_related("refund_payment", "settle_payment")
            .order_by("created_at")
        )
        return [
            {
                "id": str(row.id),
                "amount": str(row.amount),
                "reason": row.reason,
                "created_at": row.created_at.isoformat(),
                "voided_at": row.voided_at.isoformat() if row.voided_at else None,
                "refund_payment": {
                    "id": str(row.refund_payment_id),
                    "number": row.refund_payment.number,
                },
                "settle_payment": {
                    "id": str(row.settle_payment_id),
                    "number": row.settle_payment.number,
                },
            }
            for row in rows
        ]


class _Versioned(serializers.Serializer):
    version = serializers.IntegerField(required=False)


class DepositReceiveSerializer(_Versioned):
    amount = serializers.CharField()
    mode_breakup = serializers.JSONField()
    payment_date = serializers.CharField(required=False, allow_blank=True)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")


class DepositApplySerializer(_Versioned):
    allocations = serializers.JSONField()
    reason = serializers.CharField(allow_blank=True)


class DepositRefundSerializer(_Versioned):
    amount = serializers.CharField()
    mode_breakup = serializers.JSONField()
    payment_date = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField(allow_blank=True)
