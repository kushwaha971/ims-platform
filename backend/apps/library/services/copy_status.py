"""The ONLY writer of `library_copy.status` (LIB-02 FR-7, BR-6; task B05).

Every status change goes through `move_copy`, which in one transaction locks
the copy, writes the immutable event row, moves the copy, and moves the
title's two caches by the difference with `F()`. The title's `version` is NOT
bumped: an issue or a return is not an edit of the title, and bumping it would
make a title editor open on another device answer 409 on every loan. The
copy's own `version` IS bumped — EC-4: editing a copy whose status another
device just changed must be refused.

Lock order (L4): the copy, then the title's `F()` update, never the title
first. `manage.py library_recount` re-derives both caches from the copies by
a different route, which is how the replay test knows this path is right.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable
from typing import Any

from django.db import transaction
from django.db.models import F

from apps.library.constants import CopyEventReason, CopyStatus, MaterialType
from apps.library.models import LibraryCopy, LibraryCopyEvent, LibraryTitle


def counts_in_total(status: str | None) -> int:
    """`copies_total`: every copy that is not withdrawn."""
    return int(status is not None and status != CopyStatus.WITHDRAWN)


def counts_available(status: str | None, *, is_reference: bool, material_type: str) -> int:
    """`copies_available` (G15): on the shelf AND lendable — neither the copy
    nor the title is a reference work. "Available to borrow", not "on shelf"."""
    return int(
        status == CopyStatus.AVAILABLE
        and not is_reference
        and material_type != MaterialType.REFERENCE
    )


def _shift_caches(title_id: Any, total: int, available: int) -> None:
    if total or available:
        LibraryTitle.objects.filter(pk=title_id).update(
            copies_total=F("copies_total") + total,
            copies_available=F("copies_available") + available,
        )


@transaction.atomic
def move_copy(
    *,
    ctx: Any,
    copy: LibraryCopy,
    to_status: str,
    reason_code: str,
    on_date: dt.date,
    note: str = "",
    source_type: str | None = None,
    source_id: Any = None,
    withdrawn_reason: str | None = None,
) -> LibraryCopy:
    """Move one copy to `to_status`, with its event and the title caches.

    The caller decides whether the move is allowed (each action has its own
    refusal and code); this function only guarantees that a move, once
    decided, is recorded whole. Leaving `withdrawn` clears the withdrawal
    fields, entering it sets them, which `ck_library_copy_withdrawn` requires.
    """
    if to_status not in CopyStatus.values or reason_code not in CopyEventReason.values:
        raise ValueError(f"Unknown copy status {to_status!r} or reason {reason_code!r}.")
    row = LibraryCopy.objects.select_for_update().get(pk=copy.pk)
    from_status = row.status
    # The title is locked after the copy (L4) and its material type read from
    # the locked row: a concurrent change to a reference title recounts under
    # this lock, so the delta below is computed against what it committed.
    material_type = (
        LibraryTitle.objects.select_for_update()
        .values_list("material_type", flat=True)
        .get(pk=row.title_id)
    )
    LibraryCopyEvent.objects.create(
        tenant_id=row.tenant_id,
        created_by=getattr(ctx, "actor", None),
        copy=row,
        from_status=from_status,
        to_status=to_status,
        reason_code=reason_code,
        note=note[:160],
        source_type=source_type,
        source_id=source_id,
        on_date=on_date,
    )
    row.status = to_status
    if to_status == CopyStatus.WITHDRAWN:
        row.withdrawn_on = on_date
        row.withdrawn_reason = withdrawn_reason
        row.withdrawn_note = note[:160]
    elif from_status == CopyStatus.WITHDRAWN:
        row.withdrawn_on = None
        row.withdrawn_reason = None
        row.withdrawn_note = ""
    row.version += 1
    row.save(
        update_fields=[
            "status",
            "withdrawn_on",
            "withdrawn_reason",
            "withdrawn_note",
            "version",
            "updated_at",
        ]
    )
    _shift_caches(
        row.title_id,
        counts_in_total(to_status) - counts_in_total(from_status),
        counts_available(to_status, is_reference=row.is_reference, material_type=material_type)
        - counts_available(from_status, is_reference=row.is_reference, material_type=material_type),
    )
    return row


def record_new_copies(
    *,
    ctx: Any,
    title: LibraryTitle,
    copies: Iterable[LibraryCopy],
    on_date: dt.date,
    reason_code: str = CopyEventReason.CREATED,
    source_type: str | None = None,
    source_id: Any = None,
) -> None:
    """The `created` (or `imported`) event of copies just inserted, and their
    share of the title caches. Called inside the inserting transaction."""
    copies = list(copies)
    LibraryCopyEvent.objects.bulk_create(
        [
            LibraryCopyEvent(
                tenant_id=copy.tenant_id,
                created_by=getattr(ctx, "actor", None),
                copy=copy,
                from_status=None,
                to_status=copy.status,
                reason_code=reason_code,
                source_type=source_type,
                source_id=source_id,
                on_date=on_date,
            )
            for copy in copies
        ]
    )
    _shift_caches(
        title.pk,
        sum(counts_in_total(c.status) for c in copies),
        sum(
            counts_available(
                c.status, is_reference=c.is_reference, material_type=title.material_type
            )
            for c in copies
        ),
    )


def recount_titles(*, tenant: Any = None, title_ids: Iterable[Any] | None = None) -> int:
    """Re-derive both caches from the copies by one set-based UPDATE.

    The independent route `library_recount` and the replay test use, and what
    a change of `is_reference` or of a title's material type calls, since
    those change which copies are lendable without any status moving.
    Returns how many titles changed.
    """
    from django.db import connection

    clauses, params = [], []
    if tenant is not None:
        clauses.append("t.tenant_id = %s")
        params.append(tenant.pk)
    if title_ids is not None:
        ids = list(title_ids)
        if not ids:
            return 0
        clauses.append("t.id = ANY(%s)")
        params.append(ids)
    where = (" AND " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        WITH derived AS (
            SELECT t.id,
                   COUNT(c.id) FILTER (WHERE c.status <> %s) AS total,
                   COUNT(c.id) FILTER (
                       WHERE c.status = %s AND NOT c.is_reference AND t.material_type <> %s
                   ) AS available
              FROM library_title t
              LEFT JOIN library_copy c ON c.title_id = t.id
             WHERE TRUE{where}
             GROUP BY t.id, t.material_type
        )
        UPDATE library_title t
           SET copies_total = d.total, copies_available = d.available
          FROM derived d
         WHERE t.id = d.id
           AND (t.copies_total <> d.total OR t.copies_available <> d.available)
    """
    with connection.cursor() as cursor:
        cursor.execute(
            sql,
            [CopyStatus.WITHDRAWN, CopyStatus.AVAILABLE, MaterialType.REFERENCE, *params],
        )
        return cursor.rowcount
