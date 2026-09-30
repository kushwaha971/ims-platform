"""Ledger entry wire shapes (Part 26 §26.6).

Read and write serializers are separate (R6.1); `fields` is always an explicit
tuple (R6.2); money travels as a string (R6.3).
"""

from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.common.constants import MONEY_PAYMENT_MODE_CHOICES, Direction, UpiApp
from apps.common.serializers import MoneySerializerField
from apps.ledger.constants import NOTE_MAX_LENGTH, REFERENCE_MAX_LENGTH, EntryType, SourceType
from apps.ledger.models import LedgerEntry


class EntryAuthorSerializer(serializers.Serializer):
    """FR-8's "by Sunita" — an id and a name, and deliberately nothing else.

    The timeline row names who wrote the entry. It does not need their email,
    their role or their mobile, and a row that carried them would put a
    colleague's contact details on a screen a merchant can share.
    """

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class LedgerEntrySerializer(serializers.ModelSerializer):
    """One timeline row, and the body of a 201.

    `created_by` is `null` for an entry a job posted. The client renders "by
    <name>" only when the author is somebody other than the viewer, so a null
    is not a missing value to it — it is a system entry, and it says so.
    """

    amount = MoneySerializerField(read_only=True)
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = LedgerEntry
        fields = (
            "id",
            "party_id",
            "direction",
            "amount",
            "entry_date",
            "entry_type",
            "source_type",
            "source_id",
            "note",
            "payment_mode",
            "upi_app",
            "reference",
            "status",
            "reversed_by_id",
            "reverses_id",
            "supersedes_id",
            "reason",
            "created_by",
            "created_at",
            # A2 — which kind of money the line is (`main`, `loan`, `deposit`).
            "bucket",
        )
        read_only_fields = fields

    def get_created_by(self, entry: LedgerEntry) -> dict | None:
        author = entry.created_by
        if author is None:
            return None
        return {
            "id": str(author.id),
            # `full_name` is what the platform user model calls it; the wire
            # says `name`, because the timeline's caption is "by Sunita" and the
            # client should not have to know the column's name to render it.
            "name": getattr(author, "full_name", "") or "",
        }


def entry_source(entry: LedgerEntry, sources: dict | None = None) -> dict | None:
    """FR-4's document link — one function, so the statement and the timeline agree.

    `null` for a manual row, which is every row a merchant types. A reversal's
    source is the entry it undoes (`type='ledger_entry'`, the same id as
    `reverses_id`); a DOCUMENT void's reversal names the document itself
    (LED-10 BR-5), so it links to the same invoice or receipt as the row it
    undid. `number`, `status` and `kind` come from `resolve_sources`, which the
    view runs once per page and hands in as `sources` (LED-10 FR-5); they stay
    `null` for a document the resolver could not find (§9 "Document not
    found") and for a manual reversal, which has no document.
    """
    if entry.source_type == SourceType.MANUAL or entry.source_id is None:
        return None
    found = (sources or {}).get(str(entry.source_id)) or {}
    return {
        "type": entry.source_type,
        "id": str(entry.source_id),
        "number": found.get("number"),
        "status": found.get("status"),
        "kind": found.get("kind"),
        "url": None,
        # A4b (Wave A gate): an adjustment is not a return; see `resolve_payments`.
        **({"adjustment": True} if found.get("adjustment") else {}),
    }


class TimelineEntrySerializer(LedgerEntrySerializer):
    """A row of `GET /parties/{id}/ledger-entries` — CR-027's two additive keys.

    `running_balance` is the balance AFTER this row (PTY-03 FR-5/FR-6), from the
    window `selectors.statement.with_running_balance` puts on the page query
    plus the page's carried figure (`context["carried"]`);
    `source` is the statement's document link. A subclass for the LIST only:
    the 201 of a create, a correction's 200 and the detail read are one row out
    of its ordering, and a running balance there would be a number computed
    over nothing. The header moves from `meta.party_balance` on those, and the
    timeline refetches (NEW-2) — which is when the row gains its figure.

    `null` when the queryset was not annotated or no carried figure was given,
    rather than `"0.00"`: a zero this serializer cannot vouch for is
    indistinguishable from a settled khata.
    """

    running_balance = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()

    class Meta(LedgerEntrySerializer.Meta):
        fields = (*LedgerEntrySerializer.Meta.fields, "running_balance", "source")
        read_only_fields = fields

    def get_running_balance(self, entry: LedgerEntry) -> str | None:
        """`carried − timeline_delta + timeline_own` — see `with_running_balance`.

        `carried` is a property of the PAGE (it comes from the cursor), so the
        view computes it once and hands it in, as the statement's view does.
        """
        carried = self.context.get("carried")
        delta = getattr(entry, "timeline_delta", None)
        own = getattr(entry, "timeline_own", None)
        if carried is None or delta is None or own is None:
            return None
        return str(carried - delta + own)

    def get_source(self, entry: LedgerEntry) -> dict | None:
        return entry_source(entry, self.context.get("sources"))


class LedgerEntryWriteSerializer(serializers.Serializer):
    """The shape a POST may take — an explicit allowlist, not a ModelSerializer.

    A `ModelSerializer` on this model would expose `entry_type`, `source_type`,
    `status`, `reverses` and `supersedes` to the wire, and every one of those is
    the server's to decide. A client that could send `entry_type=reversal` could
    write a reversal with no reversal behind it; one that could send
    `status=reversed` could hide a line from the balance without a correction.
    So the allowlist is six fields, and the service derives the rest.

    Almost nothing here validates. `direction`, `amount` and `entry_date` are
    declared loosely on purpose: the rules are in `services/entries._validate`,
    because they have to hold for the CSV import and the opening-balance path
    too, and a rule that lives in a serializer holds only for HTTP. What this
    class does is bound the SHAPE — the types, the lengths and the field set —
    so the service is never handed a megabyte of nested JSON to reason about.
    """

    party_id = serializers.UUIDField()
    direction = serializers.ChoiceField(choices=Direction.choices)
    # CR-037 (17-02 CCR-1) — the ONE entry type a client may ask for, and the
    # choice list is the enforcement.
    #
    # Every other type is derived from the direction and the source, because a
    # client that could send `entry_type` freely could write `reversal` with no
    # reversal behind it, or `invoice` against no invoice, and the reporting
    # that groups by type would be answering a question about rows nobody can
    # trace. An opening is the exception because it is the one entry with no
    # source at all: it is a statement about what was true before the book
    # started, and only the person typing it knows that.
    entry_type = serializers.ChoiceField(
        choices=[(EntryType.OPENING, EntryType.OPENING.label)],
        required=False,
        allow_null=True,
        default=None,
    )
    # `CharField`, not `DecimalField`: canon rule 3 makes money a string on the
    # wire, and DRF's DecimalField would parse "500.005" into a Decimal and then
    # quantise it — rounding an amount the merchant typed before the service
    # ever sees it, which EC-4 says must be refused rather than rounded.
    amount = serializers.CharField(max_length=20)
    entry_date = serializers.DateField()
    note = serializers.CharField(
        max_length=NOTE_MAX_LENGTH, required=False, allow_blank=True, default=""
    )
    payment_mode = serializers.ChoiceField(
        choices=MONEY_PAYMENT_MODE_CHOICES, required=False, allow_null=True, default=None
    )
    # Which UPI app. Optional, and meaningful only with `payment_mode='upi'` —
    # the service drops it silently otherwise, so a client may leave the pick in
    # form state after switching the mode. The choice list bounds the SHAPE; an
    # unknown app is a 400 naming this field.
    upi_app = serializers.ChoiceField(
        choices=UpiApp.choices,
        required=False,
        allow_null=True,
        error_messages={"invalid_choice": "Choose a UPI app from the list."},
    )
    reference = serializers.CharField(
        max_length=REFERENCE_MAX_LENGTH, required=False, allow_blank=True, default=""
    )
    # FR-7 / AC-5. A flag rather than a separate endpoint, because it is the
    # same write with the same idempotency key: a merchant who taps "Save
    # anyway" is retrying the entry they just tried to make, and giving that a
    # route of its own would let the two double-post against each other.
    override = serializers.BooleanField(required=False, default=False)


class PartyScopedEntryWriteSerializer(LedgerEntryWriteSerializer):
    """The same body without `party_id`, for `POST /parties/{id}/ledger-entries`.

    The convenience route the FRD §14 specifies. Same service, same rules; the
    party comes from the URL, so accepting it in the body too would create a
    request that can disagree with itself.
    """

    party_id = None

    def get_fields(self) -> dict:
        fields = super().get_fields()
        fields.pop("party_id", None)
        return fields


class WrittenOffTotalsSerializer(serializers.Serializer):
    """`written_off {debit, credit}` — the write-off rows, by direction.

    CR-2026-09-24-A. `credit` is receivable forgiven ("you will not get it"),
    `debit` is payable forgiven ("you will not pay it"). Split rather than
    netted, because a party that is both customer and supplier can carry one of
    each, and a single signed figure would need a label the client cannot pick.
    """

    debit = MoneySerializerField(read_only=True)
    credit = MoneySerializerField(read_only=True)


class LedgerSummarySerializer(serializers.Serializer):
    """The khata figures the ledger can answer (PTY-03 §14).

    Money as strings, for the reason `PartyTotalsSerializer` is a serializer at
    all: handed a raw dict the renderer emits `0.0` and the precision is gone
    before the client sees it.

    `total_debit` / `total_credit` are "You gave in all" / "You got in all" and
    exclude write-offs, which are `written_off` (additive, CR-2026-09-24-A).
    """

    total_debit = MoneySerializerField(read_only=True)
    total_credit = MoneySerializerField(read_only=True)
    written_off = WrittenOffTotalsSerializer(read_only=True)
    entry_count = serializers.IntegerField(read_only=True)


class StatementTotalsSerializer(serializers.Serializer):
    """LED-04 §14 `totals` — `{debit, credit}` plus `written_off {debit, credit}`.

    No net figure, by CR-125: the client subtracts.
    """

    debit = MoneySerializerField(read_only=True)
    credit = MoneySerializerField(read_only=True)
    written_off = WrittenOffTotalsSerializer(read_only=True)


class EntryReverseSerializer(serializers.Serializer):
    """The body of `POST /ledger-entries/{id}/reverse` (LED-03 §10).

    One field, and the bound here is deliberately LOOSE — 2 KB, well past the
    160 the column holds. This layer bounds the SHAPE, as `amount =
    CharField(max_length=20)` does on the write serializer; `_validate_reason`
    in the service decides the VALUE.

    Splitting it that way is not tidiness. A DRF field error answers 400 and a
    `ValidationFailed` answers 422, so a serializer that enforced the real
    minimum would make "reason too short" a 400 while "amount has three decimal
    places" stayed a 422 — two status codes for two fields of one form, and a
    client that has to read both shapes to put a message under a field. The
    service is also reachable from a management command where no serializer
    runs at all, so the rule has to live there regardless.
    """

    reason = serializers.CharField(
        max_length=2000, trim_whitespace=True, allow_blank=True, required=False
    )


class EntryCorrectSerializer(EntryReverseSerializer):
    """The body of `POST /ledger-entries/{id}/correct` (LED-03 §10).

    Every editable field is OPTIONAL, and that is the contract FR-3 needs: the
    drawer opens on the original's values and a merchant changes one of them, so
    a body carrying only `{amount, reason}` means "everything else as it was".
    The service fills each omitted field from the original rather than nulling
    it — which is why `partial` semantics live there and not in a
    `ModelSerializer` update that would have to be given the instance.

    `payment_mode` is `allow_null` because a credit corrected into a debit has
    none at all; OMITTING it keeps the original's mode, so a correction of only
    the amount or only the UPI app of a "You got" is not refused for a mode the
    merchant never touched (FB-2). An explicit `null` on a credit is still
    refused, because a receipt must say how the money arrived.

    `upi_app` is `allow_null` for the same reason, and OMITTING it keeps the
    original's app too: a client that does not know the field must not erase
    it by not sending it.
    """

    direction = serializers.ChoiceField(choices=Direction.choices, required=False)
    amount = serializers.CharField(max_length=20, required=False)
    entry_date = serializers.DateField(required=False)
    note = serializers.CharField(max_length=NOTE_MAX_LENGTH, required=False, allow_blank=True)
    payment_mode = serializers.ChoiceField(
        choices=MONEY_PAYMENT_MODE_CHOICES, required=False, allow_null=True
    )
    upi_app = serializers.ChoiceField(
        choices=UpiApp.choices,
        required=False,
        allow_null=True,
        error_messages={"invalid_choice": "Choose a UPI app from the list."},
    )
    reference = serializers.CharField(
        max_length=REFERENCE_MAX_LENGTH, required=False, allow_blank=True
    )


class StatementRowSerializer(serializers.ModelSerializer):
    """One line of the statement (LED-04 §14).

    A different shape from `LedgerEntrySerializer` and deliberately so: a
    statement row carries `running_balance`, which no other row does, and drops
    `payment_mode`, `reference` and `created_by`, which a customer looking at a
    shared statement has no business reading. R6.1 keeps read and write
    serializers apart; this keeps two READ shapes apart for the same reason —
    one field added to the wrong one is a field on a screen somebody else sees.
    """

    amount = MoneySerializerField(read_only=True)
    running_balance = serializers.SerializerMethodField()
    source = serializers.SerializerMethodField()

    class Meta:
        model = LedgerEntry
        fields = (
            "id",
            "entry_date",
            "entry_type",
            "direction",
            "amount",
            "note",
            "status",
            "running_balance",
            "source",
            "reverses_id",
            "supersedes_id",
            "reason",
            # A2 — a row's bucket; the running balance is over `main` and `loan`.
            "bucket",
        )
        read_only_fields = fields

    def get_running_balance(self, entry: LedgerEntry) -> str:
        """The carried figure plus this row's own window delta.

        The addition happens HERE rather than in the selector because the
        carried figure is a property of the PAGE, not of the row — see
        `carried_forward`, which exists because Django computes a window after
        the keyset filter and a page-two row would otherwise restart from zero.
        """
        carried = self.context.get("carried") or Decimal("0.00")
        return str(carried + getattr(entry, "running_delta", Decimal("0.00")))

    def get_source(self, entry: LedgerEntry) -> dict | None:
        """FR-4's document link, which is `null` for every row in the product today.

        Every entry that exists is `source_type='manual'`, because
        `sales_document`, `purchases_document`, `payments_payment` and
        `expenses_expense` have no tables — their apps hold a models.py with a
        docstring in it. The KEY is here and the batch lookup §15 describes is a
        function with one branch, so the day a document posts a ledger line this
        is a resolver rather than a response-shape change that breaks a client.

        `null` rather than an empty object, for the reason `GET /parties/{id}`
        omits its unbuilt summary figures: a key that is always empty is a claim
        this code cannot verify, and the client cannot tell it from a real one.
        """
        return entry_source(entry, self.context.get("sources"))


class StatementDepositRowSerializer(serializers.ModelSerializer):
    """One line of the statement's "Deposit held" block (A2, PLT-X01 §6).

    The statement row's shape without `running_balance`: a deposit line is outside the
    running balance by definition (ADR-044), so a figure there would be a balance it did not
    move. The same customer-facing restraint as `StatementRowSerializer` — no mode, no
    reference, no author.
    """

    amount = MoneySerializerField(read_only=True)
    source = serializers.SerializerMethodField()

    class Meta:
        model = LedgerEntry
        fields = (
            "id",
            "entry_date",
            "entry_type",
            "direction",
            "amount",
            "note",
            "status",
            "source",
            "reverses_id",
            "supersedes_id",
            "reason",
            "bucket",
        )
        read_only_fields = fields

    def get_source(self, entry: LedgerEntry) -> dict | None:
        return entry_source(entry, self.context.get("sources"))


class StatementPartySerializer(serializers.Serializer):
    """BR-6 — who the statement is about, and nothing else about them.

    The mobile is MASKED here and not on the party detail, because this shape is
    the one FR-7's public page renders: a link a merchant sends on WhatsApp ends
    up in a group, and a full mobile number in it is a customer's number
    published by their shopkeeper. The masking is in the serializer rather than
    at the public boundary so that it cannot be forgotten when that boundary is
    built.
    """

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    mobile_masked = serializers.CharField(read_only=True, allow_null=True)


class StatementSerializer(serializers.Serializer):
    """The whole response body (§14), so the shape is declared in one place."""

    party = StatementPartySerializer(read_only=True)
    period = serializers.DictField(read_only=True)
    opening_balance = MoneySerializerField(read_only=True)
    closing_balance = MoneySerializerField(read_only=True)
    totals = serializers.DictField(read_only=True)
    has_entries_before_opening = serializers.BooleanField(read_only=True)
    rows = StatementRowSerializer(many=True, read_only=True)
