"""PTY-01 — creating and editing a party (Part 26 §26.7 R7.1: fat service).

Everything that decides anything lives here. The viewset authenticates,
authorises and delegates; the serializer says what shape the wire may take and
nothing about what it means. That split is not ceremony — three of the rules
below (the archived-edit refusal, the duplicate-mobile hand-off, the
unapplied opening balance) have to hold for a management command and a future
CSV import too, and a rule that lives in a serializer holds only for HTTP.
"""

from __future__ import annotations

import unicodedata
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.parties.constants import GstRegistration, PartyStatus
from apps.parties.models import Party
from apps.tax.validators import (
    InvalidGstin,
    is_valid_state_code,
    state_from_gstin,
    validate_gstin,
)

# Every column a client may write, in one place, because a whitelist that lives
# in two places is a whitelist that will disagree with itself. The serializer
# declares the wire shape; this is the authority on what may reach the model.
WRITABLE_FIELDS = (
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
)

# Opening balance is create-only: after the party exists, changing what it was
# carrying over is a LEDGER correction with its own audit trail (LED-06), not a
# quiet field edit. PATCH ignores these three.
CREATE_ONLY_FIELDS = (
    "opening_balance_amount",
    "opening_balance_direction",
    "opening_balance_as_of",
)

# What an archived party still accepts. Archiving means "I am done with this
# name", not "this record is frozen evidence" — a merchant must still be able
# to write down why they archived it.
ARCHIVED_EDITABLE_FIELDS = frozenset({"notes"})

NOTES_MAX_LENGTH = 500
NAME_MIN_LENGTH = 2
CREDIT_DAYS_MAX = 365


def _clean_text(value: Any) -> Any:
    """NFKC-normalise, strip control characters, collapse inner whitespace.

    Three separate reasons, none of them cosmetic:

     · **Bidi overrides.** U+202E in a name reverses everything after it when
       rendered, so "Ramesh" can be made to display as a different name in the
       list, in a reminder and on an invoice. It is the cheapest spoof there is
       and it costs one line to remove.
     · **`str.format` downstream.** `platform_app/services/presets.py`
       interpolates the party name into SMS and WhatsApp templates with
       `str.format`, so a name containing braces reaches a formatter. Braces are
       left alone here — that consumer must escape its own input — but control
       characters that would corrupt the template are not.
     · **Search.** NFKC folds the compatibility forms of Devanagari and Latin
       digits, so a name typed with a different keyboard still matches.
    """
    if not isinstance(value, str):
        return value
    text = unicodedata.normalize("NFKC", value)
    text = "".join(ch for ch in text if ch == "\n" or unicodedata.category(ch)[0] != "C")
    return " ".join(text.split())


def _normalise(payload: dict) -> dict:
    cleaned = dict(payload)
    for field in ("name", "display_code", "email", "notes", "state_code"):
        if field in cleaned:
            cleaned[field] = _clean_text(cleaned[field])
    if cleaned.get("email"):
        cleaned["email"] = cleaned["email"].lower()
    if cleaned.get("state_code"):
        cleaned["state_code"] = cleaned["state_code"].upper()
    return cleaned


def _validate(payload: dict, *, party: Party | None) -> None:
    """Field rules that do not need the database. Raises `ValidationFailed`."""
    details: dict[str, list[str]] = {}

    if "name" in payload:
        name = payload.get("name") or ""
        if len(name) < NAME_MIN_LENGTH:
            details["name"] = ["Enter the party's name."]

    if payload.get("notes") and len(payload["notes"]) > NOTES_MAX_LENGTH:
        details["notes"] = [f"Keep notes under {NOTES_MAX_LENGTH} characters."]

    # FR-4 — a party this business neither buys from nor sells to is a contact,
    # and this product does not have contacts. Checked against the RESULTING
    # party, not the payload, so a PATCH that clears only one flag is judged on
    # what the row will actually look like.
    is_customer = payload.get("is_customer", getattr(party, "is_customer", True))
    is_supplier = payload.get("is_supplier", getattr(party, "is_supplier", False))
    if not is_customer and not is_supplier:
        details["non_field_errors"] = ["Choose whether this is a customer, a supplier, or both."]

    if payload.get("state_code") and not is_valid_state_code(payload["state_code"]):
        details["state_code"] = ["Choose a valid state."]

    credit_days = payload.get("credit_days")
    if credit_days is not None and not 0 <= int(credit_days) <= CREDIT_DAYS_MAX:
        details["credit_days"] = [f"Credit days must be between 0 and {CREDIT_DAYS_MAX}."]

    if payload.get("credit_limit") is not None and Decimal(payload["credit_limit"]) < 0:
        details["credit_limit"] = ["A credit limit cannot be negative."]

    if details:
        raise ValidationFailed(details)


def _apply_gstin(*, payload: dict, warnings: list[dict]) -> None:
    """FR-7, and the one place this feature has two outcomes rather than one.

    A GSTIN that fails its own check digit is a typo and is REFUSED: saving it
    means the merchant discovers it on a rejected return months later.

    A GSTIN whose state prefix disagrees with the chosen state is a WARNING and
    is SAVED, because it is routinely correct — a Maharashtra-registered
    supplier delivering to a Karnataka site is an ordinary Tuesday. Refusing it
    would make the product wrong about the merchant's own business.

    This is the same split, and the same `meta.warnings[]` channel, that
    `onboarding.update_tenant()` already uses for the tenant's own GSTIN.
    """
    if "gstin" not in payload:
        return

    raw = payload.get("gstin")
    if not raw:
        payload["gstin"] = None
        return

    try:
        gstin = validate_gstin(raw)
    except InvalidGstin as exc:
        raise ValidationFailed(
            {"gstin": ["Check the GSTIN — it is 15 characters and the last one must match."]}
        ) from exc

    payload["gstin"] = gstin
    # A GSTIN means the party is registered, unless the caller said which kind.
    if not payload.get("gst_registration"):
        payload["gst_registration"] = GstRegistration.REGULAR

    gstin_state = state_from_gstin(gstin)
    chosen = payload.get("state_code")
    if not chosen:
        payload["state_code"] = gstin_state
    elif chosen != gstin_state:
        warnings.append(
            {
                "code": "gstin_state_mismatch",
                "field": "gstin",
                "gstin_state_code": gstin_state,
                "state_code": chosen,
            }
        )


def _duplicate_mobile(*, tenant: Any, mobile: str, exclude_id: Any = None) -> Party | None:
    """The active party already holding this mobile, if any.

    `Party.objects` is the soft-delete manager, so a deleted row is invisible
    here — which matches the partial unique index (`deleted_at IS NULL`) exactly.
    An ARCHIVED party is still a live row and still holds its number; that is
    deliberate, and the response says so, because the merchant's next move is to
    restore it rather than to make a second one.
    """
    if not mobile:
        return None
    query = Party.objects.filter(tenant=tenant, mobile=mobile)
    if exclude_id is not None:
        query = query.exclude(pk=exclude_id)
    return query.only("id", "status").first()


def _raise_duplicate_mobile(existing: Party) -> None:
    """400 on `details.mobile`, carrying the id and NOTHING else about the row.

    The obvious message is "this number belongs to Ramesh Traders", and it is
    the one thing this error must not say. The name is another record's data,
    returned to someone who has not asked for that record and may not be
    entitled to it — object-level visibility is a hook this codebase keeps open
    (`common/permissions.py check_object_permission`), and an error message is
    the last place that hook would ever be consulted.

    The id is enough: the client offers "Open it", the normal `GET /parties/{id}`
    runs the normal tenant and permission checks, and the name arrives — or does
    not — through the door that is allowed to decide.
    """
    raise ValidationFailed(
        {
            "mobile": ["This mobile number is already used by another party."],
            "existing_party_id": str(existing.id),
            "existing_status": existing.status,
        }
    )


def _audit_snapshot(party: Party) -> dict:
    return {field: getattr(party, field) for field in WRITABLE_FIELDS}


@transaction.atomic
def create_party(*, ctx: Ctx, payload: dict) -> tuple[Party, list[dict]]:
    """Create one party. Returns `(party, warnings)`.

    The opening balance is stored and NOT posted. Sprint 4's LED-02 reads the
    three columns and posts the entry; until then a test asserts the ledger is
    untouched, which is the only thing that keeps a deferral honest.
    """
    warnings: list[dict] = []
    data = _normalise(payload)
    _apply_gstin(payload=data, warnings=warnings)
    _validate(data, party=None)

    fields = {k: v for k, v in data.items() if k in WRITABLE_FIELDS + CREATE_ONLY_FIELDS}

    mobile = fields.get("mobile")
    if mobile:
        existing = _duplicate_mobile(tenant=ctx.tenant, mobile=mobile)
        if existing is not None:
            _raise_duplicate_mobile(existing)

    if fields.get("sms_opt_in") and fields.get("consent_source"):
        # BR-6 — the server times consent. A client-supplied timestamp is a
        # claim about when someone agreed to be messaged, which is exactly the
        # kind of claim a regulator reads back to you.
        fields["consent_at"] = timezone.now()

    try:
        party = Party.objects.create(tenant=ctx.tenant, **fields)
    except IntegrityError as exc:
        # The pre-check above loses a race with a concurrent create; the partial
        # unique index is what actually decides, and the reader gets the same
        # answer either way rather than a 500.
        if "uq_party_tenant_mobile" in str(exc) and mobile:
            existing = _duplicate_mobile(tenant=ctx.tenant, mobile=mobile)
            if existing is not None:
                _raise_duplicate_mobile(existing)
        raise

    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_CREATED,
        entity_type="parties_party",
        entity_id=party.id,
        after=_audit_snapshot(party),
    )
    return party, warnings


@transaction.atomic
def update_party(*, ctx: Ctx, party: Party, payload: dict) -> tuple[Party, list[dict]]:
    """Edit one party. Returns `(party, warnings)`."""
    warnings: list[dict] = []
    data = _normalise(payload)

    # An archived party takes notes and nothing else. Refused with 409 rather
    # than 400: the request is well-formed, the record's state is what says no,
    # and the client's move is to restore the party rather than to fix a field.
    if party.status == PartyStatus.ARCHIVED:
        offered = {k for k in data if k in WRITABLE_FIELDS} - ARCHIVED_EDITABLE_FIELDS
        if offered:
            raise BusinessRuleViolation(
                "party_archived",
                "Restore this party before editing it.",
                details={"fields": sorted(offered)},
            )

    _apply_gstin(payload=data, warnings=warnings)
    _validate(data, party=party)

    before = _audit_snapshot(party)

    mobile = data.get("mobile")
    if mobile and mobile != party.mobile:
        existing = _duplicate_mobile(tenant=ctx.tenant, mobile=mobile, exclude_id=party.pk)
        if existing is not None:
            _raise_duplicate_mobile(existing)

    if data.get("sms_opt_in") and not party.sms_opt_in and data.get("consent_source"):
        party.consent_at = timezone.now()

    for field, value in data.items():
        if field in WRITABLE_FIELDS:
            setattr(party, field, value)

    try:
        party.save()
    except IntegrityError as exc:
        if "uq_party_tenant_mobile" in str(exc) and mobile:
            existing = _duplicate_mobile(tenant=ctx.tenant, mobile=mobile, exclude_id=party.pk)
            if existing is not None:
                _raise_duplicate_mobile(existing)
        raise

    after = _audit_snapshot(party)
    changed_before, changed_after = diff_fields(before, after, fields=WRITABLE_FIELDS)
    if changed_after:
        # Only what changed. A full snapshot on every edit would put the party's
        # mobile, email, GSTIN and address into an audit row each time somebody
        # fixed a typo in the notes — PII accumulating for no reason.
        write_audit(
            ctx=ctx,
            action=AuditAction.PARTY_UPDATED,
            entity_type="parties_party",
            entity_id=party.id,
            before=changed_before,
            after=changed_after,
        )
    return party, warnings
