"""Indian mobile-number normalisation (PLT-01 FR-1, §10, T-PLT-01-2).

One spelling reaches the database: E.164, `+91XXXXXXXXXX` (Part 21 §21.3.1).
Everything the UI or an importer may produce — `9876543210`, `91 98765 43210`,
`+91-98765-43210` — normalises to it, and everything that cannot is a
`validation_error` on the `mobile` field rather than a row nobody can log in as.

`09876543210` is rejected deliberately: the leading zero is the STD prefix for a
*landline* trunk call, and accepting it would silently create a second user for
the same person (T-PLT-01-2).
"""

from __future__ import annotations

import re

E164_IN = re.compile(r"^\+91[6-9]\d{9}$")
_NON_DIGITS = re.compile(r"[^\d+]")


class InvalidMobile(ValueError):
    """Raised by `normalise_mobile`; serializers turn it into `validation_error`."""


def normalise_mobile(raw: str | None) -> str:
    """`'98765 43210'` → `'+919876543210'`. Raises `InvalidMobile` otherwise."""
    if not raw or not isinstance(raw, str):
        raise InvalidMobile("Enter a valid 10-digit mobile number")

    cleaned = _NON_DIGITS.sub("", raw.strip())
    if cleaned.startswith("+91"):
        candidate = cleaned
    elif cleaned.startswith("91") and len(cleaned) == 12:
        candidate = f"+{cleaned}"
    elif len(cleaned) == 10:
        candidate = f"+91{cleaned}"
    else:
        raise InvalidMobile("Enter a valid 10-digit mobile number")

    if not E164_IN.match(candidate):
        raise InvalidMobile("Enter a valid 10-digit mobile number")
    return candidate


def is_valid_mobile(raw: str | None) -> bool:
    try:
        normalise_mobile(raw)
    except InvalidMobile:
        return False
    return True


def mask_mobile(mobile: str) -> str:
    """`+919876543210` → `+91XXXXX43210`. For hints and logs (Part 26 R9.3)."""
    return f"{mobile[:3]}XXXXX{mobile[-5:]}" if len(mobile) >= 8 else "XXXXX"
