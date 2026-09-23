"""Tag wire shapes (Part 26 §26.6)."""

from __future__ import annotations

from rest_framework import serializers

from apps.parties.models import Tag
from apps.parties.services.tags import MAX_BULK_PARTIES, MAX_TAGS_PER_PARTY, TAG_PALETTE


class TagSerializer(serializers.ModelSerializer):
    """A tag as the picker, the chips and the manager all read it.

    `party_count` is annotated by the selector and is absent on the write
    paths' responses, where there is nothing to count yet — `required=False`
    rather than `default=0`, because a tag that was just created has an unknown
    count rather than a count of zero, and the manager refetches.
    """

    party_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Tag
        fields = ("id", "name", "color", "party_count")
        read_only_fields = fields


class TagWriteSerializer(serializers.Serializer):
    """Create and update.

    Deliberately NOT a `ModelSerializer`: the name has rules a CharField cannot
    express (NFKC, collapsed whitespace, no commas or semicolons) and they live
    in the service, where a CSV import and a management command reach them too.
    This class says what the wire may carry; `services.tags` says what it means.
    """

    name = serializers.CharField(required=False, max_length=64, allow_blank=False)
    color = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=7)


class TagMergeSerializer(serializers.Serializer):
    into_tag_id = serializers.UUIDField()


class BulkTagSerializer(serializers.Serializer):
    """`POST /parties/bulk-tag`.

    `tag_names` rather than ids, because the dialog's combobox creates inline:
    a merchant who types "Route 2" and presses Add should not need a round trip
    to turn it into an id before the bulk call can run. The service's
    `get_or_create` makes names and ids the same thing.
    """

    party_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=MAX_BULK_PARTIES
    )
    tag_names = serializers.ListField(
        child=serializers.CharField(max_length=64), allow_empty=False, max_length=5
    )
    mode = serializers.ChoiceField(choices=("add", "replace", "remove"))


class BulkTagResultSerializer(serializers.Serializer):
    """What the bulk call did, in enough detail to undo it exactly.

    `updated_count` is parties CHANGED, not parties matched. `changed` is the
    pairs actually written or deleted, which is what makes the inverse exact for
    `add` and `remove` — see the service. `previous` is the prior sets, needed
    only for `replace`.
    """

    updated_count = serializers.IntegerField(read_only=True)
    previous = serializers.ListField(child=serializers.DictField(), read_only=True)
    changed = serializers.ListField(child=serializers.DictField(), read_only=True)
    skipped = serializers.ListField(child=serializers.DictField(), read_only=True)


#: Re-exported so the party serializers can state the same ceiling without
#: importing the service into a module that should only know about shapes.
PARTY_TAG_LIMIT = MAX_TAGS_PER_PARTY
PALETTE = TAG_PALETTE
