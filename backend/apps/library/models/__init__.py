"""The library's tables. Each task adds its module here (B03 settings, B05 catalogue, …)."""

from __future__ import annotations

from apps.library.models.catalogue import (
    LibraryCategory,
    LibraryCopy,
    LibraryCopyEvent,
    LibraryLocation,
    LibraryTitle,
)
from apps.library.models.charges import LibraryCharge, LibraryWaiver
from apps.library.models.members import (
    LibraryLoanRule,
    LibraryMembership,
    LibraryMembershipPeriod,
    LibraryMembershipType,
)
from apps.library.models.settings import LibrarySettings

__all__ = [
    "LibraryCategory",
    "LibraryCharge",
    "LibraryCopy",
    "LibraryCopyEvent",
    "LibraryLoanRule",
    "LibraryLocation",
    "LibraryMembership",
    "LibraryMembershipPeriod",
    "LibraryMembershipType",
    "LibrarySettings",
    "LibraryTitle",
    "LibraryWaiver",
]
