"""Model field classes and the UUID v7 generator (Part 20 §20.7.2, ADR-009).

`uuid7()` is implemented here from RFC 9562 §5.7 rather than taken from the
`uuid6` PyPI package: that package is not on the ADR-021 allow-list, and Part 32
§32.3.8 pre-decided this exact trade ("Implement `uuid7()` in
`apps/common/db/fields.py` in ~20 lines from RFC 9562; no dependency").
"""

from __future__ import annotations

import os
import time
import uuid

from django.db import models

# ── UUID v7 (RFC 9562 §5.7) ──────────────────────────────────────────────────
#
#  0                   1                   2                   3
#  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
# +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
# |                           unix_ts_ms                          |
# +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
# |          unix_ts_ms           |  ver  |        rand_a         |
# +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
# |var|                        rand_b                             |
# +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
# |                            rand_b                             |
# +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

_last_timestamp_ms = -1
_last_counter = 0


def uuid7() -> uuid.UUID:
    """A time-ordered UUID version 7.

    The 48-bit big-endian Unix timestamp in milliseconds occupies the high bits,
    so successive ids sort by creation time and inserts stay at the right edge of
    the B-tree instead of scattering the way uuid4 does (ADR-009).

    Within one millisecond a monotonic 12-bit counter seeded from randomness
    occupies `rand_a` (RFC 9562 §6.2 "Method 1 — fixed-length dedicated counter"),
    so ids minted in a tight loop remain strictly increasing.
    """
    global _last_timestamp_ms, _last_counter

    timestamp_ms = time.time_ns() // 1_000_000
    if timestamp_ms == _last_timestamp_ms:
        _last_counter += 1
        if _last_counter > 0x0FFF:  # counter rollover: wait for the next millisecond
            while timestamp_ms <= _last_timestamp_ms:
                timestamp_ms = time.time_ns() // 1_000_000
            _last_counter = int.from_bytes(os.urandom(2), "big") & 0x0FF
    else:
        _last_counter = int.from_bytes(os.urandom(2), "big") & 0x0FF
    _last_timestamp_ms = timestamp_ms

    rand_b = int.from_bytes(os.urandom(8), "big") & ((1 << 62) - 1)
    value = (
        (timestamp_ms & ((1 << 48) - 1)) << 80
        | 0x7 << 76
        | (_last_counter & 0x0FFF) << 64
        | 0b10 << 62
        | rand_b
    )
    return uuid.UUID(int=value)


def uuid7_pk() -> models.UUIDField:
    """Every primary key in the product (Part 20 §20.7.2)."""
    return models.UUIDField(primary_key=True, default=uuid7, editable=False)


# ── Numeric field classes (Part 20 §20.7.2) ──────────────────────────────────


class MoneyField(models.DecimalField):
    """numeric(14,2) — every amount a human sees or pays."""

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 2)
        super().__init__(**kwargs)


class QuantityField(models.DecimalField):
    """numeric(14,3) — item quantities, stock on hand, movement qty."""

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 3)
        super().__init__(**kwargs)


class UnitCostField(models.DecimalField):
    """numeric(14,4) — unit prices and weighted-average costs."""

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 4)
        super().__init__(**kwargs)


class RateField(models.DecimalField):
    """numeric(6,3) — tax and discount percentages (0.000 … 999.999)."""

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("max_digits", 6)
        kwargs.setdefault("decimal_places", 3)
        super().__init__(**kwargs)
