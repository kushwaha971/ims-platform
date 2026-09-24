"""Document numbering — the one allocator (Part 21 §21.3.1 `platform_document_sequence`).

`ADJ/26-27/0003`: prefix, the financial year's short label, the zero-padded
number. Allocation is `SELECT … FOR UPDATE` on the sequence row inside the
caller's transaction, so a number is never handed out twice and a rolled-back
post gives its number back with everything else it did. Part 20 §20.11.2 rule
L4 takes this lock LAST of the contended locks — callers lock their stock or
party rows first and allocate the number at the end.

A row missing for the year (the first adjustment after 1 April, or a tenant
onboarded before a kind existed) is created on demand from the preset prefix,
which is the same default onboarding seeds.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from django.db import IntegrityError, transaction

from apps.common.dates import fy_label_for
from apps.platform_app.models import DocumentSequence
from apps.platform_app.services import presets


def _short_fy(fy_label: str) -> str:
    """`2026-27` → `26-27`, which is what a printed number carries."""
    start, _sep, end = fy_label.partition("-")
    return f"{start[-2:]}-{end}"


def format_number(*, prefix: str, fy_label: str, number: int, padding: int) -> str:
    return f"{prefix}/{_short_fy(fy_label)}/{str(number).zfill(padding)}"


@transaction.atomic
def allocate_number(*, tenant: Any, kind: str, on_date: dt.date) -> str:
    """Take the next number of `kind` for the financial year containing `on_date`."""
    fy_label = fy_label_for(tenant, on_date)
    default_prefix = dict(presets.NUMBERING_PREFIXES).get(kind, kind.upper()[:6])
    try:
        with transaction.atomic():
            DocumentSequence.objects.get_or_create(
                tenant=tenant,
                kind=kind,
                fy_label=fy_label,
                defaults={
                    "prefix": default_prefix,
                    "next_number": 1,
                    "padding": presets.NUMBER_PADDING,
                },
            )
    except IntegrityError:  # a concurrent first allocation created it — fine
        pass
    row = DocumentSequence.objects.select_for_update().get(
        tenant=tenant, kind=kind, fy_label=fy_label
    )
    number = row.next_number
    DocumentSequence.objects.filter(pk=row.pk).update(next_number=number + 1)
    return format_number(
        prefix=row.prefix or default_prefix, fy_label=fy_label, number=number, padding=row.padding
    )
