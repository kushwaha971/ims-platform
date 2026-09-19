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
