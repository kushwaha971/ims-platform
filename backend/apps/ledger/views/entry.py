"""`/ledger-entries` — the khata's lines (LED-01).

Thin by construction (Part 26 §26.7 R7.1): authenticate, authorise, delegate to
one selector or one service, wrap the result in the envelope. Everything that
decides anything is in `ledger/services/entries.py`.
"""

from __future__ import annotations

from typing import Any

from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.pagination import CursorPagination, decode_cursor
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.ledger.constants import EntryType
from apps.ledger.models import LedgerEntry
from apps.ledger.permissions import LedgerEntryPermissions
from apps.ledger.selectors.entry import TIMELINE_ORDERING, party_entries, party_ledger_summary
from apps.ledger.selectors.sources import resolve_sources
from apps.ledger.selectors.statement import (
    live_total_from_summary,
    timeline_carried,
    with_running_balance,
)
from apps.ledger.serializers.entry import (
    EntryCorrectSerializer,
    EntryReverseSerializer,
    LedgerEntrySerializer,
    LedgerEntryWriteSerializer,
    LedgerSummarySerializer,
    PartyScopedEntryWriteSerializer,
    TimelineEntrySerializer,
)
from apps.ledger.services.corrections import correct_entry, entry_history, reverse_entry
from apps.ledger.services.entries import post_entry
from apps.ledger.services.opening import post_opening_balance


class LedgerEntryViewSet(
    TenantScopeMixin,
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Create, list and retrieve. **No update and no destroy, by construction.**

    Not `TenantScopedNoDeleteViewSet`, which still hands out PUT and PATCH.
    Canon §0.11 rule 1 makes a posted line immutable, so the route must not map
    the verbs at all: 405 is the honest answer, where a permission check would
    answer 403 and tell a caller to go and ask for a right that should never
    exist. LED-03's correction is a POST that writes new rows, not an edit.

    `list` requires a `party` — the ledger has no unscoped list, because the
    only question anybody asks of it is "what happened with this person", and a
    route that would page a tenant's entire history is a route somebody will
    eventually point at a tenant's entire history.
    """

    queryset = LedgerEntry.objects.all()
    serializer_class = LedgerEntrySerializer
    pagination_class = CursorPagination
    cursor_ordering = TIMELINE_ORDERING
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.LEDGER),
        LedgerEntryPermissions,
    ]
    # The most frequent write in the product, so the ceiling is generous — a
    # merchant copying a paper book in on a slow afternoon is the shape this has
    # to allow. What it stops is a loop.
    throttle_classes = [ScopedUserRateThrottle]
    throttle_scope = "ledger_write"

    def get_throttles(self) -> list[Any]:
        """Reads on the user budget; only writes spend `ledger_write`.

        The party list had the same defect and the 2,000-party performance pass
        found it there: one class-level scope applies to every verb, so reading
        a khata timeline — the screen a merchant opens more than any other —
        spent the WRITE ceiling. A merchant flipping between khatas at a
        counter, and every e2e harness, reads far faster than they write.
        """
        if self.request.method in SAFE_METHODS:
            return [ScopedUserRateThrottle("user")]
        return [ScopedUserRateThrottle("ledger_write")]

    def get_serializer_class(self) -> Any:
        if self.action == "create":
            return LedgerEntryWriteSerializer
        if self.action == "reverse":
            return EntryReverseSerializer
        if self.action == "correct":
            return EntryCorrectSerializer
        if self.action == "list":
            return TimelineEntrySerializer
        return LedgerEntrySerializer

    def _include_reversed(self) -> bool:
        """LED-03 BR-5 — `?include_reversed=true` and nothing else.

        Anything other than the literal string is FALSE, which is the safe
        default in both directions: a typo shows the merchant the clean timeline
        rather than the raw one, and nothing about the account is exposed by
        getting it wrong.
        """
        return self.request.query_params.get("include_reversed", "").lower() == "true"

    def get_queryset(self) -> Any:
        """Scoped to the tenant, and to the party the caller named.

        A missing or unparseable `party` yields the empty set rather than every
        entry in the tenant. Fail-closed in the same direction as the tenant
        scoping above it: the mistake that costs nothing is an empty list.
        """
        tenant = self.get_tenant()
        party_id = self.request.query_params.get("party")
        if not party_id:
            return LedgerEntry.objects.none()
        return with_running_balance(
            party_entries(
                tenant=tenant, party_id=party_id, include_reversed=self._include_reversed()
            )
        )

    def _ctx(self, request: Any) -> Ctx:
        return Ctx(
            tenant=self.get_tenant(),
            actor=request.user,
            actor_type="user",
            request_id=getattr(request, "request_id", "") or "",
            ip=getattr(request, "client_ip", None),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        )

    def list(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """The party's timeline, newest first, cursor-paged.

        No `count` from the paginator. §20.14.3 makes this a cursor precisely so
        that a party with three years of daily entries costs the same to open as
        one with three, and a `COUNT(*)` for `meta.total` would put the linear
        scan straight back in.

        `meta.summary` is a different thing and is on the FIRST page only: the
        three figures the khata header shows above the timeline — what has been
        given in all, what has come back, and how many lines there are. They are
        here rather than on `GET /parties/{id}` because `parties` may not import
        `ledger` (Part 20 §20.1.4), and here rather than on a third endpoint
        because the khata page already makes this request. On page two and after
        it is omitted: the figures do not change as the merchant scrolls, and
        re-aggregating a party's whole history on every page of a cursor would
        undo the reason the cursor exists.
        """
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        meta = dict(self.paginator.get_meta())
        party_id = self._party_id()
        cursor = request.query_params.get("cursor")
        # CR-027 — the page's carried figure for each row's `running_balance`
        # (see `with_running_balance`). Page one reads it off the summary this
        # response already aggregates, so the khata's first paint costs no
        # extra query; later pages sum what is older than the cursor, in the
        # query the summary would have been.
        carried = None
        if party_id and not cursor:
            summary = party_ledger_summary(tenant=self.get_tenant(), party_id=party_id)
            meta["summary"] = LedgerSummarySerializer(summary).data
            carried = live_total_from_summary(summary)
        elif party_id:
            carried = timeline_carried(
                tenant=self.get_tenant(), party_id=party_id, position=decode_cursor(cursor)
            )
        serializer = self.get_serializer(
            page,
            many=True,
            context={
                **self.get_serializer_context(),
                "carried": carried,
                # LED-10 FR-5 — the page's document numbers, one query per type.
                "sources": resolve_sources(page or []),
            },
        )
        return StandardResponse.ok(serializer.data, meta=meta)

    def _party_id(self) -> Any:
        """Where the party comes from, which differs between the two routes."""
        return self.request.query_params.get("party")

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """One entry, scoped to the tenant.

        `get_queryset` needs a `party` for the list; a retrieve names an id, so
        it scopes directly. An id from another tenant raises `Http404` and the
        handler turns it into `not_found` — canon §0.11 rule 2.
        """
        from django.shortcuts import get_object_or_404

        entry = get_object_or_404(
            self.scope_to_tenant(LedgerEntry.objects.all()).select_related("created_by"),
            pk=self.kwargs["pk"],
        )
        data = dict(self.get_serializer(entry).data)
        # FR-8 — the whole correction chain, oldest first, on the DETAIL only.
        #
        # Not on the list: a timeline of fifty rows would walk fifty chains, and
        # the list already carries `reversed_by_id` and `supersedes_id`, which
        # is everything a row needs to draw itself struck through. The chain is
        # what the "View history" sheet asks for, and that sheet is opened one
        # entry at a time.
        data["history"] = LedgerEntrySerializer(
            entry_history(tenant=self.get_tenant(), entry=entry), many=True
        ).data
        return StandardResponse.ok(data)

    @idempotent("ledger_entry_create")
    def create(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """201 with the entry, the party's new balance, and any warnings.

        Idempotent because canon rule 5 is about exactly this write: a merchant
        on a 2G connection taps Save, the response is lost, they tap Save again.
        Without the key that is two entries against one customer and a balance
        that is wrong by the amount of the sale — the single most damaging
        double-submit in the product, because the number it corrupts is the one
        the merchant reads out at the counter.

        `meta.party_balance` rather than a refetch (FR-3): the header replaces
        its figure from this response, so the number the merchant is shown is
        the one this transaction produced rather than whatever a second read a
        moment later happens to find.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = dict(serializer.validated_data)
        payload.setdefault("party_id", kwargs.get("party_pk"))
        ctx = self._ctx(request)
        # LED-02 FR-3 — an opening balance is a different SERVICE, not a
        # different branch inside `post_entry`.
        #
        # It has its own uniqueness rule, its own audit metadata, its own note
        # and no payment mode, and folding all of that into the ordinary entry
        # path would put four `if entry_type == 'opening'` branches inside the
        # most frequently executed write in the product. The route is shared
        # because FR-3 says so and because the client's idempotency key, retry
        # and error handling are the same; what differs is what happens after
        # the body is validated.
        if payload.pop("entry_type", None) == EntryType.OPENING:
            result = post_opening_balance(
                ctx=ctx,
                party_id=payload["party_id"],
                amount=payload["amount"],
                direction=payload["direction"],
                as_of=payload["entry_date"],
            )
            return StandardResponse.created(
                LedgerEntrySerializer(result["entry"]).data,
                meta={"party_balance": str(result["balance"]), "warnings": []},
            )
        result = post_entry(ctx=ctx, payload=payload)
        return StandardResponse.created(
            LedgerEntrySerializer(result["entry"]).data,
            meta={
                "party_balance": str(result["balance"]),
                "warnings": result["warnings"],
            },
        )

    def _entry_response(self, result: dict, *, entry_key: str) -> Any:
        """One body shape for both operations, so the client has one reader.

        The STANDING row is the data — the reversal for a reverse, the
        replacement for a correct — because that is what the timeline puts where
        the old row was. The rest goes in `meta`: the party's new balance, so the
        header moves from this response rather than a refetch (the same reason
        `create` sends it), and the reversal's id on a correction, so the client
        can drop it straight into a cache it is holding.
        """
        return StandardResponse.ok(
            LedgerEntrySerializer(result[entry_key]).data,
            meta={
                "party_balance": str(result["balance"]),
                "original_id": str(result["original"].id),
                "reversal_id": str(result["reversal"].id),
            },
        )

    # `@action` OUTERMOST, deliberately. Decorators apply bottom-up, and
    # `@action` works by setting `.mapping` and `.url_path` on the function the
    # router then looks for. Wrapping it in `@idempotent` afterwards hands the
    # router a different function with none of those attributes, and the route
    # silently does not exist — a 404 on a button, with every unit test of the
    # service still green.
    @action(detail=True, methods=["post"], url_path="reverse")
    @idempotent("ledger_entry_reverse")
    def reverse(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """FR-2 — undo one entry, keeping it visible.

        Idempotent for the reason `create` is, and more sharply: a lost response
        on a retried reverse would otherwise write a SECOND reversal, and the
        second one moves the balance again. The `entry_already_reversed` guard
        catches that too — but it answers 409, and a merchant whose connection
        dropped would be told they had already done something they never saw
        succeed. The key turns the retry back into the original 200.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = reverse_entry(
            ctx=self._ctx(request),
            entry_id=kwargs["pk"],
            # `.get`, not `[...]`. The field is optional at the WIRE (the service
            # owns the rule), so a body with no `reason` at all — which is what a
            # client sends when its form state is empty — raised `KeyError` here
            # and answered 500 to a merchant who had simply not typed anything.
            reason=serializer.validated_data.get("reason"),
        )
        return self._entry_response(result, entry_key="reversal")

    # `@action` OUTERMOST, deliberately. Decorators apply bottom-up, and
    # `@action` works by setting `.mapping` and `.url_path` on the function the
    # router then looks for. Wrapping it in `@idempotent` afterwards hands the
    # router a different function with none of those attributes, and the route
    # silently does not exist — a 404 on a button, with every unit test of the
    # service still green.
    @action(detail=True, methods=["post"], url_path="correct")
    @idempotent("ledger_entry_correct")
    def correct(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """FR-3 — replace one entry's values, keeping the mistake visible."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = correct_entry(
            ctx=self._ctx(request),
            entry_id=kwargs["pk"],
            payload=dict(serializer.validated_data),
        )
        return self._entry_response(result, entry_key="replacement")


class PartyLedgerEntryViewSet(LedgerEntryViewSet):
    """`/parties/{id}/ledger-entries` — the same thing, scoped by the URL.

    FRD §14 specifies both routes. The party-scoped one is what the khata page
    uses, because the party is already in the path and a client that had to
    repeat it in a query string would have two places to get it wrong.

    Nothing is duplicated: the queryset and the body both take the party from
    the URL, and the service is the same call.
    """

    def get_serializer_class(self) -> Any:
        if self.action == "create":
            return PartyScopedEntryWriteSerializer
        if self.action == "list":
            return TimelineEntrySerializer
        return LedgerEntrySerializer

    def get_queryset(self) -> Any:
        # CR-027 — the window rides on the page query; `list` adds the carried
        # figure. See `with_running_balance`.
        return with_running_balance(
            party_entries(
                tenant=self.get_tenant(),
                party_id=self.kwargs.get("party_pk"),
                include_reversed=self._include_reversed(),
            )
        )

    def _party_id(self) -> Any:
        return self.kwargs.get("party_pk")

    # `create` is NOT overridden. The base already does
    # `payload.setdefault("party_id", kwargs.get("party_pk"))`, and DRF passes
    # the URL kwargs through, so the party arrives from the path with no
    # forwarding step. The override that used to be here re-passed `party_pk`
    # into a `**kwargs` that already held it — `TypeError: got multiple values
    # for keyword argument`, which the handler turned into a 500 with an opaque
    # body. The route worked in every unit test of the service and failed on the
    # first request that reached it.
