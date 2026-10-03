"""Catalogue reads (LIB-02 §6, FR-9, FR-10, BR-8; task B05). Read-only (rule D8).

Search (FR-9) is one box over the trigram `search_text` (title, subtitle,
authors, publisher, keywords), the normalised ISBN in either form, and an exact
accession number or barcode. The number and the ISBN are resolved to title ids
FIRST, by their own indexes, and OR-ed in as a literal id list — so the planner
can BitmapOr three index scans instead of evaluating a correlated subquery per
title (T-LIB-02-7). A term under three characters has no trigram, so it matches
the start of the title instead.

Filters whose tables do not exist yet are refused with a 400 rather than
silently ignored (`has_holds`, `ordering=-issues_12m`): a chip that lights up
and filters nothing is the PTY-02 defect.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

from django.db.models import Count, Q, QuerySet
from django.db.models.functions import Lower, Upper

from apps.common.exceptions import ValidationFailed
from apps.library.constants import CopySource, CopyStatus, MaterialType, TitleStatus
from apps.library.models import LibraryCategory, LibraryCopy, LibraryLocation, LibraryTitle
from apps.library.services import codes, isbn

#: The search length below which trigrams cannot help.
TRIGRAM_MIN = 3
TITLE_ORDERINGS = {
    "title": (Lower("title").asc(), "id"),
    "-created_at": ("-created_at", "-id"),
}
COPY_ORDERINGS = {
    "accession": ("accession_sort", "id"),
    "title": (Lower("title__title").asc(), "accession_sort", "id"),
}
#: Orderings and filters the FRD names whose tables are not built yet.
NOT_YET = {"-issues_12m": "LIB-06", "has_holds": "LIB-08"}


def _uuid(raw: Any) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError, AttributeError):
        return None


def _date(params: Any, name: str, errors: dict) -> dt.date | None:
    raw = params.get(name)
    if not raw:
        return None
    try:
        return dt.date.fromisoformat(raw)
    except ValueError:
        errors.setdefault(name, []).append("Use a date like 2026-10-01.")
        return None


def _int(params: Any, name: str, errors: dict) -> int | None:
    raw = params.get(name)
    if raw in (None, ""):
        return None
    try:
        return int(raw)
    except ValueError:
        errors.setdefault(name, []).append("Enter a whole number.")
        return None


def _id(params: Any, name: str, errors: dict) -> uuid.UUID | None:
    raw = params.get(name)
    if not raw:
        return None
    value = _uuid(raw)
    if value is None:
        errors.setdefault(name, []).append("Not a valid id.")
    return value


def titles_matching_number(tenant: Any, term: str) -> list[Any]:
    """Title ids of copies whose accession number or barcode is exactly `term`."""
    key = codes.number_key(term)
    if not key:
        return []
    by_number = LibraryCopy.objects.annotate(k=Upper("accession_number")).filter(
        tenant=tenant, k=key
    )
    by_barcode = LibraryCopy.objects.annotate(k=Upper("barcode")).filter(tenant=tenant, k=key)
    return list(
        {
            *by_number.values_list("title_id", flat=True),
            *by_barcode.values_list("title_id", flat=True),
        }
    )


def _search(tenant: Any, qs: QuerySet, term: str) -> QuerySet:
    term = term.strip()
    if not term:
        return qs
    lowered = term.lower()
    text = (
        Q(search_text__contains=lowered)
        if len(lowered) >= TRIGRAM_MIN
        else Q(title__istartswith=term)
    )
    condition = text
    isbn13 = isbn.to_isbn13(term)
    if isbn13:
        condition |= Q(isbn13=isbn13)
    ids = titles_matching_number(tenant, term)
    if ids:
        condition |= Q(id__in=ids)
    return qs.filter(condition)


def list_titles(tenant: Any, params: Any) -> QuerySet:
    """`GET /library/titles` (FR-10)."""
    errors: dict[str, list[str]] = {}
    for name, frd in NOT_YET.items():
        if name in params or params.get("ordering") == name:
            errors.setdefault(name if name in params else "ordering", []).append(
                f"Not available until {frd} is built."
            )
    qs = LibraryTitle.objects.filter(tenant=tenant).select_related("category")
    status = params.get("status") or TitleStatus.ACTIVE
    if status != "all":
        if status not in TitleStatus.values:
            errors.setdefault("status", []).append("Choose active, archived or all.")
        else:
            qs = qs.filter(status=status)
    category = _id(params, "category", errors)
    if category:
        qs = qs.filter(Q(category_id=category) | Q(category__parent_id=category))
    material = params.get("material_type")
    if material:
        if material not in MaterialType.values:
            errors.setdefault("material_type", []).append("Choose one of the options.")
        else:
            qs = qs.filter(material_type=material)
    language = params.get("language")
    if language:
        qs = qs.filter(language__iexact=language.strip())
    availability = params.get("availability")
    if availability == "on_shelf":
        qs = qs.filter(copies_available__gt=0)
    elif availability == "all_out":
        qs = qs.filter(copies_total__gt=0, copies_available=0)
    elif availability:
        errors.setdefault("availability", []).append("Choose on_shelf or all_out.")
    year_from = _int(params, "year_from", errors)
    year_to = _int(params, "year_to", errors)
    if year_from is not None:
        qs = qs.filter(year__gte=year_from)
    if year_to is not None:
        qs = qs.filter(year__lte=year_to)
    ordering = params.get("ordering") or "title"
    if ordering not in TITLE_ORDERINGS and ordering not in NOT_YET:
        errors.setdefault("ordering", []).append("Choose title or -created_at.")
    if errors:
        raise ValidationFailed(errors)
    qs = _search(tenant, qs, params.get("q") or "")
    return qs.order_by(*TITLE_ORDERINGS[ordering])


def list_copies(tenant: Any, params: Any) -> QuerySet:
    """`GET /library/copies` (FR-10); `ordering=accession` is numeric-aware (BR-4)."""
    errors: dict[str, list[str]] = {}
    qs = LibraryCopy.objects.filter(tenant=tenant).select_related("title", "location")
    statuses = [s for s in (params.get("status") or "").split(",") if s]
    if statuses:
        if not set(statuses) <= set(CopyStatus.values):
            errors.setdefault("status", []).append("Choose copy statuses.")
        else:
            qs = qs.filter(status__in=statuses)
    location = _id(params, "location", errors)
    if location:
        qs = qs.filter(location_id=location)
    category = _id(params, "category", errors)
    if category:
        qs = qs.filter(Q(title__category_id=category) | Q(title__category__parent_id=category))
    title = _id(params, "title", errors)
    if title:
        qs = qs.filter(title_id=title)
    acquired_from = _date(params, "acquired_from", errors)
    acquired_to = _date(params, "acquired_to", errors)
    if acquired_from:
        qs = qs.filter(acquired_on__gte=acquired_from)
    if acquired_to:
        qs = qs.filter(acquired_on__lte=acquired_to)
    source = params.get("source")
    if source:
        if source not in CopySource.values:
            errors.setdefault("source", []).append("Choose one of the options.")
        else:
            qs = qs.filter(source=source)
    if params.get("price_missing") in ("true", "1"):
        qs = qs.filter(price__isnull=True)
    not_seen = _date(params, "not_seen_since", errors)
    if not_seen:
        qs = qs.filter(Q(last_seen_on__lt=not_seen) | Q(last_seen_on__isnull=True))
    ordering = params.get("ordering") or "accession"
    if ordering not in COPY_ORDERINGS:
        errors.setdefault("ordering", []).append("Choose accession or title.")
    if errors:
        raise ValidationFailed(errors)
    term = (params.get("q") or "").strip()
    if term:
        key = codes.number_key(term)
        qs = qs.annotate(_k=Upper("accession_number"), _b=Upper("barcode")).filter(
            Q(_k__startswith=key) | Q(_b=key) | Q(title__search_text__contains=term.lower())
        )
    return qs.order_by(*COPY_ORDERINGS[ordering])


def title_detail(tenant: Any, title_id: Any) -> LibraryTitle | None:
    pk = _uuid(title_id)
    if pk is None:
        return None
    return LibraryTitle.objects.filter(tenant=tenant, pk=pk).select_related("category").first()


def title_copies(title: LibraryTitle) -> list[LibraryCopy]:
    return list(
        LibraryCopy.objects.filter(tenant_id=title.tenant_id, title=title)
        .select_related("location", "title")
        .order_by("accession_sort", "id")
    )


def copy_detail(tenant: Any, copy_id: Any) -> LibraryCopy | None:
    pk = _uuid(copy_id)
    if pk is None:
        return None
    return (
        LibraryCopy.objects.filter(tenant=tenant, pk=pk)
        .select_related("title", "location")
        .prefetch_related("events")
        .first()
    )


def lookup(tenant: Any, code: str) -> dict[str, Any]:
    """BR-8: exact accession number, then barcode, then (B07) member number,
    then a valid ISBN; the first hit wins. Never raises `library_code_ambiguous`
    — a clash is refused when the second record is created."""
    found = codes.classify(code or "")
    if found.number_key:
        for column in ("accession_number", "barcode"):
            copy = (
                LibraryCopy.objects.annotate(k=Upper(column))
                .filter(tenant=tenant, k=found.number_key)
                .select_related("title", "location")
                .first()
            )
            if copy is not None:
                return {"kind": "copy", "copy": copy}
    if found.isbn13:
        titles = list(
            LibraryTitle.objects.filter(tenant=tenant, isbn13=found.isbn13)
            .select_related("category")
            .order_by(Lower("title"), "id")
        )
        if titles:
            return {"kind": "isbn", "titles": titles}
    return {"kind": "none"}


def categories(tenant: Any) -> list[tuple[LibraryCategory, int]]:
    rows = list(
        LibraryCategory.objects.filter(tenant=tenant).order_by("sort_order", Lower("name"), "id")
    )
    counts = dict(
        LibraryTitle.objects.filter(tenant=tenant, category__isnull=False)
        .values("category")
        .annotate(n=Count("id"))
        .values_list("category", "n")
    )
    return [(row, counts.get(row.pk, 0)) for row in rows]


def locations(tenant: Any) -> list[tuple[LibraryLocation, int]]:
    rows = list(
        LibraryLocation.objects.filter(tenant=tenant).order_by("sort_order", Upper("code"), "id")
    )
    counts = dict(
        LibraryCopy.objects.filter(tenant=tenant, location__isnull=False)
        .exclude(status=CopyStatus.WITHDRAWN)
        .values("location")
        .annotate(n=Count("id"))
        .values_list("location", "n")
    )
    return [(row, counts.get(row.pk, 0)) for row in rows]
