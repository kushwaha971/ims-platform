"""Party routes (canon §0.8)."""

from __future__ import annotations

from rest_framework.routers import DefaultRouter

from apps.parties.views.party import PartyViewSet
from apps.parties.views.tag import TagViewSet

router = DefaultRouter(trailing_slash=False)
# `parties/tags` BEFORE `parties`, and the order is load-bearing: the router
# turns the party route into `parties/<pk>`, and DRF matches in registration
# order — so with `parties` first, a GET of `/parties/tags` would be read as a
# retrieve of a party whose id is the string "tags" and answer 404.
router.register("parties/tags", TagViewSet, basename="party-tag")
router.register("parties", PartyViewSet, basename="party")

urlpatterns = [*router.urls]
