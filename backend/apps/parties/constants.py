"""Enumerations owned by the parties app (Part 26 §26.16 R16.1)."""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class PartyStatus(models.TextChoices):
    """Canon §0.7 Party."""

    ACTIVE = "active", _("Active")
    ARCHIVED = "archived", _("Archived")


class GstRegistration(models.TextChoices):
    """Part 21 §21.3.3 `parties_party.gst_registration`."""

    UNREGISTERED = "unregistered", _("Unregistered")
    REGULAR = "regular", _("Regular")
    COMPOSITION = "composition", _("Composition")
    OVERSEAS = "overseas", _("Overseas")


class ConsentSource(models.TextChoices):
    """DPDP consent provenance (Part 21 §21.3.3)."""

    VERBAL = "verbal", _("Verbal")
    FORM = "form", _("Form")
    LINK = "link", _("Link")


class OpeningDirection(models.TextChoices):
    """Which way the balance a merchant is carrying over from paper points.

    A direction rather than a signed amount, for the reason canon §0.3 gives
    about money generally: a minus sign in front of a figure is a thing a
    merchant has to decode, and "they owe me ₹2,300" is a thing they already
    know. The sign is the database's problem, not the shopkeeper's.
    """

    DEBIT = "debit", _("They owe me")
    CREDIT = "credit", _("I owe them")


#: Where a single-party archive came from, as `party.archived`'s audit row
#: records it (FRD 17-01 §16: `via: 'detail'|'list'|'bulk'|'form'`).
#:
#: A CLOSED set, because the client sends it and an auditor reads it as fact:
#: taken verbatim, `request.data["via"]` let any caller write any string of any
#: length into the audit log (security review F-6). `bulk` is deliberately not
#: here — `/parties/bulk-archive` sets it itself, and a single archive claiming
#: to be one would be a false statement about its origin. Anything else,
#: including nothing at all, is recorded as `api`.
ARCHIVE_VIA_DEFAULT = "api"
ARCHIVE_VIA_VALUES = frozenset({"detail", "list", "form", ARCHIVE_VIA_DEFAULT})


def archive_via(raw: object) -> str:
    """`raw` if it is one of `ARCHIVE_VIA_VALUES`, otherwise `"api"`."""
    return raw if isinstance(raw, str) and raw in ARCHIVE_VIA_VALUES else ARCHIVE_VIA_DEFAULT


# ── A6 ── PLT-X04: party relations (ADR-046) ──────────────────────────────────


class RelationKind(models.TextChoices):
    """`parties_relation.kind` — who the related party is to the person.

    A closed pair at Wave A (FRD 00 PLT-X04 §3): a guardian ("Rahul's father")
    and a payer ("the company pays for Sita's membership"). An emergency contact
    is Phase 2 and gets its own value, never a free-text kind.
    """

    GUARDIAN = "guardian", _("Guardian")
    PAYER = "payer", _("Pays for")
