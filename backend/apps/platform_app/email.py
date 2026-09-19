"""Email-address normalisation — the login identifier (PLT-01 FR-1, DEC-010).

The counterpart of `mobile.py`. One spelling reaches the database: trimmed,
with the domain lower-cased, and the local part lower-cased too.

Lower-casing the local part is a deliberate choice rather than an oversight.
RFC 5321 §2.4 permits `Ramesh@example.com` and `ramesh@example.com` to be two
mailboxes, and in practice no mail provider a merchant uses treats them as two.
Keeping the case would mean a merchant who capitalises the first letter on a
phone keyboard cannot sign in to the account they created on a laptop, and it
would make the unique index case-sensitive, which would let the same person
hold two accounts. Both are worse than the theoretical loss.

Everything that cannot be normalised is a `validation_error` on the `email`
field rather than a row nobody can log in as.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email as django_validate_email

MAX_LENGTH = 254  # Part 21 §21.3.1 `platform_user.email varchar(254)`


class InvalidEmail(ValueError):
    """Raised by `normalise_email`; serializers turn it into `validation_error`."""


def normalise_email(raw: str | None) -> str:
    """`' Ramesh@Example.COM '` → `'ramesh@example.com'`. Raises `InvalidEmail`."""
    if not raw or not isinstance(raw, str):
        raise InvalidEmail("Enter your email address")

    candidate = raw.strip().lower()
    if len(candidate) > MAX_LENGTH:
        raise InvalidEmail("Enter a valid email address")
    try:
        django_validate_email(candidate)
    except DjangoValidationError as exc:
        raise InvalidEmail("Enter a valid email address") from exc
    return candidate


def is_valid_email(raw: str | None) -> bool:
    try:
        normalise_email(raw)
    except InvalidEmail:
        return False
    return True


def mask_email(email: str) -> str:
    """`ramesh@example.com` → `r****h@example.com`. For hints and logs (Part 26 R9.3).

    The domain stays legible because a merchant needs it to recognise which of
    their addresses a link went to; the local part is what identifies a person.
    """
    local, _, domain = (email or "").partition("@")
    if not domain:
        return "…"
    if len(local) <= 2:
        return f"{local[:1]}…@{domain}"
    return f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}@{domain}"
