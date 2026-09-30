"""Payment wire shapes (Part 26 §26.6) — input coercion only; the rules are in services.

Read and write serializers are separate (R6.1); money travels as a string (R6.3).
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.payments.models import Payment
from apps.payments.selectors.payments import allocation_details, party_balance_after


class PaymentWriteSerializer(serializers.Serializer):
    """`POST /payments`. Lines and allocations pass through as JSON for the service to judge.

    Coercing `mode_breakup` rows here would turn "700.005" into a rounding
    decision the service's rule (reject, do not round — LED-01 EC-4) never sees.
    """

    direction = serializers.CharField(required=False, allow_blank=True, default="in")
    party_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    payment_date = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    amount = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    mode_breakup = serializers.JSONField(required=False)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")
    allocations = serializers.JSONField(required=False)
    context = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentVoidSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentAllocateSerializer(serializers.Serializer):
    """`POST /payments/{id}/allocations` (A4a). The rows pass through as JSON for the service to
    judge, exactly as `PaymentWriteSerializer.allocations` does — `"auto"` or a list."""

    allocations = serializers.JSONField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class UpiIntentSerializer(serializers.Serializer):
    amount = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True, default="", max_length=50)
    party_id = serializers.UUIDField(required=False, allow_null=True)


def _person(user: Any) -> dict | None:
    if user is None:
        return None
    return {"id": str(user.id), "name": getattr(user, "full_name", "") or ""}


def _party(payment: Payment) -> dict | None:
    party = payment.party
    if party is None:
        return None
    return {"id": str(party.id), "name": party.name, "mobile": party.mobile}


class PaymentListSerializer(serializers.ModelSerializer):
    """One row of the list — no allocations, which the detail carries."""

    party = serializers.SerializerMethodField()
    allocated_amount = serializers.SerializerMethodField()
    modes_count = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "number",
            "direction",
            "party",
            "payment_date",
            "amount",
            "primary_mode",
            "modes_count",
            "reference",
            "status",
            "unallocated_amount",
            "allocated_amount",
            "created_at",
        )

    def get_party(self, payment: Payment) -> dict | None:
        return _party(payment)

    def get_allocated_amount(self, payment: Payment) -> str:
        value = getattr(payment, "allocated", None)
        if value is None:
            value = payment.amount - payment.unallocated_amount
        return str(value)

    def get_modes_count(self, payment: Payment) -> int:
        return len(payment.mode_breakup or [])


class PaymentDetailSerializer(serializers.ModelSerializer):
    """PAY-01 §14 `Payment`, plus PAY-04's `party_balance_after` (CCR-17)."""

    party = serializers.SerializerMethodField()
    allocations = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    voided_by = serializers.SerializerMethodField()
    party_balance_after = serializers.SerializerMethodField()
    context = serializers.SerializerMethodField()
    business = serializers.SerializerMethodField()
    deposit_pair = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = (
            "id",
            "number",
            "direction",
            "party",
            "payment_date",
            "amount",
            "mode_breakup",
            "primary_mode",
            "reference",
            "note",
            "status",
            "unallocated_amount",
            "allocations",
            "party_balance_after",
            "context",
            "business",
            "void_reason",
            "voided_at",
            "voided_by",
            "created_by",
            "created_at",
            # A4a (R5) — which balance this payment settles; Apply to bills lists that bucket.
            "bucket",
            # A4b — the other half of a deposit application, which a void takes with it.
            "deposit_pair",
        )

    def get_party(self, payment: Payment) -> dict | None:
        return _party(payment)

    def get_allocations(self, payment: Payment) -> list[dict]:
        return allocation_details(payment)

    def get_created_by(self, payment: Payment) -> dict | None:
        return _person(payment.created_by)

    def get_voided_by(self, payment: Payment) -> dict | None:
        return _person(payment.voided_by)

    def get_party_balance_after(self, payment: Payment) -> str | None:
        value = party_balance_after(payment)
        return str(value) if value is not None else None

    def get_context(self, payment: Payment) -> str | None:
        return (payment.meta or {}).get("context")

    def get_deposit_pair(self, payment: Payment) -> dict | None:
        """A4b (BR-7) — for half of a deposit application: the application and its
        other half, so the void dialog can say "This also reverses PAYOUT/…". `null`
        for every payment that is not half of one."""
        application_id = (payment.meta or {}).get("deposit_application_id")
        if not application_id:
            return None
        from apps.payments.models import DepositApplication

        application = (
            DepositApplication.objects.filter(tenant_id=payment.tenant_id, pk=application_id)
            .select_related("refund_payment", "settle_payment")
            .first()
        )
        if application is None:
            return None
        partner = (
            application.settle_payment
            if application.refund_payment_id == payment.id
            else application.refund_payment
        )
        return {
            "application_id": str(application.id),
            "amount": str(application.amount),
            "deposit_id": str(application.deposit_id),
            "partner": {"id": str(partner.id), "number": partner.number},
            "voided": application.voided_at is not None,
        }

    def get_business(self, payment: Payment) -> dict:
        """PAY-04 §7's header band — who issued the receipt (the print needs no second call)."""
        tenant = payment.tenant
        return {
            "name": tenant.name,
            "legal_name": tenant.legal_name,
            "gstin": tenant.gstin,
            "phone": tenant.phone,
            "address": dict(tenant.address or {}),
            "upi_vpa": tenant.upi_vpa,
        }
