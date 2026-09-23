"""Ledger routes (canon §0.8)."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.ledger.views.aging import LedgerAgingView, LedgerSummaryView
from apps.ledger.views.entry import LedgerEntryViewSet, PartyLedgerEntryViewSet
from apps.ledger.views.statement import PartyStatementView

router = DefaultRouter(trailing_slash=False)
router.register("ledger-entries", LedgerEntryViewSet, basename="ledger-entry")

# The party-scoped route is written by hand rather than with a nested router.
# `drf-nested-routers` is not on the ADR-021 allow-list, and two `path()` lines
# are less machinery than a dependency for the one nesting in the product.
party_entries = PartyLedgerEntryViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("parties/<uuid:party_pk>/ledger-entries", party_entries, name="party-ledger-entry"),
    # LED-04. A read with its own response shape, so an `APIView` rather than an
    # action on the entry viewset: `/ledger-entries` returns entries and this
    # returns a statement, and the two would share a serializer only by accident.
    path(
        "parties/<uuid:party_pk>/statement",
        PartyStatementView.as_view(),
        name="party-statement",
    ),
    # LED-09. Two reads about the book as a whole rather than about one party,
    # which is why they hang off `/ledger` and not off `/parties/{id}`.
    path("ledger/summary", LedgerSummaryView.as_view(), name="ledger-summary"),
    path("ledger/aging", LedgerAgingView.as_view(), name="ledger-aging"),
    *router.urls,
]
