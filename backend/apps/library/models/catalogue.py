"""The catalogue: categories, locations, titles, copies, copy events (LIB-02 §5, task B05).

A title is the work; a copy is the physical book with one permanent accession
number. Three rules from the FRD are held by the database, not by hope:

* `uq_library_copy_accession` is on `upper(accession_number)` with NO
  soft-delete exclusion — a withdrawn copy's number stays taken for ever (FR-5).
* `ck_library_copy_withdrawn` ties `status = 'withdrawn'` to `withdrawn_on`.
* the title caches never go negative and never claim more available than total.

`accession_sort` is the B04 natural sort key, `varchar(160)` under C collation
(G12, G13): a glibc or ICU collation ignores `-` at the first level and would
reorder `4512-A` against `4512A`.

`copy.status` has exactly one writer, `services.copy_status`; the title caches
move with it in the same transaction (BR-6) and `manage.py library_recount`
re-derives them by a different route.
"""

from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models import F, Q, Value
from django.db.models.functions import Concat, Lower, Upper

from apps.common.db.fields import MoneyField
from apps.common.managers import AllObjectsManager, SoftDeleteManager
from apps.common.models import ImmutableModel, SoftDeleteModel, TenantModel
from apps.library.constants import (
    ACCESSION_MAX,
    ACCESSION_SORT_MAX,
    BARCODE_MAX,
    CALL_NUMBER_MAX,
    CATEGORY_NAME_MAX,
    EDITION_MAX,
    LANGUAGE_MAX,
    LOCATION_CODE_MAX,
    LOCATION_NAME_MAX,
    LOCATION_TEXT_MAX,
    NOTE_MAX,
    PUBLISHER_MAX,
    SOURCE_NOTE_MAX,
    SOURCE_TYPE_MAX,
    TITLE_MAX,
    VOLUME_LABEL_MAX,
    YEAR_MAX,
    YEAR_MIN,
    CopyCondition,
    CopyEventReason,
    CopySource,
    CopyStatus,
    MaterialType,
    TitleStatus,
    WithdrawReason,
)


def _in(field: str, choices: type[models.TextChoices]) -> Q:
    return Q(**{f"{field}__in": choices.values})


class LibraryCategory(TenantModel, SoftDeleteModel):
    """One level only: a parent has no parent (checked by the service, FR-8)."""

    name = models.CharField(max_length=CATEGORY_NAME_MAX)
    parent = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="children"
    )
    sort_order = models.SmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "library_category"
        constraints = [
            models.UniqueConstraint(
                F("tenant"),
                Lower("name"),
                condition=Q(deleted_at__isnull=True),
                name="uq_library_category_name",
            ),
            models.CheckConstraint(
                condition=~Q(parent=F("id")), name="ck_library_category_not_own_parent"
            ),
        ]


class LibraryLocation(TenantModel, SoftDeleteModel):
    code = models.CharField(max_length=LOCATION_CODE_MAX)
    name = models.CharField(max_length=LOCATION_NAME_MAX, default="", blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.SmallIntegerField(default=0)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "library_location"
        constraints = [
            models.UniqueConstraint(
                F("tenant"),
                Upper("code"),
                condition=Q(deleted_at__isnull=True),
                name="uq_library_location_code",
            ),
        ]


def _search_expression() -> Lower:
    """`lower(title || ' ' || subtitle || ' ' || authors || ' ' || publisher || ' ' || keywords)`.

    G14: a generated column must be IMMUTABLE. Django's PostgreSQL `Concat`
    compiles to `||` over COALESCEd operands, not to `CONCAT()` (which is only
    STABLE and refused) — the migration applying is the proof.
    """
    space = Value(" ")
    return Lower(
        Concat(
            "title",
            space,
            "subtitle",
            space,
            "authors",
            space,
            "publisher",
            space,
            "keywords",
            output_field=models.TextField(),
        )
    )


class LibraryTitle(TenantModel):
    title = models.CharField(max_length=TITLE_MAX)
    subtitle = models.CharField(max_length=TITLE_MAX, default="", blank=True)
    authors = models.CharField(max_length=TITLE_MAX, default="", blank=True)
    isbn13 = models.CharField(max_length=13, null=True, blank=True)
    publisher = models.CharField(max_length=PUBLISHER_MAX, default="", blank=True)
    edition = models.CharField(max_length=EDITION_MAX, default="", blank=True)
    year = models.SmallIntegerField(null=True, blank=True)
    language = models.CharField(max_length=LANGUAGE_MAX, default="", blank=True)
    category = models.ForeignKey(
        LibraryCategory, on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    material_type = models.CharField(max_length=16, default=MaterialType.BOOK)
    call_number = models.CharField(max_length=CALL_NUMBER_MAX, default="", blank=True)
    keywords = models.CharField(max_length=TITLE_MAX, default="", blank=True)
    notes = models.TextField(default="", blank=True)
    #: Cache: copies not withdrawn.
    copies_total = models.IntegerField(default=0)
    #: Cache (G15): copies `available`, not `is_reference`, on a title that is
    #: not a reference work — "available to borrow".
    copies_available = models.IntegerField(default=0)
    status = models.CharField(max_length=10, default=TitleStatus.ACTIVE)
    search_text = models.GeneratedField(
        expression=_search_expression(), output_field=models.TextField(), db_persist=True
    )
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_title"
        indexes = [
            GinIndex(OpClass("search_text", name="gin_trgm_ops"), name="ix_library_title_search"),
            models.Index(
                fields=["tenant", "isbn13"],
                condition=Q(isbn13__isnull=False),
                name="ix_library_title_isbn",
            ),
            models.Index(F("tenant"), F("status"), Lower("title"), name="ix_library_title_list"),
            models.Index(fields=["tenant", "category"], name="ix_library_title_category"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=_in("material_type", MaterialType),
                name="ck_library_title_material_type",
            ),
            models.CheckConstraint(
                condition=_in("status", TitleStatus), name="ck_library_title_status"
            ),
            models.CheckConstraint(
                condition=Q(year__isnull=True) | Q(year__gte=YEAR_MIN, year__lte=YEAR_MAX),
                name="ck_library_title_year",
            ),
            models.CheckConstraint(
                condition=Q(copies_available__gte=0)
                & Q(copies_total__gte=0)
                & Q(copies_available__lte=F("copies_total")),
                name="ck_library_title_caches",
            ),
        ]


class LibraryCopy(TenantModel):
    """A physical book. Never deleted; it leaves stock by withdrawal (FR-6)."""

    title = models.ForeignKey(LibraryTitle, on_delete=models.RESTRICT, related_name="copies")
    accession_number = models.CharField(max_length=ACCESSION_MAX)
    accession_sort = models.CharField(max_length=ACCESSION_SORT_MAX, db_collation="C")
    barcode = models.CharField(max_length=BARCODE_MAX, null=True, blank=True)
    location = models.ForeignKey(
        LibraryLocation, on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    location_text = models.CharField(max_length=LOCATION_TEXT_MAX, default="", blank=True)
    status = models.CharField(max_length=16, default=CopyStatus.AVAILABLE)
    is_reference = models.BooleanField(default=False)
    acquired_on = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=12, default=CopySource.BOUGHT)
    source_note = models.CharField(max_length=SOURCE_NOTE_MAX, default="", blank=True)
    price = MoneyField(null=True, blank=True)
    condition = models.CharField(max_length=8, default=CopyCondition.GOOD)
    volume_label = models.CharField(max_length=VOLUME_LABEL_MAX, default="", blank=True)
    withdrawn_on = models.DateField(null=True, blank=True)
    withdrawn_reason = models.CharField(max_length=16, null=True, blank=True)
    withdrawn_note = models.CharField(max_length=NOTE_MAX, default="", blank=True)
    last_seen_on = models.DateField(null=True, blank=True)
    issued_ever = models.BooleanField(default=False)
    version = models.IntegerField(default=1)

    class Meta:
        db_table = "library_copy"
        indexes = [
            models.Index(fields=["tenant", "accession_sort"], name="ix_library_copy_sort"),
            models.Index(fields=["tenant", "status"], name="ix_library_copy_status"),
            models.Index(fields=["tenant", "title"], name="ix_library_copy_title"),
            models.Index(fields=["tenant", "location"], name="ix_library_copy_location"),
            models.Index(fields=["tenant", "last_seen_on"], name="ix_library_copy_last_seen"),
        ]
        constraints = [
            models.UniqueConstraint(
                F("tenant"), Upper("accession_number"), name="uq_library_copy_accession"
            ),
            models.UniqueConstraint(
                F("tenant"),
                Upper("barcode"),
                condition=Q(barcode__isnull=False),
                name="uq_library_copy_barcode",
            ),
            models.CheckConstraint(
                condition=Q(status=CopyStatus.WITHDRAWN, withdrawn_on__isnull=False)
                | (~Q(status=CopyStatus.WITHDRAWN) & Q(withdrawn_on__isnull=True)),
                name="ck_library_copy_withdrawn",
            ),
            models.CheckConstraint(
                condition=_in("status", CopyStatus), name="ck_library_copy_status"
            ),
            models.CheckConstraint(
                condition=_in("source", CopySource), name="ck_library_copy_source"
            ),
            models.CheckConstraint(
                condition=_in("condition", CopyCondition), name="ck_library_copy_condition"
            ),
            models.CheckConstraint(
                condition=Q(withdrawn_reason__isnull=True)
                | _in("withdrawn_reason", WithdrawReason),
                name="ck_library_copy_withdrawn_reason",
            ),
            models.CheckConstraint(
                condition=Q(price__isnull=True) | Q(price__gte=0), name="ck_library_copy_price"
            ),
        ]


class LibraryCopyEvent(TenantModel, ImmutableModel):
    """Every status change of a copy (FR-7), written with it; never updated."""

    copy = models.ForeignKey(LibraryCopy, on_delete=models.RESTRICT, related_name="events")
    from_status = models.CharField(max_length=16, null=True, blank=True)
    to_status = models.CharField(max_length=16)
    reason_code = models.CharField(max_length=24)
    note = models.CharField(max_length=NOTE_MAX, default="", blank=True)
    source_type = models.CharField(max_length=SOURCE_TYPE_MAX, null=True, blank=True)
    source_id = models.UUIDField(null=True, blank=True)
    on_date = models.DateField()

    class Meta:
        db_table = "library_copy_event"
        indexes = [models.Index(fields=["copy", "created_at"], name="ix_library_copy_event_copy")]
        constraints = [
            models.CheckConstraint(
                condition=_in("reason_code", CopyEventReason),
                name="ck_library_copy_event_reason",
            ),
            models.CheckConstraint(
                condition=_in("to_status", CopyStatus), name="ck_library_copy_event_to_status"
            ),
        ]
