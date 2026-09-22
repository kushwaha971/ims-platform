"""`/parties` — the party master (PTY-01 create/edit, PTY-02 list).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, delegate to
one selector or one service, wrap the result in the envelope. There is no
business `if` in this file, and the three that look like exceptions are not:
`get_queryset` picks a selector, `get_serializer_class` picks a wire shape, and
`create` passes `meta.warnings` through. Everything that decides anything is in
`parties/services/crud.py`.
"""

from __future__ import annotations

from typing import Any

from rest_framework.permissions import IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopedNoDeleteViewSet
from apps.parties.filters import PartyFilterSet
from apps.parties.models import Party
from apps.parties.permissions import PartyPermissions
from apps.parties.selectors.party import list_parties, party_detail_queryset
from apps.parties.serializers.party import (
    PartyDetailSerializer,
    PartyListSerializer,
    PartyUpdateSerializer,
    PartyWriteSerializer,
)
from apps.parties.services.crud import create_party, update_party


class PartyViewSet(TenantScopedNoDeleteViewSet):
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
    # Nothing throttled this endpoint before. The duplicate-mobile response
    # answers a question about another record — even reduced to an id, a
    # sufficiently patient caller could walk a number range with it — and a
    # write endpoint with no ceiling is a write endpoint that can fill a
    # tenant's book. 60/min is far above a shopkeeper copying a paper ledger.
    throttle_classes = [ScopedUserRateThrottle]
    throttle_scope = "party_write"

    # The base is `TenantScopedNoDeleteViewSet` rather than the full
    # `ModelViewSet` for exactly one reason: a party is archived, never
    # deleted. PTY-04 adds archive and restore as state changes with audit
    # rows; DELETE is not a verb this route has.

    def get_serializer_class(self) -> Any:
        """Read and write shapes are different classes (R6.1).

        `PartyWriteSerializer` is an explicit allowlist, so a column added to
        the model later is not writable from a browser by accident; the update
        form additionally drops the opening balance, which is create-only.
        """
        if self.action == "create":
            return PartyWriteSerializer
        if self.action in ("update", "partial_update"):
            return PartyUpdateSerializer
        if self.action == "retrieve":
            return PartyDetailSerializer
        return PartyListSerializer

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

    def _ctx(self, request: Any) -> Ctx:
        return Ctx(
            tenant=self.get_tenant(),
            actor=request.user,
            actor_type="user",
            request_id=getattr(request, "request_id", "") or "",
            ip=getattr(request, "client_ip", None),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        )

    @idempotent("party_create")
    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """201 with the party, and `meta.warnings` when there is something to say.

        A party create is replay-sensitive in the way canon rule 5 is about: a
        merchant on a 2G connection taps Save, the response is lost, they tap
        again, and without a key the book now has two Ramesh Traders. A party
        with no mobile has no uniqueness backstop at all, so the key is the
        only thing standing between a dropped response and a duplicate.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        party, warnings = create_party(ctx=self._ctx(request), payload=serializer.validated_data)
        return StandardResponse.created(
            PartyDetailSerializer(party).data,
            meta={"warnings": warnings} if warnings else None,
        )

    def update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """PATCH and PUT both land here; `partial` decides which.

        `get_object()` reads the tenant-scoped queryset, so another tenant's id
        is a 404 before any of this runs — canon §0.11 rule 2, and the reason
        the check is structural rather than a line of code somebody could
        forget to write.
        """
        party = self.get_object()
        serializer = self.get_serializer(data=request.data, partial=kwargs.pop("partial", True))
        serializer.is_valid(raise_exception=True)
        party, warnings = update_party(
            ctx=self._ctx(request), party=party, payload=serializer.validated_data
        )
        return StandardResponse.ok(
            PartyDetailSerializer(party).data,
            meta={"warnings": warnings} if warnings else None,
        )

    def partial_update(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        return self.update(request, *args, partial=True, **kwargs)
