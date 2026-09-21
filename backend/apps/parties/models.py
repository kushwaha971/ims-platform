"""Party — the customer/supplier master (Part 21 §21.3.3).

`Tag`, `PartyTag` and `ShareLink` are named in Part 20 §20.2.3 and land with
`PTY-02` and `PTY-09`; Sprint 0's walking skeleton needs `Party` alone
(Part 32 §32.3.6 task S0-70).
"""

from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models.functions import Upper

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
            # The default list view, which sends no `status` at all. Without it
            # the unfiltered page-1 query is a parallel sequential scan and a
            # top-N heapsort over every alive row in the tenant; with it the
            # planner walks the index and stops at the page (measured at 98,000
            # alive rows: 25.6 ms / 3,401 buffers -> 0.10 ms / 29 buffers). The
            # `status`-filtered form is served by `ix_party_tenant_activity`,
            # which cannot serve this one because `status` is its middle column.
            models.Index(
                fields=["tenant", "-last_activity_at"],
                condition=models.Q(deleted_at__isnull=True),
                name="ix_party_tenant_recent",
            ),
            # `?ordering=name`, which the list's Name column header sends
            # (`partyListSort.ts` maps the column to the `name` field). No index
            # covered it: page 1 was a parallel index scan of the tenant and a
            # top-N heapsort of every alive row (measured at 98 000 rows:
            # 44.6 ms / 2,432 buffers -> 0.11 ms / 28 buffers). A party's name is
            # written once and then almost never again, so unlike the two
            # indexes above this one is read-heavy with no update cost at all.
            models.Index(
                fields=["tenant", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="ix_party_tenant_name",
            ),
            # `?q=` search. The index is on `UPPER(name)`, not on `name`, because
            # Django compiles `icontains` to `UPPER(name::text) LIKE UPPER(%s)`
            # and a GIN index on the bare column cannot match a function
            # expression — verified with `enable_seqscan`/`enable_indexscan`/
            # `enable_indexonlyscan` all off, where the planner still could not
            # reach the bare-column index. Measured at 98,000 rows: 31.9 ms /
            # 2,414 buffers -> 0.14 ms / 8 buffers, and 6.5 MB instead of 11 MB.
            GinIndex(
                OpClass(Upper("name"), name="gin_trgm_ops"),
                name="ix_party_name_upper_trgm",
            ),
        ]

    def __str__(self) -> str:
        return self.name
