"""Party wire shapes (Part 26 §26.6).

Read and write serializers are separate (R6.1); `fields` is always an explicit
tuple (R6.2); money travels as a string (R6.3).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from rest_framework import serializers

from apps.common.serializers import MoneySerializerField
from apps.parties.constants import ConsentSource, GstRegistration, OpeningDirection
from apps.parties.models import Party, Tag
from apps.parties.services.archive import BULK_ARCHIVE_MAX


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


class PartyTagSerializer(serializers.ModelSerializer):
    """A tag as it rides on a party — no `party_count`, which is a fact about
    the tag and not about this party's relationship to it."""

    class Meta:
        model = Tag
        fields = ("id", "name", "color")
        read_only_fields = fields


class PartyListSerializer(serializers.ModelSerializer):
    """The list row. Sprint 0's walking skeleton needs no more than this."""

    balance = MoneySerializerField(read_only=True)
    tags = PartyTagSerializer(many=True, read_only=True)

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
            # LED-05 FR-4 — the reminders screen lists a bucket's parties with
            # their promise date; one column, no extra query.
            "collection_date",
            # PTY-05 — the chips the row draws. Prefetched by the selector, so
            # this is not a query per row; `test_list_columns_cover_the_list_row`
            # and the query budget both hold that.
            "tags",
        )
        read_only_fields = fields


class PartyTotalsSerializer(serializers.Serializer):
    """`meta.totals` — and the reason it is a serializer rather than a dict.

    Handed the selector's raw dict, DRF's JSON renderer turned the two
    `Decimal`s into JSON NUMBERS: `"receivable": 0.0`. That breaks canon rule 3
    and Part 22 §22.1 — money is a string on the wire — and it breaks it in the
    one place the client cannot defend itself, because by the time the browser
    parses `184300.55` it is already a double.

    Caught by printing the actual response body rather than by any assertion:
    the test compared a dict to a dict and both sides said `0`, because
    `Decimal("0.00") == 0.0` is true in Python and false in every way that
    matters on the wire.
    """

    receivable = MoneySerializerField(read_only=True)
    payable = MoneySerializerField(read_only=True)
    count = serializers.IntegerField(read_only=True)
    # PTY-06 FR-12. Counted in the same aggregate as the rest, over the same
    # filtered set — so on the default list it is the whole book, which is the
    # number the "Over limit (7)" chip is for.
    over_limit = serializers.IntegerField(read_only=True)


class PartyTagNamesField(serializers.ListField):
    """`tags: ["Camp Area", "Route 2"]` on the party write path (FR-4).

    NAMES, not ids, and that is what makes create-inline work: a merchant types
    "Camp Area" into the picker, the chip appears, and Save creates the tag and
    the link in the same transaction. Sending ids would mean a round trip
    before the form could be submitted, for a tag the merchant has already
    decided on.

    ── The ceiling is NOT enforced here, and that is a correction ─────────────
    This field used to cap the list at `PARTY_TAG_LIMIT`, on the reasonable
    theory that failing fast gives the form a field error to hang on the picker.
    It is the wrong layer, because a serializer cannot know that "Camp Area" and
    "camp area" are one tag: eleven names that resolve to ten distinct tags were
    refused with "Up to 10 tags per party", about a party that would have ended
    up carrying exactly ten.

    BR-3 counts the RESULT, so it belongs where the names are resolved —
    `set_party_tags`, which also holds for a CSV import and a management command
    that never pass through a serializer, and which raises the same
    `{"tags": [...]}` field error this would have.

    The bound that remains is not the business rule. It is a sanity guard so a
    ten-thousand-element list is refused before anything tries to resolve it.
    """

    #: Generous on purpose: well above any real submission, well below a payload
    #: worth resolving name by name.
    MAX_SUBMITTED = 50

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("child", serializers.CharField(max_length=64))
        kwargs.setdefault("required", False)
        kwargs.setdefault("max_length", self.MAX_SUBMITTED)
        super().__init__(**kwargs)


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
    tags = PartyTagNamesField()


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
    tags = PartyTagSerializer(many=True, read_only=True)

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
            "tags",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def to_representation(self, instance: Party) -> dict:
        """A2 (PLT-X01 §6) — `loan_balance`, `trade_balance`, `deposit_held`, when they mean
        something: present when non-zero or when a module that writes that bucket is on,
        omitted otherwise, so today's tenants read exactly the payload they read before."""
        from apps.parties.services.balance import bucket_figures

        data = super().to_representation(instance)
        data.update(bucket_figures(instance))
        return data


class PartySummarySerializer(serializers.Serializer):
    """`summary` on the detail response — what the khata page's header answers.

    ── What arrived with LED-01, and what still has not ───────────────────────
    FRD PTY-03 §14 specifies `summary` as
    `{balance, receivable, payable, open_invoices, overdue_amount, last_payment_at}`
    and the detail response as also carrying `recent_entries[5]`. This shipped
    with `balance` alone, because the other six were about a `ledger_entry`
    table that did not exist, and a `"0.00"` the code cannot verify reads as a
    fact to the client rendering it.

    LED-01 built that table, so four of them are now real:

     · `receivable` and `payable` are the party's own cached totals, which
       `parties/services/balance.py` now writes in the same transaction as every
       entry — no longer a cache nobody fills.
     · `total_debit` and `total_credit` are what the merchant has given and got
       in all, aggregated over the same `LIVE_ENTRIES` predicate the balance
       uses, so the header and the timeline cannot tell different stories about
       the same rows. They are not in §14's list; they are what the khata page
       actually shows above the timeline, and naming them is better than making
       the client sum a paged list.
     · `entry_count` says how many lines there are, which is what decides
       whether the page shows a timeline or a first-use empty state.

    `open_invoices`, `overdue_amount` and `last_payment_at` are still ABSENT
    rather than zero, and for the unchanged reason: `sales_document` and
    `payments_payment` have no tables. They arrive with SAL-02 and PAY-01,
    carrying data, and the test that holds them absent is what has to be deleted
    to let them in.
    """

    balance = MoneySerializerField(read_only=True)
    receivable = MoneySerializerField(read_only=True)
    payable = MoneySerializerField(read_only=True)
    total_debit = MoneySerializerField(read_only=True)
    total_credit = MoneySerializerField(read_only=True)
    entry_count = serializers.IntegerField(read_only=True)


class PartyCreditSerializer(serializers.Serializer):
    """`credit` — the limit, what is used against it, and what that means.

    Only rendered when a limit is set: a party with no credit limit has no usage
    bar, and a block of nulls is several fields saying one thing.

    `exposure` is the party's balance floored at zero (BR-3). Credit is about
    what they owe the merchant, so a party in credit — one the merchant owes —
    is using none of it. The floor is the rule rather than caution: without it a
    customer ₹2,000 in advance against a ₹50,000 limit would read as ₹52,000 of
    headroom, and the product would be lending them their own deposit back.

    `mode` travels inside the block so a client can hide the bar when the tenant
    has switched checks off (FR-10) without a second request to find out. The
    limit is still sent in that case, and still editable, because it is data
    rather than behaviour.

    `status` is `over`, `near` or `ok` — the same three words the list filter
    takes, computed by the same function, so a row in the over-limit list and
    the bar on that party's own page cannot disagree.
    """

    limit = MoneySerializerField(read_only=True)
    days = serializers.IntegerField(read_only=True, allow_null=True)
    exposure = MoneySerializerField(read_only=True)
    available = MoneySerializerField(read_only=True)
    over_by = MoneySerializerField(read_only=True)
    usage_pct = serializers.IntegerField(read_only=True, allow_null=True)
    mode = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)


class CreditCheckSerializer(serializers.Serializer):
    """`GET /parties/{id}/credit-check` — would this amount cross the limit?

    Every figure is money as a string (canon rule 3) except `can_override`,
    which is the one thing here that is about the ACTOR rather than the party:
    the client draws "Override" or "Ask owner" from it, and a client that had to
    infer it from a role would be re-implementing BR-8 in TypeScript.
    """

    status = serializers.CharField(read_only=True)
    mode = serializers.CharField(read_only=True)
    limit = MoneySerializerField(read_only=True)
    exposure_before = MoneySerializerField(read_only=True)
    exposure_after = MoneySerializerField(read_only=True)
    available_before = MoneySerializerField(read_only=True)
    over_by = MoneySerializerField(read_only=True)
    can_override = serializers.BooleanField(read_only=True)


class CreditCheckQuerySerializer(serializers.Serializer):
    """What the pre-flight's query string may carry.

    `amount` is required and must be positive: the question this endpoint
    answers is "does ADDING this cross the limit", and zero or a negative amount
    is not that question — an operation that reduces exposure is never checked
    at all (BR-6).
    """

    amount = MoneySerializerField(required=True, min_value=Decimal("0.01"))
    operation = serializers.ChoiceField(
        choices=("entry", "invoice"), required=False, default="entry"
    )


# ── PTY-04 — archive and restore ────────────────────────────────────────────


class PartyWriteOffSerializer(serializers.Serializer):
    """FR-3's `write_off` object — its SHAPE, and deliberately none of its rules.

    `{ reason, entry_date?, amount? }`. Every rule about these values is a
    ledger rule — the 3–160 reason LED-03 already enforces, the not-in-the-
    future date in the tenant's timezone that every entry obeys, the two-decimal
    amount — and `parties` may not import the ledger (Part 20 §20.1.4). Restating
    them here would be the second copy LED-02's opening balance was: the one
    that accepted the year 202600 while the ordinary entry refused it. So this
    class checks that the keys are there and are scalars, and the ledger's
    handler validates them and answers under `details.write_off.*`.

    `amount` is the figure the merchant CONFIRMED ("I understand ₹2,300 is
    written off"). Optional; when sent, a locked balance that differs is a 409
    `balance_changed` rather than a write-off of a sum nobody agreed to.
    """

    reason = serializers.CharField(required=True, allow_blank=True, trim_whitespace=True)
    entry_date = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    amount = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class PartyArchiveSerializer(serializers.Serializer):
    """The archive body: a reason, and optionally a write-off.

    FRD FR-1 makes `reason` optional and caps it at 160 characters, which is a
    sentence — "No longer trading", "Moved away", "Duplicate of C-0042". It is
    stored on the audit row rather than on the party, because it explains a
    DECISION and not a record: the next person asking why this party left the
    book is reading the audit trail, and a party who is restored and archived
    again has two reasons, not one overwritten one.

    `write_off` is FR-3, the one escape from the balance guard. Its own reason
    is separate from this one and required: this one says why the party left
    the book, that one says why the money was forgiven, and it becomes the
    ledger entry's note.
    """

    reason = serializers.CharField(
        required=False, allow_blank=True, max_length=160, trim_whitespace=True
    )
    write_off = PartyWriteOffSerializer(required=False)


class PartyBulkArchiveSerializer(serializers.Serializer):
    """`{ ids: [...], reason?: "..." }` — FR-9.

    The ceiling is validated here rather than in the service because it is a
    statement about the REQUEST, not about the parties: two hundred ids is as
    much as one transaction should hold, whatever those parties turn out to be.
    """

    ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        min_length=1,
        max_length=BULK_ARCHIVE_MAX,
    )
    reason = serializers.CharField(
        required=False, allow_blank=True, max_length=160, trim_whitespace=True
    )

    def validate(self, attrs: dict) -> dict:
        """BR-10 / FR-9 — bulk archive never writes off, and says so.

        Refused rather than ignored. DRF drops an unknown key silently, so a
        client that sent `write_off` here would get a 200 with the owing parties
        in `skipped` and could reasonably believe it had asked for something the
        server declined on the merits. Forgiving a debt is a decision about one
        person and one amount; the single-party endpoint is where it is made.
        """
        if isinstance(self.initial_data, dict) and "write_off" in self.initial_data:
            raise serializers.ValidationError(
                {"write_off": ["Write-offs are made one party at a time, not in bulk."]}
            )
        return attrs


class PartyBulkArchiveResultSerializer(serializers.Serializer):
    """What a partial success looks like on the wire.

    A serializer rather than the service's dict handed to the renderer, for the
    reason `meta.totals` taught: `balance` is money and money is a string
    (canon rule 3). Straight to the renderer it would have gone out as a JSON
    number, and the precision is lost before the client ever parses it.
    """

    archived = serializers.ListField(child=serializers.CharField(), read_only=True)
    skipped = serializers.ListField(child=serializers.DictField(), read_only=True)
