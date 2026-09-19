"""GSTIN and GST state-code validation (PLT-03 §10, normative algorithm).

The checksum is reproduced from `PLT-03` §10 exactly, and the frontend's
`utils/gstin.ts` is the same algorithm:

    alphabet `0-9A-Z` → 0–35; for positions 1–14 multiply by a factor
    alternating 1, 2, 1, 2 …; for each product `p` add `p // 36 + p % 36`;
    `check = (36 − sum % 36) % 36`; compare to character 15.

This lives in `tax` because `PLT-03` §10 names `tax/validators.py`. The
`platform` app imports it inside the function that needs it: the Part 20 §20.1.4
matrix does not let `platform` import `tax` at module level.
"""

from __future__ import annotations

import re

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

# The 38 GST state codes (PLT-03 §7 "state list of 38 GST codes").
# `97` is Other Territory and is accepted; `99` is Centre jurisdiction and is
# refused for a *tenant*, which is always a taxpayer in a state (PLT-03 EC-4).
GST_STATE_CODES: frozenset[str] = frozenset(
    [f"{n:02d}" for n in range(1, 39)] + ["97"],
)


class InvalidGstin(ValueError):
    """Raised by `validate_gstin`; serializers turn it into `validation_error`."""


def gstin_checksum(gstin: str) -> str:
    """The 15th character implied by the first fourteen."""
    total = 0
    for index, char in enumerate(gstin[:14]):
        value = _ALPHABET.index(char)
        product = value * (1 if index % 2 == 0 else 2)
        total += product // 36 + product % 36
    return _ALPHABET[(36 - total % 36) % 36]


def is_valid_gstin(gstin: str | None) -> bool:
    if not gstin or not isinstance(gstin, str):
        return False
    value = gstin.strip().upper()
    if not GSTIN_RE.match(value):
        return False
    return gstin_checksum(value) == value[14]


def validate_gstin(gstin: str) -> str:
    """Return the normalised (upper-case, trimmed) GSTIN or raise."""
    value = (gstin or "").strip().upper()
    if not is_valid_gstin(value):
        raise InvalidGstin("Invalid GSTIN")
    return value


def pan_from_gstin(gstin: str) -> str:
    """Characters 3–12 of a GSTIN are the holder's PAN (PLT-03 FR-3)."""
    return gstin[2:12]


def state_from_gstin(gstin: str) -> str:
    """Characters 1–2 of a GSTIN are the GST state code (PLT-03 FR-3)."""
    return gstin[:2]


def is_valid_state_code(state_code: str | None) -> bool:
    return bool(state_code) and state_code in GST_STATE_CODES


def is_valid_pan(pan: str | None) -> bool:
    return bool(pan) and bool(PAN_RE.match(pan.strip().upper()))
