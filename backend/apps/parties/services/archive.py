"""PTY-04 — archiving and restoring a party (Part 26 §26.7 R7.1: fat service).

Archive is a STATUS CHANGE and never a delete (BR-1). `deleted_at` on
`parties_party` is reserved for merge losers and tenant deletion; nothing in
this module touches it. A party's ledger is the reason: deleting the party
would destroy the entries behind it, which breaks canon §0.11 rule 1 and the
72-month GST retention rule at the same time. So the party leaves the working
list and every entry, bill and statement behind it stays readable forever.

── The write-off escape (FR-3) ────────────────────────────────────────────────
The one way to archive a party who still owes something is to post a
`ledger_entry` of `entry_type='write_off'` for `|balance|` in the same
transaction. That entry is the ledger's to write, and Part 20 §20.1.4 forbids
this app importing the ledger, so `archive_party` calls it through the port in
`parties/services/write_off.py`, which `LedgerConfig.ready()` fills. The
handler runs AFTER this module has taken the row lock, on the locked instance,
so the figure written off is the balance under the lock and the guard below
re-checks the same object — a write-off that left a residue would still be
refused.

── What this module does NOT do yet, and why ──────────────────────────────────
Three of FR-7's side effects need tables that do not exist:

  · **Cancelling scheduled reminders (FR-7a)** needs `ledger_reminder`.
  · **Revoking share links (FR-7b)** needs `parties_share_link`, which arrives
    with PTY-03's share sheet and PTY-09.
  · **The consequence counts (FR-6)** — "{n} transactions stay readable",
    "{m} reminders will be cancelled" — count rows in those same tables.

None of them are stubbed. A `cancelled_reminders: 0` in the response would be a
statement about this party's reminders, made by code that has never looked at a
reminder, and the client cannot tell it apart from a party who genuinely has
none. They arrive with LED-06 and PTY-09, and the tests that hold them absent
are what has to change to let them in.

The plan-limit guard on restore (FR-13) is absent for a different reason:
DEC-001 took the party-count cap out of the enforceable limits at MVP, so there
is no limit to be at. The key itself is deliberately not named here — a
structural test asserts that no file outside the entitlements service so much
as contains it, on the reasoning that a key which cannot be read cannot block
anything.
"""

from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal
from typing import Any, TypedDict

from django.core.exceptions import ImproperlyConfigured
from django.db import transaction

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation
from apps.parties.constants import PartyStatus
from apps.parties.models import Party
from apps.parties.services.balance import trade_balance
from apps.parties.services.write_off import get_write_off_handler

#: How the balance is described back to the client, so the message the merchant
#: reads is the one the server chose rather than one the client inferred from a
#: sign it had to interpret.
RECEIVABLE = "receivable"
PAYABLE = "payable"

ZERO = Decimal("0.00")


# ── A6 ── PLT-X04: archive guards (contracts §1.3, BR-3, BR-4) ─────────────────
#
# A module that holds open records for a person — an active membership, a loan
# being repaid, a deposit not yet returned — registers a guard, and archiving
# that person is refused while it answers. Core never imports the module; the
# module imports this. A guard of a module the tenant cannot reach is not
# called (BR-3), because a switched-off module's rows are not the merchant's
# concern on the screen they are using.


class ArchiveBlock(TypedDict):
    """What a guard answers when it refuses: the 409's `details`."""

    module: str
    count: int
    label_id: str


ArchiveGuard = Callable[[Any, Party], "ArchiveBlock | None"]

_GUARDS: dict[str, list[ArchiveGuard]] = {}
_GUARDS_BASELINE: dict[str, list[ArchiveGuard]] | None = None


def register_archive_guard(module: str, guard: ArchiveGuard) -> None:
    """`guard(tenant, party)` returns an `ArchiveBlock` or `None`. Idempotent.

    Several guards per module are allowed (a gym guards memberships and lockers
    separately); the same callable twice is one guard. `==` rather than `is`, so
    a bound method re-created by a second `ready()` is recognised (A12's lesson).
    """
    if not module or not callable(guard):
        raise ImproperlyConfigured("register_archive_guard needs a module and a callable.")
    guards = _GUARDS.setdefault(module, [])
    if not any(existing == guard for existing in guards):
        guards.append(guard)


def registered_archive_guards() -> dict[str, tuple[ArchiveGuard, ...]]:
    return {module: tuple(guards) for module, guards in _GUARDS.items()}


def _enabled_guards(tenant: Any) -> list[ArchiveGuard]:
    if not _GUARDS:
        return []
    from apps.platform_app.services.entitlements import effective_modules

    effective = effective_modules(tenant)
    return [guard for module, guards in _GUARDS.items() if module in effective for guard in guards]


def archive_block(tenant: Any, party: Party) -> ArchiveBlock | None:
    """The first guard that refuses, or `None`. Called under the party lock."""
    for guard in _enabled_guards(tenant):
        block = guard(tenant, party)
        if block:
            return block
    return None


def _refuse_open_records(block: ArchiveBlock) -> None:
    """409 `party_has_open_records` — the module, the number, the next step.

    `label_id` is the module's own sentence ("Gym has 1 active membership…");
    the English message here is the fallback for a client without it.
    """
    raise BusinessRuleViolation(
        "party_has_open_records",
        "Close this party's open records first.",
        details={
            "module": block["module"],
            "count": int(block["count"]),
            "label_id": block["label_id"],
        },
    )


def _reset_guards_for_tests() -> None:  # pragma: no cover - test helper
    global _GUARDS_BASELINE
    if _GUARDS_BASELINE is None:
        _GUARDS_BASELINE = {module: list(guards) for module, guards in _GUARDS.items()}
    _GUARDS.clear()
    _GUARDS.update({module: list(guards) for module, guards in _GUARDS_BASELINE.items()})


def _audit_snapshot(party: Party) -> dict:
    """What an archive or restore changed, and the figure it was guarded on.

    The balance is in the snapshot even though this feature never writes it:
    "archived while the balance was 0.00" is the fact an auditor asking why a
    party left the book needs, and it is not recoverable later — a correction
    posted afterwards moves the balance and leaves no trace of what it was at
    the moment of the decision.
    """
    return {"status": party.status, "balance": party.balance}


def _refuse_nonzero_balance(party: Party) -> None:
    """BR-2 and BR-3 — you cannot tidy away somebody who still owes you.

    **No tolerance band.** A ₹0.01 residue blocks the archive, and that is
    deliberate rather than pedantic: `numeric(14,2)` equality is exact, and a
    rupee-and-a-paisa left on a party is a real receivable that the merchant
    should retire on purpose rather than have a rounding rule retire for them.
    The alternative — "close enough to zero" — is a rule whose threshold nobody
    can defend and which silently eats the residues a collection round is for.

    `suggestion` is the server's opinion about what to do next, and the client
    renders it rather than deciding: "collect" when the party owes the merchant,
    because that money is worth chasing, and "write_off" when the amount is
    already lost. Both are advisory; the client shows what it can actually
    offer. The write-off itself is FR-3's `write_off` body on this same
    endpoint, which the server accepts whichever suggestion it made.
    """
    label = RECEIVABLE if party.balance > ZERO else PAYABLE
    details: dict = {
        "balance": str(party.balance),
        "balance_label": label,
        "suggestion": "write_off" if label == RECEIVABLE else "collect",
    }
    # R23 / LED-11 (Wave A gate): with a loan open, a shop write-off may clear only the trade
    # figure and the archive is still refused by the loan — so the dialog must not offer
    # "Write off ₹<balance>". Added only then, so no other refusal's payload changes.
    if party.loan_balance != ZERO:
        details.update(
            can_write_off=False,
            amount=str(abs(trade_balance(party))),
            suggestion="collect",
        )
    raise BusinessRuleViolation(
        "party_balance_nonzero",
        "Settle the balance or write it off before archiving.",
        details=details,
    )


@transaction.atomic
def archive_party(
    *,
    ctx: Ctx,
    party: Party,
    reason: str = "",
    via: str = "api",
    write_off: dict | None = None,
) -> tuple[Party, str | None]:
    """Take a party out of the working list. Returns `(party, write_off_entry_id)`.

    `select_for_update` on the row, because the guard and the write are two
    statements and the balance is written by every ledger entry that will ever
    exist. Without the lock, a payment posted between the check and the update
    archives a party who owes money — the exact state BR-2 exists to prevent,
    reached through the gap between two correct statements. EC-1 describes the
    same race from the client's side and is answered by the same lock: the 409
    fires on the server's reading, never on the browser's.

    `write_off` (FR-3) is the client's object, passed through unread: the
    ledger's handler owns every rule about it. It is called on the LOCKED row
    and never on `party`, which the view read before the lock and which can be
    stale by the time this runs — the amount forgiven must be the one nobody
    else can move. The entry id is `None` for a plain archive.

    Authorisation for the write-off (`ledger.entry.write`, the ledger module
    being enabled) is the VIEW's, like every other permission; this function
    only refuses when no ledger is installed at all, because that is a fact
    about the deployment rather than about the caller.
    """
    handler = get_write_off_handler() if write_off is not None else None
    locked = Party.objects.select_for_update().get(pk=party.pk)

    if locked.status == PartyStatus.ARCHIVED:
        # 409 and not 200: the caller asked for a transition that cannot
        # happen, and answering 200 would let a client that has lost track of
        # state believe it just archived something. An idempotent REPLAY is a
        # different thing and is handled by `@idempotent` above this, which
        # returns the original response without reaching here.
        raise BusinessRuleViolation(
            "party_already_archived",
            "This party is already archived.",
        )

    # Taken BEFORE the write-off, so the audit row says what the balance was
    # when the decision was made — ₹2,300 written off, not "0.00 archived".
    before = _audit_snapshot(locked)

    write_off_entry_id: str | None = None
    if handler is not None:
        written = handler(ctx=ctx, party=locked, request=write_off)
        write_off_entry_id = written["entry_id"]

    if locked.balance != ZERO:
        _refuse_nonzero_balance(locked)

    # A6 BR-3 — after the write-off and the balance check, under the lock. A
    # refusal here rolls the write-off back with the rest of the transaction.
    block = archive_block(ctx.tenant, locked)
    if block is not None:
        _refuse_open_records(block)

    locked.status = PartyStatus.ARCHIVED
    # `last_activity_at` is deliberately NOT touched (BR-12): it is when the
    # party last traded, not when somebody filed them away, and restoring must
    # put them back in their correct place in the default sort rather than at
    # the top of it.
    locked.save(update_fields=["status", "updated_at"])

    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_ARCHIVED,
        entity_type="parties_party",
        entity_id=locked.id,
        before=before,
        after=_audit_snapshot(locked),
        metadata={
            "reason": reason,
            "via": via,
            # FR-7(c) — the link from "why did this party leave the book" to
            # the entry that made it possible. The entry's own audit row points
            # back with `via='party_archive'`.
            **({"write_off_entry_id": write_off_entry_id} if write_off_entry_id else {}),
        },
    )
    return locked, write_off_entry_id


@transaction.atomic
def restore_party(*, ctx: Ctx, party: Party, via: str = "api") -> Party:
    """Bring a party back. Returns the updated party.

    Unconditional, and that asymmetry with archive is the point: archiving can
    lose track of money, restoring cannot lose anything at all. FR-13's plan
    limit would be the one guard, and DEC-001 took the party-count cap out of
    the enforceable limits at MVP, so there is nothing to be at the limit of.

    It does not undo the side effects archiving had — BR-8 — which matters more
    once there are side effects to undo: a cancelled reminder was a decision
    about a date that has probably passed, and a revoked share link was given to
    somebody who should not get it back by accident.

    Nor does it reverse a write-off (FR-4). The write-off was a real financial
    event with its own immutable entry; the party resumes from a zero balance,
    and a merchant who wants the money back on the khata reverses that entry
    through LED-03 like any other.
    """
    locked = Party.objects.select_for_update().get(pk=party.pk)

    if locked.status != PartyStatus.ARCHIVED:
        raise BusinessRuleViolation("party_not_archived", "This party is not archived.")

    before = _audit_snapshot(locked)
    locked.status = PartyStatus.ACTIVE
    locked.save(update_fields=["status", "updated_at"])

    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_RESTORED,
        entity_type="parties_party",
        entity_id=locked.id,
        before=before,
        after=_audit_snapshot(locked),
        metadata={"via": via},
    )
    return locked


def _skip_row(row: Party, block: ArchiveBlock | None) -> dict:
    """One `skipped` entry: why this party stayed, in the single archive's words."""
    if block is not None:
        return {
            "id": str(row.id),
            "name": row.name,
            "code": "party_has_open_records",
            "balance": str(row.balance),
            "module": block["module"],
            "count": int(block["count"]),
            "label_id": block["label_id"],
        }
    return {
        "id": str(row.id),
        "name": row.name,
        "code": (
            "party_already_archived"
            if row.status == PartyStatus.ARCHIVED
            else "party_balance_nonzero"
        ),
        "balance": str(row.balance),
    }


#: FR-9's ceiling. Two hundred rows in one transaction is a yearly clean-up;
#: beyond that it is an import, and an import has its own endpoint.
BULK_ARCHIVE_MAX = 200


@transaction.atomic
def bulk_archive_parties(*, ctx: Ctx, ids: list[Any], reason: str = "") -> dict:
    """Archive what can be archived and report what could not.

    ── The database decides who is eligible, under a lock ─────────────────────
    `SELECT … WHERE status = 'active' AND balance = 0 FOR UPDATE`, then an
    `UPDATE` of exactly those ids. Not a read-then-write: between reading
    "these thirty have a zero balance" and writing "archive these thirty", an
    entry posted on another device makes one of them non-zero and the write
    archives a party who owes money. The lock is what closes that gap — the
    predicate is evaluated and the rows are held in the same statement, so
    nothing can move a balance out from under the UPDATE that follows.

    `skip_locked` on the select rather than waiting: a row another transaction
    is already archiving is not one this call needs to archive again, and a
    yearly clean-up of two hundred parties must not block on somebody else's
    single archive.

    Write-off is never applied here (BR-10). Forgiving a debt is a decision
    about one person and one amount; a checkbox in a list of thirty is not where
    it belongs, and the skip report is what makes the merchant look at each one.
    """
    unique = list(dict.fromkeys(ids))
    scoped = Party.objects.for_tenant(ctx.tenant).filter(pk__in=unique)
    found = set(scoped.values_list("pk", flat=True))

    archived_ids = list(
        scoped.filter(status=PartyStatus.ACTIVE, balance=ZERO)
        .select_for_update(skip_locked=True)
        .values_list("pk", flat=True)
    )

    # A6 BR-4 — every locked eligible party goes past the guards; a blocked one
    # is skipped with the guard's module and count and is never archived. The
    # rows are already locked above, so reading them again takes no new lock.
    blocked: dict[Any, ArchiveBlock] = {}
    if archived_ids and _enabled_guards(ctx.tenant):
        for row in Party.objects.for_tenant(ctx.tenant).filter(pk__in=archived_ids):
            block = archive_block(ctx.tenant, row)
            if block is not None:
                blocked[row.pk] = block
        archived_ids = [party_id for party_id in archived_ids if party_id not in blocked]

    Party.objects.for_tenant(ctx.tenant).filter(pk__in=archived_ids).update(
        status=PartyStatus.ARCHIVED
    )

    skipped = [
        _skip_row(row, blocked.get(row.id))
        for row in scoped.exclude(pk__in=archived_ids).only("id", "name", "status", "balance")
    ]

    # An id that is not this tenant's, or not a party at all, is reported as
    # not found rather than silently dropped — a caller who sent thirty and got
    # twenty-seven back with no explanation is a caller who will send them
    # again. It discloses nothing: a made-up id and another tenant's id get the
    # same answer, which is the same answer a single-party GET gives (canon
    # §0.11 rule 2).
    skipped.extend(
        {"id": str(party_id), "name": "", "code": "not_found", "balance": None}
        for party_id in unique
        if party_id not in found
    )

    for party_id in archived_ids:
        # One row per party, so that "when did this party leave the book"
        # stays answerable from the party's own history. §16 asks for the
        # per-party rows AND a summary; the summary is below.
        write_audit(
            ctx=ctx,
            action=AuditAction.PARTY_ARCHIVED,
            entity_type="parties_party",
            entity_id=party_id,
            after={"status": PartyStatus.ARCHIVED},
            metadata={"reason": reason, "via": "bulk"},
        )

    return {
        "archived": [str(party_id) for party_id in archived_ids],
        "skipped": skipped,
    }
