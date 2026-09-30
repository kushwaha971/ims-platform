"""Relation wire shapes (A6, FRD 00 PLT-X04 §6).

`{id, kind, receives_messages, from_on, to_on, party: {…}, related_party: {…}}`,
each end as `{id, name, mobile_masked, status}` — enough to draw the row and
link to the other khata, and no more: a relation list is not where a contact's
full number is read.
"""

from __future__ import annotations

from rest_framework import serializers

from apps.parties.constants import RelationKind
from apps.parties.models import Party, PartyRelation

#: Digits kept at the end of a masked mobile — the part a merchant recognises.
MASK_KEEP = 4


def mask_party_mobile(mobile: str | None) -> str | None:
    """`9876543210` → `XXXXXX3210`; `None` stays `None`."""
    if not mobile:
        return None
    digits = "".join(character for character in mobile if character.isdigit())
    if len(digits) <= MASK_KEEP:
        return "X" * len(digits)
    return "X" * (len(digits) - MASK_KEEP) + digits[-MASK_KEEP:]


class RelationPartySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    mobile_masked = serializers.SerializerMethodField()
    status = serializers.CharField(read_only=True)

    def get_mobile_masked(self, party: Party) -> str | None:
        return mask_party_mobile(party.mobile)


class PartyRelationSerializer(serializers.ModelSerializer):
    party = RelationPartySerializer(read_only=True)
    related_party = RelationPartySerializer(read_only=True)
    active = serializers.SerializerMethodField()

    class Meta:
        model = PartyRelation
        fields = (
            "id",
            "kind",
            "receives_messages",
            "from_on",
            "to_on",
            "active",
            "party",
            "related_party",
        )
        read_only_fields = fields

    def get_active(self, relation: PartyRelation) -> bool:
        """Computed on the server against the TENANT's today, so the client never
        decides whether "ended today" is over."""
        today = self.context.get("today")
        return relation.to_on is None or (today is not None and relation.to_on > today)


class PartyRelationCreateSerializer(serializers.Serializer):
    """`{related_party_id, kind, receives_messages?, from_on?}` (§6)."""

    related_party_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=RelationKind.choices)
    receives_messages = serializers.BooleanField(required=False, default=False)
    from_on = serializers.DateField(required=False, allow_null=True)
