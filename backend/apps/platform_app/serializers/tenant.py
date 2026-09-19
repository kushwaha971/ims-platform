"""Tenant wire shapes for the onboarding wizard (PLT-03 §7, §10).

Read and write are separate (R6.1) and `fields` is an explicit tuple (R6.2).
The write serializers validate shape and enumerations; GSTIN checksum,
uniqueness and the state derivation live in `services.onboarding`, which is the
only place they can be applied inside the transaction that also writes the row.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.platform_app.constants import BusinessType, GstType
from apps.platform_app.mobile import InvalidMobile, normalise_mobile
from apps.platform_app.models import Tenant

PINCODE_RE = r"^[1-9][0-9]{5}$"


class StateCodeField(serializers.CharField):
    """Two-digit GST state code. `99` (Centre jurisdiction) is refused (EC-4)."""

    def to_internal_value(self, data: Any) -> str:
        from apps.tax.validators import is_valid_state_code

        value = super().to_internal_value(data).strip()
        if not is_valid_state_code(value):
            raise serializers.ValidationError("Choose your state")
        return value


class AddressSerializer(serializers.Serializer):
    """`platform_tenant.address` (Part 21 §21.3.1) — a closed jsonb shape."""

    line1 = serializers.CharField(max_length=120, required=False, allow_blank=True)
    line2 = serializers.CharField(max_length=120, required=False, allow_blank=True)
    city = serializers.CharField(max_length=120, required=False, allow_blank=True)
    district = serializers.CharField(max_length=120, required=False, allow_blank=True)
    state = serializers.CharField(max_length=120, required=False, allow_blank=True)
    pincode = serializers.RegexField(
        PINCODE_RE,
        required=False,
        allow_blank=True,
        error_messages={"invalid": "Enter a 6-digit PIN code"},
    )


class TenantCreateSerializer(serializers.Serializer):
    """Step 1 — `POST /tenants` (FR-2, §10)."""

    name = serializers.CharField(min_length=2, max_length=160, trim_whitespace=True)
    business_type = serializers.ChoiceField(choices=BusinessType.choices)
    state_code = StateCodeField(max_length=2)
    locale = serializers.ChoiceField(choices=["en", "hi"], required=False, default="en")
    owner_name = serializers.CharField(max_length=120, required=False, allow_blank=True)


class TenantUpdateSerializer(serializers.Serializer):
    """Steps 2–4 — `PATCH /tenants/current` (FR-3…FR-5).

    `onboarding_step` is accepted as a field: PLT-03 §14 CCR-2 requires it, and
    without it the wizard cannot record where the merchant got to. It is
    clamped to 0…4 so a client cannot mark a wizard complete that the server has
    not run the preset for.
    """

    name = serializers.CharField(min_length=2, max_length=160, required=False)
    legal_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    business_type = serializers.ChoiceField(choices=BusinessType.choices, required=False)
    gst_type = serializers.ChoiceField(choices=GstType.choices, required=False)
    gstin = serializers.CharField(max_length=15, required=False, allow_blank=True)
    pan = serializers.CharField(max_length=10, required=False, allow_blank=True)
    state_code = StateCodeField(max_length=2, required=False)
    address = AddressSerializer(required=False)
    phone = serializers.CharField(max_length=15, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    locale = serializers.ChoiceField(choices=["en", "hi"], required=False)
    onboarding_step = serializers.IntegerField(min_value=0, max_value=4, required=False)

    def validate_phone(self, value: str) -> str:
        try:
            return normalise_mobile(value)
        except InvalidMobile as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_gstin(self, value: str) -> str:
        return (value or "").strip().upper()

    def validate_pan(self, value: str) -> str:
        return (value or "").strip().upper()

    def validate(self, attrs: dict) -> dict:
        if attrs.get("address") is not None:
            attrs["address"] = {k: v for k, v in attrs["address"].items() if v not in (None, "")}
        for optional in ("legal_name", "email", "gstin", "pan"):
            if attrs.get(optional) == "":
                attrs[optional] = None
        return attrs


class TenantReadSerializer(serializers.ModelSerializer):
    """`GET /tenants/current` (Part 22 §22.3)."""

    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "legal_name",
            "business_type",
            "gst_type",
            "gstin",
            "pan",
            "state_code",
            "address",
            "phone",
            "email",
            "currency",
            "timezone",
            "locale",
            "fy_start_month",
            "enabled_modules",
            "branding",
            "bank_details",
            "upi_vpa",
            "status",
            "onboarding_step",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class MembershipReadSerializer(serializers.Serializer):
    """The membership row returned beside a created tenant (PLT-03 §14)."""

    id = serializers.UUIDField(read_only=True)
    tenant_id = serializers.UUIDField(read_only=True)
    role = serializers.CharField(source="role.code", read_only=True)
    status = serializers.CharField(read_only=True)
    is_default = serializers.BooleanField(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)


class MembershipPatchSerializer(serializers.Serializer):
    """`PATCH /memberships/{id}` — the self-service subset (PLT-04 FR-5).

    §10: only `true` is accepted, because "unset my default" is not a state the
    product has — exactly one membership is always the default.
    """

    is_default = serializers.BooleanField()

    def validate_is_default(self, value: bool) -> bool:
        if value is not True:
            raise serializers.ValidationError("Choose another business as your default instead.")
        return value
