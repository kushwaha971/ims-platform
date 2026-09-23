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

from rest_framework.decorators import action
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated

from apps.common.constants import ModuleCode
from apps.common.context import Ctx
from apps.common.idempotency import idempotent
from apps.common.permissions import ModuleEnabled
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopedNoDeleteViewSet
from apps.parties.constants import archive_via
from apps.parties.filters import PartyFilterSet
from apps.parties.models import Party
from apps.parties.permissions import PartyPermissions, WriteOffPermissions
from apps.parties.selectors.party import (
    list_parties,
    party_detail_queryset,
    party_summary,
    party_totals,
)
from apps.parties.serializers.party import (
    CreditCheckQuerySerializer,
    CreditCheckSerializer,
    PartyArchiveSerializer,
    PartyBulkArchiveResultSerializer,
    PartyBulkArchiveSerializer,
    PartyCreditSerializer,
    PartyDetailSerializer,
    PartyListSerializer,
    PartySummarySerializer,
    PartyTotalsSerializer,
    PartyUpdateSerializer,
    PartyWriteSerializer,
)
from apps.parties.services.archive import archive_party, bulk_archive_parties, restore_party
from apps.parties.services.credit import check_credit, credit_mode, credit_snapshot, may_override
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
    # FR-7's whitelist, and nothing else. An ordering parameter is a column
    # name reaching the database from the wire, so the list is a closed set:
    # anything not named here is ignored by DRF's ordering backend rather than
    # passed through. `collection_date` is here because CR-024 accepted it into
    # Part 22's four-value list.
    ordering_fields = ("name", "balance", "last_activity_at", "collection_date")
    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.PARTIES),
        PartyPermissions,
    ]
    # Three budgets, chosen per request in `get_throttles` below. No class-level
    # `throttle_scope`: a single scope on this class is what put every GET on
    # the write budget.
    throttle_classes = [ScopedUserRateThrottle]

    # The base is `TenantScopedNoDeleteViewSet` rather than the full
    # `ModelViewSet` for exactly one reason: a party is archived, never
    # deleted. PTY-04 adds archive and restore as state changes with audit
    # rows; DELETE is not a verb this route has.

    def get_throttles(self) -> list[Any]:
        """Reads on the user budget, writes on `party_write`, search guarded too.

        PTY-02 §19: the list is read on the general user bucket (600/min) with a
        120/min guard on search. This viewset used to declare one
        `throttle_scope = "party_write"` for everything, so the WRITE ceiling —
        60/min — applied to every GET as well. The 61st read in a minute was a
        429, and a merchant paging through a list, flipping chips and opening
        khatas does that in a busy minute; the e2e harnesses do it in seconds.

        Writes keep `party_write`, and its reason is unchanged: the
        duplicate-mobile response answers a question about another record — even
        reduced to an id, a patient caller could walk a number range with it —
        and a write endpoint with no ceiling can fill a tenant's book. 60/min is
        far above a shopkeeper copying a paper ledger.

        The search guard is spent IN ADDITION to the user budget, and only by a
        list request that actually carries a search term.
        """
        if self.request.method not in SAFE_METHODS:
            return [ScopedUserRateThrottle("party_write")]
        throttles = [ScopedUserRateThrottle("user")]
        if self.action == "list" and (self.request.query_params.get("q") or "").strip():
            throttles.append(ScopedUserRateThrottle("party_search"))
        return throttles

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
        if self.action == "archive":
            return PartyArchiveSerializer
        if self.action == "bulk_archive":
            return PartyBulkArchiveSerializer
        if self.action == "credit_check":
            return CreditCheckQuerySerializer
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
        """The rows, and the two figures the header answers.

        `party_totals` runs on the FILTERED queryset before the paginator
        slices it. That ordering is the feature: the header says how much the
        merchant is owed across everyone the filter matched, not across the
        twenty-five rows that fit on this page — which is what it said before,
        honestly labelled and useless for the question it was being asked.
        """
        queryset = self.filter_queryset(self.get_queryset())
        totals = party_totals(queryset)
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        # Through a serializer, not straight into the envelope: the two
        # figures are money, and money is a string on the wire (canon rule 3).
        # Handed the raw dict, the renderer emits `0.0` and the precision is
        # gone before the client ever sees it.
        meta = {**self.paginator.get_meta(), "totals": PartyTotalsSerializer(totals).data}
        return StandardResponse.ok(serializer.data, meta=meta)

    def retrieve(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """The party, plus the two blocks the khata page's header draws.

        `summary` and `credit` are computed from the row already in hand, so
        this stays one query. `credit` is omitted entirely for a party with no
        limit rather than sent as a set of nulls — see the selector.

        What is still NOT in this response, and the reason it is not, has
        changed shape with LED-01. `summary` now carries `receivable` and
        `payable` — derived from the balance, see the selector — and
        `open_invoices`, `overdue_amount` and `last_payment_at` are still absent
        because `sales_document` and `payments_payment` are unbuilt.

        FRD PTY-03 §14 also specifies `recent_entries[5]` here, and LED-01
        deliberately does NOT add it. The `ledger_entry` table now exists, so
        this route COULD read it — but Part 20 §20.1.4's import matrix has
        `ledger` depending on `parties` and not the reverse, and inverting that
        for a convenience field would make the two apps mutually dependent for
        ever. The rows are on `/parties/{id}/ledger-entries`, which the khata
        page requests anyway because the timeline is paged: its first page IS
        the recent entries, and the three ledger figures the header wants ride
        in that response's `meta.summary`. Two requests, each answered by the
        app that owns the table.
        """
        party = self.get_object()
        data = dict(self.get_serializer(party).data)
        data["summary"] = PartySummarySerializer(party_summary(party)).data
        # PTY-06. One setting read for the mode; the rest is arithmetic on the
        # row already in hand, so the block costs no extra query about the party.
        credit = credit_snapshot(party, mode=credit_mode(self.get_tenant()))
        if credit is not None:
            data["credit"] = PartyCreditSerializer(credit).data
        return StandardResponse.ok(data)

    def get_object(self) -> Any:
        """The scoped queryset WITHOUT the list's filters.

        DRF's `get_object()` runs `filter_queryset()`, so the list's BR-4
        default — archived parties are out unless asked for — was also deciding
        whether a party could be RETRIEVED or EDITED. An archived party became
        a 404: not hidden from a list, gone. Which means PTY-04's restore, and
        the notes edit PTY-01 deliberately still allows on an archived party,
        both stopped working the moment BR-4 arrived.

        A list default is a statement about a list. Tenant scoping still
        applies, because that lives in `get_queryset()`, and the object
        permission check is kept exactly as DRF does it.
        """
        from django.shortcuts import get_object_or_404

        obj = get_object_or_404(self.get_queryset(), pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, obj)
        return obj

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

    # ── PTY-04 — archive and restore ────────────────────────────────────────
    #
    # `POST` on a sub-path rather than `DELETE` on the party, and that is the
    # whole shape of the feature rather than a style choice: a party is never
    # deleted, because deleting one would destroy the ledger behind it. The
    # router still maps no DELETE at all (`TenantScopedNoDeleteViewSet`), so
    # there is no verb a client can reach for that would mean "remove this".

    @idempotent("party_archive")
    @action(detail=True, methods=["post"])
    def archive(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """Take a party out of the working list, optionally writing the balance off.

        Idempotent by key, and the reason is the one canon rule 5 is about: a
        merchant on a 2G connection taps Archive, the response is lost, they tap
        again — and without a key the second attempt answers 409
        `party_already_archived` for a party they just successfully archived,
        which reads as a failure. The replay returns the original 200 — with
        its `meta.write_off_entry_id` — and posts no second write-off.

        With a `write_off` (FR-3) the response carries `meta.write_off_entry_id`
        so the client can prepend the new row to the khata timeline.
        """
        party = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        write_off = serializer.validated_data.get("write_off")
        if write_off is not None:
            self._authorise_write_off(request)
        archived, write_off_entry_id = archive_party(
            ctx=self._ctx(request),
            party=party,
            reason=serializer.validated_data.get("reason", ""),
            via=archive_via(request.data.get("via")),
            write_off=dict(write_off) if write_off is not None else None,
        )
        return StandardResponse.ok(
            PartyDetailSerializer(archived).data,
            meta={"write_off_entry_id": write_off_entry_id} if write_off_entry_id else None,
        )

    def _authorise_write_off(self, request: Any) -> None:
        """T-PTY-04-12 — the write-off's extra gates, in Part 20 §20.5.5's order.

        Entitlement before authorisation, as on every viewset: a tenant with the
        ledger switched off is told `module_disabled`, not `permission_denied` —
        and it has to be this order, because `permissions_for` strips every
        `ledger.*` codename from a tenant whose ledger is off, so asking about
        the codename first would answer "ask your owner for rights" to an owner.

        Both are the permission CLASSES `/ledger-entries` itself declares,
        instantiated here because they apply to one body key rather than to the
        route. The route's own `parties.party.delete` has already passed by the
        time this runs.
        """
        for permission in (ModuleEnabled(ModuleCode.LEDGER)(), WriteOffPermissions()):
            if not permission.has_permission(request, self):
                self.permission_denied(
                    request, message="You do not have permission to write off a balance."
                )

    @action(detail=True, methods=["post"])
    def restore(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """Bring a party back.

        No idempotency key, and the asymmetry with archive is deliberate: a
        replayed restore on an already-active party answers 409
        `party_not_archived`, which is the truth and costs nothing — the party
        is active, which is what the caller wanted. A replayed ARCHIVE on an
        already-archived party is the same truth and costs a merchant their
        confidence, because they are looking at a screen that says the thing
        they just did did not work.
        """
        party = self.get_object()
        restored = restore_party(ctx=self._ctx(request), party=party, via="api")
        return StandardResponse.ok(PartyDetailSerializer(restored).data)

    # ── PTY-06 — the credit limit's pre-flight ──────────────────────────────
    #
    # A GET, and that is the whole shape of it: it answers a question and
    # refuses nothing. The authoritative check runs inside the write
    # transaction, after the party row is locked (BR-2), so a stale answer from
    # here cannot let anything through — it never had the power to allow
    # anything. This exists so a merchant is told BEFORE they finish the bill
    # rather than after (FR-8), which is the difference between a rule that
    # helps and a rule that wastes their typing.

    @action(detail=True, methods=["get"], url_path="credit-check")
    def credit_check(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """Would adding this amount put the party over their limit?

        Cheap and idempotent — one PK read the viewset has already done, one
        setting read, and arithmetic — so it is safe to call on every change of
        the amount field, which is what FR-8 asks the client to do behind a
        300 ms debounce.

        `can_override` is about the ACTOR rather than the party, and it is
        computed here because BR-8 is a check on the ROLE: a client that worked
        it out from codenames would be re-implementing a governance rule in
        TypeScript, and getting it wrong would draw an Override button for
        somebody the server is going to refuse.
        """
        party = self.get_object()
        query = CreditCheckQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)

        result = check_credit(
            party=party,
            amount=query.validated_data["amount"],
            mode=credit_mode(self.get_tenant()),
        )
        result["can_override"] = may_override(tenant=self.get_tenant(), user=request.user)
        return StandardResponse.ok(CreditCheckSerializer(result).data)

    @idempotent("party_bulk_archive")
    @action(detail=False, methods=["post"], url_path="bulk-archive")
    def bulk_archive(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        """Archive what can be archived; report what could not.

        200 with a partial-success body rather than 207 or a 400: every id in
        the request was a legitimate ask, and the ones that were skipped were
        skipped for a reason the merchant can act on. A status code cannot carry
        "twenty-six of thirty, and here are the four and what they owe".
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = bulk_archive_parties(
            ctx=self._ctx(request),
            ids=serializer.validated_data["ids"],
            reason=serializer.validated_data.get("reason", ""),
        )
        data = PartyBulkArchiveResultSerializer(result).data
        return StandardResponse.ok(
            data,
            meta={
                "archived_count": len(result["archived"]),
                "skipped_count": len(result["skipped"]),
            },
        )
