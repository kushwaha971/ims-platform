"""TenantSetting and DocumentSequence (Part 21 §21.3.1)."""

from __future__ import annotations

from django.db import models

from apps.common.db.fields import uuid7_pk
from apps.common.models import TimeStampedModel

# Well-known keys (Part 21 §21.3.1, table T-27). The list is normative there;
# this tuple exists so a typo'd key fails a test rather than silently defaulting.
WELL_KNOWN_SETTING_KEYS: tuple[str, ...] = (
    "numbering",
    "sales.default_due_days",
    "sales.default_kind",
    "inventory.allow_negative_stock",
    "inventory.enabled",
    "ledger.credit_limit_mode",
    "ledger.reminder_templates",
    "ledger.auto_sms",
    "ledger.party_sms_on_entry",
    "documents.terms",
    "documents.show_upi_qr",
    "locale.number_format",
)


class TenantSetting(TimeStampedModel):
    """Key/value with schema versions (Part 21 §21.3.1)."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, related_name="settings"
    )
    key = models.CharField(max_length=64)
    value = models.JSONField(default=dict, blank=True)
    schema_version = models.SmallIntegerField(default=1)

    class Meta:
        db_table = "platform_tenant_setting"
        verbose_name = "tenant setting"
        verbose_name_plural = "tenant settings"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "key"], name="uq_tenant_setting_key"),
        ]

    def __str__(self) -> str:
        return f"{self.tenant_id}:{self.key}"


class DocumentSequence(TimeStampedModel):
    """Per tenant × kind × financial year numbering (Part 21 §21.3.1).

    Allocation is `SELECT … FOR UPDATE` inside the posting transaction; numbers
    are never reused and voided documents keep their number. The sequence row is
    the hottest lock in the product and is therefore taken *last* of the contended
    locks (Part 20 §20.11.2 rule L4).
    """

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, related_name="sequences"
    )
    kind = models.CharField(max_length=24)
    fy_label = models.CharField(max_length=9)
    prefix = models.CharField(max_length=12, blank=True, default="")
    next_number = models.IntegerField(default=1)
    padding = models.SmallIntegerField(default=4)

    class Meta:
        db_table = "platform_document_sequence"
        verbose_name = "document sequence"
        verbose_name_plural = "document sequences"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "kind", "fy_label"], name="uq_document_sequence"
            ),
            models.CheckConstraint(
                condition=models.Q(next_number__gte=1), name="ck_sequence_next_number"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.kind}/{self.fy_label}"
