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
