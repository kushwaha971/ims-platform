"""The party balance cache — the only code that writes it (Part 21 §21.1 rule 3).

`parties_party.balance` is not a fact. It is a cache of a sum over
`ledger_entry`, kept current because a list of two hundred parties cannot
aggregate the ledger per row, and recomputable in full by
`manage.py recalc_balances`. `Party`'s own docstring names this module as its
sole writer, and that is the invariant this file exists to hold: one function
moves the number, inside the caller's transaction, after locking the row.

── What is here and what is next door ───────────────────────────────────────
This module moves the number. The RULE for what the number should be — which
ledger rows count, and the arithmetic over them — lives in
`ledger/selectors/entry.py`, because it is a statement about `ledger_entry` and
Part 20 §20.1.4 has `parties` importing nothing from `ledger`. The dependency
runs one way: the ledger calls `lock_party` and `apply_entry`; nothing here
calls the ledger.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Callable

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone

from apps.common.constants import Direction, LedgerBucket
from apps.common.money import ZERO
from apps.parties.models import Party


def lock_party(*, tenant: Any, party_id: Any) -> Party | None:
    """The party row, locked for the rest of this transaction (BR-2, EC-7).

    `SELECT … FOR UPDATE`, which is what makes two staff posting to the same
    party at the same moment safe: the second transaction blocks here until the
    first commits, then reads a balance that includes the first entry. Without
    it both read the same balance, both add their amount to it, and one entry's
    worth of money disappears from the cache while both rows sit in the ledger.

    It is also what makes the credit-limit check meaningful. A limit compared
    against a balance read outside the lock is a limit compared against a number
    that can change before the insert — which is the whole reason FR-6's check
    runs in the write path and not only in the pre-flight.

    Returns `None` for an id this tenant cannot see; the caller decides whether
    that is a 404 (it is — canon §0.11 rule 2).
    """
    if tenant is None:
        return None
    return Party.objects.for_tenant(tenant).select_for_update().filter(pk=party_id).first()


def lock_party_of(*, tenant: Any, rows: Any, pk: Any) -> Party | None:
    """Lock the party a document (or payment) belongs to BEFORE locking the row itself.

    ── The lock order every money path follows ───────────────────────────────
    1. the party (`lock_party`);
    2. documents, several at once in `(document_date, number, id)` order;
    3. payments and their allocations;
    4. stock rows by `item_id` (`inventory.services.stock`);
    5. number sequences (`allocate_number`).

    Invoice void used to lock the INVOICE and then the party, while payment
    void locked the PAYMENT, then the party, then the invoice. Voiding an
    invoice and its payment at the same moment held one lock each and waited on
    the other's: a PostgreSQL deadlock, answered as a 500 on one side. With the
    party first in both, the second transaction waits at step 1 holding
    nothing, and the two simply run one after the other.

    `rows` is the model's tenant-scoped queryset; the party id is read without a
    lock (it cannot change on an issued document or a payment, and a draft's
    caller re-checks it after locking the document). Returns `None` for a row
    with no party — a walk-in bill — or an id this tenant cannot see; the
    caller's own document lock then produces the 404.
    """
    try:
        party_id = rows.filter(pk=pk).values_list("party_id", flat=True).first()
    except (ValueError, TypeError, DjangoValidationError):
        return None
    if party_id is None:
        return None
    return lock_party(tenant=tenant, party_id=party_id)


def relock_if_moved(*, tenant: Any, party: Party | None, party_id: Any) -> Party | None:
    """After the document lock: the party that document ACTUALLY has, locked.

    Only a draft can change party between the unlocked read and the lock, and
    nothing that locks drafts also holds another party's documents, so taking
    the second party here cannot close a cycle.
    """
    if party_id is None:
        return None
    if party is not None and party.pk == party_id:
        return party
    return lock_party(tenant=tenant, party_id=party_id)


def apply_entry(
    *, party: Party, direction: str, amount: Decimal, bucket: str = LedgerBucket.MAIN
) -> Decimal:
    """Move the caches by one entry and write the row. Returns the new balance.

    Called with the party ALREADY LOCKED by `lock_party`. It does not lock, and
    it does not open a transaction: both belong to the caller, because the
    balance write and the ledger insert have to be the same atom or the cache
    can commit without the row that justifies it.

    Incremental rather than a re-aggregate of the party's history, and the
    difference is the feature: a party with three years of daily entries would
    make every new entry cost a scan of all of them. `recalc_balances` is the
    aggregate, run nightly, and the drift between the two is the thing it
    reports.

    ── By bucket (A2, ADR-043; owner 12 Oct 2026) ───────────────────────────
    DEC-019 — each bucket moves its OWN cache and nothing else: `main` (the
    udhaar book) moves `balance` (and its receivable/payable split, the
    collection date and `last_activity_at` — the khata list's "Last entry");
    `shop` moves `shop_balance`; `loan` moves `loan_balance`; `library` moves
    `library_balance`; a `deposit` moves
    `deposit_held` in the opposite sense (a deposit received is a credit and
    INCREASES what is held). Returns the cache this entry moved.
    Callers written before buckets pass none and get `main` (EC-4).
    """
    if bucket not in LedgerBucket.values:
        raise ValueError(f"unknown ledger bucket {bucket!r}")
    delta = amount if direction == Direction.DEBIT else -amount
    other = None if bucket == LedgerBucket.MAIN else BUCKET_CACHE[bucket]
    if other is not None:
        moved = -delta if bucket == LedgerBucket.DEPOSIT else delta
        setattr(party, other, (getattr(party, other) or ZERO) + moved)
        party.save(update_fields=[other, "updated_at"])
        return getattr(party, other)
    party.last_activity_at = timezone.now()
    party.balance = (party.balance or ZERO) + delta
    fields = ["balance", "receivable_total", "payable_total", "last_activity_at", "updated_at"]
    # BR-3. Two caches of one number, kept here rather than computed on read,
    # because the reports that want them want them summed across parties.
    party.receivable_total = max(party.balance, ZERO)
    party.payable_total = max(-party.balance, ZERO)
    # BR-4 — `now()`, not `entry_date`. The column answers "when did anything
    # last happen on this khata", and backdating an entry the merchant forgot
    # is something happening. Sorting the list by the business date of the
    # oldest thing somebody remembered would put the party they just touched at
    # the bottom.
    party.save(update_fields=fields)
    clear_collection_date_if_settled(party=party)
    return party.balance


#: DEC-019 — the cache each bucket moves.
BUCKET_CACHE: dict[str, str] = {
    LedgerBucket.MAIN: "balance",
    LedgerBucket.SHOP: "shop_balance",
    LedgerBucket.LOAN: "loan_balance",
    LedgerBucket.LIBRARY: "library_balance",
    LedgerBucket.DEPOSIT: "deposit_held",
}


def balance_of(party: Party, bucket: str) -> Decimal:
    """The party's figure for one bucket — what that app shows as owed (DEC-019)."""
    return getattr(party, BUCKET_CACHE[bucket]) or ZERO


def trade_balance(party: Party) -> Decimal:
    """BR-5 — what the party owes in the udhaar book. Since DEC-019 that is `balance` itself:
    no other app's money is in it, so nothing has to be subtracted (it used to be
    `balance − loan_balance`, and the screens that forgot the subtraction showed a loan as
    credit — QA B3)."""
    return party.balance or ZERO


#: Which modules can write a line in a bucket other than `main` (contracts §1.2 and §1.4: the
#: `loan` sources and targets are lending's; the deposit targets serve library, gym and
#: hospitality). Module CODES, not imports (10-architecture §3 rule L4). The party detail uses
#: it to decide whether a zero figure is worth sending (PTY-03's rule, below).
BUCKET_WRITER_MODULES: dict[str, frozenset[str]] = {
    LedgerBucket.SHOP: frozenset({"sales", "purchases", "expenses", "payments"}),
    LedgerBucket.LOAN: frozenset({"lending"}),
    LedgerBucket.LIBRARY: frozenset({"library"}),
    LedgerBucket.DEPOSIT: frozenset({"library", "gym", "hospitality"}),
}


def _tenant_of(party: Party) -> Any:
    """The party's tenant, from the request context when it is the same one (no query)."""
    from apps.common.tenancy import current_tenant

    bound = current_tenant()
    if bound is not None and getattr(bound, "pk", None) == party.tenant_id:
        return bound
    return party.tenant


def bucket_figures(party: Party) -> dict[str, str]:
    """`shop_balance` for the party detail — what the person owes on Shop bills (DEC-019).

    The party detail is read by the udhaar book's page and by the Shop's customer page, and
    each shows only its own figure: `balance` is the udhaar book's, `shop_balance` the Shop's.
    A loan, a library fee or a security deposit is never sent here — those are read on their
    own app's pages (QA B3/B9: they appeared on a Shop page as "Loan left" and "You gave").

    Sent when it is not zero, OR when the Shop is switched on (so a zero there is a verified
    zero); omitted otherwise — the PTY-03 rule CLAUDE.md records: a key that is always empty
    is a claim the code cannot verify, and the client cannot tell it apart from a real zero.
    """
    shop = party.shop_balance or ZERO
    if shop != ZERO:
        return {"shop_balance": str(shop)}
    # Zero queries for a tenant without a Shop module enabled: the request's own tenant is
    # used when it is this party's, and `enabled_modules` is on that row.
    tenant = _tenant_of(party)
    writers = BUCKET_WRITER_MODULES[LedgerBucket.SHOP]
    if not writers & set(tenant.enabled_modules or []):
        return {}
    from apps.platform_app.services.entitlements import effective_modules

    return {"shop_balance": str(shop)} if writers & effective_modules(tenant) else {}


# ── LED-05 BR-2 — a settled party has nothing left to collect ────────────────
#
# The ledger owns `ledger_reminder`, and Part 20 §20.1.4 does not let `parties`
# import it. So the reminder half of BR-2 is a PORT the ledger fills in its
# `AppConfig.ready()` — the same registry-in-`ready()` pattern the write-off
# handler and the job handlers use — and this module calls whatever is
# registered without knowing what a reminder is.
_SETTLE_HANDLERS: list[Callable[..., Any]] = []


def register_settle_handler(handler: Callable[..., Any]) -> None:
    """Called once per handler at start-up; idempotent so a re-`ready()` is harmless."""
    if handler not in _SETTLE_HANDLERS:
        _SETTLE_HANDLERS.append(handler)


def clear_collection_date_if_settled(*, party: Party) -> bool:
    """BR-2 / FR-5 — after any posting, a balance ≤ 0 clears the collection date.

    Called by BOTH writers of the balance cache (`apply_entry` here and the
    correction's delta in the ledger), inside the posting's transaction, so a
    payment that settles the khata and the date it settles are one atom. Also
    runs the registered handlers, which cancel the party's `scheduled`
    automated reminders — the first line of defence; the send job re-checks at
    send time as the second (LED-07 BR-4).

    Written by the SYSTEM (`actor_type='system'`, §16), because nobody chose to
    clear it: the money did. Returns whether anything changed.
    """
    if party.balance is None or party.balance > ZERO:
        return False
    had_date = party.collection_date is not None
    if had_date:
        before = party.collection_date
        party.collection_date = None
        party.save(update_fields=["collection_date", "updated_at"])
        from apps.common.audit import AuditAction, write_audit
        from apps.common.context import Ctx

        write_audit(
            ctx=Ctx.system(party.tenant),
            action=AuditAction.PARTY_COLLECTION_DATE_CLEARED,
            entity_type="parties_party",
            entity_id=party.id,
            before={"collection_date": before.isoformat()},
            after={"collection_date": None},
            metadata={"trigger": "balance_settled"},
        )
    for handler in _SETTLE_HANDLERS:
        handler(party=party)
    return had_date
