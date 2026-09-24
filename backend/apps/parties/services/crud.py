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
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.parties.constants import GstRegistration, PartyStatus
from apps.parties.models import Party
from apps.parties.services.credit import MAX_CREDIT_LIMIT
from apps.parties.services.tags import set_party_tags
from apps.tax.validators import InvalidGstin, is_valid_state_code, state_from_gstin, validate_gstin

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

    limit = payload.get("credit_limit")
    if limit is not None:
        # PTY-06 §10. Zero is allowed and is a REAL limit meaning "no udhaar at
        # all" (BR-1) — it is never conflated with NULL, which means no limit.
        if Decimal(limit) < 0:
            details["credit_limit"] = ["A credit limit cannot be negative."]
        elif Decimal(limit) > MAX_CREDIT_LIMIT:
            # ₹99,99,99,999.99 is the column's ceiling and past it a figure is a
            # typo rather than a decision. Refused here rather than by the
            # database, so the merchant gets a field error on the field rather
            # than a 500 on the form.
            details["credit_limit"] = ["Enter a credit limit under ₹99,99,99,999.99."]

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


#: LED-05 §10 — a collection date is at most a year out.
COLLECTION_DATE_MAX_DAYS = 365


def _check_collection_date(*, ctx: Ctx, party: Party, data: dict) -> None:
    """LED-05 §10 / FR-6 — a NEW promise is today-or-later, within a year, and receivable.

    Checked only when the value CHANGES to a date. An edit that resends the
    date the party already carries — the form sends every field — must not be
    refused because that promise has since become overdue; and clearing is
    always allowed, because "no promise" is where a paid-up party belongs.

    `collection_requires_receivable` (CCR-2) is the rule that a merchant does
    not chase a supplier they owe, nor a customer who owes nothing: the date
    would sit in every bucket as a promise with nothing behind it.
    """
    if "collection_date" not in data:
        return
    value = data.get("collection_date")
    if value in (None, "") or value == party.collection_date:
        return
    if isinstance(value, str):
        value = date.fromisoformat(value)
    today = tenant_today(ctx.tenant)
    if value < today or value > today + timedelta(days=COLLECTION_DATE_MAX_DAYS):
        raise ValidationFailed({"collection_date": ["Choose a date within the next year."]})
    if (party.balance or Decimal("0")) <= 0:
        raise BusinessRuleViolation(
            "collection_requires_receivable",
            "A collection date needs money owed to you.",
            details={"balance": str(party.balance)},
        )


def _audit_snapshot(party: Party) -> dict:
    return {field: getattr(party, field) for field in WRITABLE_FIELDS}


@transaction.atomic
def create_party(*, ctx: Ctx, payload: dict) -> tuple[Party, list[dict]]:
    """Create one party. Returns `(party, warnings)`.

    The opening balance is stored AND posted, in this transaction (LED-02 FR-2 /
    PTY-01 FR-9). It was stored and deliberately unposted until LED-01 built
    `ledger_entry`; the test that kept that deferral honest is the one that had
    to change to let it in.

    The three columns stay alongside the entry, and the pair is not redundant:
    the columns are what the merchant TYPED and PTY-01 BR-5 forbids editing
    them, while the entry is the money and LED-03 corrects it. A correction
    therefore changes the balance and leaves the record of the original request
    intact, which is what an auditor asking "what did they say on day one" wants.
    """
    warnings: list[dict] = []
    data = _normalise(payload)
    # Pulled out BEFORE the writable-field filter: `tags` is not a column on
    # `parties_party` and would be dropped by it. `None` means the key was
    # absent, which is different from `[]` — see `update_party`.
    tag_names = data.pop("tags", None)
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
        # ── The savepoint is the whole point of this nesting ─────────────────
        # The pre-check above loses a race with a concurrent create — there is
        # nothing between its SELECT and this INSERT — and the partial unique
        # index is what actually decides. The reader must get the same 400
        # either way.
        #
        # But an `IntegrityError` inside an atomic block marks the WHOLE block
        # as needing rollback, and Django then refuses to run any further query
        # in it. So the recovery lookup below — the one that finds who holds the
        # number, to build a useful message — raised `TransactionManagementError`
        # instead, which is not an `IntegrityError`, was not caught, and left as
        # a 500. Two staff entering the same walk-in customer at the same moment
        # is not an exotic case; it is Tuesday.
        #
        # A nested `atomic()` is a SAVEPOINT: the failed INSERT rolls back to
        # it, the outer transaction stays usable, and the lookup can run.
        with transaction.atomic():
            party = Party.objects.create(tenant=ctx.tenant, **fields)
    except IntegrityError as exc:
        if "uq_party_tenant_mobile" in str(exc) and mobile:
            existing = _duplicate_mobile(tenant=ctx.tenant, mobile=mobile)
            if existing is not None:
                _raise_duplicate_mobile(existing)
        raise

    if tag_names is not None:
        set_party_tags(ctx=ctx, party=party, names=tag_names)

    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_CREATED,
        entity_type="parties_party",
        entity_id=party.id,
        after=_audit_snapshot(party),
    )

    _post_opening_if_asked(ctx=ctx, party=party, fields=fields)
    return party, warnings


@transaction.atomic
def update_party(*, ctx: Ctx, party: Party, payload: dict) -> tuple[Party, list[dict]]:
    """Edit one party. Returns `(party, warnings)`."""
    warnings: list[dict] = []
    data = _normalise(payload)
    tag_names = data.pop("tags", None)

    # An archived party takes notes and nothing else. Refused with 409 rather
    # than 400: the request is well-formed, the record's state is what says no,
    # and the client's move is to restore the party rather than to fix a field.
    if party.status == PartyStatus.ARCHIVED:
        # Tags are explicitly editable on an archived party (PTY-01 FR-2 lists
        # notes and tags), which is what lets a merchant reorganise a book that
        # includes people they have filed away — and what makes PTY-05's Undo
        # work after a party was archived mid-flight (EC-9).
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

    _check_collection_date(ctx=ctx, party=party, data=data)

    for field, value in data.items():
        if field in WRITABLE_FIELDS:
            setattr(party, field, value)

    try:
        # Savepoint, for the reason `create_party` gives at length: without it
        # the recovery lookup runs inside a transaction the `IntegrityError`
        # has already broken, and the merchant gets a 500 instead of being told
        # the number is taken.
        with transaction.atomic():
            party.save()
    except IntegrityError as exc:
        if "uq_party_tenant_mobile" in str(exc) and mobile:
            existing = _duplicate_mobile(tenant=ctx.tenant, mobile=mobile, exclude_id=party.pk)
            if existing is not None:
                _raise_duplicate_mobile(existing)
        raise

    # `None` means the key was absent and tags are left alone; `[]` means the
    # merchant removed the last one. Collapsing the two would make it
    # impossible to clear a party's tags through the form (FR-4).
    if tag_names is not None:
        set_party_tags(ctx=ctx, party=party, names=tag_names)

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
        _audit_credit_change(ctx=ctx, party=party, before=changed_before, after=changed_after)
    return party, warnings


#: PTY-06 §16's two fields. `credit_days` is in here even though it has no
#: effect on the limit check (FR-15) because it is the other half of the same
#: decision: a cap of ₹50,000 over seven days and the same cap over ninety are
#: different amounts of trust, and an auditor reading one without the other has
#: half the story.
CREDIT_CONTROL_FIELDS: tuple[str, ...] = ("credit_limit", "credit_days")


def _post_opening_if_asked(*, ctx: Ctx, party: Party, fields: dict) -> None:
    """LED-02 FR-2 — post the opening entry, in the party's own transaction.

    AFTER the party's audit row, so the log reads in the order the events
    happened: the party existed, then it was given a balance. Both rows commit
    together or neither does, which is the point of it being one transaction —
    a party with a balance and no entry to justify it is a number nobody can
    explain, and an entry against a party that failed to save is an orphan.

    The import is deferred to the call. `parties` may not import `ledger` at
    module scope (Part 20 §20.1.4), and that rule is not a formality here: it is
    what stopped `GET /parties/{id}` growing a ledger read during LED-01, and
    keeping it means the dependency still runs one way even though this line
    crosses it.

    The party is passed rather than its id, because `Party.objects.create()`
    above has it in hand and re-reading it under `SELECT … FOR UPDATE` would
    take a lock on a row nothing else can see yet.
    """
    from apps.ledger.services.opening import post_opening_balance

    amount = fields.get("opening_balance_amount")
    direction = fields.get("opening_balance_direction")
    as_of = fields.get("opening_balance_as_of")
    if not amount or not direction or not as_of:
        return
    post_opening_balance(
        ctx=ctx,
        party=party,
        amount=amount,
        direction=direction,
        as_of=as_of,
        via="party_create",
    )


def _audit_credit_change(*, ctx: Ctx, party: Party, before: dict, after: dict) -> None:
    """A second audit row when a credit control moved (PTY-06 §16).

    ── Why this is not just `party.updated` ──────────────────────────────────
    It is, as well — this row is written IN ADDITION. A limit is a financial
    control rather than a field, and the question it answers is one an auditor
    asks on its own: "when did this customer's cap move, and what did they owe
    at the time". Finding that in the stream of every party edit means reading
    every typo fix in the notes.

    `balance_at_change` is the reason the metadata exists. It is not recoverable
    afterwards, because the balance moves — so a limit lowered below what
    somebody already owed (FR-13, which allows it deliberately) is only ever
    provably a deliberate act if the figure is captured here, in the same
    transaction.
    """
    moved = {field for field in CREDIT_CONTROL_FIELDS if field in after}
    if not moved:
        return
    write_audit(
        ctx=ctx,
        action=AuditAction.CREDIT_LIMIT_SET,
        entity_type="parties_party",
        entity_id=party.id,
        before={field: before.get(field) for field in moved},
        after={field: after[field] for field in moved},
        metadata={"balance_at_change": str(party.balance)},
    )
