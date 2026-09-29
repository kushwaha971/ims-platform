"""Test-only routes for `test_scoping.py` (A13). Never included by `config.urls`."""

from __future__ import annotations

from typing import Any, ClassVar

from django.db.models import Q
from django.urls import include, path
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.routers import SimpleRouter

from apps.common.permissions import HasPermission
from apps.common.scoping import ScopedViewSetMixin
from apps.common.serializers import RestrictedFieldsMixin
from apps.common.viewsets import TenantScopedReadOnlyViewSet
from apps.parties.models import Party


class ScopedPartySerializer(RestrictedFieldsMixin, serializers.ModelSerializer):
    """`mobile` stands in for a restricted field (a trainer's "no phone numbers")."""

    restricted_fields: ClassVar[dict[str, str]] = {"mobile": "parties.party.export"}

    class Meta:
        model = Party
        fields = ("id", "name", "mobile")


class ScopedPartyViewSet(ScopedViewSetMixin, TenantScopedReadOnlyViewSet):
    """Rows whose name starts "Route A" are this member's scope; the stand-in
    `read_all` codename is `parties.party.export`, which owner and accountant
    hold and staff does not."""

    queryset = Party.objects.all()
    serializer_class = ScopedPartySerializer
    permission_classes: ClassVar[list[Any]] = [
        IsAuthenticated,
        HasPermission({"list": "parties.party.read", "retrieve": "parties.party.read"}),
    ]
    scope_all_permission = "parties.party.export"

    def scope_filter(self, request: Any) -> Q:
        return Q(name__startswith="Route A")


class UnscopedPartyViewSet(ScopedViewSetMixin, TenantScopedReadOnlyViewSet):
    """Uses the mixin and forgets `scope_filter` — must fail closed (BR-1)."""

    queryset = Party.objects.all()
    serializer_class = ScopedPartySerializer
    permission_classes: ClassVar[list[Any]] = [
        IsAuthenticated,
        HasPermission({"list": "parties.party.read", "retrieve": "parties.party.read"}),
    ]
    scope_all_permission = "parties.party.export"


router = SimpleRouter(trailing_slash=False)
router.register("scoped", ScopedPartyViewSet, basename="scoped")
router.register("unscoped", UnscopedPartyViewSet, basename="unscoped")

urlpatterns = [path("", include(router.urls))]
