"""Party — the customer/supplier master (Part 21 §21.3.3).

`Tag`, `PartyTag` and `ShareLink` are named in Part 20 §20.2.3 and land with
`PTY-02` and `PTY-09`; Sprint 0's walking skeleton needs `Party` alone
(Part 32 §32.3.6 task S0-70).
"""

from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex
from django.db import models

from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.managers import AllObjectsManager, SoftDeleteManager
from apps.common.models import SoftDeleteModel, TenantModel
from apps.parties.constants import ConsentSource, GstRegistration, PartyStatus


class Party(TenantModel, SoftDeleteModel):
    """Any counter-party of the business: customer, supplier, or both (canon §0.2).

    `balance` is a cache: Σ debit − Σ credit of posted entries, recomputable by
    `manage.py recalc_balances` (Part 21 §21.1 rule 3). It is written only by
    `parties.services.balance`, never by a signal (rule D9).
    """

    id = uuid7_pk()
    name = models.CharField(max_length=160)
    display_code = models.CharField(max_length=24, null=True, blank=True)
    mobile = models.CharField(max_length=15, null=True, blank=True)
    alt_phone = models.CharField(max_length=15, null=True, blank=True)
    email = models.EmailField(max_length=254, null=True, blank=True)
    is_customer = models.BooleanField(default=True)
    is_supplier = models.BooleanField(default=False)
    gstin = models.CharField(max_length=15, null=True, blank=True)
    gst_registration = models.CharField(
        max_length=16, choices=GstRegistration.choices, default=GstRegistration.UNREGISTERED
    )
    billing_address = models.JSONField(default=dict, blank=True)
    shipping_address = models.JSONField(default=dict, blank=True)
    state_code = models.CharField(max_length=2, null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    balance = MoneyField(default=0)
    receivable_total = MoneyField(default=0)
    payable_total = MoneyField(default=0)
    last_activity_at = models.DateTimeField(null=True, blank=True)
    collection_date = models.DateField(null=True, blank=True)
    credit_limit = MoneyField(null=True, blank=True)
    credit_days = models.SmallIntegerField(null=True, blank=True)
    sms_opt_in = models.BooleanField(default=True)
    consent_source = models.CharField(
        max_length=32, choices=ConsentSource.choices, null=True, blank=True
    )
    consent_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=16, choices=PartyStatus.choices, default=PartyStatus.ACTIVE
    )

    # `TenantModel` and `SoftDeleteModel` both declare `objects`; a model that
    # inherits both must say which it means, or the manager it gets depends on
    # the MRO rather than on intent (Part 20 §20.4.4).
    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "parties_party"
        verbose_name = "party"
        verbose_name_plural = "parties"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "mobile"],
                condition=models.Q(mobile__isnull=False) & models.Q(deleted_at__isnull=True),
                name="uq_party_tenant_mobile",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "status", "-last_activity_at"], name="ix_party_tenant_activity"
            ),
            models.Index(fields=["tenant", "balance"], name="ix_party_tenant_balance"),
            models.Index(fields=["tenant", "collection_date"], name="ix_party_tenant_collection"),
            models.Index(fields=["tenant", "is_customer"], name="ix_party_tenant_customer"),
            models.Index(fields=["tenant", "is_supplier"], name="ix_party_tenant_supplier"),
            GinIndex(
                fields=["name"],
                name="ix_party_name_trgm",
                opclasses=["gin_trgm_ops"],
            ),
        ]

    def __str__(self) -> str:
        return self.name
