"""The walking skeleton's viewset (Part 32 §32.3.6 task S0-70).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, delegate to
one selector, wrap the result in the envelope. There is no create form, no
balance arithmetic, no totals and no business `if` — the slice exists to prove
the path, not a feature.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.viewsets import TenantScopedReadOnlyViewSet
from apps.parties.filters import PartyFilterSet
from apps.parties.models import Party
from apps.parties.permissions import PartyPermissions
from apps.parties.selectors.party import list_parties, party_detail_queryset
from apps.parties.serializers.party import PartyListSerializer


class PartyViewSet(TenantScopedReadOnlyViewSet):
    """`/parties` — list and retrieve.

    `get_queryset()` is scoped by `TenantScopeMixin`, so `retrieve` with another
    tenant's id raises `Http404` and the exception handler turns it into
    `not_found` — canon §0.11 rule 2, never `permission_denied`.
    """

    queryset = Party.objects.all()
    serializer_class = PartyListSerializer
    filterset_class = PartyFilterSet
    ordering_fields = ("name", "balance", "last_activity_at")
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.PARTIES),
        PartyPermissions,
    ]

    def get_queryset(self) -> Any:
        """The selector owns the query; the viewset owns nothing but the call.

        Two selectors rather than one because the list defers 21 of the model's
        30 columns and `retrieve` must not inherit that: `get_object()` reads
        this queryset, and a deferred column touched by a detail serializer is a
        second query per row (§20.14.2).
        """
        if self.action == "list":
            return list_parties(tenant=self.get_tenant())
        return party_detail_queryset(tenant=self.get_tenant())

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        return StandardResponse.paginated(self.paginator, serializer.data)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        party = self.get_object()
        return StandardResponse.ok(self.get_serializer(party).data)
