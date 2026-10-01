"""The subject registry (contracts §2.1, ADR-042).

A vertical registers what a schedule is FOR — a membership, a loan, an
enrolment — from its own `ready()`. The engine never imports the vertical; it
reaches the subject only through what is registered here.

Keyed by `subject_type` (≤ 48, the column). Registering the same thing twice is
a no-op; a different registration under a used key is `ImproperlyConfigured`,
a start-up error rather than whichever app imported last (the
`register_target` rule). `_reset_for_tests()` snapshots the start-up state on
its first call and restores it on every later one (`postings._reset_for_tests`).

`label` is `(ids) -> {id: label}` with no tenant (contracts): the engine only
ever passes ids it read from the caller's own tenant.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured

from apps.dues.constants import MODULE_MAX, SUBJECT_TYPE_MAX


@dataclass(frozen=True)
class Subject:
    subject_type: str
    module: str
    label: Callable[[set[UUID]], dict[UUID, str]]
    reminder_template_key: str
    on_due_changed: Callable[..., None] | None = None
    amount_hook: Callable[..., Decimal] | None = None
    line_hook: Callable[..., dict] | None = None
    own_reminder_source: bool = False


_SUBJECTS: dict[str, Subject] = {}
_BASELINE: dict[str, Subject] | None = None


def register_subject(
    subject_type: str,
    *,
    module: str,
    label: Callable[[set[UUID]], dict[UUID, str]],
    on_due_changed: Callable[..., None] | None = None,
    amount_hook: Callable[..., Decimal] | None = None,
    line_hook: Callable[..., dict] | None = None,
    own_reminder_source: bool = False,
    reminder_template_key: str,
) -> None:
    """Register a subject type (contracts §2.1, verbatim signature)."""
    if not subject_type or len(subject_type) > SUBJECT_TYPE_MAX:
        raise ImproperlyConfigured(
            f"dues subject {subject_type!r} must be 1–{SUBJECT_TYPE_MAX} characters"
        )
    if not module or len(module) > MODULE_MAX:
        raise ImproperlyConfigured(f"dues subject {subject_type!r} needs a module code")
    if not callable(label):
        raise ImproperlyConfigured(f"dues subject {subject_type!r} needs a label callable")
    if not reminder_template_key:
        raise ImproperlyConfigured(f"dues subject {subject_type!r} needs a reminder template key")
    subject = Subject(
        subject_type=subject_type,
        module=module,
        label=label,
        reminder_template_key=reminder_template_key,
        on_due_changed=on_due_changed,
        amount_hook=amount_hook,
        line_hook=line_hook,
        own_reminder_source=bool(own_reminder_source),
    )
    existing = _SUBJECTS.get(subject_type)
    if existing is not None and existing != subject:
        raise ImproperlyConfigured(
            f"dues subject {subject_type!r} is already registered differently "
            f"(by {existing.module!r})"
        )
    _SUBJECTS[subject_type] = subject


def subject_for(subject_type: str) -> Subject | None:
    return _SUBJECTS.get(subject_type)


def registered_subjects() -> dict[str, Subject]:
    """Every registered subject, by type (a copy)."""
    return dict(_SUBJECTS)


def subject_labels(subject_type: str, ids: set[Any]) -> dict[Any, str]:
    """One batched label call for one subject type; `{}` for an unknown type."""
    subject = _SUBJECTS.get(subject_type)
    if subject is None or not ids:
        return {}
    return dict(subject.label(set(ids)) or {})


def _reset_for_tests() -> None:  # pragma: no cover - test helper
    global _BASELINE
    if _BASELINE is None:
        _BASELINE = dict(_SUBJECTS)
    _SUBJECTS.clear()
    _SUBJECTS.update(_BASELINE)
