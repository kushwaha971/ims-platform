"""List-row shapes (SAL-08, SAL-01 FR-10, SAL-04 §14) — no lines, masked mobiles."""

from __future__ import annotations

from rest_framework import serializers

from apps.sales.models import SalesDocument
from apps.sales.serializers.common import mask_mobile, person


class InvoiceListSerializer(serializers.ModelSerializer):
    party = serializers.SerializerMethodField()
    walk_in_mobile_masked = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()  # ── A5 ── PLT-X05 §6

    class Meta:
        model = SalesDocument
        fields = (
            "id",
            "kind",
            "number",
            "status",
            "party",
            "walk_in_name",
            "walk_in_mobile_masked",
            "document_date",
            "due_on",
            "valid_until",
            "grand_total",
            "amount_paid",
            "amount_due",
            "is_overdue",
            "void_reason",
            "against_id",
            "converted_to_id",
            "created_by",
            "origin",
        )

    def get_party(self, obj: SalesDocument) -> dict | None:
        if obj.party_id is None:
            return None
        name = (obj.party_snapshot or {}).get("name") or (obj.party.name if obj.party else "")
        return {"id": str(obj.party_id), "name": name}

    def get_walk_in_mobile_masked(self, obj: SalesDocument) -> str | None:
        return mask_mobile(obj.walk_in_mobile)

    def get_is_overdue(self, obj: SalesDocument) -> bool:
        """BR-2 — same-day accuracy for the badge; the TAB uses the stored status."""
        today = self.context.get("today")
        if obj.status == "overdue":
            return True
        return bool(
            today
            and obj.due_on
            and obj.due_on < today
            and obj.status in ("issued", "partially_paid")
        )

    def get_created_by(self, obj: SalesDocument) -> dict | None:
        return person(obj.created_by)

    def get_origin(self, obj: SalesDocument) -> dict | None:
        """Labelled from the page's one call per origin type (`views.common.tabbed_list`)."""
        from apps.sales.services.origins import origin_view

        return origin_view(obj, self.context.get("origin_labels"))
