"""Expense wire shapes (Part 26 §26.6).

Read and write serializers are separate (R6.1); `fields` is an explicit tuple
(R6.2); money travels as a string (R6.3).
"""

from __future__ import annotations

from rest_framework import serializers

from apps.common.serializers import MoneySerializerField
from apps.expenses.constants import NOTE_MAX_LENGTH, REFERENCE_MAX_LENGTH
from apps.expenses.models import Expense, ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """EXP-02 §14's row, minus `icon` (not in this wave) and `usage`."""

    class Meta:
        model = ExpenseCategory
        fields = ("id", "name", "system_code", "color", "is_system", "status", "sort_order")
        read_only_fields = fields


class ExpenseCategoryWriteSerializer(serializers.Serializer):
    """Inline create takes a name and nothing else (EXP-02 FR-4).

    Loose on purpose: the 1–40 rule and the normalisation are the service's,
    so they hold for every caller; this only bounds the shape.
    """

    name = serializers.CharField(max_length=200, allow_blank=True, trim_whitespace=False)


def _person(user: object) -> dict | None:
    if user is None:
        return None
    return {"id": str(user.id), "name": getattr(user, "full_name", "") or ""}  # type: ignore[attr-defined]


class ExpenseSerializer(serializers.ModelSerializer):
    """One expense — a list row, the body of a 201, and the detail.

    The category travels as an object rather than an id because the row renders
    its name and colour, and an archived category (EXP-02 EC-5) must still say
    what it was; the party likewise, so the list needs no second lookup.
    """

    amount = MoneySerializerField(read_only=True)
    category = serializers.SerializerMethodField()
    party = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    voided_by = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = (
            "id",
            "number",
            "expense_date",
            "amount",
            "category",
            "party",
            "mode",
            "upi_app",
            "reference",
            "note",
            "paid",
            "due_on",
            "status",
            "void_reason",
            "voided_at",
            "voided_by",
            "created_by",
            "created_at",
        )
        read_only_fields = fields

    def get_category(self, expense: Expense) -> dict:
        category = expense.category
        return {
            "id": str(category.id),
            "name": category.name,
            "color": category.color,
            "status": category.status,
        }

    def get_party(self, expense: Expense) -> dict | None:
        if expense.party_id is None:
            return None
        return {"id": str(expense.party_id), "name": expense.party.name}

    def get_created_by(self, expense: Expense) -> dict | None:
        return _person(expense.created_by)

    def get_voided_by(self, expense: Expense) -> dict | None:
        return _person(expense.voided_by)


class ExpenseWriteSerializer(serializers.Serializer):
    """The POST body — an explicit allowlist (R6.1).

    `amount` is a `CharField` for the ledger's reason: DRF's `DecimalField`
    would quantise "500.005" before the service could refuse it. `mode` and
    `upi_app` are plain strings because the service owns which of them apply
    (an unpaid expense drops both); the ids are UUIDs so a malformed one is a
    400 naming the field rather than a lookup that raises.
    """

    amount = serializers.CharField(max_length=20, required=False, allow_blank=True)
    expense_date = serializers.CharField(max_length=10, required=False, allow_blank=True)
    category_id = serializers.UUIDField(required=False, allow_null=True)
    mode = serializers.CharField(max_length=16, required=False, allow_blank=True, allow_null=True)
    upi_app = serializers.CharField(
        max_length=16, required=False, allow_blank=True, allow_null=True
    )
    reference = serializers.CharField(
        max_length=REFERENCE_MAX_LENGTH * 2, required=False, allow_blank=True, default=""
    )
    note = serializers.CharField(
        max_length=NOTE_MAX_LENGTH * 2, required=False, allow_blank=True, default=""
    )
    paid = serializers.BooleanField(required=False, default=True)
    due_on = serializers.CharField(max_length=10, required=False, allow_blank=True, allow_null=True)
    party_id = serializers.UUIDField(required=False, allow_null=True)


class ExpenseVoidSerializer(serializers.Serializer):
    """`{reason}` — optional at the wire; the service owns the 3–160 rule."""

    reason = serializers.CharField(max_length=400, required=False, allow_blank=True)


class ExpenseTotalsSerializer(serializers.Serializer):
    amount = MoneySerializerField(read_only=True)
    count = serializers.IntegerField(read_only=True)
    by_category = serializers.SerializerMethodField()

    def get_by_category(self, totals: dict) -> list[dict]:
        return [
            {
                "category_id": str(row["category_id"]),
                "name": row["name"],
                "color": row["color"],
                "amount": str(row["amount"]),
            }
            for row in totals["by_category"]
        ]
