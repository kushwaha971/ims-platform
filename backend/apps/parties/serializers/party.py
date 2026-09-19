"""Party wire shapes (Part 26 §26.6).

Read and write serializers are separate (R6.1); `fields` is always an explicit
tuple (R6.2); money travels as a string (R6.3).
"""

from __future__ import annotations

from rest_framework import serializers

from apps.common.serializers import MoneySerializerField
from apps.parties.models import Party


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
