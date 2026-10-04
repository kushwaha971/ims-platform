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
from apps.library.models.holds import LibraryHold
from apps.library.models.loans import LibraryLoan, LibraryLoanEvent
from apps.library.models.members import (
    LibraryLoanRule,
    LibraryMembership,
    LibraryMembershipPeriod,
    LibraryMembershipType,
)
from apps.library.models.seats import LibrarySeat, LibraryShift
from apps.library.models.settings import LibrarySettings
from apps.library.models.verification import LibraryVerification, LibraryVerificationScan

__all__ = [
    "LibraryCategory",
    "LibraryCharge",
    "LibraryCopy",
    "LibraryCopyEvent",
    "LibraryHold",
    "LibraryLoan",
    "LibraryLoanEvent",
    "LibraryLoanRule",
    "LibraryLocation",
    "LibraryMembership",
    "LibraryMembershipPeriod",
    "LibraryMembershipType",
    "LibrarySeat",
    "LibrarySettings",
    "LibraryShift",
    "LibraryTitle",
    "LibraryVerification",
    "LibraryVerificationScan",
    "LibraryWaiver",
]
