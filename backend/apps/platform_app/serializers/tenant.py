"""Tenant wire shapes for the onboarding wizard (PLT-03 §7, §10).

Read and write are separate (R6.1) and `fields` is an explicit tuple (R6.2).
The write serializers validate shape and enumerations; GSTIN checksum,
uniqueness and the state derivation live in `services.onboarding`, which is the
only place they can be applied inside the transaction that also writes the row.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.platform_app.constants import BusinessType, GstType, InvitationStatus, MembershipStatus
from apps.platform_app.mobile import InvalidMobile, normalise_mobile
from apps.platform_app.models import Invitation, Tenant

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
    """`platform_tenant.address` (Part 21 §21.3.1) — a closed jsonb shape.

    Every field is `allow_null`: "I left this blank" and "clear what is there"
    are the same gesture in a form, and a client that normalises an empty input
    to `null` is spelling that gesture the only way JSON has for it. `validate`
    on the parent drops both spellings out of the stored jsonb, so a cleared
    field leaves no key behind rather than an empty one.
    """

    line1 = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    line2 = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    city = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    district = serializers.CharField(
        max_length=120, required=False, allow_blank=True, allow_null=True
    )
    state = serializers.CharField(max_length=120, required=False, allow_blank=True, allow_null=True)
    pincode = serializers.RegexField(
        PINCODE_RE,
        required=False,
        allow_blank=True,
        allow_null=True,
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
    legal_name = serializers.CharField(
        max_length=200, required=False, allow_blank=True, allow_null=True
    )
    business_type = serializers.ChoiceField(choices=BusinessType.choices, required=False)
    gst_type = serializers.ChoiceField(choices=GstType.choices, required=False)
    gstin = serializers.CharField(max_length=15, required=False, allow_blank=True, allow_null=True)
    pan = serializers.CharField(max_length=10, required=False, allow_blank=True, allow_null=True)
    state_code = StateCodeField(max_length=2, required=False)
    address = AddressSerializer(required=False, allow_null=True)
    # `platform_tenant.phone` is NOT NULL, so `null` here means "clear it", which
    # is the empty string on the column — not `None`. FR-10's "Skip for now"
    # sends exactly that.
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    locale = serializers.ChoiceField(choices=["en", "hi"], required=False)
    onboarding_step = serializers.IntegerField(min_value=0, max_value=4, required=False)

    def validate_phone(self, value: str | None) -> str:
        if value in (None, ""):
            return ""
        try:
            return normalise_mobile(value)
        except InvalidMobile as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_gstin(self, value: str | None) -> str:
        return (value or "").strip().upper()

    def validate_pan(self, value: str | None) -> str:
        return (value or "").strip().upper()

    def validate(self, attrs: dict) -> dict:
        # `null` and `""` are the same gesture on this endpoint — the wizard's
        # "Skip for now" (FR-10) and a blank optional input both mean "there is
        # no value here". They are normalised to whatever the column can hold:
        # `None` for the nullable text columns, `{}` for the jsonb, `""` for the
        # NOT NULL `phone`. The service layer behind this already expects `None`
        # (`_apply_gst` sets `payload["gstin"] = None` for an unregistered
        # business), so accepting it is what makes the two layers agree.
        if "address" in attrs:
            address = attrs["address"] or {}
            attrs["address"] = {k: v for k, v in address.items() if v not in (None, "")}
        for optional in ("legal_name", "email", "gstin", "pan"):
            if attrs.get(optional) in ("", None) and optional in attrs:
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


class MemberReadSerializer(serializers.Serializer):
    """A row of the team list (PLT-05 FR-11).

    `must_change_password` is surfaced because it is the difference between
    "this person is set up" and "this person has never signed in and the
    password is still sitting in a WhatsApp message" -- which is exactly what
    an owner opens this list to find out. `password_expires_at` lets the row say
    "expires in 2 days" rather than making them count.

    The password itself is not here and cannot be: only its hash was ever
    stored.
    """

    id = serializers.UUIDField(read_only=True)
    user_id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    full_name = serializers.CharField(source="user.full_name", read_only=True, allow_null=True)
    mobile = serializers.CharField(source="user.mobile", read_only=True, allow_null=True)
    role = serializers.CharField(source="role.code", read_only=True)
    status = serializers.CharField(read_only=True)
    joined_at = serializers.DateTimeField(read_only=True)
    last_login_at = serializers.DateTimeField(source="user.last_login_at", read_only=True)
    must_change_password = serializers.BooleanField(
        source="user.must_change_password", read_only=True
    )
    password_expires_at = serializers.DateTimeField(
        source="user.password_expires_at", read_only=True, allow_null=True
    )

    #: What an `invited` row may NOT show. The person has an account — that is
    #: the only reason the row exists (`platform_membership.user_id` is NOT
    #: NULL) — but they have not agreed to join, and their profile is theirs:
    #: their name as they spelt it, their phone number, when they last signed in
    #: anywhere on the platform, and whether they are still on a password some
    #: OTHER business issued. The inviting business knows the address it typed
    #: and the role it chose; that is all this row repeats until acceptance.
    INVITED_REDACTED: dict = {
        "full_name": None,
        "mobile": None,
        "last_login_at": None,
        "must_change_password": False,
        "password_expires_at": None,
    }

    def to_representation(self, instance: Any) -> dict:
        data = super().to_representation(instance)
        if data.get("status") == MembershipStatus.INVITED:
            data.update(self.INVITED_REDACTED)
        return data


class MemberCreateSerializer(serializers.Serializer):
    """`POST /members` (DEC-012).

    `full_name` is required and it is not ceremony: the owner is creating an
    account on somebody else's behalf, and a team list of bare email addresses
    is unreadable the moment there are four of them. Sign-up asks for it too.

    `mobile` is optional and is a notification channel, never an identity
    (DEC-010) -- it is here so the owner can record the number they are about to
    WhatsApp the password to.
    """

    email = serializers.EmailField(max_length=254)
    full_name = serializers.CharField(max_length=120, trim_whitespace=True)
    role = serializers.CharField(max_length=32)
    mobile = serializers.CharField(max_length=15, required=False, allow_blank=True, allow_null=True)

    def validate_mobile(self, value: str | None) -> str | None:
        """Normalise to E.164 or refuse, as `InvitationCreateSerializer` does (NEW-2).

        The "already used by another login" check in `credentials.create_member`
        compares against the stored E.164 spelling, so an un-normalised
        `9876543210` would slip past it and store a second spelling of a number
        the platform already holds. "" and `null` are both "no number".
        """
        if value in (None, ""):
            return None
        try:
            return normalise_mobile(value)
        except InvalidMobile as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_role(self, value: str) -> str:
        """`owner` is not invitable. A business has exactly one and it is transferred.

        Canon §0.7: ownership moves by an explicit transfer that the current
        owner performs, so an endpoint that mints a second owner would be a
        privilege-escalation path dressed as an onboarding convenience.
        """
        code = (value or "").strip().lower()
        if code == "owner":
            raise serializers.ValidationError(
                "Ownership is transferred, not granted. Choose admin, accountant or staff."
            )
        return code


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


# `?status=all` on the invitation list. Not an `InvitationStatus`: it is the
# absence of a status filter, spelled so a client can ask for it explicitly.
ANY_STATUS = "all"


class InvitationListQuerySerializer(serializers.Serializer):
    """`GET /invitations?status=` (PLT-05 FR-11).

    The query string is validated rather than read raw, so `?status=pendingg`
    is a `validation_error` naming the field instead of an empty list that looks
    like "you have invited nobody".
    """

    status = serializers.ChoiceField(
        choices=[*InvitationStatus.values, ANY_STATUS],
        required=False,
        default=InvitationStatus.PENDING,
    )


class InvitationCreateSerializer(serializers.Serializer):
    """`POST /invitations` (PLT-05 FR-9) — shape only.

    `role` is a *code* on the wire and a `Role` row in the service; resolving
    the one to the other needs the tenant, which the view has and a field does
    not, so the view resolves it and turns an unknown code into a
    `validation_error` on this field.

    The address is checked here and normalised again in the service — the
    service is callable from a job, so it cannot rely on a serializer having
    run, and this layer exists to give the merchant the field-level message.
    """

    email = serializers.EmailField(max_length=254)
    role = serializers.CharField(max_length=32, trim_whitespace=True)
    # Not the identity (DEC-010) — a notification channel, so `null` and "" are
    # both "no number" rather than a rejection.
    mobile = serializers.CharField(max_length=20, required=False, allow_blank=True, allow_null=True)

    def validate_role(self, value: str) -> str:
        """`owner` is refused here exactly as `MemberCreateSerializer` refuses it.

        It was not, and the team screen's own comment (`INVITABLE_ROLES`) said
        "the server is the authority and will refuse it". An admin holds
        `platform.members.manage`, so an admin could invite an address they
        control as `owner`, accept it, and outrank the person who hired them —
        the privilege escalation PLT-05 §12 forbids ("Invite/promote owner:
        admin ❌"). Ownership is transferred, never granted (canon §0.7).
        """
        code = (value or "").strip().lower()
        if code == "owner":
            raise serializers.ValidationError(
                "Ownership is transferred, not granted. Choose admin, accountant or staff."
            )
        return code

    def validate_mobile(self, value: str | None) -> str | None:
        """Normalise to E.164 or refuse. `platform_invitation.mobile` is 15 chars.

        Without this an over-long or oddly punctuated number reaches the column
        and Postgres answers with a `DataError` — a 500 for what is a bad field.
        """
        if value in (None, ""):
            return None
        try:
            return normalise_mobile(value)
        except InvalidMobile as exc:
            raise serializers.ValidationError(str(exc)) from exc


class InvitationReadSerializer(serializers.ModelSerializer):
    """The invitation as the team screen sees it.

    `fields` is explicit (R6.2) and the explicitness is load-bearing here:
    `token_hash` is a column on this model, and a `ModelSerializer` with
    `exclude` or `__all__` would publish the one column that must never leave
    the server. The raw token is not on the model at all — it exists only in
    `invite()`'s return value — and the create endpoint adds it to its own
    response as `accept_url`, once.
    """

    role = serializers.CharField(source="role.code", read_only=True)
    invited_by = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = (
            "id",
            "email",
            "role",
            "status",
            "expires_at",
            "created_at",
            "invited_by",
        )
        read_only_fields = fields

    def get_invited_by(self, obj: Invitation) -> str | None:
        """The inviter's name, or `null` — never their id or address.

        `invited_by` is `ON DELETE SET NULL`, so "somebody who has since gone"
        is a real state the screen has to render.
        """
        inviter = obj.invited_by
        return (inviter.full_name or None) if inviter is not None else None
