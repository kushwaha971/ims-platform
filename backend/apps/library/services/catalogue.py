"""Catalogue writes: titles, copies, categories, locations (LIB-02, task B05).

Numbers (BR-1–BR-3). Automatic numbers come from `allocate_counter(kind=
"library_accession")` and the sequence row is locked LAST (L4), after the title
and before nothing else contended, so a rolled-back create returns its numbers
and the series has no gap. Typed numbers are validated (B04), checked against
the register — including withdrawn copies, whose numbers are never reused — and
the largest all-digit one at or above the counter raises it to that number + 1,
also last, so the next automatic number never collides with a typed one.

A typed all-digit number the counter can never reach (2,147,483,647 and above,
`MAX_NEXT_NUMBER`) does not raise it: the counter's own column cannot hold the
number + 1, and it cannot collide either, because the counter stops below it
(B04 QA note 1). The number is accepted as typed.

Clashes are found twice: by a read before the insert, for the details the
409 names (`number`, `copy_id`, `title`), and by the unique index under a
savepoint, for the race between two devices typing the same number.
"""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.db.models.functions import Upper
from django.utils import timezone

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.dates import tenant_today
from apps.common.exceptions import BusinessRuleViolation, NotFound, StaleVersion, ValidationFailed
from apps.library.constants import (
    BARCODE_MAX,
    CALL_NUMBER_MAX,
    CATEGORY_NAME_MAX,
    EDITION_MAX,
    LANGUAGE_MAX,
    LOCATION_CODE_MAX,
    LOCATION_NAME_MAX,
    LOCATION_TEXT_MAX,
    MAX_COPIES_PER_REQUEST,
    NOTE_MAX,
    PUBLISHER_MAX,
    SOURCE_NOTE_MAX,
    TITLE_MAX,
    VOLUME_LABEL_MAX,
    YEAR_MIN,
    CopyCondition,
    CopyEventReason,
    CopySource,
    CopyStatus,
    MaterialType,
    TitleStatus,
    WithdrawReason,
)
from apps.library.models import (
    LibraryCategory,
    LibraryCopy,
    LibraryCopyEvent,
    LibraryLocation,
    LibraryMembership,
    LibraryTitle,
)
from apps.library.services import codes, copy_status, isbn, numbering
from apps.library.services.fields import Errors as _Errors
from apps.library.services.fields import boolean as _bool
from apps.library.services.fields import choice as _choice
from apps.library.services.fields import date as _date
from apps.library.services.fields import money as _money
from apps.library.services.fields import owned as _owned
from apps.library.services.fields import text as _text
from apps.library.services.fields import uuid_or_none as _uuid
from apps.platform_app.services import sequences

ACCESSION_KIND = "library_accession"
NUMBER_MESSAGE = codes.MESSAGE

# ── Title fields ─────────────────────────────────────────────────────────────

_TITLE_TEXT = {
    "title": TITLE_MAX,
    "subtitle": TITLE_MAX,
    "authors": TITLE_MAX,
    "publisher": PUBLISHER_MAX,
    "edition": EDITION_MAX,
    "language": LANGUAGE_MAX,
    "call_number": CALL_NUMBER_MAX,
    "keywords": TITLE_MAX,
}
TITLE_FIELDS = (*_TITLE_TEXT, "isbn", "year", "category_id", "material_type", "notes")


def _clean_title(tenant: Any, data: dict, *, partial: bool, errors: _Errors) -> dict:
    out: dict[str, Any] = {}
    for field, limit in _TITLE_TEXT.items():
        if partial and field not in data:
            continue
        value = _text(errors, data, field, limit, required=field == "title")
        if value is not None:
            out[field] = value
    if not partial or "notes" in data:
        notes = data.get("notes") or ""
        if not isinstance(notes, str):
            errors.add("notes", "Enter text.")
        else:
            out["notes"] = notes.strip()
    if not partial or "isbn" in data:
        raw = data.get("isbn")
        if raw in (None, ""):
            out["isbn13"] = None
        else:
            normal = isbn.to_isbn13(raw) if isinstance(raw, str) else None
            if normal is None:
                errors.add("isbn13", "This ISBN's check digit is wrong.")
            else:
                out["isbn13"] = normal
    if not partial or "year" in data:
        year = data.get("year")
        if year in (None, ""):
            out["year"] = None
        else:
            highest = tenant_today(tenant).year + 1
            if (
                isinstance(year, bool)
                or not isinstance(year, int)
                or not (YEAR_MIN <= year <= highest)
            ):
                errors.add("year", f"Enter a year between {YEAR_MIN} and {highest}.")
            else:
                out["year"] = year
    if not partial or "category_id" in data:
        category = _owned(LibraryCategory, tenant, data.get("category_id"), errors, "category_id")
        if category is not None or data.get("category_id") in (None, ""):
            out["category"] = category
    if not partial or "material_type" in data:
        material = _choice(errors, data, "material_type", MaterialType, MaterialType.BOOK)
        if material is not None:
            out["material_type"] = material
    return out


# ── Copies block ─────────────────────────────────────────────────────────────


def _clean_copies(tenant: Any, block: Any) -> dict:
    """The `copies` object of a create or an add (EC-1: refused before any write)."""
    errors = _Errors()
    if not isinstance(block, dict):
        raise ValidationFailed({"copies": ["Say how many copies to add."]})
    count = block.get("count")
    if (
        isinstance(count, bool)
        or not isinstance(count, int)
        or not (1 <= count <= MAX_COPIES_PER_REQUEST)
    ):
        errors.add("copies.count", f"Add at most {MAX_COPIES_PER_REQUEST} copies at a time.")
    numbers = block.get("numbers")
    typed: list[str] | None = None
    if numbers not in (None, []):
        if not isinstance(numbers, list):
            errors.add("copies.numbers", "Each copy needs its own number.")
        else:
            typed = []
            for raw in numbers:
                try:
                    typed.append(codes.validate_number(raw if isinstance(raw, str) else ""))
                except codes.InvalidNumber as exc:
                    errors.add("copies.numbers", exc.message)
                    break
            keys = [codes.number_key(n) for n in typed]
            if len(set(keys)) != len(keys) or (isinstance(count, int) and len(typed) != count):
                errors.add("copies.numbers", "Each copy needs its own number.")
    cleaned = {
        "count": count,
        "numbers": typed,
        "location": _owned(
            LibraryLocation, tenant, block.get("location_id"), errors, "copies.location_id"
        ),
        "location_text": _text(errors, block, "location_text", LOCATION_TEXT_MAX),
        "price": _money(errors, block, "price"),
        "acquired_on": _date(errors, block, "acquired_on"),
        "source": _choice(errors, block, "source", CopySource, CopySource.BOUGHT),
        "source_note": _text(errors, block, "source_note", SOURCE_NOTE_MAX),
        "is_reference": _bool(errors, block, "is_reference"),
        "volume_label": _text(errors, block, "volume_label", VOLUME_LABEL_MAX),
    }
    errors.raise_if_any()
    return cleaned


def _taken(tenant: Any, keys: list[str], *, exclude_copy: Any = None) -> None:
    """409 `library_accession_taken` for the first key already in the register
    (withdrawn copies included, FR-5), or `library_code_ambiguous` when it is
    another copy's barcode (BR-8)."""
    if not keys:
        return
    qs = LibraryCopy.objects.filter(tenant=tenant).annotate(key=Upper("accession_number"))
    if exclude_copy is not None:
        qs = qs.exclude(pk=exclude_copy)
    clash = qs.filter(key__in=keys).select_related("title").order_by("accession_sort").first()
    if clash is not None:
        raise BusinessRuleViolation(
            "library_accession_taken",
            f"{clash.accession_number} is already {clash.title.title}.",
            details={
                "number": clash.accession_number,
                "copy_id": str(clash.id),
                "title": clash.title.title,
            },
        )
    barcode_clash = (
        LibraryCopy.objects.filter(tenant=tenant)
        .annotate(code=Upper("barcode"))
        .filter(code__in=keys)
    )
    if exclude_copy is not None:
        barcode_clash = barcode_clash.exclude(pk=exclude_copy)
    row = barcode_clash.first()
    if row is not None:
        raise BusinessRuleViolation(
            "library_code_ambiguous",
            "This code is already used by another record.",
            details={"code": row.barcode, "matches": [{"kind": "copy", "id": str(row.id)}]},
        )
    _member_clash(tenant, keys)


def _member_clash(tenant: Any, keys: list[str]) -> None:
    """BR-8 (B07): a copy's number or barcode may not be a member's number — the counter's
    scan would open the copy and never the member."""
    member = (
        LibraryMembership.objects.filter(tenant=tenant)
        .annotate(k=Upper("member_number"))
        .filter(k__in=keys)
        .first()
    )
    if member is not None:
        raise BusinessRuleViolation(
            "library_code_ambiguous",
            "This code is already used by another record.",
            details={
                "code": member.member_number,
                "matches": [{"kind": "member", "id": str(member.id)}],
            },
        )


def _barcode_clash(tenant: Any, barcode: str, *, exclude_copy: Any = None) -> None:
    """A new barcode may not be another copy's accession number (BR-8); a second
    copy's equal barcode is the unique index's (`uq_library_copy_barcode`)."""
    key = barcode.upper()
    qs = LibraryCopy.objects.filter(tenant=tenant).annotate(k=Upper("accession_number"))
    if exclude_copy is not None:
        qs = qs.exclude(pk=exclude_copy)
    row = qs.filter(k=key).first()
    if row is not None:
        raise BusinessRuleViolation(
            "library_code_ambiguous",
            "This code is already used by another record.",
            details={"code": barcode, "matches": [{"kind": "copy", "id": str(row.id)}]},
        )
    other = LibraryCopy.objects.filter(tenant=tenant).annotate(k=Upper("barcode")).filter(k=key)
    if exclude_copy is not None:
        other = other.exclude(pk=exclude_copy)
    if other.exists():
        raise ValidationFailed({"barcode": ["Another copy already has this barcode."]})
    _member_clash(tenant, [key])


def _counter_prefix(tenant: Any) -> str:
    return numbering.counter_prefix(tenant, ACCESSION_KIND)


def _raise_for_typed(ctx: Any, numbers: list[str]) -> None:
    """BR-2/BR-3 — the shared rule (`services/numbering.py`), for the accession counter."""
    numbering.raise_for_typed(ctx, ACCESSION_KIND, numbers)


def _counter_numbers(tenant: Any, count: int) -> list[str]:
    """`count` numbers from the counter, none equal to an existing barcode or member number.

    BR-8 (QA-B05-1): a lookup tries the accession number before the barcode, so
    a counter number equal to another copy's barcode would make that copy
    unreachable by its label. Such a number is passed over (it is spent as a
    label already) and the next one taken; the sequence row stays the last
    lock (L4).
    """
    numbers: list[str] = []
    while len(numbers) < count:
        wanted = count - len(numbers)
        batch = [
            sequences.allocate_counter(tenant=tenant, kind=ACCESSION_KIND) for _ in range(wanted)
        ]
        keys = [n.upper() for n in batch]
        labels = set(
            LibraryCopy.objects.filter(tenant=tenant, barcode__isnull=False)
            .annotate(code=Upper("barcode"))
            .filter(code__in=keys)
            .values_list("code", flat=True)
        ) | set(  # B07: a member's number is spent too (BR-8)
            LibraryMembership.objects.filter(tenant=tenant)
            .annotate(code=Upper("member_number"))
            .filter(code__in=keys)
            .values_list("code", flat=True)
        )
        numbers += [n for n in batch if n.upper() not in labels]
    return numbers


def _insert_copies(ctx: Any, title: LibraryTitle, block: dict) -> list[LibraryCopy]:
    """Insert `block["count"]` copies of `title` with their events and caches."""
    tenant = ctx.tenant
    typed = block["numbers"]
    if typed is not None:
        _taken(tenant, [codes.number_key(n) for n in typed])
        numbers = typed
    else:
        # The sequence row is the last lock taken (L4).
        numbers = _counter_numbers(tenant, block["count"])
    rows = [
        LibraryCopy(
            tenant=tenant,
            created_by=getattr(ctx, "actor", None),
            title=title,
            accession_number=number,
            accession_sort=codes.natural_sort_key(number),
            location=block["location"],
            location_text=block["location_text"] or "",
            is_reference=block["is_reference"],
            acquired_on=block["acquired_on"],
            source=block["source"],
            source_note=block["source_note"] or "",
            price=block["price"],
            volume_label=block["volume_label"] or "",
        )
        for number in numbers
    ]
    try:
        with transaction.atomic():
            LibraryCopy.objects.bulk_create(rows)
    except IntegrityError:
        # Another device took one of these numbers between the read and the
        # insert: name it from the register, as the read would have.
        _taken(tenant, [codes.number_key(n) for n in numbers])
        raise
    copy_status.record_new_copies(ctx=ctx, title=title, copies=rows, on_date=tenant_today(tenant))
    if typed is not None:
        _raise_for_typed(ctx, typed)
    return rows


def _isbn_warnings(tenant: Any, isbn13: str | None, *, exclude: Any = None) -> list[dict]:
    """BR-5: a duplicate ISBN is a warning (reprints, sets), never an error."""
    if not isbn13:
        return []
    qs = LibraryTitle.objects.filter(tenant=tenant, isbn13=isbn13)
    if exclude is not None:
        qs = qs.exclude(pk=exclude)
    return [{"code": "isbn_exists", "title_id": str(pk)} for pk in qs.values_list("pk", flat=True)]


# ── Titles ───────────────────────────────────────────────────────────────────


@transaction.atomic
def create_title(*, ctx: Any, data: Any) -> tuple[LibraryTitle, list[str], list[dict]]:
    """`POST /library/titles`: the work and its first copies, in one transaction."""
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = _Errors()
    fields = _clean_title(ctx.tenant, data, partial=False, errors=errors)
    try:
        block = _clean_copies(ctx.tenant, data.get("copies"))
    except ValidationFailed as exc:
        for key, messages in exc.details.items():
            for message in messages:
                errors.add(key, message)
        block = None
    errors.raise_if_any()
    warnings = _isbn_warnings(ctx.tenant, fields.get("isbn13"))
    title = LibraryTitle.objects.create(
        tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **fields
    )
    copies = _insert_copies(ctx, title, block)
    numbers = [c.accession_number for c in copies]
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_TITLE_CREATED,
        entity_type="library_title",
        entity_id=title.id,
        after={"title": title.title, "isbn13": title.isbn13, "copies": numbers},
    )
    title.refresh_from_db()
    return title, numbers, warnings


def _locked_title(tenant: Any, title_id: Any) -> LibraryTitle:
    pk = _uuid(title_id)
    row = (
        LibraryTitle.objects.select_for_update().filter(tenant=tenant, pk=pk).first()
        if pk
        else None
    )
    if row is None:
        raise NotFound()
    return row


def _locked_copy(tenant: Any, copy_id: Any) -> LibraryCopy:
    pk = _uuid(copy_id)
    row = (
        LibraryCopy.objects.select_for_update()
        .select_related("title")
        .filter(tenant=tenant, pk=pk)
        .first()
        if pk
        else None
    )
    if row is None:
        raise NotFound()
    return row


def _version(data: Any) -> int:
    version = data.get("version") if isinstance(data, dict) else None
    if isinstance(version, bool) or not isinstance(version, int):
        raise ValidationFailed({"version": ["This field is required."]})
    return version


@transaction.atomic
def add_copies(*, ctx: Any, title_id: Any, data: Any) -> list[LibraryCopy]:
    """`POST /library/titles/{id}/copies`. An archived title is restored by
    getting a copy again: it is in stock."""
    block = _clean_copies(ctx.tenant, data)
    # Lock order: copies are new rows; the title row is touched by F() only.
    pk = _uuid(title_id)
    title = LibraryTitle.objects.filter(tenant=ctx.tenant, pk=pk).first() if pk else None
    if title is None:
        raise NotFound()
    copies = _insert_copies(ctx, title, block)
    if title.status == TitleStatus.ARCHIVED:
        LibraryTitle.objects.filter(pk=title.pk).update(status=TitleStatus.ACTIVE)
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_COPY_CREATED,
        entity_type="library_title",
        entity_id=title.id,
        after={"copies": [c.accession_number for c in copies]},
    )
    return copies


@transaction.atomic
def update_title(*, ctx: Any, title_id: Any, data: Any) -> tuple[LibraryTitle, list[dict]]:
    """`PATCH /library/titles/{id}` with `version` (409 `stale_version`)."""
    version = _version(data)
    errors = _Errors()
    fields = _clean_title(ctx.tenant, data, partial=True, errors=errors)
    errors.raise_if_any()
    title = _locked_title(ctx.tenant, title_id)
    if title.version != version:
        raise StaleVersion(title.version)
    before = {f: getattr(title, f) for f in fields}
    changed = [f for f, v in fields.items() if getattr(title, f) != v]
    if not changed:
        return title, []
    material_changed = "material_type" in changed
    for field in changed:
        setattr(title, field, fields[field])
    title.version += 1
    title.save(update_fields=[*changed, "version", "updated_at"])
    if material_changed:  # G15: which copies are lendable changed with no status moving
        copy_status.recount_titles(title_ids=[title.pk])
    old, new = diff_fields(
        {k: getattr(v, "pk", v) for k, v in before.items()},
        {f: getattr(getattr(title, f), "pk", getattr(title, f)) for f in changed},
        fields=changed,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_TITLE_UPDATED,
        entity_type="library_title",
        entity_id=title.id,
        before=old,
        after=new,
    )
    title.refresh_from_db()
    warnings = _isbn_warnings(ctx.tenant, title.isbn13, exclude=title.pk)
    return title, warnings if "isbn13" in changed else []


@transaction.atomic
def archive_title(*, ctx: Any, title_id: Any, auto: bool = False) -> LibraryTitle:
    """FR-12: only when every copy is withdrawn (`copies_total` counts the rest)."""
    title = _locked_title(ctx.tenant, title_id)
    if title.status == TitleStatus.ARCHIVED:
        return title
    if title.copies_total:
        raise BusinessRuleViolation(
            "library_title_has_copies",
            "Withdraw this title's copies first.",
            details={"count": title.copies_total},
        )
    title.status = TitleStatus.ARCHIVED
    title.save(update_fields=["status", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_TITLE_ARCHIVED,
        entity_type="library_title",
        entity_id=title.id,
        metadata={"auto": auto},
    )
    return title


@transaction.atomic
def restore_title(*, ctx: Any, title_id: Any) -> LibraryTitle:
    title = _locked_title(ctx.tenant, title_id)
    if title.status == TitleStatus.ACTIVE:
        return title
    title.status = TitleStatus.ACTIVE
    title.save(update_fields=["status", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_TITLE_RESTORED,
        entity_type="library_title",
        entity_id=title.id,
    )
    return title


# ── Copies ───────────────────────────────────────────────────────────────────

COPY_FIELDS = (
    "accession_number",
    "barcode",
    "location_id",
    "location_text",
    "price",
    "condition",
    "volume_label",
    "is_reference",
    "acquired_on",
    "source",
    "source_note",
)


@transaction.atomic
def update_copy(*, ctx: Any, copy_id: Any, data: Any) -> LibraryCopy:
    """`PATCH /library/copies/{id}` with `version`. The number is frozen once
    the copy has ever been issued (FR-5); status is never written here."""
    version = _version(data)
    errors = _Errors()
    out: dict[str, Any] = {}
    tenant = ctx.tenant
    if "accession_number" in data:
        try:
            raw = data["accession_number"]
            out["accession_number"] = codes.validate_number(raw if isinstance(raw, str) else "")
        except codes.InvalidNumber as exc:
            errors.add("accession_number", exc.message)
    if "barcode" in data:
        barcode = _text(errors, data, "barcode", BARCODE_MAX)
        if barcode is not None:
            out["barcode"] = barcode or None
    if "location_id" in data:
        location = _owned(LibraryLocation, tenant, data.get("location_id"), errors, "location_id")
        if location is not None or data.get("location_id") in (None, ""):
            out["location"] = location
    for field, limit in (
        ("location_text", LOCATION_TEXT_MAX),
        ("volume_label", VOLUME_LABEL_MAX),
        ("source_note", SOURCE_NOTE_MAX),
    ):
        if field in data:
            value = _text(errors, data, field, limit)
            if value is not None:
                out[field] = value
    if "price" in data:
        before = len(errors)
        price = _money(errors, data, "price")
        if len(errors) == before:
            out["price"] = price
    if "condition" in data:
        value = _choice(errors, data, "condition", CopyCondition, CopyCondition.GOOD)
        if value is not None:
            out["condition"] = value
    if "source" in data:
        value = _choice(errors, data, "source", CopySource, CopySource.BOUGHT)
        if value is not None:
            out["source"] = value
    if "is_reference" in data:
        value = _bool(errors, data, "is_reference")
        if value is not None:
            out["is_reference"] = value
    if "acquired_on" in data:
        before = len(errors)
        value = _date(errors, data, "acquired_on")
        if len(errors) == before:
            out["acquired_on"] = value
    errors.raise_if_any()

    copy = _locked_copy(tenant, copy_id)
    if copy.version != version:
        raise StaleVersion(copy.version)
    changed = [f for f, v in out.items() if getattr(copy, f) != v]
    number_changed = "accession_number" in changed
    if "accession_number" in changed and copy.issued_ever:
        raise BusinessRuleViolation(
            "library_accession_frozen",
            "This copy has been issued, so its number cannot change.",
            details={"copy_id": str(copy.id)},
        )
    if number_changed:
        _taken(tenant, [codes.number_key(out["accession_number"])], exclude_copy=copy.pk)
    if "barcode" in changed and out["barcode"]:
        _barcode_clash(tenant, out["barcode"], exclude_copy=copy.pk)
    if not changed:
        return copy
    before = {f: getattr(getattr(copy, f), "pk", getattr(copy, f)) for f in changed}
    old_number = copy.accession_number
    for field in changed:
        setattr(copy, field, out[field])
    update = [*changed]
    if number_changed:
        copy.accession_sort = codes.natural_sort_key(copy.accession_number)
        update.append("accession_sort")
    copy.version += 1
    try:
        with transaction.atomic():
            copy.save(update_fields=[*update, "version", "updated_at"])
    except IntegrityError:
        if number_changed:
            _taken(tenant, [codes.number_key(copy.accession_number)], exclude_copy=copy.pk)
        raise ValidationFailed({"barcode": ["Another copy already has this barcode."]}) from None
    if number_changed:
        LibraryCopyEvent.objects.create(
            tenant=tenant,
            created_by=getattr(ctx, "actor", None),
            copy=copy,
            from_status=copy.status,
            to_status=copy.status,
            reason_code=CopyEventReason.EDITED_NUMBER,
            note=f"{old_number} → {copy.accession_number}"[:NOTE_MAX],
            on_date=tenant_today(tenant),
        )
    if "is_reference" in changed:
        # Lock order copy → title (as `move_copy`), so a loan or return on
        # another copy cannot interleave with the recount and be overwritten.
        LibraryTitle.objects.select_for_update().filter(pk=copy.title_id).first()
        copy_status.recount_titles(title_ids=[copy.title_id])
    old, new = diff_fields(
        before,
        {f: getattr(getattr(copy, f), "pk", getattr(copy, f)) for f in changed},
        fields=changed,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_COPY_UPDATED,
        entity_type="library_copy",
        entity_id=copy.id,
        before=old,
        after=new,
    )
    if number_changed:
        _raise_for_typed(ctx, [copy.accession_number])
    return copy


@transaction.atomic
def withdraw_copy(*, ctx: Any, copy_id: Any, data: Any) -> LibraryCopy:
    """FR-6/BR-7: allowed from available, in repair, lost and missing. The last
    copy's withdrawal archives the title (FR-12)."""
    data = data if isinstance(data, dict) else {}
    errors = _Errors()
    reason = data.get("reason_code")
    if reason not in WithdrawReason.values:
        errors.add("reason_code", "Say why this copy is withdrawn.")
    note = _text(errors, data, "note", NOTE_MAX) or ""
    if reason == WithdrawReason.OTHER and len(note) < 3:
        errors.add("note", "Say why this copy is withdrawn.")
    errors.raise_if_any()
    copy = _locked_copy(ctx.tenant, copy_id)
    if copy.status == CopyStatus.ON_LOAN:
        # `details.loan_id` lands with the loans table (B09); a key this code
        # cannot fill is omitted rather than sent as null (PTY-03).
        raise BusinessRuleViolation(
            "library_copy_on_loan", "This copy is on loan. Take it back first.", details={}
        )
    if copy.status not in (
        CopyStatus.AVAILABLE,
        CopyStatus.IN_REPAIR,
        CopyStatus.LOST,
        CopyStatus.MISSING,
    ):
        raise BusinessRuleViolation(
            "library_copy_unavailable",
            "This copy is not available.",
            details={"status": copy.status},
        )
    copy = copy_status.move_copy(
        ctx=ctx,
        copy=copy,
        to_status=CopyStatus.WITHDRAWN,
        reason_code=CopyEventReason.WITHDRAWN,
        on_date=tenant_today(ctx.tenant),
        note=note,
        withdrawn_reason=reason,
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_COPY_WITHDRAWN,
        entity_type="library_copy",
        entity_id=copy.id,
        after={"reason_code": reason, "note": note},
    )
    title = LibraryTitle.objects.get(pk=copy.title_id)
    if title.copies_total == 0 and title.status == TitleStatus.ACTIVE:
        archive_title(ctx=ctx, title_id=title.pk, auto=True)
    return copy


def _simple_move(
    *, ctx: Any, copy_id: Any, data: Any, allowed_from: str, to: str, reason: str, action: str
) -> LibraryCopy:
    data = data if isinstance(data, dict) else {}
    errors = _Errors()
    note = _text(errors, data, "note", NOTE_MAX) or ""
    errors.raise_if_any()
    copy = _locked_copy(ctx.tenant, copy_id)
    if copy.status != allowed_from:
        raise BusinessRuleViolation(
            "library_copy_unavailable",
            "This copy is not available.",
            details={"status": copy.status},
        )
    copy = copy_status.move_copy(
        ctx=ctx,
        copy=copy,
        to_status=to,
        reason_code=reason,
        on_date=tenant_today(ctx.tenant),
        note=note,
    )
    write_audit(ctx=ctx, action=action, entity_type="library_copy", entity_id=copy.id)
    return copy


@transaction.atomic
def repair_copy(*, ctx: Any, copy_id: Any, data: Any) -> LibraryCopy:
    return _simple_move(
        ctx=ctx,
        copy_id=copy_id,
        data=data,
        allowed_from=CopyStatus.AVAILABLE,
        to=CopyStatus.IN_REPAIR,
        reason=CopyEventReason.REPAIR,
        action=AuditAction.LIBRARY_COPY_REPAIRED,
    )


@transaction.atomic
def back_to_shelf(*, ctx: Any, copy_id: Any, data: Any) -> LibraryCopy:
    return _simple_move(
        ctx=ctx,
        copy_id=copy_id,
        data=data,
        allowed_from=CopyStatus.IN_REPAIR,
        to=CopyStatus.AVAILABLE,
        reason=CopyEventReason.BACK_TO_SHELF,
        action=AuditAction.LIBRARY_COPY_BACK_TO_SHELF,
    )


# ── Categories ───────────────────────────────────────────────────────────────


def _category(tenant: Any, category_id: Any) -> LibraryCategory:
    pk = _uuid(category_id)
    row = LibraryCategory.objects.filter(tenant=tenant, pk=pk).first() if pk else None
    if row is None:
        raise NotFound()
    return row


def _name_taken(tenant: Any, name: str, *, exclude: Any = None) -> bool:
    qs = LibraryCategory.objects.filter(tenant=tenant, name__iexact=name)
    if exclude is not None:
        qs = qs.exclude(pk=exclude)
    return qs.exists()


def _clean_category(tenant: Any, data: Any, *, partial: bool, current: Any = None) -> dict:
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = _Errors()
    out: dict[str, Any] = {}
    if not partial or "name" in data:
        name = _text(errors, data, "name", CATEGORY_NAME_MAX, required=True)
        if name is not None:
            if _name_taken(tenant, name, exclude=getattr(current, "pk", None)):
                errors.add("name", "A category with this name already exists.")
            else:
                out["name"] = name
    if not partial or "parent_id" in data:
        parent = _owned(LibraryCategory, tenant, data.get("parent_id"), errors, "parent_id")
        if parent is not None:
            if parent.parent_id is not None:
                errors.add("parent_id", "A sub-category cannot have its own sub-categories.")
            elif current is not None and parent.pk == current.pk:
                errors.add("parent_id", "A category cannot be inside itself.")
            elif current is not None and current.children.filter(deleted_at__isnull=True).exists():
                errors.add("parent_id", "This category has sub-categories, so it stays on top.")
            else:
                out["parent"] = parent
        elif data.get("parent_id") in (None, ""):
            out["parent"] = None
    if not partial or "sort_order" in data:
        order = data.get("sort_order", 0)
        if isinstance(order, bool) or not isinstance(order, int) or not -32768 <= order <= 32767:
            errors.add("sort_order", "Enter a whole number.")
        else:
            out["sort_order"] = order
    if "is_active" in data or not partial:
        active = _bool(errors, data, "is_active", True)
        if active is not None:
            out["is_active"] = active
    errors.raise_if_any()
    return out


@transaction.atomic
def create_category(*, ctx: Any, data: Any) -> LibraryCategory:
    fields = _clean_category(ctx.tenant, data, partial=False)
    try:
        with transaction.atomic():
            row = LibraryCategory.objects.create(
                tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **fields
            )
    except IntegrityError:
        raise ValidationFailed({"name": ["A category with this name already exists."]}) from None
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CATEGORY_CREATED,
        entity_type="library_category",
        entity_id=row.id,
        after={"name": row.name, "parent_id": row.parent_id},
    )
    return row


@transaction.atomic
def update_category(*, ctx: Any, category_id: Any, data: Any) -> LibraryCategory:
    row = _category(ctx.tenant, category_id)
    fields = _clean_category(ctx.tenant, data, partial=True, current=row)
    changed = [f for f, v in fields.items() if getattr(row, f) != v]
    if not changed:
        return row
    before = {f: getattr(getattr(row, f), "pk", getattr(row, f)) for f in changed}
    for field in changed:
        setattr(row, field, fields[field])
    try:
        with transaction.atomic():
            row.save(update_fields=[*changed, "updated_at"])
    except IntegrityError:
        raise ValidationFailed({"name": ["A category with this name already exists."]}) from None
    old, new = diff_fields(
        before, {f: getattr(getattr(row, f), "pk", getattr(row, f)) for f in changed}
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CATEGORY_UPDATED,
        entity_type="library_category",
        entity_id=row.id,
        before=old,
        after=new,
    )
    return row


@transaction.atomic
def delete_category(*, ctx: Any, category_id: Any) -> None:
    """FR-8: deleted only while unused; a used one is deactivated instead."""
    row = _category(ctx.tenant, category_id)
    used = LibraryTitle.objects.filter(tenant=ctx.tenant, category=row).count()
    if used:
        raise BusinessRuleViolation(
            "library_category_in_use", "Titles still use this category.", details={"count": used}
        )
    if row.children.filter(deleted_at__isnull=True).exists():
        raise ValidationFailed({"non_field_errors": ["Move or delete its sub-categories first."]})
    row.deleted_at = timezone.now()
    row.save(update_fields=["deleted_at", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CATEGORY_DELETED,
        entity_type="library_category",
        entity_id=row.id,
        before={"name": row.name},
    )


@transaction.atomic
def merge_category(*, ctx: Any, category_id: Any, data: Any) -> LibraryCategory:
    """Move every title (and sub-category) into `into_id`, then soft-delete."""
    row = _category(ctx.tenant, category_id)
    errors = _Errors()
    into = _owned(LibraryCategory, ctx.tenant, (data or {}).get("into_id"), errors, "into_id")
    if into is None and "into_id" not in errors:
        errors.add("into_id", "Choose the category to merge into.")
    if into is not None and into.pk == row.pk:
        errors.add("into_id", "Choose a different category.")
    children = row.children.filter(deleted_at__isnull=True)
    if into is not None and into.parent_id is not None and children.exists():
        errors.add("into_id", "Its sub-categories cannot move under a sub-category.")
    if into is not None and into.parent_id == row.pk:
        errors.add("into_id", "Choose a category that is not inside this one.")
    errors.raise_if_any()
    moved = LibraryTitle.objects.filter(tenant=ctx.tenant, category=row).update(category=into)
    children.update(parent=into)
    row.deleted_at = timezone.now()
    row.save(update_fields=["deleted_at", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_CATEGORY_MERGED,
        entity_type="library_category",
        entity_id=row.id,
        metadata={"into_id": str(into.pk), "titles_moved": moved},
    )
    return into


# ── Locations ────────────────────────────────────────────────────────────────


def _location(tenant: Any, location_id: Any) -> LibraryLocation:
    pk = _uuid(location_id)
    row = LibraryLocation.objects.filter(tenant=tenant, pk=pk).first() if pk else None
    if row is None:
        raise NotFound()
    return row


def _clean_location(tenant: Any, data: Any, *, partial: bool, current: Any = None) -> dict:
    if not isinstance(data, dict):
        raise ValidationFailed({"non_field_errors": ["Expected an object."]})
    errors = _Errors()
    out: dict[str, Any] = {}
    if not partial or "code" in data:
        code = _text(errors, data, "code", LOCATION_CODE_MAX, required=True)
        if code is not None:
            qs = LibraryLocation.objects.filter(tenant=tenant, code__iexact=code)
            if current is not None:
                qs = qs.exclude(pk=current.pk)
            if qs.exists():
                errors.add("code", "A location with this code already exists.")
            else:
                out["code"] = code
    if not partial or "name" in data:
        name = _text(errors, data, "name", LOCATION_NAME_MAX)
        if name is not None:
            out["name"] = name
    if not partial or "sort_order" in data:
        order = data.get("sort_order", 0)
        if isinstance(order, bool) or not isinstance(order, int) or not -32768 <= order <= 32767:
            errors.add("sort_order", "Enter a whole number.")
        else:
            out["sort_order"] = order
    if "is_active" in data or not partial:
        active = _bool(errors, data, "is_active", True)
        if active is not None:
            out["is_active"] = active
    errors.raise_if_any()
    return out


@transaction.atomic
def create_location(*, ctx: Any, data: Any) -> LibraryLocation:
    fields = _clean_location(ctx.tenant, data, partial=False)
    try:
        with transaction.atomic():
            row = LibraryLocation.objects.create(
                tenant=ctx.tenant, created_by=getattr(ctx, "actor", None), **fields
            )
    except IntegrityError:
        raise ValidationFailed({"code": ["A location with this code already exists."]}) from None
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOCATION_CREATED,
        entity_type="library_location",
        entity_id=row.id,
        after={"code": row.code, "name": row.name},
    )
    return row


@transaction.atomic
def update_location(*, ctx: Any, location_id: Any, data: Any) -> LibraryLocation:
    row = _location(ctx.tenant, location_id)
    fields = _clean_location(ctx.tenant, data, partial=True, current=row)
    changed = [f for f, v in fields.items() if getattr(row, f) != v]
    if not changed:
        return row
    before = {f: getattr(row, f) for f in changed}
    for field in changed:
        setattr(row, field, fields[field])
    try:
        with transaction.atomic():
            row.save(update_fields=[*changed, "updated_at"])
    except IntegrityError:
        raise ValidationFailed({"code": ["A location with this code already exists."]}) from None
    old, new = diff_fields(before, {f: getattr(row, f) for f in changed})
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOCATION_UPDATED,
        entity_type="library_location",
        entity_id=row.id,
        before=old,
        after=new,
    )
    return row


@transaction.atomic
def delete_location(*, ctx: Any, location_id: Any) -> None:
    """Deleted only while no copy on the shelf is kept there (withdrawn copies
    keep their history and do not count)."""
    row = _location(ctx.tenant, location_id)
    used = (
        LibraryCopy.objects.filter(tenant=ctx.tenant, location=row)
        .exclude(status=CopyStatus.WITHDRAWN)
        .count()
    )
    if used:
        raise BusinessRuleViolation(
            "library_location_in_use", "Copies are still kept here.", details={"count": used}
        )
    row.deleted_at = timezone.now()
    row.save(update_fields=["deleted_at", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.LIBRARY_LOCATION_DELETED,
        entity_type="library_location",
        entity_id=row.id,
        before={"code": row.code},
    )
