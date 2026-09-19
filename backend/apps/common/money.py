"""Decimal money helpers (Part 20 §20.7, ADR-010).

`ROUND_HALF_UP` everywhere, without exception: banker's rounding disagrees with
the GST convention Indian accountants and every competing product use
(Part 20 §20.7.3). The process-wide decimal context is never modified; rounding is
always explicit at the quantise call.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Sequence

TWO = Decimal("0.01")
THREE = Decimal("0.001")
FOUR = Decimal("0.0001")
ONE = Decimal("1")

ZERO = Decimal("0.00")


def D(value: object) -> Decimal:  # noqa: N802 — the canonical spelling in Part 20 §20.7.3
    """The only way a string/int becomes a Decimal. Never `Decimal(float)`."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):  # defence: this should be unreachable
        raise TypeError("float is not allowed in money arithmetic; pass a str or Decimal")
    return Decimal(str(value))


def half_up(value: object, exponent: Decimal) -> Decimal:
    """Quantise to `exponent` with ROUND_HALF_UP. The single rounding primitive."""
    return D(value).quantize(exponent, rounding=ROUND_HALF_UP)


def q2(value: object) -> Decimal:
    """Money — numeric(14,2)."""
    return half_up(value, TWO)


def q3(value: object) -> Decimal:
    """Quantity — numeric(14,3)."""
    return half_up(value, THREE)


def q4(value: object) -> Decimal:
    """Unit cost — numeric(14,4)."""
    return half_up(value, FOUR)


def to_rupee(value: object) -> Decimal:
    """Round to whole rupees for the round-off computation (SAL-02 BR-8)."""
    return half_up(value, ONE)


def allocate_proportional(total: object, weights: Sequence[object]) -> list[Decimal]:
    """Split `total` across `weights` at 2 dp, residual to the largest weight.

    Part 20 §20.7.3: a document-level discount shared over lines must sum back to
    the discount exactly. Rounding each share independently loses or gains paisa,
    so the shares are rounded and the residual is given to the line with the
    largest weight. Ties go to the last such line, matching the "absorbed by
    the last document in FIFO order" convention the same table uses for
    payment allocation, so the two residual rules do not disagree.
    """
    amount = q2(total)
    decimal_weights = [D(w) for w in weights]
    if not decimal_weights:
        return []
    weight_total = sum(decimal_weights, Decimal("0"))
    if weight_total == 0:
        shares = [ZERO for _ in decimal_weights]
        shares[0] = amount
        return shares

    shares = [q2(amount * w / weight_total) for w in decimal_weights]
    residual = amount - sum(shares, Decimal("0"))
    if residual != 0:
        largest = max(range(len(decimal_weights)), key=lambda i: (decimal_weights[i], i))
        shares[largest] = q2(shares[largest] + residual)
    return shares


def sum_money(values: Iterable[object]) -> Decimal:
    """Exact addition of 2-dp values — no rounding (Part 20 §20.7.3, aging rows)."""
    total = Decimal("0")
    for value in values:
        total += D(value)
    return q2(total)
