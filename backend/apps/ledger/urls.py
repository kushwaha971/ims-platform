"""Ledger routes (canon §0.8)."""

from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.ledger.views.entry import LedgerEntryViewSet, PartyLedgerEntryViewSet

router = DefaultRouter(trailing_slash=False)
router.register("ledger-entries", LedgerEntryViewSet, basename="ledger-entry")

# The party-scoped route is written by hand rather than with a nested router.
# `drf-nested-routers` is not on the ADR-021 allow-list, and two `path()` lines
# are less machinery than a dependency for the one nesting in the product.
party_entries = PartyLedgerEntryViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("parties/<uuid:party_pk>/ledger-entries", party_entries, name="party-ledger-entry"),
    *router.urls,
]
