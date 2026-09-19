"""Postgres function wrappers used by selectors (Part 20 §20.2.2)."""

from __future__ import annotations

from django.db.models import FloatField, Func


class TrigramSimilarity(Func):
    """`similarity(a, b)` from the `pg_trgm` extension — party and item search."""

    function = "SIMILARITY"
    output_field = FloatField()
