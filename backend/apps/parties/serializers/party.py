"""Party wire shapes (Part 26 §26.6).

Read and write serializers are separate (R6.1); `fields` is always an explicit
tuple (R6.2); money travels as a string (R6.3).
"""

from __future__ import annotations

from rest_framework import serializers

from apps.common.serializers import MoneySerializerField
from apps.parties.constants import ConsentSource, GstRegistration, OpeningDirection
from apps.parties.models import Party


class AddressField(serializers.JSONField):
    """A postal address, bounded.

    `JSONField` accepts any JSON, which on a write path means a client can send
    a megabyte of nested objects that this process then serialises, diffs for
    the audit row and stores. The bound is the control: a flat map of short
    strings, which is what an address is.
    """

    ALLOWED = ("line1", "line2", "city", "state_code", "pincode", "country")
    MAX_VALUE_LENGTH = 120

    def to_internal_value(self, data: object) -> dict:
        value = super().to_internal_value(data)
        if value in (None, ""):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Enter an address as a set of fields.")
        unknown = sorted(set(value) - set(self.ALLOWED))
        if unknown:
            raise serializers.ValidationError(f"Unknown address fields: {', '.join(unknown)}.")
        for key, item in value.items():
            if item is None:
                continue
            if not isinstance(item, (str, int)):
                raise serializers.ValidationError(f"{key} must be text.")
            if len(str(item)) > self.MAX_VALUE_LENGTH:
                raise serializers.ValidationError(f"{key} is too long.")
        return {k: v for k, v in value.items() if v not in (None, "")}


class PartyListSerializer(serializers.ModelSerializer):
    """The list row. Sprint 0's walking skeleton needs no more than this."""

    balance = MoneySerializerField(read_only=True)

    class Meta:
        model = Party
        fields = (
            "id",
            "name",
            # The party's human-readable code — the subtitle the list row draws
            # beside the name. It was on the model and off the wire.
            "display_code",
            "mobile",
            "is_customer",
            "is_supplier",
            "balance",
            "status",
            "last_activity_at",
        )
        read_only_fields = fields


class PartyWriteSerializer(serializers.Serializer):
    """What the wire may say — and nothing about what it means.

    A plain `Serializer` rather than a `ModelSerializer`, and the reason is the
    one defect a write path cannot recover from. A `ModelSerializer` is
    allow-by-default: every column added to `Party` from now on becomes
    client-writable unless somebody remembers to list it read-only in the same
    commit. `balance`, `receivable_total` and `payable_total` are written only
    by `parties.services.balance`; `tenant` decides who can see the row at all;
    `consent_at` is a legal claim about when a person agreed to be messaged.
    One forgotten line and any of those is settable from a browser.

    So the field list here is hand-written and exhaustive. A column that is not
    on it cannot be written, today or after the next migration.
    """

    name = serializers.CharField(max_length=160)
    display_code = serializers.CharField(
        max_length=24, required=False, allow_null=True, allow_blank=True
    )
    mobile = serializers.RegexField(
        r"^\+?[0-9]{10,15}$", required=False, allow_null=True, allow_blank=True
    )
    alt_phone = serializers.RegexField(
        r"^\+?[0-9]{10,15}$", required=False, allow_null=True, allow_blank=True
    )
    email = serializers.EmailField(
        max_length=254, required=False, allow_null=True, allow_blank=True
    )
    is_customer = serializers.BooleanField(required=False, default=True)
    is_supplier = serializers.BooleanField(required=False, default=False)
    gstin = serializers.CharField(max_length=15, required=False, allow_null=True, allow_blank=True)
    gst_registration = serializers.ChoiceField(
        choices=GstRegistration.choices, required=False, allow_null=True
    )
    billing_address = AddressField(required=False)
    shipping_address = AddressField(required=False)
    state_code = serializers.CharField(
        max_length=2, required=False, allow_null=True, allow_blank=True
    )
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    collection_date = serializers.DateField(required=False, allow_null=True)
    credit_limit = MoneySerializerField(required=False, allow_null=True)
    credit_days = serializers.IntegerField(
        required=False, allow_null=True, min_value=0, max_value=365
    )
    sms_opt_in = serializers.BooleanField(required=False)
    consent_source = serializers.ChoiceField(
        choices=ConsentSource.choices, required=False, allow_null=True
    )

    # Create-only, and the serializer says so by being used only on create.
    opening_balance_amount = MoneySerializerField(required=False, allow_null=True)
    opening_balance_direction = serializers.ChoiceField(
        choices=OpeningDirection.choices, required=False, allow_null=True
    )
    opening_balance_as_of = serializers.DateField(required=False, allow_null=True)


class PartyUpdateSerializer(PartyWriteSerializer):
    """PATCH: every field optional, and the opening balance gone entirely.

    Not "ignored" — gone. A field that is silently dropped is a field a client
    can believe it set, and "I changed the opening balance and nothing happened"
    is a support conversation nobody needs. Changing what a party was carrying
    over is a ledger correction (LED-06), with its own entry and its own trail.
    """

    name = serializers.CharField(max_length=160, required=False)

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)
        for field in (
            "opening_balance_amount",
            "opening_balance_direction",
            "opening_balance_as_of",
        ):
            self.fields.pop(field, None)


class PartyDetailSerializer(serializers.ModelSerializer):
    """What comes back from a create, an edit or a retrieve.

    Read-only in full: this class exists to render a row, never to accept one.
    """

    balance = MoneySerializerField(read_only=True)
    credit_limit = MoneySerializerField(read_only=True)
    opening_balance_amount = MoneySerializerField(read_only=True)

    class Meta:
        model = Party
        fields = (
            "id",
            "name",
            "display_code",
            "mobile",
            "alt_phone",
            "email",
            "is_customer",
            "is_supplier",
            "gstin",
            "gst_registration",
            "billing_address",
            "shipping_address",
            "state_code",
            "notes",
            "collection_date",
            "credit_limit",
            "credit_days",
            "sms_opt_in",
            "consent_source",
            "opening_balance_amount",
            "opening_balance_direction",
            "opening_balance_as_of",
            "balance",
            "status",
            "last_activity_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
