"""Abstract base models (Part 26 §26.3 R3.9, Part 21 §21.1)."""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.managers import AllObjectsManager, SoftDeleteManager, TenantManager


class TimeStampedModel(models.Model):
    """`created_at` / `updated_at` on every table (Part 21 §21.1 rule 7)."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantModel(TimeStampedModel):
    """Every business table (Part 21 §21.1).

    `tenant` is `ON DELETE RESTRICT` (Part 21 §21.5): a tenant is removed by an
    explicit deletion job that drains children in dependency order, never by a
    cascade.
    """

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant",
        on_delete=models.RESTRICT,
        related_name="+",
        db_index=True,
    )
    created_by = models.ForeignKey(
        "platform.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    objects = TenantManager()

    class Meta:
        abstract = True


class SoftDeleteModel(models.Model):
    """Master data only (Part 21 §21.6).

    Documents are voided; ledgers are never deleted. A model that inherits this
    gets `objects` (alive rows only) and `all_objects` (everything).

    A model that inherits *both* this and `TenantModel` must re-declare the two
    managers on itself: both bases define `objects`, and which one wins would
    otherwise depend on the MRO rather than on intent.
    """

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True


class ImmutableModel(models.Model):
    """A row that is written once and never updated (`LedgerEntry`, `StockMovement`).

    The database trigger `forbid_update_delete` (Part 21 §21.3.4) is the real
    guarantee; this base stops the ORM path early so a bug fails in a test rather
    than in production. Subclasses list the columns the product does permit to
    change in `MUTABLE_FIELDS` — for `ledger_entry` that is exactly `status` and
    `reversed_by_id`.
    """

    MUTABLE_FIELDS: tuple[str, ...] = ()

    class Meta:
        abstract = True

    def save(self, *args: object, **kwargs: object) -> None:
        """Normalisation only — never business logic (Part 26 §26.3 R3.6)."""
        if self._state.adding:
            super().save(*args, **kwargs)
            return
        update_fields = kwargs.get("update_fields")
        if update_fields is None:
            raise ValueError(
                f"{type(self).__name__} is immutable: update only "
                f"{self.MUTABLE_FIELDS or '()'} and pass update_fields."
            )
        forbidden = set(update_fields) - set(self.MUTABLE_FIELDS)
        if forbidden:
            raise ValueError(
                f"{type(self).__name__} is immutable: {sorted(forbidden)} may not be updated."
            )
        super().save(*args, **kwargs)

    def delete(self, *args: object, **kwargs: object) -> None:
        raise ValueError(f"{type(self).__name__} rows are never deleted (Part 21 §21.6).")
