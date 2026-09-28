"""Shared serializer primitives (Part 20 §20.4.5, Part 26 §26.6)."""

from __future__ import annotations

from decimal import InvalidOperation
from typing import Any

from rest_framework import serializers

from apps.common.money import D


class TenantPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """`PrimaryKeyRelatedField` whose queryset is scoped to the request tenant.

    Prevents cross-tenant IDOR: an id belonging to another tenant behaves exactly
    like a non-existent id ("Invalid pk"), never leaking existence
    (canon §0.11 rule 2).
    """

    def __init__(self, *args: Any, tenant_field: str = "tenant", **kwargs: Any) -> None:
        self.tenant_field = tenant_field
        super().__init__(*args, **kwargs)

    def get_queryset(self) -> Any:
        qs = super().get_queryset()
        if qs is None:
            return qs
        tenant = self.context.get("tenant")
        if tenant is None:
            return qs.none()
        return qs.filter(**{self.tenant_field: tenant})


class MoneySerializerField(serializers.DecimalField):
    """Money on the wire is a string with exactly 2 decimals (Part 22 §22.1)."""

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 2)
        kwargs.setdefault("coerce_to_string", True)
        kwargs.setdefault("localize", False)
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> Any:
        if isinstance(data, float):
            raise serializers.ValidationError("Send this amount as a string, not a number.")
        if isinstance(data, (str, int)):
            try:
                data = D(data)
            except InvalidOperation as exc:
                # `D()` is `Decimal(str(value))` with no guard, so anything that
                # is not a decimal literal raised `InvalidOperation` and escaped
                # as a 500. The input that matters is not the fuzzer's: it is
                # "1,000" — what a merchant gets from a phone keyboard, or from
                # copying a figure off a printed bill. A reference number and
                # "something went wrong" is the wrong answer to a comma.
                raise serializers.ValidationError("Enter an amount, like 1500.00.") from exc
        return super().to_internal_value(data)


class QuantitySerializerField(serializers.DecimalField):
    """Quantities are strings with up to 3 decimals."""

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 3)
        kwargs.setdefault("coerce_to_string", True)
        kwargs.setdefault("localize", False)
        super().__init__(**kwargs)


class UnitCostSerializerField(serializers.DecimalField):
    """Unit costs are strings with up to 4 decimals."""

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 4)
        kwargs.setdefault("coerce_to_string", True)
        kwargs.setdefault("localize", False)
        super().__init__(**kwargs)
