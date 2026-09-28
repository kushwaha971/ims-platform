"""Party, Tag and the join between them (Part 21 §21.3.3).

`ShareLink` is named in Part 20 §20.2.3 and lands with PTY-09.
"""

from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models import F
from django.db.models.functions import Lower, Upper

from apps.common.db.fields import MoneyField, uuid7_pk
from apps.common.managers import AllObjectsManager, SoftDeleteManager
from apps.common.models import SoftDeleteModel, TenantModel
from apps.parties.constants import ConsentSource, GstRegistration, OpeningDirection, PartyStatus


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

    # ── The opening balance, STORED AND UNAPPLIED (TSK-PTY-01-05) ───────────
    #
    # What a merchant is carrying over from the paper book. PTY-01 records it;
    # it posts nothing. `LED-02` in Sprint 4 reads these three columns, posts
    # the `opening` ledger entry and is what finally moves `balance`.
    #
    # Three typed columns rather than one jsonb blob, and the reason is canon
    # rule 3: an amount is a `Decimal` on the server, and money inside jsonb is
    # neither `numeric(14,2)` nor indexable. It is also exactly the argument
    # list `post_opening_balance()` will take, so Sprint 4 reads the row and
    # calls the function with no translation step in between.
    #
    # Until then the invariant is testable and tested: a party may have these
    # set while `balance` is still 0.00 and no `ledger_entry` row exists.
    opening_balance_amount = MoneyField(null=True, blank=True)
    opening_balance_direction = models.CharField(
        max_length=6, choices=OpeningDirection.choices, null=True, blank=True
    )
    opening_balance_as_of = models.DateField(null=True, blank=True)
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

    #: PTY-05. Declared here rather than on `Tag` so that `party.tags` reads
    #: naturally at every call site; `through` is an explicit model because the
    #: join needs its own indexes (see `PartyTag`).
    tags = models.ManyToManyField(
        "parties.Tag", through="parties.PartyTag", related_name="parties", blank=True
    )

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
            # The list's default order, and after PTY-02 BR-4 the order of EVERY
            # list query: the filterset now supplies `status=active` when the
            # client sends none, so there is no longer a list shape that reaches
            # this table without a status predicate.
            #
            # `DESC NULLS LAST`, spelled out, is the whole point of the index.
            # `fields=["-last_activity_at"]` compiles to a plain `DESC`, and
            # Postgres puts NULLs FIRST on a DESC index; the query asks for
            # `DESC NULLS LAST` (FR-7/BR-6, because a party who has never
            # transacted must not sort above one who bought something this
            # morning). Those are two different orderings, so the planner could
            # not use this index for the query it was added to serve, and said
            # so by not using it at all.
            #
            # Measured on a 100,000-party tenant, page 1 of the default list:
            # parallel seq scan of 55,845 rows and a full sort, 5,728 cost units
            # -> index scan and an incremental sort over one tie group, 29
            # buffers and 0.088 ms. Carrying `name, id` in the index too would
            # remove even that sort (0.075 ms) and cost 9.3 MB against 4.3 MB —
            # not a trade worth making for 13 microseconds.
            models.Index(
                "tenant",
                "status",
                F("last_activity_at").desc(nulls_last=True),
                condition=models.Q(deleted_at__isnull=True),
                name="ix_party_tenant_activity",
            ),
            # The same index the other way up, for `?ordering=last_activity_at`
            # — the Activity header clicked a second time, oldest first. A
            # B-tree walked backwards reverses its null placement as well as its
            # order, so the index above read backwards is `ASC NULLS FIRST`,
            # while `StableOrderingFilter` asks for `ASC NULLS LAST` (a party
            # that has never transacted does not outrank one that has, in either
            # direction). Different orderings; the header's second click was a
            # sequential scan and a sort of every active party. Same columns and
            # same partial predicate as its twin, so the planner can use it for
            # exactly the `tenant + status + deleted_at` shape every list query
            # has (0008).
            models.Index(
                "tenant",
                "status",
                F("last_activity_at").asc(nulls_last=True),
                condition=models.Q(deleted_at__isnull=True),
                name="ix_party_tenant_activity_asc",
            ),
            models.Index(fields=["tenant", "balance"], name="ix_party_tenant_balance"),
            # `ASC NULLS LAST` — it serves `?ordering=collection_date` and the
            # three collection chips' range predicates. It cannot serve
            # `?ordering=-collection_date`: walked backwards it is `DESC NULLS
            # FIRST`, and the filter asks for `DESC NULLS LAST`.
            models.Index(fields=["tenant", "collection_date"], name="ix_party_tenant_collection"),
            # ...which is what this one is for (0008). A collection date is set
            # by hand a few times in a party's life, so unlike the activity pair
            # it costs next to nothing to keep current.
            models.Index(
                "tenant",
                "status",
                F("collection_date").desc(nulls_last=True),
                condition=models.Q(deleted_at__isnull=True),
                name="ix_party_tenant_collect_desc",
            ),
            models.Index(fields=["tenant", "is_customer"], name="ix_party_tenant_customer"),
            models.Index(fields=["tenant", "is_supplier"], name="ix_party_tenant_supplier"),
            # `ix_party_tenant_recent` lived here: (tenant, -last_activity_at)
            # partial, added for the default list "which sends no `status` at
            # all". PTY-02 BR-4 removed that shape — the filterset defaults the
            # status rather than leaving it out — so the index had no query left
            # to serve and 4.6 MB per 100,000 parties to keep current on every
            # ledger entry. `ix_party_tenant_activity` above serves both forms.
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
            # ── The other three arms of `?q=` (0008) ─────────────────────────────
            #
            # `PartyFilterSet.filter_search` ORs up to four predicates, and
            # Postgres can answer a disjunction from indexes only as a BitmapOr
            # in which EVERY arm has an index of its own. One arm without one
            # and the whole OR becomes a filter over every row in the tenant —
            # which is what happened: the trigram index above was unreachable
            # from the endpoint it was built for, because the display-code arm
            # had no index at all.
            #
            # None of the three is partial, deliberately. The planner only reads
            # the statistics ANALYZE gathers on an index EXPRESSION when the
            # index is not partial; with `WHERE deleted_at IS NULL` on them it
            # fell back to a 0.5% default per arm — 483 rows for a GSTIN that
            # matches one — and chose to walk the ordering index and filter
            # rather than use the BitmapOr (measured at 50,000 parties).
            #
            # `display_code__istartswith` is `UPPER(display_code) LIKE 'X%'`: a
            # prefix, so a B-tree serves it — but only with `text_pattern_ops`
            # under any collation other than C, and only on the same UPPER()
            # expression.
            models.Index(
                F("tenant"),
                OpClass(Upper("display_code"), name="text_pattern_ops"),
                name="ix_party_tenant_code_upper",
            ),
            # `mobile__endswith` is `mobile LIKE '%1234'`, a suffix: no B-tree
            # can serve that, and a trigram index can. It is only in the OR when
            # the query has four or more digits.
            GinIndex(
                OpClass("mobile", name="gin_trgm_ops"),
                name="ix_party_mobile_trgm",
            ),
            # `gstin__iexact` is `UPPER(gstin) = UPPER(x)`, in the OR only for a
            # fifteen-character query.
            models.Index(
                F("tenant"),
                Upper("gstin"),
                name="ix_party_tenant_gstin_upper",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Tag(TenantModel):
    """A label a merchant puts on parties — "Camp Area", "Monday route".

    ── Flat, and carrying no behaviour (BR-8) ─────────────────────────────────
    A tag never changes pricing, tax, reminders or permissions. It is a filter
    dimension and a label, and keeping it that way is what lets a merchant
    invent one at the counter without wondering what it will do. Per-party
    pricing is a different mechanism entirely (INV-13).

    There is no parent/child: Indian small businesses reorganise by season, and
    a hierarchy is a promise about structure that the next season breaks.
    Groups are Phase 2 and are a different entity, which is why the copy never
    calls a tag a group.
    """

    id = uuid7_pk()
    #: As the merchant first typed it. The lookup is case-insensitive (BR-1),
    #: but the display is theirs — "GST" is not "Gst".
    name = models.CharField(max_length=40)
    #: `#RRGGBB` from a fixed palette, or NULL for no colour. Presentational
    #: only (BR-10), and never the only signal: every chip carries its name.
    color = models.CharField(max_length=7, null=True, blank=True)

    class Meta:
        db_table = "parties_tag"
        constraints = [
            # `lower(name)`, not `name`. The service normalises before it looks
            # up, and a service is not a constraint: two staff members creating
            # "Camp Area" and "camp area" from two party forms at the same
            # moment both pass their own check and both insert. The database is
            # the only place that can refuse the second one.
            models.UniqueConstraint(
                Lower("name"),
                "tenant",
                name="uq_tag_tenant_lower_name",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return self.name


class PartyTag(models.Model):
    """The join. A party carries 0–10 tags; a tag carries any number of parties.

    A model rather than a bare `ManyToManyField` through-table so that the
    indexes below can be declared, and so that a future column (who tagged this,
    when) does not need a migration that rewrites the relation.
    """

    id = uuid7_pk()
    party = models.ForeignKey("parties.Party", on_delete=models.CASCADE, related_name="party_tags")
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name="party_tags")

    class Meta:
        db_table = "parties_party_tag"
        constraints = [
            models.UniqueConstraint(fields=["party", "tag"], name="uq_party_tag"),
        ]
        indexes = [
            # `U(party, tag)` above serves party → tags, because `party` leads
            # it. It cannot serve tag → parties, and that is the direction the
            # `party_count` annotation and the list's tag filter both read in.
            # Without this the manager's count is a sequential scan of every
            # join row in the tenant, once per tag.
            models.Index(fields=["tag"], name="ix_party_tag_tag"),
        ]
