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

**Number kinds (A8, ADR-051, contracts §1.7).** A module registers its kinds with
a MODE: `fy` kinds go through `allocate_number` exactly as the core's do;
`perpetual` kinds (a library's accession register, a member code) use the same
row shape with `fy_label = '*'` through `allocate_counter`, never reset, may be
raised (`raise_counter`, e.g. after an import of typed numbers) and never
lowered. Each allocator refuses the other mode. The module's own unique
constraint is the guarantee; the counter only proposes the next number.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction
from django.utils.translation import gettext_lazy as _

from apps.common.audit import AuditAction, write_audit
from apps.common.dates import fy_label_for
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app.models import DocumentSequence
from apps.platform_app.services import presets

#: `fy_label` of a perpetual kind's one row (ADR-051). The CHECK
#: `ck_sequence_fy_label` admits this and `YYYY-YY` and nothing else.
PERPETUAL = "*"
MODES = frozenset({"fy", "perpetual"})
#: `next_number` is an `integer` column (EC-4).
MAX_NEXT_NUMBER = 2**31 - 1


@dataclass(frozen=True, slots=True)
class NumberKind:
    kind: str
    module: str
    mode: str
    default_prefix: str
    padding: int
    label_id: str


_KINDS: dict[str, NumberKind] = {}
_KINDS_BASELINE: dict[str, NumberKind] | None = None


def register_number_kind(
    kind: str, *, module: str, mode: str, default_prefix: str, padding: int, label_id: str
) -> None:
    """Register a module's number kind (contracts §1.7), from its `ready()`.

    Refused at start-up unless it fits the row (`kind` ≤ 24, prefix ≤ 12,
    `0 ≤ padding ≤ 10`), the mode is `fy` or `perpetual`, and the kind is not a
    core series. Idempotent for an equal spec; a conflicting one raises.
    """
    problems: list[str] = []
    if not kind or len(kind) > 24:
        problems.append("kind must be 1-24 characters")
    if kind in dict(presets.NUMBERING_PREFIXES):
        problems.append("kind is a core series")
    if mode not in MODES:
        problems.append(f"mode must be one of {sorted(MODES)}")
    if not isinstance(default_prefix, str) or len(default_prefix) > 12:
        problems.append("default_prefix must be at most 12 characters")
    if isinstance(padding, bool) or not isinstance(padding, int) or not 0 <= padding <= 10:
        problems.append("padding must be 0-10")
    if problems:
        raise ImproperlyConfigured(f"Number kind {kind!r}: " + "; ".join(problems))
    spec = NumberKind(kind, module, mode, default_prefix, padding, label_id)
    existing = _KINDS.get(kind)
    if existing is not None and existing != spec:
        raise ImproperlyConfigured(f"Number kind {kind!r} is already registered differently.")
    _KINDS[kind] = spec


def number_kind(kind: str) -> NumberKind | None:
    return _KINDS.get(kind)


def number_kinds() -> tuple[NumberKind, ...]:
    return tuple(_KINDS.values())


def format_counter(*, prefix: str, number: int, padding: int) -> str:
    """`M-0007`, `1024` — a perpetual number carries no year."""
    return f"{prefix}{str(number).zfill(padding)}"


def _reset_kinds_for_tests() -> None:  # pragma: no cover - test helper
    """Back to what the apps' `ready()` registered (the guards.py pattern)."""
    global _KINDS_BASELINE
    if _KINDS_BASELINE is None:
        _KINDS_BASELINE = dict(_KINDS)
    _KINDS.clear()
    _KINDS.update(_KINDS_BASELINE)


def _short_fy(fy_label: str) -> str:
    """`2026-27` → `26-27`, which is what a printed number carries."""
    start, _sep, end = fy_label.partition("-")
    return f"{start[-2:]}-{end}"


def format_number(*, prefix: str, fy_label: str, number: int, padding: int) -> str:
    return f"{prefix}/{_short_fy(fy_label)}/{str(number).zfill(padding)}"


@transaction.atomic
def allocate_number(*, tenant: Any, kind: str, on_date: dt.date) -> str:
    """Take the next number of `kind` for the financial year containing `on_date`."""
    spec = _KINDS.get(kind)
    if spec is not None and spec.mode != "fy":
        raise ImproperlyConfigured(f"{kind!r} is a perpetual kind; use allocate_counter.")
    fy_label = fy_label_for(tenant, on_date)
    default_prefix = (
        spec.default_prefix
        if spec is not None
        else dict(presets.NUMBERING_PREFIXES).get(kind, kind.upper()[:6])
    )
    padding = spec.padding if spec is not None else presets.NUMBER_PADDING
    try:
        with transaction.atomic():
            DocumentSequence.objects.get_or_create(
                tenant=tenant,
                kind=kind,
                fy_label=fy_label,
                defaults={"prefix": default_prefix, "next_number": 1, "padding": padding},
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


# ── A8 ── perpetual counters (ADR-051, contracts §1.7) ───────────────────────


def _perpetual(kind: str) -> NumberKind:
    spec = _KINDS.get(kind)
    if spec is None or spec.mode != "perpetual":
        raise ImproperlyConfigured(f"{kind!r} is not a registered perpetual kind.")
    return spec


def _locked_counter_row(*, tenant: Any, spec: NumberKind) -> DocumentSequence:
    """Get-or-create the `'*'` row race-safely, then `SELECT … FOR UPDATE` it."""
    try:
        with transaction.atomic():
            DocumentSequence.objects.get_or_create(
                tenant=tenant,
                kind=spec.kind,
                fy_label=PERPETUAL,
                defaults={
                    "prefix": spec.default_prefix,
                    "next_number": 1,
                    "padding": spec.padding,
                },
            )
    except IntegrityError:  # a concurrent first allocation created it — fine
        pass
    return DocumentSequence.objects.select_for_update().get(
        tenant=tenant, kind=spec.kind, fy_label=PERPETUAL
    )


@transaction.atomic
def allocate_counter(*, tenant: Any, kind: str) -> str:
    """Take the next number of a perpetual `kind`: `M-0007`, `1024`.

    Never resets (BR-1); the row is locked in the caller's transaction, so a
    rollback gives the number back (BR-2); like every sequence it is locked
    LAST (BR-5). The module's own unique constraint is the guarantee (BR-3).
    """
    spec = _perpetual(kind)
    row = _locked_counter_row(tenant=tenant, spec=spec)
    number = row.next_number
    DocumentSequence.objects.filter(pk=row.pk).update(next_number=number + 1)
    return format_counter(prefix=row.prefix, number=number, padding=row.padding)


def peek_counter(*, tenant: Any, kind: str) -> int:
    """The number `allocate_counter` would take next. Advisory: no lock, no row."""
    _perpetual(kind)
    row = DocumentSequence.objects.filter(tenant=tenant, kind=kind, fy_label=PERPETUAL).first()
    return row.next_number if row is not None else 1


@transaction.atomic
def raise_counter(*, ctx: Any, kind: str, next_number: int, via: str = "import") -> None:
    """Move a perpetual counter UP to `next_number` (BR-4: after an import).

    Lower → 409 `sequence_backwards {current, requested}`, because a lower
    number may already be printed on a card; equal → no-op; higher → the row
    moves and one `counter.raised` audit row says from what, to what and why
    (`via`, e.g. "import" or "settings").
    """
    spec = _perpetual(kind)
    if (
        isinstance(next_number, bool)
        or not isinstance(next_number, int)
        or not (1 <= next_number <= MAX_NEXT_NUMBER)
    ):
        raise ValidationFailed(
            {"next_number": [f"Enter a whole number from 1 to {MAX_NEXT_NUMBER}."]}
        )
    row = _locked_counter_row(tenant=ctx.tenant, spec=spec)
    current = row.next_number
    if next_number < current:
        raise BusinessRuleViolation(
            "sequence_backwards",
            str(_("Cannot go below %(current)s.") % {"current": current}),
            details={"current": current, "requested": next_number},
        )
    if next_number == current:
        return
    DocumentSequence.objects.filter(pk=row.pk).update(next_number=next_number)
    write_audit(
        ctx=ctx,
        action=AuditAction.COUNTER_RAISED,
        entity_type="platform_document_sequence",
        entity_id=row.pk,
        after={"kind": kind, "before": current, "after": next_number, "via": via},
    )
