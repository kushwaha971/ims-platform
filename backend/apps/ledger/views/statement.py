"""`GET /parties/{id}/statement` — LED-04, the hisaab.

Thin, like every view here (Part 26 §26.7 R7.1): parse the period, ask the
selectors, wrap the answer. Everything that decides a number is in
`ledger/selectors/statement.py`.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

from django.http import StreamingHttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.common.audit import AuditAction
from apps.common.constants import ModuleCode
from apps.common.dates import tenant_today
from apps.common.exceptions import ValidationFailed
from apps.common.pagination import CursorPagination, decode_cursor
from apps.common.permissions import HasPermission, ModuleEnabled
from apps.common.renderers import EnvelopeJSONRenderer, PassthroughCsvRenderer
from apps.common.responses import StandardResponse
from apps.common.throttling import ScopedUserRateThrottle
from apps.common.viewsets import TenantScopeMixin
from apps.ledger.selectors.sources import resolve_sources
from apps.ledger.selectors.statement import (
    STATEMENT_ORDERING,
    carried_forward,
    has_entries_before_opening,
    opening_balance,
    statement_rows,
    statement_totals,
)
from apps.ledger.serializers.entry import StatementRowSerializer, StatementTotalsSerializer
from apps.ledger.services.statement_csv import statement_csv_rows
from apps.ledger.views.exports import audit_export, authorise_export

#: §10 — five years, and the cap is what makes "print fetches all rows first"
#: (FR-8) a finite promise. A merchant who wants more has a reason to ask for
#: it; a client that sends `date_from=0001-01-01` has a bug.
MAX_RANGE_DAYS = 366 * 5

#: §14 — above this the export becomes an async job, and `reports_export` has no
#: table. So the synchronous path refuses rather than timing out, and says what
#: to do instead. A five-thousand-row party is three years of daily trading.
MAX_SYNC_CSV_ROWS = 5000


def mask_mobile(mobile: str | None) -> str | None:
    """BR-6 — `+91 98••• ••678`.

    A statement link ends up in a WhatsApp group. A full mobile number in it is a
    customer's number published by their shopkeeper, so the masking lives in the
    response every statement is built from rather than at the public boundary,
    where it would be one `if` away from being forgotten.
    """
    if not mobile:
        return None
    digits = "".join(ch for ch in mobile if ch.isdigit())
    if len(digits) < 6:
        return "•" * len(digits)
    return f"{digits[:2]}••• ••{digits[-3:]}"


class PartyStatementView(TenantScopeMixin, APIView):
    """The statement, paged, or the whole thing as a CSV.

    `APIView` rather than a viewset: this is one read with its own response
    shape, and a `GenericViewSet` would bring `create`, `update` and `destroy`
    for a resource that has none. The ledger's own viewset makes the same
    argument in the other direction.
    """

    permission_classes = [
        IsAuthenticated,
        ModuleEnabled(ModuleCode.LEDGER),
        # §12 — everyone who may read the ledger may read a statement, including
        # the accountant. The CSV is gated separately, below, because
        # `ledger.statement.export` is a different capability: reading a
        # customer's history at the counter and walking out with the whole book
        # in a file are not the same act.
        HasPermission("ledger.entry.read"),
    ]
    throttle_classes = [ScopedUserRateThrottle]
    #: The ordinary per-user budget, NOT the export one.
    #:
    #: This was `"export"` — `UB_RATE_LIMIT_EXPORT=10/hour` — and the first e2e
    #: run answered **429** after ten statement views, with an hour to wait. A
    #: statement is a screen a merchant opens at a counter while a customer is
    #: standing there, and ten a day would be a slow afternoon; ten an hour is a
    #: product that stops working during an argument about a bill.
    #:
    #: The EXPORT is the expensive act, and it is a query parameter on this same
    #: URL rather than a route of its own — so the budget for it is applied in
    #: the handler, where the parameter can be seen. One URL, two costs.
    throttle_scope = "user"
    #: BR-1, and the paginator reads it off the view. Without it `CursorPagination`
    #: falls back to its own `(-created_at, -id)` default and the statement comes
    #: back newest-first — a passbook read backwards, with the running balance
    #: descending down the page.
    cursor_ordering = STATEMENT_ORDERING
    #: `PassthroughCsvRenderer` is what makes `?format=csv` reach the handler at
    #: all — see its docstring. Without it DRF's negotiation answers 404, which
    #: reads exactly like a missing party.
    renderer_classes = [EnvelopeJSONRenderer, PassthroughCsvRenderer]

    def _party(self) -> Any:
        from django.shortcuts import get_object_or_404

        from apps.parties.models import Party

        return get_object_or_404(
            self.scope_to_tenant(Party.all_objects.all()), pk=self.kwargs["party_pk"]
        )

    def _period(self, request: Any) -> tuple[dt.date | None, dt.date | None]:
        """§10 — both dates optional, ordered, and no more than five years apart."""
        details: dict[str, list[str]] = {}

        def parse(name: str) -> dt.date | None:
            raw = request.query_params.get(name)
            if not raw:
                return None
            try:
                return dt.date.fromisoformat(raw)
            except ValueError:
                details[name] = ["Give a date as YYYY-MM-DD."]
                return None

        date_from, date_to = parse("date_from"), parse("date_to")
        if date_from and date_to:
            if date_from > date_to:
                details["date_from"] = ["The start date is after the end date."]
            elif (date_to - date_from).days > MAX_RANGE_DAYS:
                details["date_to"] = ["Choose a range of up to 5 years."]
        if details:
            raise ValidationFailed(details)
        return date_from, date_to

    def get(self, request: Any, *args: Any, **kwargs: Any) -> Any:
        party = self._party()
        date_from, date_to = self._period(request)
        # §C9.4 of the build notes: `/statement` honours LED-04's
        # `include_corrections` and `/ledger-entries` keeps LED-03's
        # `include_reversed`. Two names for one predicate is a wart, and the
        # alternative — renaming one after both are in tests and change requests
        # — is a bigger one. The SELECTOR has a single parameter, so they cannot
        # mean different things.
        include_corrections = request.query_params.get("include_corrections", "").lower() == "true"
        scope = {
            "tenant": self.get_tenant(),
            "party_id": party.id,
            "include_corrections": include_corrections,
        }

        if request.query_params.get("format") == "csv":
            return self._csv(party, scope, date_from, date_to)

        rows_qs = statement_rows(**scope, date_from=date_from, date_to=date_to)
        paginator = CursorPagination()
        page = paginator.paginate_queryset(rows_qs, request, self)
        carried = carried_forward(
            **scope,
            date_from=date_from,
            position=decode_cursor(request.query_params.get(paginator.cursor_query_param)),
        )
        serializer = StatementRowSerializer(
            page, many=True, context={"carried": carried, "sources": resolve_sources(page or [])}
        )

        opening = opening_balance(**scope, date_from=date_from)
        closing = self._closing(scope, date_from, date_to, opening)
        return StandardResponse.ok(
            {
                "party": {
                    "id": str(party.id),
                    "name": party.name,
                    "mobile_masked": mask_mobile(party.mobile),
                },
                "period": {
                    "from": date_from.isoformat() if date_from else None,
                    "to": date_to.isoformat() if date_to else None,
                },
                "opening_balance": str(opening),
                "closing_balance": str(closing),
                "rows": serializer.data,
                "totals": StatementTotalsSerializer(
                    statement_totals(**scope, date_from=date_from, date_to=date_to)
                ).data,
                "has_entries_before_opening": has_entries_before_opening(
                    tenant=scope["tenant"], party_id=party.id
                ),
            },
            meta=paginator.get_meta(),
        )

    def _closing(
        self, scope: dict, date_from: dt.date | None, date_to: dt.date | None, opening: Decimal
    ) -> Decimal:
        """The period's last running balance, and BR-3's check on it.

        Computed as one aggregate over the whole period rather than read off the
        last row, because the last row is on the last PAGE and a merchant
        looking at page one still needs the closing figure in the header.

        BR-3: on an unbounded statement the closing must equal
        `parties_party.balance`. When it does not, the cache and the ledger
        disagree — which is the one thing `manage.py recalc_balances` exists to
        find — so it is logged at WARN with the party id rather than silently
        papered over. It is NOT corrected here: a read that repairs data is a
        read that hides how often the repair was needed.
        """
        from apps.ledger.selectors.statement import _scoped, _signed_total

        scoped = _scoped(**scope)
        if date_from is not None:
            scoped = scoped.filter(entry_date__gte=date_from)
        if date_to is not None:
            scoped = scoped.filter(entry_date__lte=date_to)
        closing = opening + _signed_total(scoped)

        if date_from is None and date_to is None:
            party = self._party()
            if (party.balance or Decimal("0.00")) != closing:
                import logging

                logging.getLogger("apps.ledger").warning(
                    "ledger.balance_drift party=%s cached=%s ledger=%s",
                    party.id,
                    party.balance,
                    closing,
                )
        return closing

    def _csv(
        self, party: Any, scope: dict, date_from: dt.date | None, date_to: dt.date | None
    ) -> Any:
        """FR-10 — the whole period as a file, gated on its own permission.

        Checked here rather than in the permission class because it depends on
        a QUERY PARAMETER: the same URL is a read for everybody and an export for
        the roles that may take the book away. A permission map keyed on the HTTP
        verb cannot see the difference.
        """
        # Cross-site refusal, permission and the export budget — in that order,
        # in one helper both exports share. The budget is applied HERE rather
        # than on the class because the export is a query parameter and a
        # class-level scope cannot see one.
        authorise_export(
            self.request,
            self,
            codename="ledger.statement.export",
            refusal="You do not have permission to export statements.",
        )

        rows_qs = statement_rows(**scope, date_from=date_from, date_to=date_to)
        count = rows_qs.count()
        if count > MAX_SYNC_CSV_ROWS:
            raise ValidationFailed(
                {"non_field_errors": [f"That is {count} rows. Narrow the dates and export again."]}
            )

        audit_export(
            request=self.request,
            tenant=scope["tenant"],
            action=AuditAction.LEDGER_STATEMENT_EXPORTED,
            entity_type="parties_party",
            entity_id=party.id,
            params={
                "date_from": date_from.isoformat() if date_from else None,
                "date_to": date_to.isoformat() if date_to else None,
                "include_corrections": scope["include_corrections"],
            },
            row_count=count,
        )

        carried = opening_balance(**scope, date_from=date_from)
        response = StreamingHttpResponse(
            _csv_lines(statement_csv_rows(rows_qs.iterator(chunk_size=500), carried=carried)),
            content_type="text/csv",
        )
        # NEW-3: the merchant's today, not the server's. `dt.date.today()` is the
        # UTC date, so between midnight and 05:30 IST a statement whose period
        # ends today was named for yesterday, beside an aging export (which
        # uses `tenant_today`) named for today.
        stamp = tenant_today(self.get_tenant()).isoformat()
        response["Content-Disposition"] = f'attachment; filename="statement-{party.id}-{stamp}.csv"'
        return response


def _csv_lines(rows: Any) -> Any:
    """Render each row to a CSV line, streaming.

    `csv.writer` wants a file; an object whose `write` returns the string it was
    given turns it into a generator, which is the documented Django idiom for
    streaming a CSV without building it in memory first.
    """
    import csv

    class Echo:
        def write(self, value: str) -> str:
            return value

    writer = csv.writer(Echo())
    for row in rows:
        yield writer.writerow(row)
