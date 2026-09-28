"""`MoneySerializerField` — what happens to a string that is not a number.

Money crosses the wire as a string (Part 22 §22.1), which means a client can
put ANY string there, and this field is the only thing between that string and
`Decimal`. It is shared by every amount in the product, so a hole here is a
hole in sales, purchases, payments and the ledger at the same time.
"""

from __future__ import annotations

from typing import Any

import pytest
from rest_framework import serializers

from apps.common.serializers import MoneySerializerField


class _AmountSerializer(serializers.Serializer):
    amount = MoneySerializerField()


@pytest.mark.parametrize(
    "value",
    [
        # The one a real person sends. A phone keyboard, or a merchant copying
        # a figure off a printed bill, produces thousands separators — and
        # `Decimal("1,000")` raises rather than parsing.
        "1,000",
        "1,000.00",
        # And the ones a fuzzer sends, which reach the same line.
        "abc",
        "",
        "--5",
        "1.2.3",
        "₹500",
    ],
)
def test_a_string_that_is_not_a_number_is_a_400_and_not_a_500(value: str) -> None:
    """`D()` is `Decimal(str(value))` with no guard, so `decimal.InvalidOperation`
    escaped as an unhandled exception and the caller got `server_error` with a
    reference number — for typing a comma.

    Caught by adversarial testing against a running server, not by the unit
    tests, because every test until now passed this field something that was
    already a number.
    """
    serializer = _AmountSerializer(data={"amount": value})
    assert not serializer.is_valid()
    assert "amount" in serializer.errors


@pytest.mark.parametrize(
    "value,expected",
    [("100", "100.00"), ("100.5", "100.50"), ("+100", "100.00"), ("0", "0.00")],
)
def test_the_shapes_that_are_a_number_still_pass(value: str, expected: str) -> None:
    serializer = _AmountSerializer(data={"amount": value})
    assert serializer.is_valid(), serializer.errors
    assert str(serializer.validated_data["amount"]) == expected


def test_a_json_number_is_still_refused(value: Any = 100.5) -> None:
    """Unchanged, and worth keeping: a float has already lost precision by the
    time it reaches this field, so the refusal has to happen at the wire."""
    serializer = _AmountSerializer(data={"amount": value})
    assert not serializer.is_valid()
