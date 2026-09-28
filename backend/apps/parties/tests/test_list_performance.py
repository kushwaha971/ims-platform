"""The party list's performance contract, as behaviour rather than as prose.

The query *counts* live in `tests/performance/test_query_budgets.py`. What is
asserted here is the shape of the list query itself: that its ordering is total,
that it fetches the columns the row draws and not the three wide ones it does
not, and that the trigram index is on the expression Django actually emits.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from apps.common.filters import with_tie_breaker
from apps.parties.models import Party
from apps.parties.selectors.party import LIST_COLUMNS, list_parties, party_detail_queryset
from apps.parties.serializers.party import PartyListSerializer
from tests.factories.parties import PartyFactory


class TestOrderingIsTotal:
    """`OrderingFilter` replaces the selector's ordering; the replacement must still tie-break."""

    def test_the_selector_orders_by_a_unique_key_last(self, db: Any, tenant: Any) -> None:
        order_by = list_parties(tenant=tenant).query.order_by
        assert order_by[-1] == "id"

    def test_a_client_ordering_gains_the_primary_key(self) -> None:
        assert with_tie_breaker(["-last_activity_at"], Party) == ["-last_activity_at", "pk"]

    def test_an_ordering_that_already_ends_in_the_key_is_left_alone(self) -> None:
        assert with_tie_breaker(["name", "id"], Party) == ["name", "id"]
        assert with_tie_breaker(["-pk"], Party) == ["-pk"]

    @pytest.mark.django_db
    def test_paging_a_fully_tied_list_repeats_no_row_and_skips_none(
        self, tenant: Any, api_as: Any
    ) -> None:
        """Every party ties on `last_activity_at`, which is the common case, not the rare one.

        A party that has never had a ledger entry has `last_activity_at IS NULL`,
        so a sort on that column alone puts every new party in one undefined
        block. With `LIMIT/OFFSET` over an undefined order the same row can come
        back on two pages while another is never returned at all.
        """
        client, _ = api_as(tenant)
        PartyFactory.create_batch(30, tenant=tenant, last_activity_at=None)
        url = reverse("v1:party-list") + "?ordering=-last_activity_at&page_size=10"

        seen: list[str] = []
        for page in (1, 2, 3):
            response = client.get(f"{url}&page={page}")
            assert response.status_code == 200
            seen += [row["id"] for row in response.json()["data"]]

        assert len(seen) == 30
        assert len(set(seen)) == 30, "a row came back on two pages"
        everything = Party.objects.for_tenant(tenant).values_list("id", flat=True)
        assert set(seen) == {str(pk) for pk in everything}, "a row was never returned"

    @pytest.mark.django_db
    def test_the_ordering_the_backend_builds_ends_in_the_key(
        self, tenant: Any, api_as: Any
    ) -> None:
        """The SQL, not just the rows: PostgreSQL may happen to be stable today.

        Stock `OrderingFilter` emits `ORDER BY "name" ASC` here and nothing else.
        """
        client, _ = api_as(tenant)
        PartyFactory.create_batch(3, tenant=tenant)
        with CaptureQueriesContext(connection) as captured:
            client.get(reverse("v1:party-list") + "?ordering=name")
        ordered = [q["sql"] for q in captured.captured_queries if "ORDER BY" in q["sql"]]
        assert ordered, "the page query did not run"
        assert (
            'ORDER BY "parties_party"."name" ASC, "parties_party"."id" ASC' in ordered[-1]
        ), ordered[-1]


class TestTheListFetchesTheColumnsItDraws:
    """§20.14.2 allows `only()` on a hot list path, and warns about what it costs."""

    def test_list_columns_cover_every_CONCRETE_field_the_serializer_reads(self) -> None:
        """If they ever drift, the deferred column becomes a query per row.

        Relations are excluded and are checked by the test below instead.
        `only()` is about columns on the row; a many-to-many is not one, and
        adding `tags` to `LIST_COLUMNS` to satisfy this assertion would have
        produced a queryset that raises rather than one that is fast.
        """
        # `concrete` alone is not the discriminator: Django reports a
        # `ManyToManyField` as concrete (it is declared on the model) even
        # though it has no column on the row, which is the property `only()`
        # actually cares about.
        concrete = {
            field.name
            for field in Party._meta.get_fields()
            if getattr(field, "concrete", False) and not field.many_to_many
        }
        declared = {name for name in PartyListSerializer().fields if name in concrete}
        assert declared <= set(LIST_COLUMNS), (
            f"{declared - set(LIST_COLUMNS)} is on the wire but not in LIST_COLUMNS, so the "
            f"list page defers it and fetches it again once per row."
        )

    def test_every_RELATION_the_serializer_reads_is_prefetched(self) -> None:
        """The same defect, one category over, and it needed its own guard.

        A relation the serializer renders and the selector does not prefetch is
        a query per row exactly like a deferred column — and the `only()` check
        above cannot see it, because `only()` has nothing to say about a
        many-to-many. PTY-05's `tags` was the first relation on this row, so
        this is the first time the gap mattered.
        """
        relations = {
            field.name
            for field in Party._meta.get_fields()
            if field.is_relation and (field.many_to_many or field.one_to_many)
        }
        declared = {name for name in PartyListSerializer().fields if name in relations}

        prefetched = {
            lookup if isinstance(lookup, str) else lookup.prefetch_to
            for lookup in list_parties(tenant=None)._prefetch_related_lookups
        }
        assert declared <= prefetched, (
            f"{declared - prefetched} is rendered on every row and not prefetched, so the "
            f"list page fetches it once per row."
        )

    def test_every_list_column_is_a_concrete_model_field(self) -> None:
        concrete = {f.name for f in Party._meta.concrete_fields}
        assert set(LIST_COLUMNS) <= concrete

    @pytest.mark.django_db
    def test_the_page_query_leaves_the_wide_columns_behind(self, tenant: Any) -> None:
        """`notes` is TEXT and both addresses are JSONB; the row draws none of them."""
        sql = str(list_parties(tenant=tenant).query)
        for column in ("notes", "billing_address", "shipping_address"):
            assert f'"{column}"' not in sql, f"{column} is still being selected"

    @pytest.mark.django_db
    def test_the_detail_queryset_defers_nothing(self, tenant: Any) -> None:
        """`retrieve` must not inherit the list's `only()` — that is the §20.14.2 trap."""
        assert party_detail_queryset(tenant=tenant).query.deferred_loading == (frozenset(), True)


@pytest.mark.postgres
class TestTheSearchIndexMatchesTheSearch:
    """`icontains` compiles to `UPPER(name) LIKE UPPER(%s)`; the index must be on that."""

    def _indexdef(self, name: str) -> str | None:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT indexdef FROM pg_indexes WHERE tablename = 'parties_party' "
                "AND indexname = %s",
                [name],
            )
            row = cursor.fetchone()
        return row[0] if row else None

    @pytest.mark.django_db
    def test_the_trigram_index_is_on_the_upper_expression(self) -> None:
        definition = self._indexdef("ix_party_name_upper_trgm")
        assert definition is not None, "ix_party_name_upper_trgm is missing"
        assert "gin" in definition.lower()
        assert "upper" in definition.lower(), definition
        assert "gin_trgm_ops" in definition

    @pytest.mark.django_db
    def test_the_index_that_could_not_serve_the_search_is_gone(self) -> None:
        """A GIN index on the bare column cannot match `UPPER(name)` — 11 MB serving nothing."""
        assert self._indexdef("ix_party_name_trgm") is None

    @pytest.mark.django_db
    def test_the_search_the_filterset_emits_is_the_one_the_index_covers(self, tenant: Any) -> None:
        sql = str(list_parties(tenant=tenant, search="ravi").query)
        assert "UPPER" in sql.upper() and "LIKE" in sql.upper(), sql

    @pytest.mark.django_db
    def test_the_list_index_holds_the_order_the_list_asks_for(self) -> None:
        """An index the planner cannot use is not an index, and existence tests miss it.

        This assertion used to read `ix_party_tenant_recent is not None`, and it
        passed for months while page 1 of the party list was a sequential scan
        of the tenant and a full sort. Both halves of it were wrong: that index
        was declared `DESC`, which is `NULLS FIRST` in Postgres, against a query
        that orders `DESC NULLS LAST` — two different orderings, so the planner
        skipped it — and PTY-02 BR-4 then removed the query shape it existed
        for, since the filterset now supplies `status=active` rather than
        leaving the parameter out.

        So it is replaced by an assertion about the index the list actually
        needs, and specifically about the property the old one lacked. The
        definitive guarantee is a plan read out of `EXPLAIN` in
        `tests/performance/test_party_list_plans.py`; this one is here because
        it costs nothing and names the mistake at the point where it was made.
        """
        definition = self._indexdef("ix_party_tenant_activity")
        assert definition is not None, "ix_party_tenant_activity is missing"
        assert "NULLS LAST" in definition.upper(), definition
        assert "deleted_at IS NULL" in definition, definition
        assert self._indexdef("ix_party_tenant_recent") is None

    @pytest.mark.django_db
    def test_ordering_by_name_has_an_index_to_walk(self) -> None:
        assert self._indexdef("ix_party_tenant_name") is not None
