"""`GET /ledger/summary` and `GET /ledger/aging` — LED-09.

Thin (Part 26 §26.7 R7.1): parse, ask the selector, join the names, page, wrap.
Every number is decided in `ledger/selectors/aging.py`.
"""

from __future__ import annotations

import csv
import datetime as dt
from typing import Any

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.audit import AuditAction
from apps.common.constants import ModuleCode
from apps.common.exceptions import ValidationFailed
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.ledger.selectors.aging import BUCKET_KEYS, aging_rows, aging_totals, ledger_summary
from apps.ledger.services.statement_csv import neutralise
from apps.ledger.views.exports import audit_export, authorise_export

#: §14 — above this the export becomes an async job, and `reports_export` has no
#: table. The synchronous path refuses and says what to do, rather than timing
#: out halfway through a file the merchant is already downloading.
MAX_SYNC_CSV_ROWS = 5000

#: §8 — the oldest money first, because that is the order a merchant works in.
#: A collection round starts with the customer who has owed the longest, not the
#: one who owes the most.
DEFAULT_ORDERING = "-90_plus"
ALLOWED_ORDERING = {"-90_plus", "90_plus", "-total", "total", "name", "-name"}


class LedgerSummaryView(TenantScopeMixin, APIView):
    """FR-1 / BR-1 — the tenant's position, in two numbers."""

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.LEDGER),
        HasPermission("ledger.entry.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        totals = ledger_summary(tenant=self.get_tenant())
        return StandardResponse.ok({key: str(value) for key, value in totals.items()})


class LedgerAgingView(TenantScopeMixin, APIView):
    """FR-2 — every party with something outstanding, bucketed by age.

    ── Why the paging happens in Python and not in the query ────────────────
    The default ordering is `-90_plus`, which is a COMPUTED column: it does not
    exist until the FIFO walk has run over every party. So there is no page of
    parties to fetch before the arithmetic — the arithmetic is what decides
    which parties are on the first page at all.

    That is fine at the size this product is for. The selector returns one row
    per party with something outstanding, which is bounded by the tenant's party
    count rather than by their entry count: a shop with 100,000 entries and 800
    debtors returns 800 rows. §20's own budget is written for 5,000 parties, and
    BR-6's answer above that is a nightly snapshot in `reports_snapshot` — a
    table CR-106 adds and Part 21 does not yet have, which is why the response
    carries `cached_at: null` rather than pretending.
    """

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.LEDGER),
        # §12 — staff see aging, because chasing a collection IS their work.
        # BR-8 says so explicitly, against the instinct that a money report is
        # for the owner: the person who rings the customer needs to know which
        # customer to ring.
        HasPermission("ledger.entry.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]
    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def _as_of(self, request: Any) -> dt.date:
        """§10 — a date, not in the future, in the TENANT's today.

        The device clock is not consulted. An accountant in one timezone pulling
        a year-end report for a shop in another must get the shop's year end,
        and "not in the future" has to mean the same thing to both of them.
        """
        from apps.common.dates import tenant_today

        today = tenant_today(self.get_tenant())
        raw = request.query_params.get("as_of")
        if not raw:
            return today
        try:
            as_of = dt.date.fromisoformat(raw)
        except ValueError:
            raise ValidationFailed({"as_of": ["Give a date as YYYY-MM-DD."]}) from None
        if as_of > today:
            raise ValidationFailed({"as_of": ["The as-of date cannot be in the future."]})
        return as_of

    def _kind(self, request: Any) -> str:
        kind = request.query_params.get("type", "receivable")
        if kind not in ("receivable", "payable"):
            raise ValidationFailed({"type": ["Choose receivable or payable."]})
        return kind

    def _ordering(self, request: Any) -> str:
        ordering = request.query_params.get("ordering") or DEFAULT_ORDERING
        if ordering not in ALLOWED_ORDERING:
            raise ValidationFailed({"ordering": ["That is not a sort this report offers."]})
        return ordering

    def _validate_params(self, request: Any) -> tuple[dt.date, str, str]:
        """Every query parameter, checked without touching a ledger row.

        Separate from `_rows` so an export with a typo in it is a 400 BEFORE
        the export budget is charged: the merchant who fat-fingers a date
        should not lose one of their ten exports an hour to it.
        """
        return self._as_of(request), self._kind(request), self._ordering(request)

    def _rows(self, request: Any) -> tuple[list[dict], dict, dt.date, str]:
        """The report, named, filtered, ordered — before paging."""
        tenant = self.get_tenant()
        as_of, kind, ordering = self._validate_params(request)
        raw = aging_rows(tenant=tenant, as_of=as_of, kind=kind)

        names = self._party_names(tenant, list(raw), request.query_params.get("tag"))
        rows = [
            {
                "party": {"id": party_id, "name": names[party_id]},
                **{key: str(buckets[key]) for key in BUCKET_KEYS},
                "total": str(buckets["total"]),
            }
            for party_id, buckets in raw.items()
            if party_id in names
        ]
        totals = aging_totals({key: value for key, value in raw.items() if key in names})

        rows.sort(key=self._sort_key(ordering), reverse=ordering.startswith("-"))
        return rows, totals, as_of, kind

    @staticmethod
    def _sort_key(ordering: str) -> Any:
        from decimal import Decimal

        field = ordering.lstrip("-")
        if field == "name":
            # Case-folded, because a book sorted A…Z then a…z is a book a
            # merchant scrolls past their own customer in.
            return lambda row: (row["party"]["name"].casefold(), row["party"]["id"])
        # Two keys, not one: parties tie at ₹0.00 in the 90+ column constantly —
        # most books have nobody that old — and a tie broken by dict order puts
        # the same merchant's list in a different sequence on every request.
        # The id last, so two parties equal on every figure still keep ONE order
        # between refreshes instead of whatever order the dict was built in.
        return lambda row: (Decimal(row[field]), Decimal(row["total"]), row["party"]["id"])

    def _party_names(self, tenant: Any, party_ids: list[str], tag: str | None) -> dict[str, str]:
        """The names, and the tag filter, in one query.

        The filter is applied HERE rather than inside the CTE deliberately: a
        tag is a property of a party and the walk is about entries, so folding a
        join into the arithmetic would put PTY-05's tables inside the one query
        in this feature that has to stay readable.
        """
        from apps.parties.filters import PartyFilterSet
        from apps.parties.models import Party

        if not party_ids:
            return {}
        queryset = Party.objects.filter(tenant=tenant, id__in=party_ids)
        if tag:
            # The party list's own tag predicate, not a second one: the screen
            # uses the list's picker, which writes `?tag=A,B` meaning "either",
            # folds case and inner whitespace, and asks with EXISTS so a party
            # carrying both tags is counted once in the totals.
            queryset = PartyFilterSet(queryset=queryset).filter_tags(queryset, "tag", tag)
        return {str(row.id): row.name for row in queryset.only("id", "name")}

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        is_csv = request.query_params.get("format") == "csv"
        if is_csv:
            self._validate_params(request)
            # BEFORE the report is computed (security review I-5). The FIFO walk
            # over every party is the expensive part of this view; a caller who
            # may not export, has spent their budget, or was sent here by
            # another site is refused without the server doing it first.
            authorise_export(
                request,
                self,
                codename="reports.export",
                refusal="You do not have permission to export reports.",
            )

        rows, totals, as_of, kind = self._rows(request)

        if is_csv:
            return self._csv(rows, as_of, kind)

        page = self._positive_int(request, "page", default=1)
        page_size = min(self._positive_int(request, "page_size", default=25), 200)
        start = (page - 1) * page_size
        return StandardResponse.ok(
            rows[start : start + page_size],
            meta={
                "totals": {key: str(value) for key, value in totals.items()},
                "as_of": as_of.isoformat(),
                "type": kind,
                # BR-6's snapshot lands with CR-106's `reports_snapshot` table.
                # `null` says "this was computed now", which is true, rather
                # than omitting the key and leaving a client to guess.
                "cached_at": None,
                "page": page,
                "page_size": page_size,
                "total": len(rows),
            },
        )

    @staticmethod
    def _positive_int(request: Any, name: str, *, default: int) -> int:
        """`?page=two` is a typo in an address bar, and a typo is a 400.

        The first version called `int()` on the raw parameter and answered 500,
        which a merchant reads as "the report is broken".
        """
        raw = request.query_params.get(name)
        if raw in (None, ""):
            return default
        try:
            value = int(raw)
        except ValueError:
            raise ValidationFailed({name: ["Give a whole number."]}) from None
        if value < 1:
            raise ValidationFailed({name: ["Give a number of 1 or more."]})
        return value

    def _csv(self, rows: list[dict], as_of: dt.date, kind: str) -> Any:
        """FR-3's export. `get` has already authorised it (§12, I-5).

        The gate — cross-site refusal, `reports.export`, the export budget — is
        in the handler rather than the permission class for the same reason
        LED-04's is: the export is a QUERY PARAMETER on a URL everybody may
        read, and a permission map keyed on the HTTP verb cannot see one.
        """
        if len(rows) > MAX_SYNC_CSV_ROWS:
            raise ValidationFailed(
                {
                    "non_field_errors": [
                        f"That is {len(rows)} rows. Narrow the report and try again."
                    ]
                }
            )
        audit_export(
            request=self.request,
            tenant=self.get_tenant(),
            action=AuditAction.LEDGER_AGING_EXPORTED,
            entity_type="ledger_aging",
            entity_id=None,
            params={
                "type": kind,
                "as_of": as_of.isoformat(),
                "tag": self.request.query_params.get("tag") or None,
            },
            row_count=len(rows),
        )

        class Echo:
            def write(self, value: str) -> str:
                return value

        writer = csv.writer(Echo())
        header = ["party", *BUCKET_KEYS, "total"]

        def lines() -> Any:
            yield writer.writerow(header)
            for row in rows:
                # §19, the same neutralisation the statement does: a party named
                # "=Sharma" is a formula to a spreadsheet, and a customer can
                # choose their own trade name.
                yield writer.writerow(
                    [
                        neutralise(row["party"]["name"]),
                        *[row[key] for key in BUCKET_KEYS],
                        row["total"],
                    ]
                )

        response = StreamingHttpResponse(lines(), content_type="text/csv")
        response["Content-Disposition"] = (
            f'attachment; filename="aging-{kind}-{as_of.isoformat()}.csv"'
        )
        return response
