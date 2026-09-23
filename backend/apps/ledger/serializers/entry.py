"""Ledger entry wire shapes (Part 26 §26.6).

Read and write serializers are separate (R6.1); `fields` is always an explicit
tuple (R6.2); money travels as a string (R6.3).
"""

from __future__ import annotations

from rest_framework import serializers

from apps.common.constants import Direction, PaymentMode
from apps.common.serializers import MoneySerializerField
from apps.ledger.constants import (
    NOTE_MAX_LENGTH,
    REASON_MAX_LENGTH,
    REFERENCE_MAX_LENGTH,
    EntryType,
)
from apps.ledger.services.corrections import REASON_MIN_LENGTH
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
            "reference",
            "status",
            "reversed_by_id",
            "reverses_id",
            "supersedes_id",
            "reason",
            "created_by",
            "created_at",
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
        choices=PaymentMode.choices, required=False, allow_null=True, default=None
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


class LedgerSummarySerializer(serializers.Serializer):
    """The three khata figures the ledger can answer (PTY-03 §14).

    Money as strings, for the reason `PartyTotalsSerializer` is a serializer at
    all: handed a raw dict the renderer emits `0.0` and the precision is gone
    before the client sees it.
    """

    total_debit = MoneySerializerField(read_only=True)
    total_credit = MoneySerializerField(read_only=True)
    entry_count = serializers.IntegerField(read_only=True)


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

    `payment_mode` is `allow_null` because clearing it is a real correction: a
    "You got" recorded as UPI that was actually cash gets a new mode, and a
    credit corrected into a debit has none at all.
    """

    direction = serializers.ChoiceField(choices=Direction.choices, required=False)
    amount = serializers.CharField(max_length=20, required=False)
    entry_date = serializers.DateField(required=False)
    note = serializers.CharField(
        max_length=NOTE_MAX_LENGTH, required=False, allow_blank=True
    )
    payment_mode = serializers.ChoiceField(
        choices=PaymentMode.choices, required=False, allow_null=True
    )
    reference = serializers.CharField(
        max_length=REFERENCE_MAX_LENGTH, required=False, allow_blank=True
    )
