"""Party filtersets (Part 26 §26.7 R7.3).

Every parameter the list accepts is DECLARED here. The rule exists because
django-filter drops an undeclared parameter silently: a screen can send
`?balance=owes_me`, present itself as filtered, and show the merchant every
party in the book with no error anywhere. That is not hypothetical — `status`
was exactly that bug before Sprint 1 closed it.
"""

from __future__ import annotations

from datetime import date, timedelta

import django_filters
from django.db.models import Exists, F, OuterRef, Q, QuerySet, Value
from django.db.models.functions import Lower

from apps.common.dates import tenant_today
from apps.common.filters import BaseTenantFilterSet
from apps.parties.constants import PartyStatus
from apps.parties.models import Party, PartyTag
from apps.parties.services.credit import NEAR_LIMIT_RATIO
from apps.parties.services.roles import parse_role_codes, role_predicate
from apps.parties.services.tags import normalise_tag_name

#: How far ahead "upcoming" looks. Seven days is the FRD's window and matches
#: the collection rhythm the product is built around — a merchant plans the
#: week, not the fortnight.
UPCOMING_DAYS = 7

#: Below this many digits, a numeric query is not a phone number, it is a
#: house number in an address or a quantity somebody pasted. Matching on two
#: digits returns most of the book and buries the name the merchant wanted.
MOBILE_SUFFIX_MIN_DIGITS = 4

GSTIN_LENGTH = 15


class PartyFilterSet(BaseTenantFilterSet):
    """`q`, `type`, `balance`, `status`, `collection` (FRD PTY-02 FR-5…FR-7).

    `tag` arrived with PTY-05, which is what created `parties_tag`. Until then
    it was deliberately absent: a filter declared against a table that does not
    exist is a filter that 500s, which is worse than one that is missing.

    `credit` arrived with PTY-06 and needed no new table at all — `credit_limit`
    has been on the party since the initial migration, waiting for something to
    compare it against.
    """

    q = django_filters.CharFilter(method="filter_search")
    type = django_filters.ChoiceFilter(
        method="filter_type", choices=(("customer", "Customer"), ("supplier", "Supplier"))
    )
    balance = django_filters.ChoiceFilter(
        method="filter_balance",
        choices=(("owes_me", "They owe me"), ("i_owe", "I owe them"), ("settled", "Settled")),
    )
    status = django_filters.ChoiceFilter(choices=PartyStatus.choices)
    collection = django_filters.ChoiceFilter(
        method="filter_collection",
        choices=(("today", "Today"), ("overdue", "Overdue"), ("upcoming", "Upcoming")),
    )
    tag = django_filters.CharFilter(method="filter_tags")
    credit = django_filters.ChoiceFilter(
        method="filter_credit",
        choices=(("over", "Over limit"), ("near", "Near limit"), ("ok", "Within limit")),
    )
    # ── A6 ── PLT-X04: `?role=gym_member,library_member`, OR within, AND against the rest.
    role = django_filters.CharFilter(method="filter_roles")

    class Meta:
        model = Party
        fields = ("q", "type", "balance", "status", "collection", "tag")

    def filter_queryset(self, queryset: QuerySet) -> QuerySet:
        """BR-4 — archived parties are out unless somebody asks for them.

        Not a default in the UI, a default in the CONTRACT. An archived party
        is one the merchant has put away, and a request that does not mention
        status is asking about the book they are working in — so a ₹40,000
        balance on a supplier archived last year must not appear in the header
        total of today's list.

        Applied here rather than in the selector because the two must not
        fight: a selector that filters to active and a parameter that asks for
        archived would AND into the empty set, which is the shape of bug that
        looks like "the archived tab is broken" and is actually two correct
        rules disagreeing.

        The two statuses are never mixed. There is no `all` value, on purpose:
        a total that spans both answers a question about money the merchant has
        deliberately set aside.
        """
        queryset = super().filter_queryset(queryset)
        if not self.form.cleaned_data.get("status"):
            queryset = queryset.filter(status=PartyStatus.ACTIVE)
        return queryset

    # ── The search ──────────────────────────────────────────────────────────

    def filter_search(self, queryset: QuerySet, _name: str, value: str) -> QuerySet:
        """FR-5 — four ways a merchant looks for somebody, OR'd.

        A shopkeeper searching for a customer types whichever fragment they
        happen to remember: part of the name, the code they wrote on the bill,
        the last four digits of the number that just called them, or a GSTIN
        pasted from an invoice. Matching only the name — which is what this did
        — means three of those four return nothing at all, and an empty result
        for a party that is plainly in the book reads as data loss.

        **`notes` is deliberately not searched (BR-8).** Notes are where a
        merchant writes things about a person that they would not want surfaced
        by a stray query, and a search that reaches them turns a private field
        into an index.

        ── Every arm of the OR has its own index, and it has to ──────────────
        Postgres can answer a disjunction from indexes only as a BitmapOr in
        which EVERY arm has one; a single arm without an index turns the whole
        predicate into a filter over every row in the tenant, and the other
        arms' indexes go unused. This docstring used to say the display-code
        arm was served by "`ix_party_tenant_name`-style B-tree logic". It was
        served by nothing — no index on `display_code` existed — and so the
        trigram index on the name was unreachable from this endpoint, while a
        test that EXPLAINed a hand-built name-only query said it was used.

        Each arm and the index that answers it (all created in parties 0008,
        except the first):

        * `name__icontains` -> `UPPER(name) LIKE '%X%'` -> `ix_party_name_upper_trgm`
          (GIN trigram on the same `UPPER()` expression).
        * `display_code__istartswith` -> `UPPER(display_code) LIKE 'X%'` ->
          `ix_party_tenant_code_upper`, a B-tree on `(tenant, UPPER(display_code)
          text_pattern_ops)`. A prefix is a range, which a B-tree serves — but
          under any collation other than C only with `text_pattern_ops`.
        * `mobile__endswith` -> `mobile LIKE '%1234'` -> `ix_party_mobile_trgm`.
          A suffix is not a range, so no B-tree helps; a trigram index does. It
          is still gated behind the digit count, because a two-digit suffix
          matches most of the book and buries the name the merchant wanted.
        * `gstin__iexact` -> `UPPER(gstin) = UPPER(x)` -> `ix_party_tenant_gstin_upper`.

        Change the lookup on any arm — `icontains` for `istartswith`, a
        different case fold — and its index stops matching.
        `tests/performance/test_two_thousand_party_book.py` and
        `test_party_list_plans.py` EXPLAIN the SQL this method produces, through
        the endpoint, so that failure is loud.
        """
        term = (value or "").strip()
        if not term:
            return queryset

        predicate = Q(name__icontains=term) | Q(display_code__istartswith=term)

        digits = "".join(character for character in term if character.isdigit())
        if len(digits) >= MOBILE_SUFFIX_MIN_DIGITS:
            predicate |= Q(mobile__endswith=digits)

        if len(term) == GSTIN_LENGTH:
            predicate |= Q(gstin__iexact=term)

        return queryset.filter(predicate)

    # ── The chips ───────────────────────────────────────────────────────────

    def filter_type(self, queryset: QuerySet, _name: str, value: str) -> QuerySet:
        """BR-5 — a party that is both matches EITHER chip, and is counted once.

        Two boolean columns rather than one enum is what makes that true without
        any special case: "customer" asks `is_customer`, and a party who is also
        a supplier still has it set.
        """
        if value == "customer":
            return queryset.filter(is_customer=True)
        if value == "supplier":
            return queryset.filter(is_supplier=True)
        return queryset

    def filter_balance(self, queryset: QuerySet, _name: str, value: str) -> QuerySet:
        """BR-3 — the sign of `balance`, with no tolerance band.

        ₹0.01 is money somebody owes, and a merchant who is owed a rupee by
        forty people is owed forty rupees. A "close enough to zero" band would
        hide exactly the rows that a collection round is for.
        """
        if value == "owes_me":
            return queryset.filter(balance__gt=0)
        if value == "i_owe":
            return queryset.filter(balance__lt=0)
        if value == "settled":
            return queryset.filter(balance=0)
        return queryset

    def filter_collection(self, queryset: QuerySet, _name: str, value: str) -> QuerySet:
        """The collection chips, against the tenant's own today.

        `overdue` carries a second predicate the other two do not: a party whose
        collection date has passed but who owes NOTHING is not overdue, they are
        done. Without `balance > 0` the overdue chip fills with people who have
        already paid, which is the fastest way to make a merchant stop trusting
        it (BR-7).
        """
        today = self._today()
        # LED-05 BR-1 puts `balance > 0` on ALL THREE buckets, and the ledger
        # summary's tiles count with the same predicate (`ledger/selectors/
        # collection.py`). Without it here, tapping "Due today · 3" listed a
        # fourth party who had already paid (AC-2: "lists exactly those").
        if value == "today":
            return queryset.filter(collection_date=today, balance__gt=0)
        if value == "overdue":
            return queryset.filter(collection_date__lt=today, balance__gt=0)
        if value == "upcoming":
            return queryset.filter(
                collection_date__gt=today,
                collection_date__lte=today + timedelta(days=UPCOMING_DAYS),
                balance__gt=0,
            )
        return queryset

    def filter_tags(self, queryset: QuerySet, _name: str, value: str) -> QuerySet:
        """`?tag=Camp Area,Route 2` — OR within the group, AND against the rest.

        BR-4, and it is how a merchant thinks: "show me Camp Area and Deccan
        today" means both areas, not the parties that are in both.

        ── `EXISTS`, not a join, and that is not a micro-optimisation ─────────
        A party with three matching tags would come back three times from a
        join, and PTY-02's totals aggregate sums `balance` over the same
        queryset — so the header would report that party's balance three times
        and disagree with the rows underneath it. `DISTINCT` would fix the rows
        and not the aggregate. A subquery asks the only question being asked:
        does this party carry any of these tags?

        Names rather than ids in the URL, because the filter is shareable and
        readable, and because a name is what the chip shows. Unknown names
        match nothing rather than erroring (EC-6): a tag deleted by somebody
        else while this filter was open should narrow the list, not break it.
        """
        names = [normalise_tag_name(part) for part in (value or "").split(",")]
        names = [name for name in names if name]
        if not names:
            return queryset

        # ── Case-INSENSITIVELY, and this is BR-1 arriving from the read side ──
        #
        # An earlier version used `tag__name__in=names`, which is exact on case
        # and on inner whitespace. Tag names are case-insensitively unique and
        # the casing the merchant first typed is what everybody sees (BR-1), so
        # "Camp Area" and "camp area" ARE one tag — but `__in` does not know
        # that, and this parameter is the one place in the product a person
        # types a tag name by hand.
        #
        # The failure was silent and expensive: a merchant who edits a shared
        # link to `?tag=camp area`, or whose phone lower-cases it on paste, gets
        # zero parties and ₹0.00 totals under a filter chip that reads
        # "Camp Area" in the right colour — because `PartyTagFilter` resolves
        # the label case-insensitively on purpose. The screen shows a filter
        # that is on, correctly named, and matching nothing.
        #
        # `normalise_tag_name` above folds the whitespace the same way the write
        # path does, so `?tag=Camp  Area` finds "Camp Area" too.
        #
        # ── `lower()`, and the party's own tenant, to match the one index ────
        #
        # `iexact` compiles to `UPPER(name) = UPPER(x)`, and the only index on a
        # tag's name is `uq_tag_tenant_lower_name` — `(lower(name), tenant)`.
        # An `UPPER()` predicate cannot use a `lower()` index, and with no tenant
        # condition either, every tag lookup read tags across all tenants by
        # primary key and filtered. `lower()` is also the right fold on its
        # merits: it is the one the uniqueness constraint uses, so it is the
        # database's own definition of "the same tag", and folding with the
        # same function on both sides (SQL, not Python's `str.lower`) keeps the
        # two from disagreeing on some Unicode letter nobody has tested.
        #
        # The tenant comes from the PARTY row (`OuterRef`), not the request: the
        # aging view calls this method on a filterset it builds without one.
        #
        # One `IN (…)` rather than an OR of equalities: Postgres turns it into a
        # single `= ANY(array)` index condition, where an OR has to be costed
        # as a BitmapOr of one probe per name — and on a book with a handful of
        # tags the planner then prefers reading the tag table whole.
        matching = PartyTag.objects.alias(tag_name_folded=Lower("tag__name")).filter(
            tag_name_folded__in=[Lower(Value(name)) for name in names],
            party_id=OuterRef("pk"),
            tag__tenant_id=OuterRef("tenant_id"),
        )
        return queryset.filter(Exists(matching))

    def filter_credit(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        """PTY-06 FR-12 — who is over their credit limit, and who is close.

        ── Parties with no limit are not "ok", they are not in the question ───
        All three branches require `credit_limit IS NOT NULL`, `ok` included. A
        book of three hundred parties where four have limits would otherwise
        answer "within limit" with two hundred and ninety-six people nobody has
        ever set a limit for — a list that is true and useless. The filter is
        about the control, so it only ever returns parties the control applies
        to.

        ── The comparison mirrors `credit.limit_status` exactly ──────────────
        `over` is `balance > limit`, strictly (EC-12: a balance landing exactly
        on the limit is not over it). `near` is the band from four fifths of the
        limit up to and including it. `balance` rather than a computed exposure
        because at MVP exposure IS `max(balance, 0)` (FR-4) and the floor only
        matters below zero, where neither band can reach: a party in credit is
        never near their limit.

        ── Not index-supported, and that is accepted at MVP (§15) ────────────
        `balance > credit_limit` compares two columns, so no index helps. It is
        used on demand — a merchant reviewing the over-limit list — rather than
        on every list load, and the partial index plus a generated
        `credit_usage` column for tenants above ten thousand parties are
        proposed in CCR-28.
        """
        # A2 (BR-5) — the TRADE figure `balance − loan_balance`, which is what
        # `credit_exposure` and `limit_status` compare: a loan is not shop credit.
        # Identical to `balance` for every party without a loan.
        has_limit = queryset.filter(credit_limit__isnull=False).alias(
            trade=F("balance") - F("loan_balance")
        )
        if value == "over":
            return has_limit.filter(trade__gt=F("credit_limit"))
        if value == "near":
            return has_limit.filter(
                trade__gte=F("credit_limit") * NEAR_LIMIT_RATIO,
                trade__lte=F("credit_limit"),
            )
        if value == "ok":
            return has_limit.filter(trade__lt=F("credit_limit") * NEAR_LIMIT_RATIO)
        return queryset

    def filter_roles(self, queryset: QuerySet, _name: str, value: str) -> QuerySet:
        """A6 BR-1 — only roles of ENABLED modules; anything else is a 400.

        Not "matches nothing", unlike an unknown tag: a tag is data the merchant
        can delete while a link is open, a role is a module's contract, and a
        request naming one that is off (EC-2) is asking about a feature this
        business does not have. `{role: ["Unknown role."]}` says so.
        """
        roles = parse_role_codes(self.tenant, value)
        if not roles:
            return queryset
        return queryset.filter(role_predicate(self.tenant, roles))

    def _today(self) -> date:
        """The business date: today on the TENANT's wall clock (Part 20 §20.2.2).

        A method rather than a module-level constant because a module-level
        `date.today()` is evaluated at import and then wrong for as long as the
        process lives — a worker started on Monday still filtering for Monday on
        Thursday.

        And not `date.today()` at call time either (NEW-3): that is the server's
        UTC date, so from midnight to 05:30 IST "Due today" showed yesterday's
        list. It used to look for a `request.business_date` first, which
        nothing ever set.
        """
        return tenant_today(self.tenant)
