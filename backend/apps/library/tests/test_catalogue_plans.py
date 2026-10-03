"""T-LIB-02-7 — the catalogue's query plans, read from EXPLAIN (the PTY-02 lesson).

An index the planner cannot use returns the same rows as a sequential scan, so
only the plan can tell them apart. At 50,000 rows the trigram index and the
unique number index are genuinely the cheaper plans.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.db import connection
from django.db.models.functions import Upper

from apps.library.models import LibraryCopy, LibraryTitle
from apps.library.selectors.catalogue import list_titles
from apps.library.services.codes import natural_sort_key

pytestmark = [pytest.mark.django_db, pytest.mark.slow, pytest.mark.postgres]

SIZE = 50_000
WORDS = ("history", "garden", "river", "mathematics", "poems", "science", "village", "stories")


def _plan(queryset: Any) -> str:
    sql, params = queryset.query.sql_with_params()
    with connection.cursor() as cursor:
        cursor.execute("EXPLAIN " + sql, params)
        return "\n".join(row[0] for row in cursor.fetchall())


@pytest.fixture
def big_catalogue(tenant: Any) -> Any:
    titles = LibraryTitle.objects.bulk_create(
        [
            LibraryTitle(
                tenant=tenant,
                title=f"{WORDS[i % 8].title()} volume {i}"
                + (" zanzibarquill" if i % 10_000 == 0 else ""),
                authors=f"Author {i % 997}",
            )
            for i in range(SIZE)
        ],
        batch_size=5_000,
    )
    LibraryCopy.objects.bulk_create(
        [
            LibraryCopy(
                tenant=tenant,
                title=t,
                accession_number=str(i + 1),
                accession_sort=natural_sort_key(str(i + 1)),
            )
            for i, t in enumerate(titles)
        ],
        batch_size=5_000,
    )
    with connection.cursor() as cursor:
        cursor.execute("ANALYZE library_title")
        cursor.execute("ANALYZE library_copy")
    return tenant


def test_a_selective_search_uses_the_trigram_index(big_catalogue: Any) -> None:
    """FR-9: the one search box must not read every title of a 50,000-book library."""
    plan = _plan(list_titles(big_catalogue, {"q": "zanzibarquill"}))
    assert "ix_library_title_search" in plan, plan


def test_a_number_lookup_uses_the_unique_index(big_catalogue: Any) -> None:
    """BR-8: the counter's scan resolves through `uq_library_copy_accession`."""
    qs = LibraryCopy.objects.annotate(k=Upper("accession_number")).filter(
        tenant=big_catalogue, k="4512"
    )
    plan = _plan(qs)
    assert "uq_library_copy_accession" in plan, plan
