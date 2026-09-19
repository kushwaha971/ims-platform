"""Party routes (canon §0.8)."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.parties.views.party import PartyViewSet

router = DefaultRouter(trailing_slash=False)
router.register("parties", PartyViewSet, basename="party")

urlpatterns = [*router.urls]
